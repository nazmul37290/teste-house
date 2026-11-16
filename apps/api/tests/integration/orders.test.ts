import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, ourRouteHeaders, uniquePhone } from './helpers';
import { makeProduct, registerCustomer, uid } from './fixtures';

const ctx = createTestContext();
const { prisma } = ctx.deps;

// Known zone charges for these tests; the seeded values are restored afterwards.
let savedZones: {
  code: string;
  charge: unknown;
  freeDeliveryThreshold: unknown;
  isActive: boolean;
}[];
let savedCod: unknown;
beforeAll(async () => {
  savedZones = await prisma.deliveryZone.findMany({
    where: { code: { in: ['inside-dhaka', 'outside-dhaka'] } },
    select: { code: true, charge: true, freeDeliveryThreshold: true, isActive: true },
  });
  savedCod = (await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'COD' } })).config;
  await prisma.deliveryZone.update({
    where: { code: 'inside-dhaka' },
    data: { charge: '60', freeDeliveryThreshold: null, isActive: true },
  });
  await prisma.deliveryZone.update({
    where: { code: 'outside-dhaka' },
    data: { charge: '130', freeDeliveryThreshold: '2000', isActive: true, isDefault: true },
  });
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'DHAKA_ONLY' } },
  });
});
afterAll(async () => {
  for (const z of savedZones) {
    await prisma.deliveryZone.update({
      where: { code: z.code },
      data: {
        charge: z.charge as string,
        freeDeliveryThreshold: z.freeDeliveryThreshold as string | null,
        isActive: z.isActive,
      },
    });
  }
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { config: savedCod ?? { scope: 'DHAKA_ONLY' } },
  });
  await prisma.deliveryZone.deleteMany({ where: { code: { startsWith: 'test-' } } });
  await ctx.close();
});

const dhaka = {
  recipientName: 'Rahim Uddin',
  phone: '01712345678',
  division: 'Dhaka',
  district: 'Dhaka',
  addressLine: 'House 1, Road 2, Mirpur',
};
const bogura = { ...dhaka, division: 'Rajshahi', district: 'Bogura', addressLine: 'Sherpur Road' };

type Item = { variantId: string; quantity: number };
function orderBody(items: Item[], extra: Record<string, unknown> = {}) {
  const phone = (extra.phone as string | undefined) ?? uniquePhone();
  const { phone: _p, ...rest } = extra;
  return {
    items,
    contact: { name: 'Rahim Uddin', phone, email: `buyer${uid()}@example.com` },
    address: dhaka,
    paymentMethodCode: 'COD',
    ...rest,
  };
}

function place(body: object, opts: { key?: string; cookie?: string } = {}) {
  let req = request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Idempotency-Key', opts.key ?? randomUUID());
  if (opts.cookie) req = req.set('Cookie', opts.cookie);
  return req.send(body);
}
const quote = (body: object, cookie?: string) => {
  let req = request(ctx.app).post('/api/v1/checkout/quote').set(ourRouteHeaders());
  if (cookie) req = req.set('Cookie', cookie);
  return req.send(body);
};
const stockOf = async (variantId: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id: variantId } })).stockQty;
const reason = (res: request.Response) => res.body.error?.details?.[0]?.reason as string;

