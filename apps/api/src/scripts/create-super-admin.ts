/**
 * One-off production command: create the first Super Admin (docs/database.md section 6).
 *
 *   read -s SUPER_ADMIN_PASSWORD && export SUPER_ADMIN_PASSWORD   # typed, not echoed, not in history
 *   SUPER_ADMIN_EMAIL=owner@example.com SUPER_ADMIN_NAME="Store Owner" node dist/create-super-admin.js
 *
 * Needs the same environment as the API (DATABASE_URL, BETTER_AUTH_SECRET, ...). Safe to re-run.
 */
import { createAdminAuth } from '../auth/admin-auth';
import { loadEnv } from '../config/env';
import { createPrisma } from '../lib/prisma';
import { createRedis } from '../lib/redis';
import { ensureSuperAdmin } from '../services/super-admin.service';

const env = loadEnv();
const prisma = createPrisma(env.DATABASE_URL);
const redis = createRedis(env.REDIS_URL);

try {
  const result = await ensureSuperAdmin(
    { prisma, adminAuth: createAdminAuth({ env, prisma, redis }) },
    {
      email: process.env.SUPER_ADMIN_EMAIL ?? '',
      name: process.env.SUPER_ADMIN_NAME ?? 'Super Admin',
      password: process.env.SUPER_ADMIN_PASSWORD ?? '',
    },
  );
  console.log(
    result.created
      ? 'Super Admin created.'
      : 'An admin with that email already exists; nothing changed.',
  );
} catch (err) {
  // Zod messages name the field (email, password length), never the values.
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
  redis.disconnect();
}
