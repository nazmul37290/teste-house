import type { Redis } from 'ioredis';
import type { Db } from './prisma';

/**
 * Role permission keys cached in Redis (docs/design.md section 4). Invalidated whenever a role's
 * permissions change or the role is deleted; the TTL only bounds staleness if an invalidation is lost.
 */
const TTL_SEC = 10 * 60;
const key = (roleId: string) => `rbac:role:${roleId}:permissions`;

export async function getRolePermissionKeys(
  deps: { prisma: Db; redis: Redis },
  roleId: string,
): Promise<string[]> {
  const cached = await deps.redis.get(key(roleId));
  if (cached) return JSON.parse(cached) as string[];
  const rows = await deps.prisma.rolePermission.findMany({
    where: { roleId },
    select: { permission: { select: { key: true } } },
  });
  const keys = rows.map((r) => r.permission.key).sort();
  await deps.redis.set(key(roleId), JSON.stringify(keys), 'EX', TTL_SEC);
  return keys;
}

export async function invalidateRolePermissions(redis: Redis, roleId: string): Promise<void> {
  await redis.del(key(roleId));
}