describe('placing an order', () => {
  it('creates a COD order with server prices, stock movements, history and an email', async () => {
    const p = await makeProduct(ctx, [{ price: '500', salePrice: '450', stock: 5 }]);
    const res = await place(orderBody([{ variantId: p.variantIds[0]!, quantity: 2 }]));
    expect(res.status).toBe(201);
    const o = res.body.data;
    expect(o.orderNumber).toMatch(/^ORD-\d{6,}$/);
    expect(o).toMatchObject({
      status: 'PENDING',
      paymentStatus: 'UNPAID',
      subtotal: '900.00',
      discountTotal: '0.00',
      deliveryCharge: '60.00',
      grandTotal: '960.00',
      paymentMethod: { code: 'COD' },
    });
    expect(o.items[0]).toMatchObject({ listPrice: '500.00', unitPrice: '450.00', quantity: 2 });
    expect(o.timeline.map((t: { status: string }) => t.status)).toEqual(['PENDING']);

    expect(await stockOf(p.variantIds[0]!)).toBe(3);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderNumber: o.orderNumber } });
    const movement = await prisma.stockMovement.findFirstOrThrow({ where: { orderId: order.id } });
    expect(movement).toMatchObject({ type: 'SALE', quantity: -2, balanceAfter: 3 });
    expect((await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).soldCount).toBe(2);
    const mail = await prisma.notificationLog.findFirst({
      where: { orderId: order.id, template: 'order-placed' },
    });
    expect(mail?.recipient).toBe(order.contactEmail);
  });

  it('removes the ordered lines from the cart', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }, { price: '200' }]);
    const add = await request(ctx.app)
      .post('/api/v1/cart/items')
      .set(ourRouteHeaders())
      .send({ variantId: p.variantIds[0], quantity: 1 });
    const cookie = (add.headers['set-cookie'] as unknown as string[])[0]!.split(';')[0]!;
    await request(ctx.app)
      .post('/api/v1/cart/items')
      .set(ourRouteHeaders())
      .set('Cookie', cookie)
      .send({ variantId: p.variantIds[1], quantity: 1 });

    expect(
      (await place(orderBody([{ variantId: p.variantIds[0]!, quantity: 1 }]), { cookie })).status,
    ).toBe(201);
    const cart = await request(ctx.app).get('/api/v1/cart').set('Cookie', cookie);
    expect(cart.body.data.items.map((i: { variantId: string }) => i.variantId)).toEqual([
      p.variantIds[1],
    ]);
  });

  it('matches the worked example in pricing.md (coupon, cap, allocation, delivery)', async () => {
    const honey = await makeProduct(ctx, [{ price: '500', salePrice: '450' }]);
    const horlicks = await makeProduct(ctx, [{ price: '780' }]);
    const code = `WORKED${uid()}`.slice(0, 40);
    await prisma.coupon.create({
      data: { code, type: 'PERCENT', value: '10', maxDiscount: '150', minOrderAmount: '1500' },
    });
    await prisma.paymentMethod.update({
      where: { code: 'COD' },
      data: { config: { scope: 'NATIONWIDE' } },
    });
    try {
      const res = await place(
        orderBody(
          [
            { variantId: honey.variantIds[0]!, quantity: 2 },
            { variantId: horlicks.variantIds[0]!, quantity: 1 },
          ],
          { address: bogura, couponCode: code.toLowerCase() },
        ),
      );
      expect(res.status).toBe(201);
      expect(res.body.data).toMatchObject({
        subtotal: '1680.00',
        discountTotal: '150.00',
        deliveryCharge: '130.00',
        grandTotal: '1660.00',
        couponCode: code,
      });
      const byVariant = Object.fromEntries(
        res.body.data.items.map((i: { variantId: string; discountAmount: string }) => [
          i.variantId,
          i.discountAmount,
        ]),
      );
      expect(byVariant[honey.variantIds[0]!]).toBe('80.36');
      expect(byVariant[horlicks.variantIds[0]!]).toBe('69.64');
      const coupon = await prisma.coupon.findUniqueOrThrow({ where: { code } });
      expect(coupon.usedCount).toBe(1);
      expect(await prisma.couponUsage.count({ where: { couponId: coupon.id } })).toBe(1);
    } finally {
      await prisma.paymentMethod.update({
        where: { code: 'COD' },
        data: { config: { scope: 'DHAKA_ONLY' } },
      });
    }
  });
});

describe('what the client may send', () => {
  it('rejects any money field and creates nothing', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    for (const field of ['grandTotal', 'subtotal', 'deliveryCharge', 'discount', 'price']) {
      const key = randomUUID();
      const res = await place(
        orderBody([{ variantId: p.variantIds[0]!, quantity: 1 }], { [field]: '1.00' }),
        { key },
      );
      expect(res.status).toBe(400);
      expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(0);
    }
    const priced = await place(
      orderBody([{ variantId: p.variantIds[0]!, quantity: 1, price: '1' } as Item]),
    );
    expect(priced.status).toBe(400);
    expect(await stockOf(p.variantIds[0]!)).toBe(10);
  });

  it('needs an Idempotency-Key header', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const res = await request(ctx.app)
      .post('/api/v1/orders')
      .set(ourRouteHeaders())
      .send(orderBody([{ variantId: p.variantIds[0]!, quantity: 1 }]));
    expect(res.status).toBe(400);
  });
});

