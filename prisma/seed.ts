/**
 * Idempotent seed: safe to run many times (upserts by unique key).
 * Creates permissions, default roles, payment methods, delivery zones and settings, and in
 * development the Super Admin, through Better Auth's internal adapter and password hasher
 * (docs/auth.md), never by writing password hashes directly.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { createAdminAuth } from '../apps/api/src/auth/admin-auth';
import { loadEnv } from '../apps/api/src/config/env';
import { Prisma, PrismaClient } from '../apps/api/src/generated/prisma/client';
import { createRedis } from '../apps/api/src/lib/redis';
import { ensureSuperAdmin } from '../apps/api/src/services/super-admin.service';
import { DEFAULT_ROLES, PERMISSIONS, SUPER_ADMIN_ROLE } from '../packages/shared/src/permissions';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is required');
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });

async function seedPermissionsAndRoles() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { module: p.module, description: p.description },
      create: { key: p.key, module: p.module, description: p.description },
    });
  }
  const all = await prisma.permission.findMany();
  const idByKey = new Map(all.map((p) => [p.key, p.id]));

  for (const [name, def] of Object.entries(DEFAULT_ROLES)) {
    const isSystem = name === SUPER_ADMIN_ROLE;
    const role = await prisma.role.upsert({
      where: { name },
      update: isSystem ? { description: def.description, isSystem } : {},
      create: { name, description: def.description, isSystem },
    });
    // Roles are editable in the admin UI, so only fill permissions the first time a role is created.
    const existing = await prisma.rolePermission.count({ where: { roleId: role.id } });
    if (existing === 0) {
      const keys = def.permissions === 'ALL' ? PERMISSIONS.map((p) => p.key) : def.permissions;
      await prisma.rolePermission.createMany({
        data: keys.map((k) => ({ roleId: role.id, permissionId: idByKey.get(k)! })),
        skipDuplicates: true,
      });
    }
  }
}

async function seedPaymentMethods() {
  await prisma.paymentMethod.upsert({
    where: { code: 'COD' },
    update: {},
    create: {
      code: 'COD',
      name: 'Cash on Delivery',
      isActive: true,
      sortOrder: 1,
      config: { scope: 'DHAKA_ONLY' },
    },
  });
  await prisma.paymentMethod.upsert({
    where: { code: 'UDDOKTAPAY' },
    update: {},
    create: { code: 'UDDOKTAPAY', name: 'Online Payment', isActive: true, sortOrder: 2 },
  });
}

async function seedDeliveryZones() {
  // Charges are placeholders: the owner sets real values in the admin panel.
  await prisma.deliveryZone.upsert({
    where: { code: 'inside-dhaka' },
    update: {},
    create: {
      code: 'inside-dhaka',
      name: 'Inside Dhaka',
      districts: ['Dhaka'],
      charge: '60.00',
      estimatedDays: '1-2 days',
      sortOrder: 1,
    },
  });
  await prisma.deliveryZone.upsert({
    where: { code: 'outside-dhaka' },
    update: {},
    create: {
      code: 'outside-dhaka',
      name: 'Outside Dhaka',
      districts: [],
      charge: '120.00',
      estimatedDays: '3-5 days',
      isDefault: true,
      sortOrder: 2,
    },
  });
}

async function seedSettings() {
  const defaults: {
    key: string;
    value: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    group: string;
    isPublic: boolean;
  }[] = [
    { key: 'store.name', value: 'My Food Store', group: 'store', isPublic: true },
    { key: 'store.logo', value: Prisma.JsonNull, group: 'store', isPublic: true },
    { key: 'store.phone', value: '', group: 'store', isPublic: true },
    { key: 'store.email', value: '', group: 'store', isPublic: true },
    { key: 'store.address', value: '', group: 'store', isPublic: true },
    // Live by default; the admin switches to maintenance from the sidebar.
    { key: 'store.mode', value: 'live', group: 'store', isPublic: true },
    { key: 'store.maintenanceMessage', value: '', group: 'store', isPublic: true },
    { key: 'seo.defaultTitle', value: 'My Food Store', group: 'seo', isPublic: true },
    { key: 'seo.defaultDescription', value: '', group: 'seo', isPublic: true },
    { key: 'gtm.containerId', value: '', group: 'tracking', isPublic: true },
    { key: 'ga4.measurementId', value: '', group: 'tracking', isPublic: true },
    { key: 'meta.pixelId', value: '', group: 'tracking', isPublic: true },
    // Policy pages: empty until the owner writes them in /admin/pages.
    { key: 'page.privacy', value: '', group: 'pages', isPublic: false },
    { key: 'page.terms', value: '', group: 'pages', isPublic: false },
    { key: 'page.returns', value: '', group: 'pages', isPublic: false },
    // Empty: the home page builds its highlights from payment methods and delivery zones.
    { key: 'home.highlights', value: [], group: 'homepage', isPublic: true },
    { key: 'review.autoApprove', value: false, group: 'reviews', isPublic: false },
    { key: 'notifications.adminEmail', value: '', group: 'notifications', isPublic: false },
    { key: 'shipping.steadfastEnabled', value: false, group: 'shipping', isPublic: false },
  ];
  for (const s of defaults) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {},
      create: { key: s.key, value: s.value, group: s.group, isPublic: s.isPublic },
    });
  }
}

/** Development only: production uses `node dist/create-super-admin.js` with its own values. */
async function seedSuperAdmin() {
  const { SEED_ADMIN_EMAIL: email, SEED_ADMIN_PASSWORD: password, NODE_ENV } = process.env;
  if (NODE_ENV === 'production' || !email || !password) {
    console.log(
      'Super Admin: skipped (needs SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD, never in production)',
    );
    return;
  }
  const env = loadEnv();
  const redis = createRedis(env.REDIS_URL); // lazy: creating a user never touches Redis
  try {
    const adminAuth = createAdminAuth({ env, prisma, redis });
    const result = await ensureSuperAdmin(
      { prisma, adminAuth },
      { email, password, name: 'Super Admin' },
    );
    console.log(`Super Admin: ${result.created ? 'created' : 'already exists'} (${email})`);
  } finally {
    redis.disconnect();
  }
}

async function main() {
  await seedPermissionsAndRoles();
  await seedPaymentMethods();
  await seedDeliveryZones();
  await seedSettings();
  await seedSuperAdmin();
  console.log('Seed complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
