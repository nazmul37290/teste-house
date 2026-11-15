import type { RequestHandler } from 'express';
import { AppError } from '../lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Our state-changing routes require X-Requested-With (docs/design.md section 3). A browser cannot add
 * a custom header to a cross-site request without a CORS preflight, which our strict CORS refuses.
 * Better Auth routes rely on its own Origin check; webhooks are excluded.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method) || req.get('x-requested-with')) return next();
  next(new AppError('FORBIDDEN', 'Missing X-Requested-With header'));
};
