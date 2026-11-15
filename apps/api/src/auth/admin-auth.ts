import { betterAuth } from 'better-auth';
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
    emailAndPassword: { enabled: true, disableSignUp: true },
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
        // Store name comes from settings; wired up in step 5.
        issuer: 'Shop Admin',
        skipVerificationOnEnable: false,
        schema: { twoFactor: { modelName: 'adminTwoFactor' } },
      }),
    ],
  });
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
