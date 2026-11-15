import type { Db } from '../lib/prisma';

export function findAdminWithRole(prisma: Db, id: string) {
  return prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      isActive: true,
      twoFactorEnabled: true,
      lastLoginAt: true,
      role: {
        select: {
          id: true,
          name: true,
          isSystem: true,
          permissions: { select: { permission: { select: { key: true } } } },
        },
      },
    },
  });
}
