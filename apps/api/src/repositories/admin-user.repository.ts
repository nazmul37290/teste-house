import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

export const adminUserSelect = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  twoFactorEnabled: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { id: true, name: true, isSystem: true } },
} as const;

export async function listAdminUsers(
  prisma: Client,
  query: { page: number; pageSize: number; q?: string },
) {
  const where: Prisma.AdminUserWhereInput = query.q
    ? {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { email: { contains: query.q, mode: 'insensitive' } },
        ],
      }
    : {};
  const [items, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      select: adminUserSelect,
      orderBy: { createdAt: 'asc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.adminUser.count({ where }),
  ]);
  return { items, total };
}

export function findAdminUser(prisma: Client, id: string) {
  return prisma.adminUser.findUnique({ where: { id }, select: adminUserSelect });
}

export function adminEmailTaken(prisma: Client, email: string) {
  return prisma.adminUser.count({ where: { email } }).then((n) => n > 0);
}

export function updateAdminUser(
  prisma: Client,
  id: string,
  data: { name?: string; roleId?: string; isActive?: boolean },
) {
  return prisma.adminUser.update({ where: { id }, data, select: adminUserSelect });
}

/**
 * Locks the active Super Admin rows (FOR UPDATE) and returns how many there are. Run inside the
 * transaction that may remove one: two Super Admins deactivating each other at the same moment then
 * run one after the other, and the second sees only one left.
 */
export async function lockActiveSuperAdmins(tx: Prisma.TransactionClient): Promise<number> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT u.id FROM admin_users u JOIN roles r ON r.id = u."roleId"
    WHERE u."isActive" AND r."isSystem"
    FOR UPDATE OF u`;
  return rows.length;
}
