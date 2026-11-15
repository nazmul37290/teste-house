import { z } from 'zod';
import { PERMISSION_KEYS, type PermissionKey } from './permissions';
import { adminPasswordSchema } from './schemas';

/** Admin API inputs (staff and roles). Strict: unknown fields are rejected. */

const KNOWN_KEYS = new Set<string>(PERMISSION_KEYS);

export const permissionKeySchema = z
  .string()
  .refine((k) => KNOWN_KEYS.has(k), { message: 'Unknown permission' })
  .transform((k) => k as PermissionKey);

/** De-duplicated list of known permission keys. */
const permissionList = z
  .array(permissionKeySchema)
  .max(PERMISSION_KEYS.length * 2)
  .transform((keys) => [...new Set(keys)]);

const roleName = z.string().trim().min(2).max(50);
const roleDescription = z.string().trim().max(200).nullable();

export const createRoleSchema = z.strictObject({
  name: roleName,
  description: roleDescription.optional(),
  permissions: permissionList.default([]),
});

export const updateRoleSchema = z
  .strictObject({ name: roleName.optional(), description: roleDescription.optional() })
  .refine((v) => v.name !== undefined || v.description !== undefined, {
    message: 'Nothing to update',
  });

export const setRolePermissionsSchema = z.strictObject({ permissions: permissionList });

const adminName = z.string().trim().min(2).max(100);
const adminEmail = z.string().trim().toLowerCase().pipe(z.email());

export const createAdminUserSchema = z.strictObject({
  name: adminName,
  email: adminEmail,
  password: adminPasswordSchema,
  roleId: z.uuid(),
});

export const updateAdminUserSchema = z
  .strictObject({
    name: adminName.optional(),
    roleId: z.uuid().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export const setAdminPasswordSchema = z.strictObject({ password: adminPasswordSchema });

/** ?page=1&pageSize=20&q=... (docs/api-conventions.md section 2). */
export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
});

export const idParamSchema = z.object({ id: z.uuid() });

export type CreateRoleInput = z.output<typeof createRoleSchema>;
export type UpdateRoleInput = z.output<typeof updateRoleSchema>;
export type CreateAdminUserInput = z.output<typeof createAdminUserSchema>;
export type UpdateAdminUserInput = z.output<typeof updateAdminUserSchema>;
export type ListQuery = z.output<typeof listQuerySchema>;
