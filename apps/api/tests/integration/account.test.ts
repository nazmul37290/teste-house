import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, ourRouteHeaders } from './helpers';
import { makeProduct, registerCustomer, uid } from './fixtures';

const ctx = createTestContext();
const { prisma } = ctx.deps;
afterAll(() => ctx.close());

let savedCod: unknown;
beforeAll(async () => {
  savedCod = (await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'COD' } })).config;
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'DHAKA_ONLY' } },
  });
  await prisma.deliveryZone.update({ where: { code: 'inside-dhaka' }, data: { isActive: true } });
});
afterAll(async () => {
  await prisma.paymentMethod.update({ where: { code: 'COD' }, data: { config: savedCod ?? {} } });
});

const dhaka = {
  recipientName: 'Karim Ahmed',
  phone: '01812345678',
  division: 'Dhaka',
  district: 'Dhaka',
  addressLine: 'House 9, Road 4, Dhanmondi',
};

const as = (cookie: string) => ({
  get: (p: string) => request(ctx.app).get(`/api/v1${p}`).set('Cookie', cookie),
  post: (p: string, b: object = {}) =>
    request(ctx.app).post(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  put: (p: string, b: object) =>
    request(ctx.app).put(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  patch: (p: string, b: object) =>
    request(ctx.app).patch(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  del: (p: string) =>
    request(ctx.app).delete(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie),
});

async function placeOrder(
  cookie: string,
  phone: string,
  items: { variantId: string; quantity: number }[],
  extra = {},
) {
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Cookie', cookie)
    .set('Idempotency-Key', randomUUID())
    .send({
      items,
      contact: { name: 'Karim Ahmed', phone },
      address: { ...dhaka, phone },
      paymentMethodCode: 'COD',
      ...extra,
    });
  expect(res.status).toBe(201);
  return res.body.data.orderNumber as string;
}

describe('/me', () => {
  it('needs a customer session', async () => {
    expect((await request(ctx.app).get('/api/v1/me')).status).toBe(401);
  });

  it('shows and edits the profile; the placeholder email is hidden', async () => {
    const me = await registerCustomer(ctx);
    const api = as(me.cookie);
    expect((await api.get('/me')).body.data).toMatchObject({ phone: me.phone, email: null });
    const renamed = await api.patch('/me', { name: 'Karim Uddin Ahmed' });
    expect(renamed.body.data.name).toBe('Karim Uddin Ahmed');
    expect((await api.patch('/me', { phone: '01999999999', name: 'X Y' })).status).toBe(400);
  });
});

describe('/me/addresses', () => {
  it('keeps one default, checks the place names and hides other people’s addresses', async () => {
    const me = await registerCustomer(ctx);
    const other = await registerCustomer(ctx);
    const api = as(me.cookie);

    const first = await api.post('/me/addresses', { ...dhaka, label: 'Home' });
    expect(first.status).toBe(201);
    expect(first.body.data.isDefault).toBe(true); // the first one is the default
    const second = await api.post('/me/addresses', {
      ...dhaka,
      division: 'Rajshahi',
      district: 'Bogura',
      label: 'Office',
      isDefault: true,
    });
    expect(second.body.data.isDefault).toBe(true);
    const list = (await api.get('/me/addresses')).body.data as { id: string; isDefault: boolean }[];
    expect(list.map((a) => a.isDefault)).toEqual([true, false]);
    expect(list[0]!.id).toBe(second.body.data.id);

    const badGeo = await api.post('/me/addresses', { ...dhaka, district: 'Bogura' });
    expect(badGeo.status).toBe(400);

    const theirs = as(other.cookie);
    expect((await theirs.put(`/me/addresses/${first.body.data.id}`, dhaka)).status).toBe(404);
    expect((await theirs.del(`/me/addresses/${first.body.data.id}`)).status).toBe(404);

    // Deleting the default makes another address the default.
    expect((await api.del(`/me/addresses/${second.body.data.id}`)).status).toBe(204);
    const after = (await api.get('/me/addresses')).body.data as { isDefault: boolean }[];
    expect(after).toHaveLength(1);
    expect(after[0]!.isDefault).toBe(true);
  });

  it('can be used at checkout by its owner', async () => {
    const me = await registerCustomer(ctx);
    const api = as(me.cookie);
    const saved = (await api.post('/me/addresses', { ...dhaka, phone: me.phone })).body.data;
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const res = await request(ctx.app)
      .post('/api/v1/orders')
      .set(ourRouteHeaders())
      .set('Cookie', me.cookie)
      .set('Idempotency-Key', randomUUID())
      .send({
        items: [{ variantId: p.variantIds[0], quantity: 1 }],
        contact: { name: 'Karim', phone: me.phone },
        addressId: saved.id,
        paymentMethodCode: 'COD',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.address.addressLine).toBe(dhaka.addressLine);
  });
});

describe('/me/orders', () => {
  it('lists only my orders and 404s for someone else’s', async () => {
    const me = await registerCustomer(ctx);
    const other = await registerCustomer(ctx);
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const mine = await placeOrder(me.cookie, me.phone, [
      { variantId: p.variantIds[0]!, quantity: 2 },
    ]);
    const theirs = await placeOrder(other.cookie, other.phone, [
      { variantId: p.variantIds[0]!, quantity: 1 },
    ]);

    const list = await as(me.cookie).get('/me/orders');
    expect(list.body.data.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([mine]);
    expect(list.body.data[0]).toMatchObject({ itemCount: 2, grandTotal: '260.00' });
    expect(list.body.meta.total).toBe(1);

    const detail = await as(me.cookie).get(`/me/orders/${mine}`);
    expect(detail.body.data).toMatchObject({ orderNumber: mine, canCancel: true });
    expect((await as(me.cookie).get(`/me/orders/${theirs}`)).status).toBe(404);
    expect((await as(me.cookie).post(`/me/orders/${theirs}/cancel`)).status).toBe(404);
    expect((await as(me.cookie).get(`/me/orders/${theirs}/invoice`)).status).toBe(404);
  });

  it('cancels a pending order: stock and coupon come back, history and email are written', async () => {
    const me = await registerCustomer(ctx, { email: `cancel${uid()}@example.com` });
    const p = await makeProduct(ctx, [{ price: '200', stock: 5 }]);
    const code = `BACK${uid()}`.slice(0, 40);
    await prisma.coupon.create({ data: { code, type: 'FIXED', value: '20', usageLimit: 5 } });
    const number = await placeOrder(
      me.cookie,
      me.phone,
      [{ variantId: p.variantIds[0]!, quantity: 3 }],
      {
        couponCode: code,
      },
    );
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantIds[0] } })).stockQty,
    ).toBe(2);

    const res = await as(me.cookie).post(`/me/orders/${number}/cancel`, {
      reason: 'Ordered twice',
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', canCancel: false });
    expect(res.body.data.timeline.map((t: { status: string }) => t.status)).toEqual([
      'PENDING',
      'CANCELLED',
    ]);

    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantIds[0] } })).stockQty,
    ).toBe(5);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: number } });
    expect(order.cancelReason).toBe('Ordered twice');
    const release = await prisma.stockMovement.findFirst({
      where: { orderId: order.id, type: 'CANCEL_RELEASE' },
    });
    expect(release).toMatchObject({ quantity: 3, balanceAfter: 5 });
    const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
    expect(coupon.usedCount).toBe(0);
    expect(await prisma.couponUsage.count({ where: { orderId: order.id } })).toBe(0);
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).soldCount).toBe(0);
    const history = await prisma.orderStatusHistory.findFirst({
      where: { orderId: order.id, toStatus: 'CANCELLED' },
    });
    expect(history?.source).toBe('CUSTOMER');
    expect(
      await prisma.notificationLog.count({
        where: { orderId: order.id, template: 'order-cancelled' },
      }),
    ).toBe(1);

    const again = await as(me.cookie).post(`/me/orders/${number}/cancel`);
    expect(again.status).toBe(422);
    expect(again.body.error.details[0].reason).toBe('CANNOT_CANCEL');
  });

  it('refuses to cancel once the order is being packed', async () => {
    const me = await registerCustomer(ctx);
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const number = await placeOrder(me.cookie, me.phone, [
      { variantId: p.variantIds[0]!, quantity: 1 },
    ]);
    await prisma.order.update({ where: { orderNumber: number }, data: { status: 'PROCESSING' } });
    const res = await as(me.cookie).post(`/me/orders/${number}/cancel`);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].reason).toBe('CANNOT_CANCEL');
  });

  it('downloads an invoice PDF and reorders what is still available', async () => {
    const me = await registerCustomer(ctx);
    const p = await makeProduct(ctx, [
      { price: '100', stock: 10 },
      { price: '50', stock: 10 },
    ]);
    const number = await placeOrder(me.cookie, me.phone, [
      { variantId: p.variantIds[0]!, quantity: 2 },
      { variantId: p.variantIds[1]!, quantity: 1 },
    ]);

    const pdf = await as(me.cookie)
      .get(`/me/orders/${number}/invoice`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');

    await prisma.productVariant.update({
      where: { id: p.variantIds[1] },
      data: { isActive: false },
    });
    const again = await as(me.cookie).post(`/me/orders/${number}/reorder`);
    expect(again.body.data.added).toBe(1);
    expect(again.body.data.skipped).toHaveLength(1);
    const cart = await as(me.cookie).get('/cart');
    expect(
      cart.body.data.items.map((i: { variantId: string; quantity: number }) => [
        i.variantId,
        i.quantity,
      ]),
    ).toEqual([[p.variantIds[0], 2]]);
  });
});
