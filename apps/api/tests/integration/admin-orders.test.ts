import { randomUUID } from 'node:crypto';
import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  adminHeaders,
  adminSession,
  createTestContext,
  ourRouteHeaders,
  uniquePhone,
} from './helpers';
import { makeProduct, uid } from './fixtures';

const ctx = createTestContext();
const { prisma } = ctx.deps;

let h: Record<string, string>;
let salesman: Record<string, string>;
let savedInside: { charge: unknown; freeDeliveryThreshold: unknown };
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
  const z = await prisma.deliveryZone.findUniqueOrThrow({ where: { code: 'inside-dhaka' } });
  savedInside = { charge: z.charge, freeDeliveryThreshold: z.freeDeliveryThreshold };
  await prisma.deliveryZone.update({
    where: { code: 'inside-dhaka' },
    data: { charge: '60', freeDeliveryThreshold: null, isActive: true },
  });
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'DHAKA_ONLY' } },
  });
});
afterAll(async () => {
  await prisma.deliveryZone.update({
    where: { code: 'inside-dhaka' },
    data: {
      charge: savedInside.charge as string,
      freeDeliveryThreshold: savedInside.freeDeliveryThreshold as string | null,
    },
  });
  await ctx.close();
});

const dhaka = {
  recipientName: 'Admin Test',
  phone: '01712345678',
  division: 'Dhaka',
  district: 'Dhaka',
  addressLine: 'House 2, Road 8, Banani',
};

async function place(
  items: { variantId: string; quantity: number }[],
  extra: Record<string, unknown> = {},
) {
  const phone = (extra.phone as string) ?? uniquePhone();
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Idempotency-Key', randomUUID())
    .send({
      items,
      contact: { name: 'Admin Test', phone, email: `admin-test${uid()}@example.com` },
      address: dhaka,
      paymentMethodCode: 'COD',
      ...(extra.couponCode ? { couponCode: extra.couponCode } : {}),
    });
  expect(res.status).toBe(201);
  return (
    await prisma.order.findUniqueOrThrow({ where: { orderNumber: res.body.data.orderNumber } })
  ).id;
}

const api = {
  get: (p: string, headers = h) => request(ctx.app).get(`/api/v1/admin${p}`).set(headers),
  post: (p: string, b: object, headers = h) =>
    request(ctx.app).post(`/api/v1/admin${p}`).set(headers).send(b),
  patch: (p: string, b: object, headers = h) =>
    request(ctx.app).patch(`/api/v1/admin${p}`).set(headers).send(b),
};
const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stockQty;

describe('order list and detail', () => {
  it('finds orders by number and phone, filters by status, shows detail with risk info', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const phone = uniquePhone();
    const first = await place([{ variantId: p.variantIds[0]!, quantity: 1 }], { phone });
    const second = await place([{ variantId: p.variantIds[0]!, quantity: 1 }], { phone });
    await api.post(`/orders/${first}/status`, {
      status: 'CANCELLED',
      note: 'Customer unreachable',
    });

    const byPhone = await api.get(`/orders?q=${encodeURIComponent(`+88${phone}`)}`);
    expect(byPhone.body.data.map((o: { id: string }) => o.id).sort()).toEqual(
      [first, second].sort(),
    );
    const number = byPhone.body.data.find((o: { id: string }) => o.id === second).orderNumber;
    expect(
      (await api.get(`/orders?q=${number}`)).body.data.map((o: { id: string }) => o.id),
    ).toEqual([second]);
    const cancelled = await api.get(`/orders?q=${phone}&status=CANCELLED`);
    expect(cancelled.body.data.map((o: { id: string }) => o.id)).toEqual([first]);

    const detail = await api.get(`/orders/${second}`);
    expect(detail.body.data).toMatchObject({
      id: second,
      status: 'PENDING',
      allowedTransitions: ['CONFIRMED', 'CANCELLED'],
      editable: true,
      risk: { otherOrdersSamePhone: 1, cancelled: 1, problemRate: 100 },
    });
    expect((await api.get(`/orders/${randomUUID()}`)).status).toBe(404);
  });

  it('lets a salesman view and move orders but not cancel or edit them', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const id = await place([{ variantId: p.variantIds[0]!, quantity: 1 }]);
    expect((await api.get(`/orders/${id}`, salesman)).status).toBe(200);
    expect((await api.post(`/orders/${id}/status`, { status: 'CANCELLED' }, salesman)).status).toBe(
      403,
    );
    expect((await api.patch(`/orders/${id}`, { removeCoupon: true }, salesman)).status).toBe(403);
    expect((await api.post(`/orders/${id}/status`, { status: 'CONFIRMED' }, salesman)).status).toBe(
      200,
    );
    expect(
      (await api.post(`/orders/${id}/notes`, { note: 'Called, confirmed' }, salesman)).status,
    ).toBe(201);
  });
});

