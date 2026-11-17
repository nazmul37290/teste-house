import * as Sentry from '@sentry/nextjs';
import { dataCollection, scrubEvent } from './lib/sentry-options';

/** Server-side error tracking for the web app; off unless SENTRY_DSN is set (runtime env). */
export function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: 0,
    dataCollection,
    beforeSend: scrubEvent,
  });
}

/** Errors thrown while rendering server components and route handlers. */
export const onRequestError = Sentry.captureRequestError;
