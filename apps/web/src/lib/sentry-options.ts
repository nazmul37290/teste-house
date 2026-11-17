import type { ErrorEvent, init } from '@sentry/nextjs';

/**
 * Shared Sentry settings for the web app (server and browser). Errors only, and no personal data:
 * no cookies, bodies, query strings or user details (the SDK collects them by default).
 */
const KEEP_HEADERS = ['user-agent', 'content-type', 'accept', 'referer'];

type DataCollection = NonNullable<NonNullable<Parameters<typeof init>[0]>['dataCollection']>;

export const dataCollection: DataCollection = {
  userInfo: false,
  cookies: false,
  httpHeaders: { request: { allow: KEEP_HEADERS }, response: false },
  httpBodies: [],
  urlQueryParams: false,
};

export function scrubEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.query_string;
    if (event.request.headers) {
      event.request.headers = Object.fromEntries(
        Object.entries(event.request.headers).filter(([k]) =>
          KEEP_HEADERS.includes(k.toLowerCase()),
        ),
      );
    }
    if (event.request.url) event.request.url = event.request.url.split('?')[0];
  }
  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  return event;
}
