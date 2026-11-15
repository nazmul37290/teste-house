import {
  isPlaceholderEmail,
  parseLoginIdentifier,
  placeholderEmailFor,
  type LoginInput,
  type RegisterInput,
} from '@shop/shared';
import { isAPIError } from 'better-auth/api';
import type { Redis } from 'ioredis';
import { CUSTOMER_EMAIL_VERIFIED_PATH, type CustomerAuth } from '../auth/customer-auth';
import { AppError, rateLimited } from '../lib/errors';
import { Lockout, type LockoutDecision } from '../lib/lockout';
import type { Db } from '../lib/prisma';
import {
  customerExists,
  findCustomerForLogin,
  findCustomerProfile,
  touchLastLogin,
} from '../repositories/customer.repository';

export type CustomerAuthServiceDeps = { prisma: Db; redis: Redis; customerAuth: CustomerAuth };
/** Request headers for Better Auth (IP, user agent) plus the client IP for our lockout. */
export type AuthRequestContext = { headers: Headers; ip: string };

export type CustomerProfile = {
  id: string;
  name: string;
  phone: string;
  /** null for phone-only customers (their placeholder email is never shown). */
  email: string | null;
  emailVerified: boolean;
  createdAt: Date;
};
export type AuthResult = { customer: CustomerProfile; setCookie: string[] };

/** One message for every login failure, whether or not the identifier exists (docs/auth.md). */
export const INVALID_CREDENTIALS = 'Invalid phone/email or password';
const DUPLICATE = 'An account with this phone number or email already exists';

async function profile(prisma: Db, id: string): Promise<CustomerProfile> {
  const { email, ...rest } = await findCustomerProfile(prisma, id);
  return { ...rest, email: isPlaceholderEmail(email) ? null : email };
}

function throwIfLocked(...decisions: LockoutDecision[]): void {
  const waits = decisions.flatMap((d) => (d.allowed ? [] : [d.retryAfterSec]));
  if (waits.length) throw rateLimited(Math.max(...waits));
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

export async function registerCustomer(
  deps: CustomerAuthServiceDeps,
  input: RegisterInput,
  ctx: AuthRequestContext,
): Promise<AuthResult> {
  const ipLock = new Lockout(deps.redis, 'registerIp');
  throwIfLocked(await ipLock.check(ctx.ip));
  await ipLock.fail(ctx.ip); // every registration attempt counts towards the per-IP limit

  // registerSchema already normalized the phone (normalizePhone) and lowercased the email.
  const email = input.email ?? placeholderEmailFor(input.phone);
  if (await customerExists(deps.prisma, input.phone, email))
    throw new AppError('CONFLICT', DUPLICATE);

  try {
    const { headers, response } = await deps.customerAuth.api.signUpEmail({
      body: {
        name: input.name,
        email,
        password: input.password,
        phone: input.phone,
        callbackURL: CUSTOMER_EMAIL_VERIFIED_PATH,
      },
      headers: ctx.headers,
      returnHeaders: true,
    });
    return {
      customer: await profile(deps.prisma, response.user.id),
      setCookie: headers.getSetCookie(),
    };
  } catch (err) {
    // A concurrent registration can still win the race between the check above and the insert.
    if (
      (isAPIError(err) && String(err.body?.code ?? '').startsWith('USER_ALREADY_EXISTS')) ||
      isUniqueViolation(err)
    ) {
      throw new AppError('CONFLICT', DUPLICATE);
    }
    throw err;
  }
}

export async function loginCustomer(
  deps: CustomerAuthServiceDeps,
  input: LoginInput,
  ctx: AuthRequestContext,
): Promise<AuthResult> {
  const parsed = parseLoginIdentifier(input.identifier);
  const subject = parsed
    ? `${parsed.type}:${parsed.value}`
    : `raw:${input.identifier.trim().toLowerCase()}`;
  const idLock = new Lockout(deps.redis, 'loginIdentifier');
  const ipLock = new Lockout(deps.redis, 'loginIp');
  throwIfLocked(await idLock.check(subject), await ipLock.check(ctx.ip));

  const fail = async (): Promise<never> => {
    await Promise.all([idLock.fail(subject), ipLock.fail(ctx.ip)]);
    throw new AppError('UNAUTHENTICATED', INVALID_CREDENTIALS);
  };

  // Placeholder addresses are internal: nobody logs in with them.
  const lookup = !parsed
    ? null
    : parsed.type === 'phone'
      ? { phone: parsed.value }
      : isPlaceholderEmail(parsed.value)
        ? null
        : { email: parsed.value };
  const customer = lookup ? await findCustomerForLogin(deps.prisma, lookup) : null;
  if (!customer || customer.status === 'BLOCKED') {
    // Hash anyway, so an unknown or blocked identifier takes as long as a wrong password.
    await (await deps.customerAuth.$context).password.hash(input.password);
    return fail();
  }

  let headers: Headers;
  try {
    ({ headers } = await deps.customerAuth.api.signInEmail({
      body: { email: customer.email, password: input.password },
      headers: ctx.headers,
      returnHeaders: true,
    }));
  } catch (err) {
    if (isAPIError(err) && (err.statusCode === 401 || err.statusCode === 403)) return fail();
    throw err;
  }

  await Promise.all([idLock.reset(subject), touchLastLogin(deps.prisma, customer.id)]);
  return { customer: await profile(deps.prisma, customer.id), setCookie: headers.getSetCookie() };
}
