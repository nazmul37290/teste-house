import { randomUUID } from 'node:crypto';
import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bookShipment, onBookingFailed, syncShipments } from '../../src/services/courier.service';
import { createFakeCourier } from './fake-courier';
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
const fake = createFakeCourier();

let h: Record<string, string>;
let salesman: Record<string, string>;
let savedEnabled: unknown;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
  savedEnabled = (await prisma.setting.findUnique({ where: { key: 'shipping.steadfastEnabled' } }))
    ?.value;
  await prisma.setting.update({
    where: { key: 'shipping.steadfastEnabled' },
    data: { value: true },
  });
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'DHAKA_ONLY' } },
  });
  await prisma.deliveryZone.update({
    where: { code: 'inside-dhaka' },
    data: { charge: '60', freeDeliveryThreshold: null, isActive: true },
  });
});
afterAll(async () => {
  await prisma.setting.update({
    where: { key: 'shipping.steadfastEnabled' },
    data: { value: (savedEnabled ?? false) as boolean },
  });
  await ctx.close();
});

async function processingOrder(price = '200', email = true) {
  const p = await makeProduct(ctx, [{ price, stock: 10 }]);
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Idempotency-Key', randomUUID())
    .send({
      items: [{ variantId: p.variantIds[0], quantity: 2 }],
      contact: {
        name: 'Courier Test',
        phone: uniquePhone(),
        ...(email ? { email: `ship${uid()}@example.com` } : {}),
      },
      address: {
        recipientName: 'Courier Test',
        phone: '01812345678',
        division: 'Dhaka',
        district: 'Dhaka',
        addressLine: 'House 1, Road 1, Mohammadpur',
        deliveryNote: 'Call before coming',
      },
      paymentMethodCode: 'COD',
    });
  expect(res.status).toBe(201);
  const order = await prisma.order.findUniqueOrThrow({
    where: { orderNumber: res.body.data.orderNumber },
  });
  await prisma.order.update({ where: { id: order.id }, data: { status: 'PROCESSING' } });
  return { ...order, variantId: p.variantIds[0]! };
}
const book = (id: string, headers = h) =>
  request(ctx.app).post(`/api/v1/admin/orders/${id}/book-courier`).set(headers).send({});
const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });

describe('without a configured courier', () => {
  it('explains that the courier is not connected', async () => {
    ctx.deps.courier = null;
    const o = await processingOrder();
    const res = await book(o.id);
    expect(res.status).toBe(422);
    expect(res.body.error.details[0].reason).toBe('COURIER_NOT_CONFIGURED');
    expect((await request(ctx.app).get('/api/v1/admin/courier/balance').set(h)).body.data).toEqual({
      configured: false,
    });
  });
});

describe('booking', () => {
  beforeAll(() => {
    ctx.deps.courier = fake.adapter;
  });

  it('queues a PROCESSING order once; the job books it and hands it to the courier', async () => {
    const o = await processingOrder('200');
    const res = await book(o.id);
    expect(res.status).toBe(202);
    expect(res.body.data).toMatchObject({ orderId: o.id, queued: true });
    const job = await ctx.deps.courierQueue().getJob(`book-${o.id}`);
    expect(job?.data).toMatchObject({ orderId: o.id });

    await bookShipment(ctx.deps, o.id, null);
    const parcel = fake.byInvoice(o.orderNumber);
    expect(parcel.codAmount).toBe(46_000); // unpaid COD: 2 x 200 + 60 delivery
    const order = await orderOf(o.id);
    expect(order.status).toBe('HANDED_TO_COURIER');
    const shipment = await prisma.shipment.findFirstOrThrow({ where: { orderId: o.id } });
    expect(shipment).toMatchObject({
      consignmentId: parcel.consignmentId,
      courierStatus: 'in_review',
    });
    expect(shipment.codAmount.toFixed(2)).toBe('460.00');
    expect(
      await prisma.notificationLog.count({ where: { orderId: o.id, template: 'order-shipped' } }),
    ).toBe(1);

    // Booking again is refused; the job skips an order that is already booked.
    expect((await book(o.id)).body.error.details[0].reason).toBe('ALREADY_BOOKED');
    expect(await bookShipment(ctx.deps, o.id, null)).toEqual({ skipped: 'ALREADY_BOOKED' });
  });

  it('sends 0 to collect for a paid order and refuses orders not being packed', async () => {
    const paid = await processingOrder('150');
    await prisma.order.update({ where: { id: paid.id }, data: { paymentStatus: 'PAID' } });
    await bookShipment(ctx.deps, paid.id, null);
    expect(fake.byInvoice(paid.orderNumber).codAmount).toBe(0);

    const early = await processingOrder();
    await prisma.order.update({ where: { id: early.id }, data: { status: 'CONFIRMED' } });
    expect((await book(early.id)).body.error.details[0].reason).toBe('NOT_PROCESSING');
  });

  it('books in bulk with a per-order result and needs orders.book_courier', async () => {
    const a = await processingOrder();
    const b = await processingOrder();
    await prisma.order.update({ where: { id: b.id }, data: { status: 'PENDING' } });
    const res = await request(ctx.app)
      .post('/api/v1/admin/orders/bulk/book-courier')
      .set(h)
      .send({ orderIds: [a.id, b.id, a.id] });
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual([
      expect.objectContaining({ orderId: a.id, queued: true }),
      expect.objectContaining({ orderId: b.id, queued: false, reason: 'NOT_PROCESSING' }),
    ]);
    expect((await book(a.id, salesman)).status).toBe(403);
  });

  it('leaves the order alone when the courier fails and notes the final failure', async () => {
    const o = await processingOrder();
    fake.failNext();
    await expect(bookShipment(ctx.deps, o.id, null)).rejects.toThrow('Fake courier is down');
    expect((await orderOf(o.id)).status).toBe('PROCESSING');
    expect(await prisma.shipment.count({ where: { orderId: o.id } })).toBe(0);
    await onBookingFailed(ctx.deps, o.id, 'Fake courier is down');
    const note = await prisma.orderNote.findFirstOrThrow({ where: { orderId: o.id } });
    expect(note.note).toContain('Courier booking failed');
  });

  it('shows the courier balance', async () => {
    const res = await request(ctx.app).get('/api/v1/admin/courier/balance').set(h);
    expect(res.body.data).toEqual({ configured: true, balance: '1234.50' });
  });
});

