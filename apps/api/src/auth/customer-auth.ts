import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import type { EmailQueue } from '../jobs/queues';
import { enqueueEmail } from '../services/email.service';
import { linkGuestOrders } from '../services/guest-linking.service';
import { commonAuthOptions, DAY, sessionDefaults, type AuthDeps } from './common';

export const CUSTOMER_AUTH_BASE_PATH = '/api/v1/auth';
/** Web pages Better Auth redirects to after following an email link. */
export const CUSTOMER_EMAIL_VERIFIED_PATH = '/email-verified';

export type CustomerAuthDeps = AuthDeps & { emailQueue: () => EmailQueue };

/**
 * Customer instance (docs/auth.md section 2). Tables customers, customer_sessions, customer_accounts,
 * customer_verifications. Model names are Prisma client properties.
 */
export function createCustomerAuth(deps: CustomerAuthDeps) {
  const common = commonAuthOptions(deps, 'ba:c:');

  // Email callbacks only enqueue (no await in the request path: Better Auth's timing-attack advice).
  // enqueueEmail skips @phone.invalid placeholders, so they are never mailed.
  const send = (job: Parameters<typeof enqueueEmail>[1]) => {
    void enqueueEmail(deps, job).catch((err: unknown) => {
      console.error(
        `Could not enqueue ${job.template} email: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  };

  return betterAuth({
    ...common,
    basePath: CUSTOMER_AUTH_BASE_PATH,
    advanced: { ...common.advanced, cookiePrefix: 'shop_c' },
    // Sign-up, sign-in and profile updates go only through our own endpoints (/auth/register,
    // /auth/login, /me): they normalize the phone and apply our lockout. disabledPaths blocks the
    // HTTP routes; our server-side auth.api calls still work.
    disabledPaths: ['/sign-up/email', '/sign-in/email', '/update-user'],
    rateLimit: {
      ...common.rateLimit,
      customRules: {
        '/request-password-reset': { window: 300, max: 3 },
        '/send-verification-email': { window: 300, max: 3 },
      },
    },
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => {
        send({ template: 'password-reset', to: user.email, data: { name: user.name, url } });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      expiresIn: DAY,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        send({ template: 'email-verify', to: user.email, data: { name: user.name, url } });
      },
      // The only place guest orders are linked: the email is verified at this point (never by phone).
      // Better Auth also runs this after a verified email change.
      afterEmailVerification: async (user) => {
        await linkGuestOrders(deps.prisma, user);
      },
    },
    databaseHooks: {
      session: {
        create: {
          // Every path that creates a session (login, sign-up, verification auto sign-in).
          before: async (session) => {
            const customer = await deps.prisma.customer.findUnique({
              where: { id: session.userId },
              select: { status: true },
            });
            if (customer?.status === 'BLOCKED')
              throw new APIError('FORBIDDEN', { message: 'Account blocked' });
          },
        },
      },
    },
    user: {
      modelName: 'customer',
      // POST /auth/change-email. A verified customer gets a link at the new address; clicking it swaps
      // the email (still verified) and runs afterEmailVerification. An unverified customer (e.g. a
      // phone-only placeholder) has the email swapped at once, still unverified, plus one normal
      // verification email; without this flag Better Auth would swap it on click but leave it
      // unverified, so the customer would need a second email before guest orders could link.
      changeEmail: { enabled: true, updateEmailWithoutVerification: true },
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