describe('status changes', () => {
  it('walks the happy path to DELIVERED and marks COD paid', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const id = await place([{ variantId: p.variantIds[0]!, quantity: 1 }]);
    for (const status of [
      'CONFIRMED',
      'PROCESSING',
      'HANDED_TO_COURIER',
      'IN_TRANSIT',
      'DELIVERED',
    ]) {
      const res = await api.post(`/orders/${id}/status`, { status });
      expect(res.status).toBe(200);
    }
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
    expect(order.confirmedAt).not.toBeNull();
    expect(order.deliveredAt).not.toBeNull();
    expect(
      await prisma.notificationLog.count({ where: { orderId: id, template: 'order-confirmed' } }),
    ).toBe(1);
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: id },
      orderBy: { createdAt: 'asc' },
    });
    expect(history.map((x) => x.toStatus)).toEqual([
      'PENDING',
      'CONFIRMED',
      'PROCESSING',
      'HANDED_TO_COURIER',
      'IN_TRANSIT',
      'DELIVERED',
    ]);
    expect(history.slice(1).every((x) => x.source === 'ADMIN' && x.changedById)).toBe(true);
  });

  it('refuses transitions the state machine does not allow', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const id = await place([{ variantId: p.variantIds[0]!, quantity: 1 }]);
    for (const status of [
      'PROCESSING',
      'DELIVERED',
      'RETURNED',
      'FAILED',
      'IN_TRANSIT',
      'PENDING',
    ]) {
      const res = await api.post(`/orders/${id}/status`, { status });
      expect(res.status, status).toBe(422);
      expect(res.body.error.details[0].reason).toBe('INVALID_TRANSITION');
    }
    await api.post(`/orders/${id}/status`, { status: 'CANCELLED' });
    expect((await api.post(`/orders/${id}/status`, { status: 'CONFIRMED' })).status).toBe(422);
  });

  it('restocks on FAILED and RETURNED; RETURNED keeps the coupon use', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 10 }]);
    const code = `RET${uid()}`.slice(0, 40);
    await prisma.coupon.create({ data: { code, type: 'FIXED', value: '10' } });
    const toCourier = async (id: string) => {
      for (const s of ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER'])
        await api.post(`/orders/${id}/status`, { status: s });
    };
    const failed = await place([{ variantId: p.variantIds[0]!, quantity: 2 }], {
      couponCode: code,
    });
    const returned = await place([{ variantId: p.variantIds[0]!, quantity: 3 }], {
      couponCode: code,
    });
    expect(await stockOf(p.variantIds[0]!)).toBe(5);
    await toCourier(failed);
    await toCourier(returned);
    await api.post(`/orders/${failed}/status`, { status: 'FAILED' });
    await api.post(`/orders/${returned}/status`, { status: 'DELIVERED' });
    await api.post(`/orders/${returned}/status`, { status: 'RETURNED' });
    expect(await stockOf(p.variantIds[0]!)).toBe(10);
    expect(await prisma.stockMovement.count({ where: { orderId: returned, type: 'RETURN' } })).toBe(
      1,
    );
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount).toBe(1);
    expect(await prisma.couponUsage.count({ where: { orderId: returned } })).toBe(1);
  });
});

