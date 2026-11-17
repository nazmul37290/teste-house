import * as Sentry from '@sentry/nextjs';
import { dataCollection, scrubEvent } from './lib/sentry-options';

/** Browser error tracking; off unless NEXT_PUBLIC_SENTRY_DSN was set at build time (not a secret). */
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    tracesSampleRate: 0,
    dataCollection,
    beforeSend: scrubEvent,
  });
}