describe('idempotency', () => {
  it('returns the same order for the same key and decrements stock once', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 5 }]);
    const key = randomUUID();
    const body = orderBody([{ variantId: p.variantIds[0]!, quantity: 2 }]);
    const first = await place(body, { key });
    const second = await place(body, { key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.data.orderNumber).toBe(first.body.data.orderNumber);
    expect(await stockOf(p.variantIds[0]!)).toBe(3);

    const other = await place(
      { ...body, contact: { ...body.contact, phone: uniquePhone() } },
      { key },
    );
    expect(other.status).toBe(409);
    expect(reason(other)).toBe('IDEMPOTENCY_MISMATCH');
  });
});

describe('price changes', () => {
  it('refuses a different expectedGrandTotal with the new breakdown and writes nothing', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 5 }]);
    const key = randomUUID();
    const res = await place(
      orderBody([{ variantId: p.variantIds[0]!, quantity: 1 }], { expectedGrandTotal: '1.00' }),
      { key },
    );
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('PRICE_CHANGED');
    expect(res.body.error.details[0].quote.grandTotal).toBe('160.00');
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(0);
    expect(await stockOf(p.variantIds[0]!)).toBe(5);
  });

  it('uses the database price at order time, not the price seen earlier', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    const q = await quote({ items, district: 'Dhaka' });
    expect(q.body.data.grandTotal).toBe('160.00');
    await prisma.productVariant.update({ where: { id: p.variantIds[0] }, data: { price: '120' } });

    const stale = await place(orderBody(items, { expectedGrandTotal: q.body.data.grandTotal }));
    expect(stale.body.error.code).toBe('PRICE_CHANGED');
    const ok = await place(orderBody(items, { expectedGrandTotal: '180.00' }));
    expect(ok.status).toBe(201);
    expect(ok.body.data.items[0].unitPrice).toBe('120.00');
  });
});

describe('refusals', () => {
  it('refuses inactive variants, archived products and too little stock', async () => {
    const inactive = await makeProduct(ctx, [{ price: '100' }, { price: '100', isActive: false }]);
    const archived = await makeProduct(ctx, [{ price: '100' }], { status: 'ARCHIVED' });
    const low = await makeProduct(ctx, [{ price: '100', stock: 1 }]);
    expect(
      reason(await place(orderBody([{ variantId: inactive.variantIds[1]!, quantity: 1 }]))),
    ).toBe('UNAVAILABLE');
    expect(
      reason(await place(orderBody([{ variantId: archived.variantIds[0]!, quantity: 1 }]))),
    ).toBe('UNAVAILABLE');
    const short = await place(orderBody([{ variantId: low.variantIds[0]!, quantity: 2 }]));
    expect(short.status).toBe(422);
    expect(short.body.error.details[0]).toEqual({
      reason: 'OUT_OF_STOCK',
      variantIds: [low.variantIds[0]],
    });
  });

  it('refuses a zone that is turned off, COD outside Dhaka and online payment for now', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    await prisma.deliveryZone.create({
      data: {
        name: 'Off zone',
        code: 'test-off',
        districts: ['Sylhet'],
        charge: '100',
        isActive: false,
      },
    });
    const sylhet = { ...dhaka, division: 'Sylhet', district: 'Sylhet' };
    expect(reason(await place(orderBody(items, { address: sylhet })))).toBe(
      'DELIVERY_NOT_AVAILABLE',
    );
    expect(reason(await place(orderBody(items, { address: bogura })))).toBe('COD_NOT_AVAILABLE');
    expect(reason(await place(orderBody(items, { paymentMethodCode: 'UDDOKTAPAY' })))).toBe(
      'PAYMENT_METHOD_UNAVAILABLE',
    );
    expect(
      reason(await place(orderBody(items, { address: { ...dhaka, district: 'Bogura' } }))),
    ).toBe(undefined); // district outside its division: a 400 validation error, no reason
  });
});

