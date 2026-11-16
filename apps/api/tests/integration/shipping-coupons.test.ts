import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
const { prisma } = ctx.deps;
const TAG = `t${Date.now().toString(36)}`;

let h: Record<string, string>;
let salesman: Record<string, string>;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
  // Leftovers from an interrupted earlier run would hold the test districts.
  await prisma.deliveryZone.deleteMany({ where: { code: { startsWith: 'test-' } } });
});
afterAll(async () => {
  await prisma.deliveryZone.deleteMany({ where: { code: { startsWith: 'test-' } } });
  await prisma.deliveryZone.update({ where: { code: 'outside-dhaka' }, data: { isDefault: true } });
  await prisma.coupon.deleteMany({ where: { code: { startsWith: TAG.toUpperCase() } } });
  await ctx.close();
});

const api = {
  get: (p: string, headers = h) => request(ctx.app).get(`/api/v1/admin${p}`).set(headers),
  post: (p: string, b: object, headers = h) =>
    request(ctx.app).post(`/api/v1/admin${p}`).set(headers).send(b),
  patch: (p: string, b: object) => request(ctx.app).patch(`/api/v1/admin${p}`).set(h).send(b),
  del: (p: string) => request(ctx.app).delete(`/api/v1/admin${p}`).set(h),
};

describe('delivery zones', () => {
  it('creates, edits and deletes a zone; districts belong to one zone only', async () => {
    const clash = await api.post('/delivery-zones', {
      name: 'Greater Dhaka',
      code: 'test-greater-dhaka',
      districts: ['Dhaka', 'Gazipur'],
      charge: '80',
    });
    expect(clash.status).toBe(422);
    expect(clash.body.error.details[0].reason).toBe('DISTRICT_IN_OTHER_ZONE');

    const created = await api.post('/delivery-zones', {
      name: 'Sylhet region',
      code: 'test-sylhet',
      districts: ['Sylhet', 'Moulvibazar'],
      charge: '100',
      freeDeliveryThreshold: '3000',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      districts: ['Moulvibazar', 'Sylhet'],
      charge: '100.00',
      freeDeliveryThreshold: '3000.00',
      isActive: true,
      orderCount: 0,
    });
    const id = created.body.data.id as string;

    const dup = await api.post('/delivery-zones', {
      name: 'Copy',
      code: 'test-sylhet',
      districts: [],
      charge: '1',
    });
    expect(dup.status).toBe(409);

    const off = await api.patch(`/delivery-zones/${id}`, { isActive: false, charge: '120.5' });
    expect(off.body.data).toMatchObject({ isActive: false, charge: '120.50' });
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(2);

    expect((await api.del(`/delivery-zones/${id}`)).status).toBe(204);
  });

  it('keeps a single default zone', async () => {
    const created = await api.post('/delivery-zones', {
      name: 'Test default',
      code: 'test-default',
      districts: [],
      charge: '150',
      isDefault: true,
    });
    expect(created.status).toBe(201);
    const defaults = await prisma.deliveryZone.findMany({ where: { isDefault: true } });
    expect(defaults.map((z) => z.code)).toEqual(['test-default']);
  });

  it('needs shipping.manage', async () => {
    expect((await api.get('/delivery-zones', salesman)).status).toBe(403);
  });
});

describe('payment methods', () => {
  it('toggles a method and sets the COD scope and limits (merged)', async () => {
    const list = await api.get('/payment-methods');
    const cod = list.body.data.find((m: { code: string }) => m.code === 'COD');
    const online = list.body.data.find((m: { code: string }) => m.code === 'UDDOKTAPAY');
    const original = await prisma.paymentMethod.findUniqueOrThrow({ where: { id: cod.id } });
    try {
      const r1 = await api.patch(`/payment-methods/${cod.id}`, {
        config: { scope: 'NATIONWIDE', maxAmount: '20000' },
      });
      expect(r1.status).toBe(200);
      expect(r1.body.data.config).toEqual({ scope: 'NATIONWIDE', maxAmount: '20000.00' });
      const r2 = await api.patch(`/payment-methods/${cod.id}`, { config: { minAmount: '100' } });
      expect(r2.body.data.config).toEqual({
        scope: 'NATIONWIDE',
        minAmount: '100.00',
        maxAmount: '20000.00',
      });
      const r3 = await api.patch(`/payment-methods/${cod.id}`, { config: { maxAmount: null } });
      expect(r3.body.data.config).toEqual({ scope: 'NATIONWIDE', minAmount: '100.00' });
      const bad = await api.patch(`/payment-methods/${cod.id}`, { config: { maxAmount: '50' } });
      expect(bad.status).toBe(400);

      const scopeOnline = await api.patch(`/payment-methods/${online.id}`, {
        config: { scope: 'DHAKA_ONLY' },
      });
      expect(scopeOnline.status).toBe(400);
    } finally {
      await prisma.paymentMethod.update({
        where: { id: cod.id },
        data: { config: original.config ?? {}, isActive: original.isActive },
      });
    }
  });
});

describe('coupons', () => {
  it('creates, refuses a duplicate code, edits and deletes an unused coupon', async () => {
    const code = `${TAG}a`;
    const created = await api.post('/coupons', {
      code,
      type: 'PERCENT',
      value: '10',
      maxDiscount: '150',
      minOrderAmount: '1500',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      code: code.toUpperCase(),
      value: '10.00',
      usedCount: 0,
    });
    const id = created.body.data.id as string;

    const dup = await api.post('/coupons', { code: code.toLowerCase(), type: 'FIXED', value: '5' });
    expect(dup.status).toBe(409);

    const edited = await api.patch(`/coupons/${id}`, { expiresAt: '2020-01-01T00:00:00Z' });
    expect(edited.status).toBe(200);
    const badDates = await api.patch(`/coupons/${id}`, { startsAt: '2021-01-01T00:00:00Z' });
    expect(badDates.status).toBe(400);

    expect((await api.del(`/coupons/${id}`)).status).toBe(204);
  });

  it('keeps a used coupon: no delete, no code change', async () => {
    const created = await api.post('/coupons', { code: `${TAG}b`, type: 'FIXED', value: '50' });
    const id = created.body.data.id as string;
    await prisma.coupon.update({ where: { id }, data: { usedCount: 1 } });

    const del = await api.del(`/coupons/${id}`);
    expect(del.status).toBe(409);
    expect(del.body.error.details[0].reason).toBe('COUPON_IN_USE');
    const rename = await api.patch(`/coupons/${id}`, { code: `${TAG}c` });
    expect(rename.body.error.details[0].reason).toBe('COUPON_USED');
    expect((await api.patch(`/coupons/${id}`, { isActive: false })).body.data.isActive).toBe(false);
  });

  it('needs coupons.manage', async () => {
    expect((await api.get('/coupons', salesman)).status).toBe(403);
  });
});
