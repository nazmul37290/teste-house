import type { Request } from 'express';
import { describe, expect, it } from 'vitest';
import { clientIp } from '../src/lib/client-ip';

const req = (headers: Record<string, string>, ip = '10.0.0.9') =>
  ({ headers, ip }) as unknown as Request;

describe('clientIp', () => {
  it('production: reads the configured proxy header, first address only', () => {
    const env = { NODE_ENV: 'production' as const, CLIENT_IP_HEADER: 'x-shop-client-ip' };
    expect(clientIp(req({ 'x-shop-client-ip': '203.0.113.7' }), env)).toBe('203.0.113.7');
    expect(clientIp(req({ 'x-shop-client-ip': '203.0.113.7, 10.0.0.1' }), env)).toBe('203.0.113.7');
    // Another proxy's header is ignored when ours is configured (it could be forged).
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.1' }), env)).toBe('10.0.0.9');
  });

  it('production default is Cloudflare; development never trusts the headers', () => {
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.1' }), { NODE_ENV: 'production' })).toBe(
      '198.51.100.1',
    );
    expect(clientIp(req({ 'cf-connecting-ip': '198.51.100.1' }), { NODE_ENV: 'development' })).toBe(
      '10.0.0.9',
    );
  });
});
