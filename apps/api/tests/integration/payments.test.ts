import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { expireUnpaidOrders, reconcilePayments } from '../../src/services/payment.service';
import { createFakeGateway } from './fake-gateway';
import { SUPER_ADMIN_ROLE } from '@shop/shared';
import {
  adminHeaders,
  adminSession,
  createTestContext,
  ourRouteHeaders,
  uniquePhone,
} from './helpers';
import { makeProduct, uid } from './fixtures';

const WEBHOOK_KEY = 'test-uddoktapay-key-0123456789';
const ctx = createTestContext({ UDDOKTAPAY_API_KEY: WEBHOOK_KEY });
const { prisma } = ctx.deps;
const fake = createFakeGateway();
ctx.deps.gateways = { UDDOKTAPAY: fake.gateway };

beforeAll(async () => {
  await prisma.paymentMethod.update({
    where: { code: 'UDDOKTAPAY' },
    data: { isActive: true, config: {} },
  });
  await prisma.deliveryZone.update({
    where: { code: 'inside-dhaka' },
    data: { charge: '60', freeDeliveryThreshold: null, isActive: true },
  });
});
afterAll(() => ctx.close());

const dhaka = {
  recipientName: 'Online Buyer',
  phone: '01712345678',
  division: 'Dhaka',
  district: 'Dhaka',
  addressLine: 'House 4, Road 6, Uttara',
};

async function placeOnline(variantId: string, quantity = 1, phone = uniquePhone()) {
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Idempotency-Key', randomUUID())
    .send({
      items: [{ variantId, quantity }],
      contact: { name: 'Online Buyer', phone },
      address: dhaka,
      paymentMethodCode: 'UDDOKTAPAY',
    });
  expect(res.status).toBe(201);
  const order = await prisma.order.findUniqueOrThrow({
    where: { orderNumber: res.body.data.orderNumber },
    include: { payments: true },
  });
  return { res, order, phone, payment: order.payments[0]! };
}
const confirm = (invoiceId: string) =>
  request(ctx.app)
    .post('/api/v1/payments/uddoktapay/confirm')
    .set(ourRouteHeaders())
    .send({ invoiceId });
const orderOf = (id: string) => prisma.order.findUniqueOrThrow({ where: { id } });
const paymentOf = (id: string) => prisma.payment.findUniqueOrThrow({ where: { id } });

