import type { CreateAdminUserInput, ListQuery, UpdateAdminUserInput } from '@shop/shared';
import type { AdminAuth } from '../auth/admin-auth';
import { createAdminUserWithPassword } from '../auth/admin-users';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/admin-user.repository';
import { findRole, rolePermissionKeys } from '../repositories/role.repository';
import { recordAudit, type Actor } from './audit.service';
import { assertCanGrant, businessRule } from './role.service';

/**
 * Staff accounts (docs/api-conventions.md, Staff). Admins are never hard-deleted: deactivating keeps
 * their name on the audit log, order notes and stock movements, and revokes their sessions at once.
 */
export type AdminUserServiceDeps = { prisma: Db; adminAuth: AdminAuth };
export type AdminUserDto = NonNullable<Awaited<ReturnType<typeof repo.findAdminUser>>>;

async function target(prisma: Db, id: string): Promise<AdminUserDto> {
  const admin = await repo.findAdminUser(prisma, id);
  if (!admin) throw new AppError('NOT_FOUND', 'Staff member not found');
  return admin;
}

/** Only a Super Admin can manage Super Admin accounts. */
function assertCanManage(actor: Actor, admin: AdminUserDto): void {
  if (admin.role.isSystem && !actor.isSuperAdmin) {
    throw new AppError('FORBIDDEN', 'Only a Super Admin can change a Super Admin account');
  }
}

/** A role can be assigned only by someone who holds everything it grants (no escalation). */
async function assertCanAssignRole(
  prisma: Db,
  actor: Actor,
  roleId: string,
): Promise<{ isSystem: boolean }> {
  const role = await findRole(prisma, roleId);
  if (!role) throw businessRule('UNKNOWN_ROLE', 'That role does not exist');
  if (role.isSystem && !actor.isSuperAdmin) {
    throw new AppError('FORBIDDEN', 'Only a Super Admin can assign the Super Admin role');
  }
  if (!role.isSystem) assertCanGrant(actor, await rolePermissionKeys(prisma, roleId));
  return { isSystem: role.isSystem };
}

async function revokeSessions(adminAuth: AdminAuth, adminId: string): Promise<void> {
  await (await adminAuth.$context).internalAdapter.deleteUserSessions(adminId);
}

const auditView = (a: AdminUserDto) => ({
  name: a.name,
  email: a.email,
  isActive: a.isActive,
  roleId: a.role.id,
  role: a.role.name,
});

export async function listAdminUsers(prisma: Db, query: ListQuery) {
  return repo.listAdminUsers(prisma, query);
}

export async function getAdminUser(prisma: Db, id: string): Promise<AdminUserDto> {
  return target(prisma, id);
}

export async function createAdminUser(
  deps: AdminUserServiceDeps,
  actor: Actor,
  input: CreateAdminUserInput,
): Promise<AdminUserDto> {
  await assertCanAssignRole(deps.prisma, actor, input.roleId);
  if (await repo.adminEmailTaken(deps.prisma, input.email)) {
    throw new AppError('CONFLICT', 'A staff member with this email already exists');
  }
  const user = await createAdminUserWithPassword(deps.adminAuth, input);
  const created = await target(deps.prisma, user.id);
  await recordAudit(deps.prisma, actor, {
    action: 'admin_user.create',
    entityType: 'admin_user',
    entityId: user.id,
    after: auditView(created),
  });
  return created;
}

export async function updateAdminUser(
  deps: AdminUserServiceDeps,
  actor: Actor,
  id: string,
  input: UpdateAdminUserInput,
): Promise<AdminUserDto> {
  const before = await target(deps.prisma, id);
  assertCanManage(actor, before);

  const self = id === actor.adminUserId;
  const deactivating = input.isActive === false && before.isActive;
  const roleChanging = input.roleId !== undefined && input.roleId !== before.role.id;
  if (self && deactivating)
    throw businessRule('CANNOT_DEACTIVATE_SELF', 'You cannot deactivate your own account');
  if (self && roleChanging)
    throw businessRule('CANNOT_CHANGE_OWN_ROLE', 'You cannot change your own role');

  const newRole = roleChanging
    ? await assertCanAssignRole(deps.prisma, actor, input.roleId!)
    : null;
  const leavesSuperAdmins =
    before.role.isSystem && before.isActive && (deactivating || (newRole && !newRole.isSystem));

  const after = await deps.prisma.$transaction(async (tx) => {
    if (leavesSuperAdmins && (await repo.lockActiveSuperAdmins(tx)) <= 1) {
      throw businessRule('LAST_SUPER_ADMIN', 'The store needs at least one active Super Admin');
    }
    const updated = await repo.updateAdminUser(tx, id, input);
    await recordAudit(tx, actor, {
      action: deactivating ? 'admin_user.deactivate' : 'admin_user.update',
      entityType: 'admin_user',
      entityId: id,
      before: auditView(before),
      after: auditView(updated),
    });
    return updated;
  });

  if (deactivating) await revokeSessions(deps.adminAuth, id);
  return after;
}

/**
 * Sets a new password for another staff member (through Better Auth's hasher) and signs them out
 * everywhere. Admins change their own password with Better Auth's /change-password, which needs the
 * current one.
 */
export async function setAdminPassword(
  deps: AdminUserServiceDeps,
  actor: Actor,
  id: string,
  password: string,
): Promise<void> {
  const admin = await target(deps.prisma, id);
  assertCanManage(actor, admin);
  if (id === actor.adminUserId) {
    throw businessRule(
      'USE_CHANGE_PASSWORD',
      'Change your own password from your profile (it asks for the current one)',
    );
  }
  const ctx = await deps.adminAuth.$context;
  await ctx.internalAdapter.updatePassword(id, await ctx.password.hash(password));
  await revokeSessions(deps.adminAuth, id);
  await recordAudit(deps.prisma, actor, {
    action: 'admin_user.password_reset',
    entityType: 'admin_user',
    entityId: id,
  });
}
