import { PERMISSION_KEYS, type PermissionKey } from '@shop/shared';
import type { Redis } from 'ioredis';
import { getRolePermissionKeys } from '../lib/permission-cache';
import type { Db } from '../lib/prisma';
import { findAdminWithRole } from '../repositories/admin.repository';

export type AdminContext = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  twoFactorEnabled: boolean;
  lastLoginAt: Date | null;
  role: { id: string; name: string; isSystem: boolean };
  /** Effective permission keys. The system role (Super Admin) always has all of them, in code. */
  permissions: PermissionKey[];
};

const KNOWN = new Set<string>(PERMISSION_KEYS);

export async function loadAdminContext(
  deps: { prisma: Db; redis: Redis },
  adminId: string,
): Promise<AdminContext | null> {
  const admin = await findAdminWithRole(deps.prisma, adminId);
  if (!admin) return null;
  const { role, twoFactorEnabled, ...rest } = admin;
  const permissions = role.isSystem
    ? [...PERMISSION_KEYS]
    : (await getRolePermissionKeys(deps, role.id)).filter((k): k is PermissionKey => KNOWN.has(k));
  return { ...rest, twoFactorEnabled: twoFactorEnabled ?? false, role, permissions };
}