describe('online checkout', () => {
  it('offers online payment at checkout when the gateway is configured', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const q = await request(ctx.app)
      .post('/api/v1/checkout/quote')
      .set(ourRouteHeaders())
      .send({ items: [{ variantId: p.variantIds[0], quantity: 1 }], district: 'Bogura' });
    expect(q.body.data.paymentMethods.map((m: { code: string }) => m.code)).toContain('UDDOKTAPAY');
  });

  it('places the order, opens a charge and confirms it only through verify, once', async () => {
    const p = await makeProduct(ctx, [{ price: '500', stock: 5 }]);
    const { res, order, payment } = await placeOnline(p.variantIds[0]!, 2);
    expect(res.body.data.payment.redirectUrl).toMatch(/^https:\/\/gateway\.test\/payment\//);
    expect(order).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
    expect(payment).toMatchObject({ status: 'PENDING', gatewayInvoiceId: null });
    expect(payment.amount.toFixed(2)).toBe('1060.00');
    // The placeholder email went to the gateway (the guest gave none), never to our mailer.
    expect(
      await prisma.notificationLog.count({
        where: { orderId: order.id, template: 'order-placed' },
      }),
    ).toBe(0);

    const invoice = fake.invoiceFor(payment.id);
    const early = await confirm(invoice); // returned before paying: still pending
    expect(early.body.data).toMatchObject({ outcome: 'PENDING', paymentStatus: 'PENDING' });

    fake.settle(invoice, 'SUCCESS', { txnId: `TX${uid()}` });
    const paid = await confirm(invoice);
    expect(paid.body.data).toMatchObject({
      outcome: 'PAID',
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
    });
    expect(await paymentOf(payment.id)).toMatchObject({
      status: 'SUCCESS',
      gatewayInvoiceId: invoice,
    });
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, toStatus: 'CONFIRMED' },
      }),
    ).toBe(1);

    const again = await confirm(invoice);
    expect(again.body.data.outcome).toBe('ALREADY_PAID');
    expect(
      await prisma.orderStatusHistory.count({
        where: { orderId: order.id, toStatus: 'CONFIRMED' },
      }),
    ).toBe(1);
  });

  it('never marks an order paid when the verified amount differs', async () => {
    const p = await makeProduct(ctx, [{ price: '500' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    fake.settle(invoice, 'SUCCESS', { amount: 100 }); // Tk 1 instead of Tk 560
    const res = await confirm(invoice);
    expect(res.body.data.outcome).toBe('MISMATCH');
    expect(await orderOf(order.id)).toMatchObject({ status: 'PENDING', paymentStatus: 'PENDING' });
    expect((await paymentOf(payment.id)).status).toBe('FAILED');
    expect(await prisma.orderNote.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('records a failure and lets the right phone pay again', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment, phone } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    fake.settle(invoice, 'FAILED');
    expect((await confirm(invoice)).body.data.outcome).toBe('FAILED');
    expect((await orderOf(order.id)).paymentStatus).toBe('FAILED');

    const pay = (body: object) =>
      request(ctx.app).post('/api/v1/orders/pay').set(ourRouteHeaders()).send(body);
    expect((await pay({ orderNumber: order.orderNumber, phone: uniquePhone() })).status).toBe(404);
    const retry = await pay({ orderNumber: order.orderNumber, phone });
    expect(retry.body.data.redirectUrl).toMatch(/gateway\.test/);
    expect((await orderOf(order.id)).paymentStatus).toBe('PENDING');
    expect(await prisma.payment.count({ where: { orderId: order.id } })).toBe(2);
  });

  it('keeps the order when the gateway is down and says so', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    fake.failNextCharge();
    const { res, order } = await placeOnline(p.variantIds[0]!);
    expect(res.body.data.payment).toEqual({ error: expect.any(String) });
    expect(order.status).toBe('PENDING');
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId: order.id } })).status).toBe(
      'FAILED',
    );
  });
});

describe('webhook', () => {
  const hook = (key: string | null, body: object) => {
    const req = request(ctx.app).post('/api/v1/webhooks/uddoktapay');
    return (key ? req.set('RT-UDDOKTAPAY-API-KEY', key) : req).send(body);
  };

  it('refuses a wrong or missing key and verifies with the gateway for the right one', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    fake.settle(invoice, 'SUCCESS');

    expect((await hook(null, { invoice_id: invoice })).status).toBe(401);
    expect((await hook('wrong-key', { invoice_id: invoice })).status).toBe(401);
    // A forged "COMPLETED" body with the right key still goes through verify() (amount from the gateway).
    const ok = await hook(WEBHOOK_KEY, {
      invoice_id: invoice,
      status: 'COMPLETED',
      amount: '1.00',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.data.outcome).toBe('PAID');
    expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
    expect((await hook(WEBHOOK_KEY, { invoice_id: invoice })).body.data.outcome).toBe(
      'ALREADY_PAID',
    );
  });
});

