import { adminPasswordSchema } from '@shop/shared';
import { z } from 'zod';
import type { AdminAuth } from '../auth/admin-auth';
import { createAdminUserWithPassword } from '../auth/admin-users';
import type { Db } from '../lib/prisma';

export const superAdminInput = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(2).max(100),
  password: adminPasswordSchema,
});
export type SuperAdminInput = z.input<typeof superAdminInput>;

/**
 * Creates the first Super Admin through adminAuth (never by writing a hash). Idempotent: if an admin
 * with that email exists, nothing changes (its password is never reset here).
 */
export async function ensureSuperAdmin(
  deps: { prisma: Db; adminAuth: AdminAuth },
  raw: SuperAdminInput,
): Promise<{ created: boolean; id: string }> {
  const input = superAdminInput.parse(raw);
  const role = await deps.prisma.role.findFirst({
    where: { isSystem: true },
    select: { id: true },
  });
  if (!role) throw new Error('The Super Admin role is missing: run the seed first (pnpm db:seed)');

  const existing = await deps.prisma.adminUser.findUnique({
    where: { email: input.email },
    select: { id: true },
  });
  if (existing) return { created: false, id: existing.id };

  const user = await createAdminUserWithPassword(deps.adminAuth, { ...input, roleId: role.id });
  return { created: true, id: user.id };
}
