import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

const roleSelect = {
  id: true,
  name: true,
  description: true,
  isSystem: true,
  createdAt: true,
  updatedAt: true,
  permissions: { select: { permission: { select: { key: true } } } },
  _count: { select: { users: true } },
} as const;

export function listPermissions(prisma: Client) {
  return prisma.permission.findMany({
    select: { key: true, module: true, description: true },
    orderBy: [{ module: 'asc' }, { key: 'asc' }],
  });
}

export function listRoles(prisma: Client) {
  // System role first, then by name.
  return prisma.role.findMany({
    select: roleSelect,
    orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
  });
}

export function findRole(prisma: Client, id: string) {
  return prisma.role.findUnique({ where: { id }, select: roleSelect });
}

export function createRole(prisma: Client, data: { name: string; description: string | null }) {
  return prisma.role.create({ data, select: { id: true } });
}

export function updateRole(
  prisma: Client,
  id: string,
  data: { name?: string; description?: string | null },
) {
  return prisma.role.update({ where: { id }, data, select: { id: true } });
}

export function deleteRole(prisma: Client, id: string) {
  return prisma.role.delete({ where: { id } });
}

/** Replaces the role's permission set with exactly these keys. */
export async function replaceRolePermissions(
  prisma: Client,
  roleId: string,
  keys: readonly string[],
) {
  await prisma.rolePermission.deleteMany({ where: { roleId } });
  if (!keys.length) return;
  const permissions = await prisma.permission.findMany({
    where: { key: { in: [...keys] } },
    select: { id: true },
  });
  await prisma.rolePermission.createMany({
    data: permissions.map((p) => ({ roleId, permissionId: p.id })),
  });
}

/** Permission keys of a role (for escalation checks); the system role is handled by callers. */
export async function rolePermissionKeys(prisma: Client, roleId: string): Promise<string[]> {
  const rows = await prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });
  return rows.map((r) => r.permission.key);
}
