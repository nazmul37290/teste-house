import { fromNodeHeaders } from 'better-auth/node';
import type { Request, RequestHandler } from 'express';
import type { Deps } from '../deps';
import { AppError } from '../lib/errors';
import { loadAdminContext, type AdminContext } from '../services/admin-access.service';

/**
 * Admin session from adminAuth (shop_a cookies only; a customer session never passes). Loads the
 * admin, role and permissions onto req.admin. Inactive admins are rejected on every request, not just
 * at sign-in.
 */
export function requireAdmin(deps: Pick<Deps, 'adminAuth' | 'prisma' | 'redis'>): RequestHandler {
  return async (req, _res, next) => {
    // disableCookieCache: always check the session store, so a revoked session (deactivation,
    // password reset) stops working at once instead of after the 5-minute cookie cache.
    const session = await deps.adminAuth.api.getSession({
      headers: fromNodeHeaders(req.headers),
      query: { disableCookieCache: true },
    });
    if (!session) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    const admin = await loadAdminContext(deps, session.user.id);
    if (!admin) throw new AppError('UNAUTHENTICATED', 'Sign in required');
    if (!admin.isActive) throw new AppError('FORBIDDEN', 'Account disabled');
    req.admin = admin;
    next();
  };
}

/** The admin set by requireAdmin. Only call it in handlers mounted behind requireAdmin. */
export function currentAdmin(req: Request): AdminContext {
  if (!req.admin) throw new AppError('UNAUTHENTICATED', 'Sign in required');
  return req.admin;
}
