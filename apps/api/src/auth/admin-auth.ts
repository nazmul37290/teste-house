import { ADMIN_PASSWORD_MIN_LENGTH } from '@shop/shared';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { twoFactor } from 'better-auth/plugins';
import { commonAuthOptions, DAY, sessionDefaults, type AuthDeps } from './common';

export const ADMIN_AUTH_BASE_PATH = '/api/v1/admin/auth';

/**
 * Admin instance (docs/auth.md section 2). Tables admin_users, admin_sessions, admin_accounts,
 * admin_verifications, admin_two_factors. No public sign-up; admins are created by our own code.
 */
export function createAdminAuth(deps: AuthDeps) {
  const common = commonAuthOptions(deps, 'ba:a:');
  return betterAuth({
    ...common,
    basePath: ADMIN_AUTH_BASE_PATH,
    advanced: { ...common.advanced, cookiePrefix: 'shop_a' },
    // Admins sign in through Better Auth's own HTTP route, so its rate limit is their lockout.
    rateLimit: { ...common.rateLimit, customRules: { '/sign-in/email': { window: 60, max: 5 } } },
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: ADMIN_PASSWORD_MIN_LENGTH,
    },
    databaseHooks: {
      session: {
        create: {
          // Inactive admins never get a session (existing ones are revoked when an admin is deactivated).
          before: async (session) => {
            const admin = await deps.prisma.adminUser.findUnique({
              where: { id: session.userId },
              select: { isActive: true },
            });
            if (!admin?.isActive) throw new APIError('FORBIDDEN', { message: 'Account disabled' });
          },
          after: async (session) => {
            await deps.prisma.adminUser.update({
              where: { id: session.userId },
              data: { lastLoginAt: new Date() },
            });
          },
        },
      },
    },
    user: {
      modelName: 'adminUser',
      additionalFields: {
        roleId: { type: 'string', required: true, input: false },
        isActive: { type: 'boolean', required: false, defaultValue: true, input: false },
        lastLoginAt: { type: 'date', required: false, input: false },
      },
    },
    session: { ...sessionDefaults, modelName: 'adminSession', expiresIn: 7 * DAY },
    account: { modelName: 'adminAccount' },
    verification: { ...common.verification, modelName: 'adminVerification' },
    plugins: [
      twoFactor({
        // No issuer here: the admin UI sends the store name (from settings) as `issuer` when enabling
        // 2FA, which is when the QR code is made. Enabling needs the password and a valid TOTP code.
        skipVerificationOnEnable: false,
        schema: { twoFactor: { modelName: 'adminTwoFactor' } },
      }),
    ],
  });
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
