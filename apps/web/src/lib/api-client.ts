import { parseEnvelope } from './api-types';

/**
 * Browser call to our API through the same-origin rewrite (/api/v1/*). Sends cookies and the CSRF
 * header our state-changing routes require.
 */
export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method: init.method ?? 'GET',
    credentials: 'include',
    headers: {
      'X-Requested-With': 'XMLHttpRequest',
      ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  return parseEnvelope<T>(res);
}