describe('editing an order', () => {
  it('changes quantities and adds an item: kept lines keep their price, stock follows', async () => {
    const a = await makeProduct(ctx, [{ price: '100', stock: 10 }]);
    const b = await makeProduct(ctx, [{ price: '50', stock: 10 }]);
    const id = await place([{ variantId: a.variantIds[0]!, quantity: 2 }]);
    // The price changes after the order: the kept line must keep 100.
    await prisma.productVariant.update({ where: { id: a.variantIds[0] }, data: { price: '999' } });

    const res = await api.patch(`/orders/${id}`, {
      items: [
        { variantId: a.variantIds[0], quantity: 3 },
        { variantId: b.variantIds[0], quantity: 1 },
      ],
      note: 'Customer asked for one more',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      subtotal: '350.00',
      deliveryCharge: '60.00',
      grandTotal: '410.00',
    });
    expect(await stockOf(a.variantIds[0]!)).toBe(7);
    expect(await stockOf(b.variantIds[0]!)).toBe(9);
    expect(res.body.data.history.at(-1).note).toContain('Customer asked for one more');

    const fewer = await api.patch(`/orders/${id}`, {
      items: [{ variantId: b.variantIds[0], quantity: 1 }],
    });
    expect(fewer.body.data.grandTotal).toBe('110.00');
    expect(await stockOf(a.variantIds[0]!)).toBe(10);
    expect(await prisma.auditLog.count({ where: { entityId: id, action: 'order.edit' } })).toBe(2);
  });

  it('refuses money fields, too little stock and edits after dispatch', async () => {
    const a = await makeProduct(ctx, [{ price: '100', stock: 3 }]);
    const id = await place([{ variantId: a.variantIds[0]!, quantity: 1 }]);
    expect((await api.patch(`/orders/${id}`, { grandTotal: '1.00' })).status).toBe(400);
    expect(
      (
        await api.patch(`/orders/${id}`, {
          items: [{ variantId: a.variantIds[0], quantity: 1, price: '1' }],
        })
      ).status,
    ).toBe(400);
    const tooMany = await api.patch(`/orders/${id}`, {
      items: [{ variantId: a.variantIds[0], quantity: 5 }],
    });
    expect(tooMany.body.error.details[0].reason).toBe('OUT_OF_STOCK');
    expect(await stockOf(a.variantIds[0]!)).toBe(2);

    for (const s of ['CONFIRMED', 'PROCESSING', 'HANDED_TO_COURIER'])
      await api.post(`/orders/${id}/status`, { status: s });
    const late = await api.patch(`/orders/${id}`, { address: dhaka });
    expect(late.body.error.details[0].reason).toBe('ORDER_NOT_EDITABLE');
  });

  it('removes a coupon and changes the address (zone follows the district)', async () => {
    const a = await makeProduct(ctx, [{ price: '1000' }]);
    const code = `EDIT${uid()}`.slice(0, 40);
    await prisma.coupon.create({
      data: { code, type: 'FIXED', value: '100', minOrderAmount: '900' },
    });
    const id = await place([{ variantId: a.variantIds[0]!, quantity: 1 }], { couponCode: code });
    expect((await api.get(`/orders/${id}`)).body.data.grandTotal).toBe('960.00');

    const below = await api.patch(`/orders/${id}`, {
      items: [{ variantId: a.variantIds[0], quantity: 1 }],
    });
    expect(below.status).toBe(200); // still above the minimum

    const removed = await api.patch(`/orders/${id}`, { removeCoupon: true });
    expect(removed.body.data).toMatchObject({
      discountTotal: '0.00',
      grandTotal: '1060.00',
      couponCode: null,
    });
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount).toBe(0);

    const moved = await api.patch(`/orders/${id}`, {
      address: { ...dhaka, division: 'Rajshahi', district: 'Bogura' },
    });
    expect(moved.status).toBe(200);
    expect(moved.body.data.address.district).toBe('Bogura');
    const outside = await prisma.deliveryZone.findUniqueOrThrow({
      where: { code: 'outside-dhaka' },
    });
    expect(moved.body.data.deliveryZone.name).toBe(outside.name);
  });
});

describe('PDFs', () => {
  it('serves the invoice and packing slip', async () => {
    const a = await makeProduct(ctx, [{ price: '100' }]);
    const id = await place([{ variantId: a.variantIds[0]!, quantity: 1 }]);
    for (const kind of ['invoice', 'packing-slip']) {
      const res = await api
        .get(`/orders/${id}/${kind}`)
        .buffer(true)
        .parse((r, cb) => {
          const chunks: Buffer[] = [];
          r.on('data', (c: Buffer) => chunks.push(c));
          r.on('end', () => cb(null, Buffer.concat(chunks)));
        });
      expect(res.status).toBe(200);
      expect((res.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    }
  });
});
