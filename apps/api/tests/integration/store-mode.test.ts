import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
let h: Record<string, string>;

beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
});
afterAll(async () => {
  await ctx.deps.prisma.setting.update({ where: { key: 'store.mode' }, data: { value: 'live' } });
  await ctx.close();
});

const setMode = (body: object, headers = h) =>
  request(ctx.app).put('/api/v1/admin/settings').set(headers).send(body);
const shopper = (path: string) =>
  request(ctx.app).post(`/api/v1${path}`).set('X-Requested-With', 'fetch').send({});

describe('shop status (live / maintenance)', () => {
  it('maintenance refuses new orders and payments with 503 and Retry-After; live lets them through', async () => {
    const on = await setMode({
      'store.mode': 'maintenance',
      'store.maintenanceMessage': ' Back at 6 pm. ',
    });
    expect(on.status).toBe(200);
    const pub = await request(ctx.app).get('/api/v1/settings/public');
    expect(pub.body.data).toMatchObject({
      'store.mode': 'maintenance',
      'store.maintenanceMessage': 'Back at 6 pm.',
    });

    for (const path of ['/orders', '/orders/pay']) {
      const res = await shopper(path);
      expect(res.status).toBe(503);
      expect(res.body.error.code).toBe('MAINTENANCE');
      expect(res.headers['retry-after']).toBe('600');
    }
    // Tracking an existing order keeps working.
    expect((await shopper('/orders/track')).status).toBe(400);

    expect((await setMode({ 'store.mode': 'live' })).status).toBe(200);
    // Live: the same empty request now reaches validation instead.
    expect((await shopper('/orders')).status).toBe(400);
  });

  it('only known modes, and only with settings.manage', async () => {
    expect((await setMode({ 'store.mode': 'closed' })).status).toBe(400);
    expect((await setMode({ 'store.maintenanceMessage': 'x'.repeat(301) })).status).toBe(400);
    const manager = adminHeaders((await adminSession(ctx, 'Manager')).cookie);
    expect((await setMode({ 'store.mode': 'maintenance' }, manager)).status).toBe(403);
  });
});
