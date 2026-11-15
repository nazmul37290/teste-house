import type { AdminAuth } from './admin-auth';

export type NewAdminUser = { name: string; email: string; password: string; roleId: string };

/**
 * Creates an admin with a credential account through adminAuth's internal adapter and password
 * hasher (sign-up is disabled on adminAuth, and we never write hashes ourselves; docs/auth.md).
 */
export async function createAdminUserWithPassword(adminAuth: AdminAuth, input: NewAdminUser) {
  const ctx = await adminAuth.$context;
  const user = await ctx.internalAdapter.createUser(
    {
      name: input.name,
      email: input.email.toLowerCase(),
      emailVerified: true,
      roleId: input.roleId,
      isActive: true,
    },
    { method: 'admin' },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: 'credential',
    accountId: user.id,
    password: await ctx.password.hash(input.password),
  });
  return user;
}
