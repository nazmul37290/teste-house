import type { CreateRoleInput, PermissionKey, UpdateRoleInput } from '@shop/shared';
import type { Redis } from 'ioredis';
import { AppError } from '../lib/errors';
import { invalidateRolePermissions } from '../lib/permission-cache';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/role.repository';
import { recordAudit, type Actor } from './audit.service';

export type RoleServiceDeps = { prisma: Db; redis: Redis };

export type RoleDto = {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  userCount: number;
  createdAt: Date;
  updatedAt: Date;
};

export function businessRule(reason: string, message: string): AppError {
  return new AppError('BUSINESS_RULE', message, [{ reason }]);
}

function toDto(role: NonNullable<Awaited<ReturnType<typeof repo.findRole>>>): RoleDto {
  const { permissions, _count, ...rest } = role;
  return {
    ...rest,
    permissions: permissions.map((p) => p.permission.key).sort(),
    userCount: _count.users,
  };
}

/** Non-Super Admins can only grant what they hold themselves (no privilege escalation). */
export function assertCanGrant(actor: Actor, keys: readonly string[]): void {
  if (actor.isSuperAdmin) return;
  const missing = keys.filter((k) => !actor.permissions.includes(k));
  if (missing.length)
    throw new AppError('FORBIDDEN', 'You can only grant permissions you have yourself');
}

async function editableRole(prisma: Db, id: string) {
  const role = await repo.findRole(prisma, id);
  if (!role) throw new AppError('NOT_FOUND', 'Role not found');
  if (role.isSystem)
    throw businessRule('SYSTEM_ROLE', 'The Super Admin role cannot be changed or deleted');
  return role;
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

export const listPermissions = (prisma: Db) => repo.listPermissions(prisma);

export async function listRoles(prisma: Db): Promise<RoleDto[]> {
  return (await repo.listRoles(prisma)).map(toDto);
}

export async function getRole(prisma: Db, id: string): Promise<RoleDto> {
  const role = await repo.findRole(prisma, id);
  if (!role) throw new AppError('NOT_FOUND', 'Role not found');
  return toDto(role);
}

export async function createRole(
  deps: RoleServiceDeps,
  actor: Actor,
  input: CreateRoleInput,
): Promise<RoleDto> {
  assertCanGrant(actor, input.permissions);
  try {
    const id = await deps.prisma.$transaction(async (tx) => {
      const role = await repo.createRole(tx, {
        name: input.name,
        description: input.description ?? null,
      });
      await repo.replaceRolePermissions(tx, role.id, input.permissions);
      await recordAudit(tx, actor, {
        action: 'role.create',
        entityType: 'role',
        entityId: role.id,
        after: {
          name: input.name,
          description: input.description ?? null,
          permissions: input.permissions,
        },
      });
      return role.id;
    });
    return getRole(deps.prisma, id);
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('CONFLICT', 'A role with this name already exists');
    throw err;
  }
}

export async function updateRole(
  deps: RoleServiceDeps,
  actor: Actor,
  id: string,
  input: UpdateRoleInput,
): Promise<RoleDto> {
  const before = await editableRole(deps.prisma, id);
  try {
    await deps.prisma.$transaction(async (tx) => {
      await repo.updateRole(tx, id, input);
      await recordAudit(tx, actor, {
        action: 'role.update',
        entityType: 'role',
        entityId: id,
        before: { name: before.name, description: before.description },
        after: {
          name: input.name ?? before.name,
          description: input.description ?? before.description,
        },
      });
    });
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('CONFLICT', 'A role with this name already exists');
    throw err;
  }
  return getRole(deps.prisma, id);
}

export async function setRolePermissions(
  deps: RoleServiceDeps,
  actor: Actor,
  id: string,
  keys: PermissionKey[],
): Promise<RoleDto> {
  const before = toDto(await editableRole(deps.prisma, id));
  assertCanGrant(actor, keys);
  await deps.prisma.$transaction(async (tx) => {
    await repo.replaceRolePermissions(tx, id, keys);
    await recordAudit(tx, actor, {
      action: 'role.permissions_update',
      entityType: 'role',
      entityId: id,
      before: { permissions: before.permissions },
      after: { permissions: [...keys].sort() },
    });
  });
  await invalidateRolePermissions(deps.redis, id);
  return getRole(deps.prisma, id);
}

export async function deleteRole(deps: RoleServiceDeps, actor: Actor, id: string): Promise<void> {
  const role = toDto(await editableRole(deps.prisma, id));
  if (role.userCount > 0) {
    throw new AppError(
      'CONFLICT',
      'This role is still assigned to staff. Move them to another role first.',
      [{ reason: 'ROLE_IN_USE' }],
    );
  }
  await deps.prisma.$transaction(async (tx) => {
    await repo.deleteRole(tx, id);
    await recordAudit(tx, actor, {
      action: 'role.delete',
      entityType: 'role',
      entityId: id,
      before: { name: role.name, description: role.description, permissions: role.permissions },
    });
  });
  await invalidateRolePermissions(deps.redis, id);
}
