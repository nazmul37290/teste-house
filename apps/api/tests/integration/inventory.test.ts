import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
const { prisma } = ctx.deps;

let h: Record<string, string>;
let categoryId: string;
let adminEmailBefore: unknown;
const alertTo = `stock-alerts-${Date.now()}@example.com`;

beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  categoryId = (await prisma.category.create({ data: { name: 'Stock', slug: `stock-${u()}` } })).id;
  adminEmailBefore = (
    await prisma.setting.findUnique({ where: { key: 'notifications.adminEmail' } })
  )?.value;
  await prisma.setting.update({
    where: { key: 'notifications.adminEmail' },
    data: { value: alertTo },
  });
});
afterAll(async () => {
  await prisma.setting.update({
    where: { key: 'notifications.adminEmail' },
    data: { value: (adminEmailBefore ?? '') as string },
  });
  await ctx.close();
});

function u() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}
const post = (p: string, b: object, headers = h) =>
  request(ctx.app).post(`/api/v1/admin${p}`).set(headers).send(b);
const get = (p: string) => request(ctx.app).get(`/api/v1/admin${p}`).set(h);
const reason = (res: request.Response) => res.body.error?.details?.[0]?.reason;

async function variant(stock: number, threshold = 5) {
  const res = await post('/products', {
    name: `Tuna ${u()}`,
    categoryId,
    variants: [
      {
        sku: `TUNA-${u()}`,
        unit: 'G',
        unitValue: '185',
        price: '220',
        initialStock: stock,
        lowStockThreshold: threshold,
      },
    ],
  });
  expect(res.status).toBe(201);
  return res.body.data.variants[0] as { id: string; sku: string };
}
const stockOf = async (id: string) =>
  (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).stockQty;
const adjust = (variantId: string, quantity: number, extra: object = {}) =>
  post('/inventory/adjust', { variantId, quantity, reason: 'Stock count', ...extra });