describe('status sync', () => {
  beforeAll(() => {
    ctx.deps.courier = fake.adapter;
  });

  it('moves the order with the parcel, records each new status once, marks COD paid on delivery', async () => {
    const o = await processingOrder();
    await bookShipment(ctx.deps, o.id, null);
    const { consignmentId } = fake.byInvoice(o.orderNumber);

    fake.move(consignmentId, 'in_transit', 'IN_TRANSIT');
    await syncShipments(ctx.deps);
    await syncShipments(ctx.deps); // nothing new: no second event
    expect((await orderOf(o.id)).status).toBe('IN_TRANSIT');

    fake.move(consignmentId, 'hold', 'HOLD');
    await syncShipments(ctx.deps);
    expect((await orderOf(o.id)).status).toBe('IN_TRANSIT'); // recorded only

    fake.move(consignmentId, 'delivered', 'DELIVERED');
    await syncShipments(ctx.deps);
    const order = await orderOf(o.id);
    expect(order).toMatchObject({ status: 'DELIVERED', paymentStatus: 'PAID' });
    expect(
      await prisma.notificationLog.count({ where: { orderId: o.id, template: 'order-delivered' } }),
    ).toBe(1);

    const shipment = await prisma.shipment.findFirstOrThrow({
      where: { orderId: o.id },
      include: { events: true },
    });
    expect(shipment.events.map((e) => e.status).sort()).toEqual([
      'delivered',
      'hold',
      'in_review',
      'in_transit',
    ]);
    const history = await prisma.orderStatusHistory.findMany({
      where: { orderId: o.id, source: 'COURIER' },
    });
    expect(history.map((x) => x.toStatus).sort()).toEqual([
      'DELIVERED',
      'HANDED_TO_COURIER',
      'IN_TRANSIT',
    ]);
  });

  it('returns stock when the courier sends the parcel back', async () => {
    const o = await processingOrder();
    await bookShipment(ctx.deps, o.id, null);
    const before = (await prisma.productVariant.findUniqueOrThrow({ where: { id: o.variantId } }))
      .stockQty;
    fake.move(fake.byInvoice(o.orderNumber).consignmentId, 'cancelled', 'CANCELLED');
    await syncShipments(ctx.deps);
    expect((await orderOf(o.id)).status).toBe('RETURNED');
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: o.variantId } })).stockQty,
    ).toBe(before + 2);
  });

  it('shows the parcel and its timeline to the customer when tracking', async () => {
    const o = await processingOrder();
    await bookShipment(ctx.deps, o.id, null);
    fake.move(fake.byInvoice(o.orderNumber).consignmentId, 'in_transit', 'IN_TRANSIT');
    await syncShipments(ctx.deps);
    const res = await request(ctx.app)
      .post('/api/v1/orders/track')
      .set(ourRouteHeaders())
      .send({ orderNumber: o.orderNumber, phone: o.contactPhone });
    expect(res.body.data.status).toBe('IN_TRANSIT');
    expect(res.body.data.shipments[0]).toMatchObject({
      trackingCode: fake.byInvoice(o.orderNumber).trackingCode,
      courierStatus: 'in_transit',
    });
    expect(res.body.data.shipments[0].events.map((e: { status: string }) => e.status)).toEqual([
      'in_review',
      'in_transit',
    ]);
    expect(JSON.stringify(res.body.data)).not.toContain('"raw');
  });
});
