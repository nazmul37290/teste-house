import type { Request } from 'express';
import type { Env } from '../config/env';

/**
 * The client IP for rate limits and lockout. In production it comes from CLIENT_IP_HEADER, which
 * the proxy in front overwrites with the real visitor IP (Cloudflare: cf-connecting-ip; Caddy on our
 * VPS: x-shop-client-ip). That is only safe if nothing reaches the app around the proxy (docs/auth.md
 * section 6). Elsewhere, or if the header is missing, Express's req.ip.
 */
export function clientIp(
  req: Request,
  env: Pick<Env, 'NODE_ENV'> & Partial<Pick<Env, 'CLIENT_IP_HEADER'>>,
): string {
  if (env.NODE_ENV === 'production') {
    const value = req.headers[env.CLIENT_IP_HEADER ?? 'cf-connecting-ip'];
    const ip = (Array.isArray(value) ? value[0] : value)?.split(',')[0]?.trim();
    if (ip) return ip;
  }
  return req.ip ?? 'unknown';
}
