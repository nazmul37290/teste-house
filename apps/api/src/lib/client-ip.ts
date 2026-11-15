import type { Request } from 'express';
import type { Env } from '../config/env';

/**
 * The client IP for rate limits and lockout. In production only Cloudflare reaches the origin, so
 * cf-connecting-ip is trustworthy there (docs/auth.md section 6); elsewhere use Express's req.ip.
 */
export function clientIp(req: Request, env: Pick<Env, 'NODE_ENV'>): string {
  if (env.NODE_ENV === 'production') {
    const cf = req.headers['cf-connecting-ip'];
    if (typeof cf === 'string' && cf) return cf;
  }
  return req.ip ?? 'unknown';
}