describe('inventory adjustments', () => {
  it('adds and removes stock with an ADJUSTMENT movement holding the exact balance', async () => {
    const v = await variant(10);
    expect((await adjust(v.id, 5)).body.data).toEqual({ variantId: v.id, stockQty: 15 });
    expect((await adjust(v.id, -3, { reason: 'Two cans dented' })).body.data.stockQty).toBe(12);
    const moves = await prisma.stockMovement.findMany({
      where: { variantId: v.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(moves.map((m) => [m.type, m.quantity, m.balanceAfter])).toEqual([
      ['PURCHASE', 10, 10],
      ['ADJUSTMENT', 5, 15],
      ['ADJUSTMENT', -3, 12],
    ]);
    expect(moves[2]?.reason).toBe('Two cans dented');
    expect(
      (await prisma.auditLog.findFirst({ where: { entityId: v.id, action: 'inventory.adjust' } }))
        ?.after,
    ).toMatchObject({ stockQty: 15 });
  });

  it('never goes below zero and needs a reason', async () => {
    const v = await variant(2);
    const res = await adjust(v.id, -3);
    expect(res.status).toBe(422);
    expect(reason(res)).toBe('INSUFFICIENT_STOCK');
    expect(await stockOf(v.id)).toBe(2);
    expect(
      await prisma.stockMovement.count({ where: { variantId: v.id, type: 'ADJUSTMENT' } }),
    ).toBe(0);
    expect((await post('/inventory/adjust', { variantId: v.id, quantity: 1 })).status).toBe(400);
    expect((await adjust(v.id, 0)).status).toBe(400);
  });

  it('stays consistent under concurrent adjustments (last units)', async () => {
    const v = await variant(10, 0);
    const results = await Promise.all(Array.from({ length: 15 }, () => adjust(v.id, -1)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(10);
    expect(results.filter((r) => r.status === 422)).toHaveLength(5);
    expect(await stockOf(v.id)).toBe(0);
    const balances = (
      await prisma.stockMovement.findMany({ where: { variantId: v.id, type: 'ADJUSTMENT' } })
    ).map((m) => m.balanceAfter);
    expect(balances.sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]); // each balance exactly once
  });
});

describe('receiving stock and batches', () => {
  it('receives a batch with dates, tracks what remains, and refuses mismatches', async () => {
    const v = await variant(0, 0);
    const batchNo = `B-${u()}`;
    const received = await post('/inventory/receive', {
      variantId: v.id,
      quantity: 24,
      batchNo,
      manufacturedAt: '2026-10-01',
      expiryDate: '2028-10-01',
    });
    expect(received.status).toBe(201);
    expect(received.body.data.stockQty).toBe(24);
    const batchId = received.body.data.batchId as string;

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { variantId: v.id, type: 'PURCHASE' },
    });
    expect(movement).toMatchObject({
      quantity: 24,
      balanceAfter: 24,
      batchId,
      reason: `Received batch ${batchNo}`,
    });
    expect(
      (await post('/inventory/receive', { variantId: v.id, quantity: 1, batchNo })).status,
    ).toBe(409);
    expect(
      (await post('/inventory/receive', { variantId: v.id, quantity: 1, expiryDate: '2028-01-01' }))
        .status,
    ).toBe(400);
    expect(
      (
        await post('/inventory/receive', {
          variantId: v.id,
          quantity: 1,
          batchNo: `X-${u()}`,
          manufacturedAt: '2027-01-01',
          expiryDate: '2026-01-01',
        })
      ).status,
    ).toBe(400);

    expect((await adjust(v.id, -4, { batchId, reason: 'Expired jars' })).status).toBe(200);
    const batches = (await get(`/inventory/variants/${v.id}/batches`)).body.data;
    expect(batches[0]).toMatchObject({
      batchNo,
      qtyReceived: 24,
      qtyRemaining: 20,
      expiryDate: '2028-10-01',
    });

    const other = await variant(5);
    expect(reason(await adjust(other.id, -1, { batchId }))).toBe('BATCH_MISMATCH');
    expect(await stockOf(other.id)).toBe(5); // rolled back with the batch check
  });
});

describe('low-stock alerts', () => {
  /** Low-stock emails queued to the test address in the last minute. */
  const alerts = () =>
    prisma.notificationLog.count({
      where: {
        recipient: alertTo,
        template: 'admin-low-stock',
        createdAt: { gte: new Date(Date.now() - 60_000) },
      },
    });

  it('emails the admin once when stock falls to the alert level, again only after a restock', async () => {
    const v = await variant(7, 5);
    const before = await alerts();
    await adjust(v.id, -2); // 5: at the alert level
    expect(await alerts()).toBe(before + 1);
    await adjust(v.id, -1); // 4: still low, same day
    expect(await alerts()).toBe(before + 1);
    await adjust(v.id, 10); // 14: back above, the alert resets
    await adjust(v.id, -10); // 4: low again
    expect(await alerts()).toBe(before + 2);

    const log = await prisma.notificationLog.findFirstOrThrow({
      where: { recipient: alertTo, template: 'admin-low-stock' },
      orderBy: { createdAt: 'desc' },
    });
    const job = await ctx.deps.emailQueue().getJob(log.id);
    expect(job?.data.data).toMatchObject({ sku: v.sku, stockQty: 4, threshold: 5 });
  });
});

describe('stock lists', () => {
  it('filters low stock, shows nearest expiry and the movement log, and needs inventory.view', async () => {
    const low = await variant(1, 5);
    const list = (await get(`/inventory?lowStock=true&q=${low.sku}`)).body.data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: low.id, stockQty: 1, isLow: true });
    expect(
      (await get(`/inventory?lowStock=true&q=${(await variant(50, 5)).sku}`)).body.data,
    ).toHaveLength(0);

    const moves = (await get(`/inventory/movements?variantId=${low.id}`)).body;
    expect(moves.meta.total).toBe(1);
    expect(moves.data[0]).toMatchObject({
      type: 'PURCHASE',
      quantity: 1,
      variant: { sku: low.sku },
    });

    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    expect((await request(ctx.app).get('/api/v1/admin/inventory').set(salesman)).status).toBe(403);
    expect(
      (
        await post(
          '/inventory/adjust',
          { variantId: low.id, quantity: 1, reason: 'x x x' },
          salesman,
        )
      ).status,
    ).toBe(403);
  });
});