describe('concurrency', () => {
  it('sells the last unit exactly once', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 1 }]);
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    const results = await Promise.all([place(orderBody(items)), place(orderBody(items))]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(reason(results.find((r) => r.status === 422)!)).toBe('OUT_OF_STOCK');
    expect(await stockOf(p.variantIds[0]!)).toBe(0);
  });

  it('honours a coupon usage limit of 1 under concurrent orders', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const code = `ONCE${uid()}`.slice(0, 40);
    await prisma.coupon.create({ data: { code, type: 'FIXED', value: '10', usageLimit: 1 } });
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    const results = await Promise.all([
      place(orderBody(items, { couponCode: code })),
      place(orderBody(items, { couponCode: code })),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
    expect(reason(results.find((r) => r.status === 422)!)).toBe('COUPON_USED_UP');
    expect((await prisma.coupon.findUniqueOrThrow({ where: { code } })).usedCount).toBe(1);
  });

  it('applies the per-customer limit by phone', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const code = `PERPHONE${uid()}`.slice(0, 40);
    await prisma.coupon.create({ data: { code, type: 'FIXED', value: '10', perCustomerLimit: 1 } });
    const phone = uniquePhone();
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    expect((await place(orderBody(items, { couponCode: code, phone }))).status).toBe(201);
    expect(reason(await place(orderBody(items, { couponCode: code, phone })))).toBe(
      'COUPON_LIMIT_REACHED',
    );
  });
});

describe('database checks', () => {
  it('refuses an order whose totals do not add up', async () => {
    const method = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'COD' } });
    await expect(
      prisma.order.create({
        data: {
          orderNumber: `ORD-T${uid()}`,
          contactName: 'Direct insert',
          contactPhone: uniquePhone(),
          paymentMethodId: method.id,
          subtotal: '100',
          deliveryCharge: '60',
          grandTotal: '1',
          idempotencyKey: randomUUID(),
        },
      }),
    ).rejects.toThrow();
  });
});

describe('checkout quote', () => {
  it('reports a coupon problem without failing and lists usable payment methods', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];
    const inDhaka = await quote({ items, district: 'Dhaka', couponCode: 'NOPE-NOT-REAL' });
    expect(inDhaka.status).toBe(200);
    expect(inDhaka.body.data).toMatchObject({
      grandTotal: '160.00',
      coupon: { applied: false, reason: 'COUPON_NOT_FOUND' },
      paymentMethods: [{ code: 'COD' }],
      zone: { name: expect.any(String) },
    });
    const outside = await quote({ items, district: 'Bogura' });
    expect(outside.body.data).toMatchObject({ deliveryCharge: '130.00', paymentMethods: [] });
  });
});

describe('guest tracking', () => {
  it('shows the order for the right number and phone only, without the street address', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const phone = uniquePhone();
    const placed = await place(
      orderBody([{ variantId: p.variantIds[0]!, quantity: 1 }], { phone }),
    );
    const orderNumber = placed.body.data.orderNumber as string;
    const track = (body: object) =>
      request(ctx.app).post('/api/v1/orders/track').set(ourRouteHeaders()).send(body);

    const ok = await track({ orderNumber: orderNumber.toLowerCase(), phone: `+88${phone}` });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({
      orderNumber,
      status: 'PENDING',
      address: { district: 'Dhaka' },
    });
    expect(JSON.stringify(ok.body.data)).not.toContain('Mirpur');
    expect(ok.body.data).not.toHaveProperty('contactPhone');

    expect((await track({ orderNumber, phone: uniquePhone() })).status).toBe(404);
  });
});

describe('signed-in customers', () => {
  it('links the order, never uses the placeholder email, and refuses other people’s addresses', async () => {
    const me = await registerCustomer(ctx);
    const other = await registerCustomer(ctx);
    const theirs = await prisma.customerAddress.create({
      data: { customerId: other.id, ...dhaka },
    });
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const items = [{ variantId: p.variantIds[0]!, quantity: 1 }];

    const res = await place(
      { ...orderBody(items, { phone: me.phone }), contact: { name: 'Me', phone: me.phone } },
      { cookie: me.cookie },
    );
    expect(res.status).toBe(201);
    const order = await prisma.order.findUniqueOrThrow({
      where: { orderNumber: res.body.data.orderNumber },
    });
    expect(order.customerId).toBe(me.id);
    expect(order.contactEmail).toBeNull(); // phone-only account: placeholder email is never used

    const { address: _a, ...noAddress } = orderBody(items);
    const stolen = await place({ ...noAddress, addressId: theirs.id }, { cookie: me.cookie });
    expect(stolen.status).toBe(404);
  });
});
