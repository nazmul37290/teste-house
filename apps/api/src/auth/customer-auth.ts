import { betterAuth } from 'better-auth';
import { commonAuthOptions, DAY, sessionDefaults, type AuthDeps } from './common';

export const CUSTOMER_AUTH_BASE_PATH = '/api/v1/auth';

/**
 * Customer instance (docs/auth.md section 2). Tables customers, customer_sessions, customer_accounts,
 * customer_verifications. Model names are Prisma client properties.
 */
export function createCustomerAuth(deps: AuthDeps) {
  const common = commonAuthOptions(deps, 'ba:c:');
  return betterAuth({
    ...common,
    basePath: CUSTOMER_AUTH_BASE_PATH,
    advanced: { ...common.advanced, cookiePrefix: 'shop_c' },
    // Sign-up and profile updates go only through our own endpoints (/auth/register, /me), which
    // normalize the phone. disabledPaths blocks the HTTP routes; server-side auth.api calls still work.
    disabledPaths: ['/sign-up/email', '/update-user'],
    emailAndPassword: { enabled: true },
    user: {
      modelName: 'customer',
      additionalFields: {
        // Settable only through server-side calls (both HTTP paths that accept it are disabled above).
        phone: { type: 'string', required: true, unique: true },
        status: {
          type: ['ACTIVE', 'BLOCKED'],
          required: false,
          defaultValue: 'ACTIVE',
          input: false,
        },
        lastLoginAt: { type: 'date', required: false, input: false },
      },
    },
    session: { ...sessionDefaults, modelName: 'customerSession', expiresIn: 30 * DAY },
    account: { modelName: 'customerAccount' },
    verification: { ...common.verification, modelName: 'customerVerification' },
  });
}

export type CustomerAuth = ReturnType<typeof createCustomerAuth>;
