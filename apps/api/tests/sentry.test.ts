import { describe, expect, it } from 'vitest';
import type { Env } from '../src/config/env';
import { initSentry, scrubEvent } from '../src/lib/sentry';

describe('Sentry', () => {
  it('stays off without a DSN', () => {
    expect(initSentry({ SENTRY_DSN: undefined } as Env, 'api')).toBe(false);
  });

  it('strips cookies, bodies, query strings, auth headers and user details before sending', () => {
    const event = scrubEvent({
      type: undefined,
      request: {
        url: 'https://api.shop.test/api/v1/orders/track?phone=01712345678',
        cookies: { 'shop_c.session_token': 'secret' },
        data: '{"phone":"01712345678"}',
        query_string: 'phone=01712345678',
        headers: {
          cookie: 'shop_c.session_token=secret',
          authorization: 'Bearer x',
          'x-revalidate-secret': 'y',
          'user-agent': 'Mozilla',
        },
      },
      user: { id: 'u1', email: 'a@b.c', ip_address: '1.2.3.4' },
    });
    expect(event.request).toEqual({
      url: 'https://api.shop.test/api/v1/orders/track',
      headers: { 'user-agent': 'Mozilla' },
    });
    expect(event.user).toEqual({ id: 'u1' });
  });
});
