import { randomUUID } from 'node:crypto';
import { parsePaisa, SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getDashboard } from '../../src/services/dashboard.service';
import { adminHeaders, adminSession, createTestContext, ourRouteHeaders } from './helpers';
import { makeProduct, registerCustomer } from './fixtures';

const ctx = createTestContext();
const { prisma } = ctx.deps;
afterAll(() => ctx.close());

let h: Record<string, string>;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'NATIONWIDE' } },
  });
  await prisma.deliveryZone.updateMany({ data: { isActive: true } });
});

/** A COD order for `quantity` of the variant, then moved to the given time and status. */
async function order(
  variantId: string,
  quantity: number,
  placedAt: Date,
  status: 'PENDING' | 'CANCELLED' | 'DELIVERED' = 'PENDING',
  district = 'Dhaka',
) {
  const c = await registerCustomer(ctx);
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Cookie', c.cookie)
    .set('Idempotency-Key', randomUUID())
    .send({
      items: [{ variantId, quantity }],
      contact: { name: 'Dashboard Buyer', phone: c.phone },
      address: {
        recipientName: 'Dashboard Buyer',
        phone: c.phone,
        division: district === 'Dhaka' ? 'Dhaka' : 'Rajshahi',
        district,
        addressLine: 'House 9, Road 9, Some Area',
      },
      paymentMethodCode: 'COD',
    });
  expect(res.status).toBe(201);
  return prisma.order.update({
    where: { orderNumber: res.body.data.orderNumber },
    data: { placedAt, status },
  });
}

describe('dashboard figures', () => {
  it('counts sales by Dhaka day, leaves out cancelled orders, and ranks products and districts', async () => {
    // A week in 2030 that no other test touches. "Now" is 09:00 on 10 Jan in Dhaka (03:00 UTC).
    const now = new Date('2030-01-10T03:00:00Z');
    // The shared test database keeps earlier runs: move their orders out of this fortnight.
    await prisma.order.updateMany({
      where: {
        placedAt: { gte: new Date('2029-12-20T00:00:00Z'), lt: new Date('2030-01-20T00:00:00Z') },
      },
      data: { placedAt: new Date('2000-01-01T00:00:00Z') },
    });
    const p = await makeProduct(ctx, [{ price: '100' }], { name: `Dash honey ${randomUUID()}` });
    const v = p.variantIds[0]!;

    // 00:30 on 10 Jan in Dhaka is still 9 Jan in UTC: it belongs to "today".
    const todayEarly = await order(v, 2, new Date('2030-01-09T18:30:00Z'));
    // 23:30 on 9 Jan in Dhaka: yesterday.
    const yesterday = await order(v, 1, new Date('2030-01-09T17:30:00Z'), 'DELIVERED', 'Bogura');
    // Cancelled today: in the status counts, never in sales.
    await order(v, 5, new Date('2030-01-10T02:00:00Z'), 'CANCELLED');
    // Before the 7-day period (Dhaka 3 Jan): the previous period, for the comparison.
    const before = await order(v, 1, new Date('2030-01-03T06:00:00Z'));

    const d = await getDashboard(prisma, 7, { includeOrders: true }, now);
    const money = (o: { grandTotal: { toFixed(n: number): string } }) => o.grandTotal.toFixed(2);
    const paisa = parsePaisa;

    expect(d.period).toEqual({
      days: 7,
      from: '2030-01-04',
      to: '2030-01-10',
      timeZone: 'Asia/Dhaka',
    });
    expect(d.salesByDay).toHaveLength(7);
    expect(d.salesByDay.at(-1)).toEqual({
      date: '2030-01-10',
      orders: 1,
      sales: money(todayEarly),
    });
    expect(d.salesByDay.at(-2)).toEqual({ date: '2030-01-09', orders: 1, sales: money(yesterday) });
    expect(d.salesByDay[0]).toEqual({ date: '2030-01-04', orders: 0, sales: '0.00' });

    const total = paisa(money(todayEarly)) + paisa(money(yesterday));
    expect(paisa(d.totals.sales)).toBe(total);
    expect(d.totals.orders).toBe(2);
    expect(paisa(d.totals.averageOrder)).toBe(Math.round(total / 2));
    expect(d.today).toEqual({
      orders: 1,
      sales: money(todayEarly),
      yesterdayOrders: 1,
      yesterdaySales: money(yesterday),
    });
    // Previous period: the one order on 3 Jan.
    const prev = paisa(money(before));
    expect(d.totals.change.orders).toBe(100);
    expect(d.totals.change.sales).toBe(Math.round(((total - prev) / prev) * 1000) / 10);

    expect(d.ordersByStatus).toEqual(
      expect.arrayContaining([
        { status: 'PENDING', orders: 1 },
        { status: 'DELIVERED', orders: 1 },
        { status: 'CANCELLED', orders: 1 },
      ]),
    );
    expect(d.topProducts[0]).toMatchObject({ productId: p.id, quantity: 3, sales: '300.00' });
    expect(d.topDistricts).toEqual(
      expect.arrayContaining([
        { district: 'Dhaka', orders: 1 },
        { district: 'Bogura', orders: 1 },
      ]),
    );
    expect(d.paymentMethods).toEqual([
      { name: expect.any(String), orders: 2, sales: d.totals.sales },
    ]);
  });
});

describe('GET /admin/dashboard', () => {
  it('needs reports.view; recent orders (customer names) also need orders.view', async () => {
    const ok = await request(ctx.app).get('/api/v1/admin/dashboard?days=7').set(h);
    expect(ok.status).toBe(200);
    expect(ok.body.data.period.days).toBe(7);
    expect(Array.isArray(ok.body.data.recentOrders)).toBe(true);
    expect((await request(ctx.app).get('/api/v1/admin/dashboard?days=12').set(h)).status).toBe(400);

    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    expect((await request(ctx.app).get('/api/v1/admin/dashboard').set(salesman)).status).toBe(403);

    const name = `Reports only ${randomUUID().slice(0, 8)}`;
    const role = await request(ctx.app)
      .post('/api/v1/admin/roles')
      .set(h)
      .send({ name, permissions: ['reports.view'] });
    expect(role.status).toBe(201);
    const reporter = adminHeaders((await adminSession(ctx, name)).cookie);
    const limited = await request(ctx.app).get('/api/v1/admin/dashboard').set(reporter);
    expect(limited.status).toBe(200);
    expect(limited.body.data.period.days).toBe(30);
    expect(limited.body.data.recentOrders).toBeNull();
  });
});
