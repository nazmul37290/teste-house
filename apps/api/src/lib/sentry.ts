import * as Sentry from '@sentry/node';
import type { Env } from '../config/env';

const KEEP_HEADERS = new Set(['user-agent', 'content-type', 'accept', 'referer']);

/**
 * Error tracking (requirements section 16, Sentry free tier). Off unless SENTRY_DSN is set. Errors
 * only (no performance tracing). Personal data stays out: no cookies, no auth headers, no request
 * bodies, no query strings, no IP addresses.
 */
export function initSentry(env: Env, service: 'api' | 'worker'): boolean {
  if (!env.SENTRY_DSN) return false;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    serverName: service,
    // SDK 11 collects cookies, headers, bodies and query strings by default: switch all of it off.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { allow: [...KEEP_HEADERS] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
    },
    tracesSampleRate: 0,
    beforeSend: scrubEvent,
  });
  Sentry.setTag('service', service);
  return true;
}

/** Exported for tests: what leaves the server. */
export function scrubEvent<E extends Sentry.ErrorEvent>(event: E): E {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) => KEEP_HEADERS.has(k.toLowerCase())),
      );
    }
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}

export { Sentry };
