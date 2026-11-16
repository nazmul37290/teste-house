import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';

export type CustomerContext = {
  id: string;
  name: string;
  phone: string;
  email: string;
  emailVerified: boolean;
};

type AuthDeps = Pick<Deps, 'customerAuth' | 'prisma'>;

/**
 * Customer session from customerAuth (shop_c cookies only; an admin session never passes). Blocked
 * customers are treated as signed out. Returns null when there is no usable session.
 */
async function loadCustomer(deps: AuthDeps, req: Request): Promise<CustomerContext | null> {
  const session = await deps.customerAuth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) return null;
  const customer = await deps.prisma.customer.findUnique({
    where: { id: session.user.id },
    select: { id: true, name: true, phone: true, email: true, emailVerified: true, status: true },
  });
  if (!customer || customer.status === 'BLOCKED') return null;
  const { status: _status, ...ctx } = customer;
  return ctx;
}

export function requireCustomer(deps: AuthDeps): RequestHandler {
  return async (req, _res, next) => {
    const customer = await loadCustomer(deps, req);
    if (!customer) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    req.customer = customer;
    next();
  };
}

/** Sets req.customer when signed in; guests pass through (cart, checkout, orders). */
export function optionalCustomer(deps: AuthDeps): RequestHandler {
  return async (req, _res, next) => {
    req.customer = (await loadCustomer(deps, req)) ?? undefined;
    next();
  };
}

/** The customer set by requireCustomer. Only call it in handlers mounted behind requireCustomer. */
export function currentCustomer(req: Request): CustomerContext {
  if (!req.customer) throw new AppError('UNAUTHENTICATED', 'Sign in required');
  return req.customer;
}