describe('expiry and reconciliation', () => {
  it('cancels unpaid online orders after 30 minutes and releases stock', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 5 }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!, 2);
    await confirm(fake.invoiceFor(payment.id)); // invoice id now known, still unpaid
    await prisma.order.update({
      where: { id: order.id },
      data: { placedAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect(await expireUnpaidOrders(ctx.deps)).toBeGreaterThanOrEqual(1);
    expect(await orderOf(order.id)).toMatchObject({ status: 'CANCELLED' });
    expect(
      (await prisma.productVariant.findUniqueOrThrow({ where: { id: p.variantIds[0] } })).stockQty,
    ).toBe(5);
    expect((await paymentOf(payment.id)).status).toBe('CANCELLED');
  });

  it('checks the gateway once more before expiring, so a paid order is kept', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    await confirm(invoice);
    fake.settle(invoice, 'SUCCESS');
    await prisma.order.update({
      where: { id: order.id },
      data: { placedAt: new Date(Date.now() - 40 * 60_000) },
    });
    await expireUnpaidOrders(ctx.deps);
    expect(await orderOf(order.id)).toMatchObject({ status: 'CONFIRMED', paymentStatus: 'PAID' });
  });

  it('reconciles open attempts whose invoice is known', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    await confirm(invoice);
    fake.settle(invoice, 'SUCCESS');
    await prisma.payment.update({
      where: { id: payment.id },
      data: { createdAt: new Date(Date.now() - 10 * 60_000) },
    });
    await reconcilePayments(ctx.deps);
    expect((await orderOf(order.id)).paymentStatus).toBe('PAID');
  });

  it('flags a payment that arrives after the order was cancelled', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { placedAt: new Date(Date.now() - 31 * 60_000) },
    });
    await expireUnpaidOrders(ctx.deps); // invoice unknown to us: cancelled
    fake.settle(invoice, 'SUCCESS');
    const late = await confirm(invoice);
    expect(late.body.data).toMatchObject({
      outcome: 'LATE_PAYMENT',
      status: 'CANCELLED',
      paymentStatus: 'PAID',
    });
    const note = await prisma.orderNote.findFirstOrThrow({ where: { orderId: order.id } });
    expect(note.note).toContain('after the order was cancelled');
  });
});

describe('refunds and payment records', () => {
  async function paidOrder(price = '500') {
    const p = await makeProduct(ctx, [{ price }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const invoice = fake.invoiceFor(payment.id);
    fake.settle(invoice, 'SUCCESS', { txnId: `TX${uid()}` });
    await confirm(invoice);
    return { order, payment };
  }

  it('records partial and full refunds, never more than was paid', async () => {
    const h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
    const { order, payment } = await paidOrder(); // Tk 560 with delivery
    const refund = (amount: string) =>
      request(ctx.app)
        .post(`/api/v1/admin/orders/${order.id}/refunds`)
        .set(h)
        .send({ paymentId: payment.id, amount, reason: 'One jar arrived broken' });

    const part = await refund('100');
    expect(part.status).toBe(201);
    expect(part.body.data.paymentStatus).toBe('PARTIALLY_REFUNDED');
    expect(part.body.data.payments[0].refunds).toHaveLength(1);

    const tooMuch = await refund('460.01');
    expect(tooMuch.body.error.details[0]).toEqual({
      reason: 'REFUND_TOO_LARGE',
      maxAmount: '460.00',
    });
    const rest = await refund('460');
    expect(rest.body.data.paymentStatus).toBe('REFUNDED');
    expect(
      await prisma.auditLog.count({ where: { entityId: order.id, action: 'payment.refund' } }),
    ).toBe(2);
  });

  it('refuses refunds of unpaid attempts and without the permission', async () => {
    const h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const { order, payment } = await placeOnline(p.variantIds[0]!);
    const body = { paymentId: payment.id, amount: '10', reason: 'Test refund' };
    const unpaid = await request(ctx.app)
      .post(`/api/v1/admin/orders/${order.id}/refunds`)
      .set(h)
      .send(body);
    expect(unpaid.body.error.details[0].reason).toBe('PAYMENT_NOT_PAID');
    const forbidden = await request(ctx.app)
      .post(`/api/v1/admin/orders/${order.id}/refunds`)
      .set(salesman)
      .send(body);
    expect(forbidden.status).toBe(403);
    const other = await request(ctx.app)
      .post(`/api/v1/admin/orders/${randomUUID()}/refunds`)
      .set(h)
      .send(body);
    expect(other.status).toBe(404);
  });

  it('lists payment attempts with filters', async () => {
    const h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
    const { order } = await paidOrder('120');
    const res = await request(ctx.app)
      .get(`/api/v1/admin/payments?q=${order.orderNumber}&status=SUCCESS`)
      .set(h);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toMatchObject({
      status: 'SUCCESS',
      amount: '180.00',
      refunded: '0.00',
      order: { orderNumber: order.orderNumber },
      method: { code: 'UDDOKTAPAY' },
    });
  });
});
