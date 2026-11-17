import { randomUUID } from 'node:crypto';
import { SUPER_ADMIN_ROLE } from '@shop/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext, ourRouteHeaders } from './helpers';
import { makeProduct, registerCustomer } from './fixtures';

const ctx = createTestContext();
const { prisma } = ctx.deps;

let h: Record<string, string>;
let salesman: Record<string, string>;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
  await setAutoApprove(false);
  await prisma.paymentMethod.update({
    where: { code: 'COD' },
    data: { isActive: true, config: { scope: 'DHAKA_ONLY' } },
  });
  await prisma.deliveryZone.update({ where: { code: 'inside-dhaka' }, data: { isActive: true } });
});
afterAll(async () => {
  await setAutoApprove(false);
  await ctx.close();
});

async function setAutoApprove(on: boolean) {
  await prisma.setting.update({ where: { key: 'review.autoApprove' }, data: { value: on } });
}

const as = (cookie: string) => ({
  get: (p: string) => request(ctx.app).get(`/api/v1${p}`).set('Cookie', cookie),
  post: (p: string, b: object = {}) =>
    request(ctx.app).post(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  patch: (p: string, b: object) =>
    request(ctx.app).patch(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  del: (p: string) =>
    request(ctx.app).delete(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie),
});

/** A customer with an order for the product, moved to the given status. */
async function buyer(
  productVariantId: string,
  status: 'DELIVERED' | 'CANCELLED' | 'PROCESSING' = 'DELIVERED',
) {
  const c = await registerCustomer(ctx);
  const res = await request(ctx.app)
    .post('/api/v1/orders')
    .set(ourRouteHeaders())
    .set('Cookie', c.cookie)
    .set('Idempotency-Key', randomUUID())
    .send({
      items: [{ variantId: productVariantId, quantity: 1 }],
      contact: { name: 'Review Writer', phone: c.phone },
      address: {
        recipientName: 'Review Writer',
        phone: c.phone,
        division: 'Dhaka',
        district: 'Dhaka',
        addressLine: 'House 3, Road 3, Banasree',
      },
      paymentMethodCode: 'COD',
    });
  expect(res.status).toBe(201);
  await prisma.order.update({
    where: { orderNumber: res.body.data.orderNumber },
    data: { status, ...(status === 'DELIVERED' ? { deliveredAt: new Date() } : {}) },
  });
  return { ...c, api: as(c.cookie) };
}

const ratingOf = async (productId: string) => {
  const p = await prisma.product.findUniqueOrThrow({ where: { id: productId } });
  return { avg: p.ratingAvg.toFixed(2), count: p.ratingCount };
};
const publicList = (slug: string) => request(ctx.app).get(`/api/v1/products/${slug}/reviews`);

describe('writing reviews', () => {
  it('needs a delivered order for the product; cancelled or undelivered orders do not count', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    for (const status of ['CANCELLED', 'PROCESSING'] as const) {
      const c = await buyer(p.variantIds[0]!, status);
      const res = await c.api.post('/me/reviews', { productId: p.id, rating: 5 });
      expect(res.status).toBe(422);
      expect(res.body.error.details[0].reason).toBe('NOT_PURCHASED');
      expect(
        (await c.api.get(`/me/reviews/eligibility?productId=${p.id}`)).body.data.canReview,
      ).toBe(false);
    }
  });

  it('is pending until approved; approval updates the rating; one review per product', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const c = await buyer(p.variantIds[0]!);
    expect((await c.api.get(`/me/reviews/eligibility?productId=${p.id}`)).body.data.canReview).toBe(
      true,
    );
    expect(
      (await c.api.get('/me/reviews/to-review')).body.data.map((x: { id: string }) => x.id),
    ).toContain(p.id);

    const created = await c.api.post('/me/reviews', {
      productId: p.id,
      rating: 4,
      title: 'Good honey',
      body: 'Thick and <b>sweet</b>.',
    });
    expect(created.status).toBe(201);
    expect(created.body.data.status).toBe('PENDING');
    expect((await publicList(p.slug)).body.data.items).toEqual([]);
    expect(await ratingOf(p.id)).toEqual({ avg: '0.00', count: 0 });

    const dup = await c.api.post('/me/reviews', { productId: p.id, rating: 5 });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details[0].reason).toBe('ALREADY_REVIEWED');

    expect(
      (await request(ctx.app).post(`/api/v1/admin/reviews/${created.body.data.id}/approve`).set(h))
        .status,
    ).toBe(204);
    const pub = (await publicList(p.slug)).body.data;
    expect(pub.items[0]).toMatchObject({
      rating: 4,
      title: 'Good honey',
      body: 'Thick and <b>sweet</b>.', // stored as plain text; the page never renders HTML
      author: 'Shop',
      isVerifiedPurchase: true,
    });
    expect(pub.items[0]).not.toHaveProperty('customerId');
    expect(pub.summary).toMatchObject({ average: 4, count: 1, stars: { 4: 1, 5: 0 } });
    expect(await ratingOf(p.id)).toEqual({ avg: '4.00', count: 1 });
  });

  it('auto-approves when the setting is on, and averages exactly', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    await setAutoApprove(true);
    try {
      for (const rating of [5, 4, 4]) {
        const c = await buyer(p.variantIds[0]!);
        expect(
          (await c.api.post('/me/reviews', { productId: p.id, rating })).body.data.status,
        ).toBe('APPROVED');
      }
    } finally {
      await setAutoApprove(false);
    }
    expect(await ratingOf(p.id)).toEqual({ avg: '4.33', count: 3 });
  });

  it('an edit goes back to moderation and the rating follows; others cannot touch it', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const c = await buyer(p.variantIds[0]!);
    const id = (await c.api.post('/me/reviews', { productId: p.id, rating: 2 })).body.data
      .id as string;
    await request(ctx.app).post(`/api/v1/admin/reviews/${id}/approve`).set(h);
    expect(await ratingOf(p.id)).toEqual({ avg: '2.00', count: 1 });

    const other = await buyer(p.variantIds[0]!);
    expect((await other.api.patch(`/me/reviews/${id}`, { rating: 1 })).status).toBe(404);
    expect((await other.api.del(`/me/reviews/${id}`)).status).toBe(404);

    const edited = await c.api.patch(`/me/reviews/${id}`, {
      rating: 5,
      body: 'Better than I said',
    });
    expect(edited.body.data.status).toBe('PENDING');
    expect(await ratingOf(p.id)).toEqual({ avg: '0.00', count: 0 });

    expect((await c.api.del(`/me/reviews/${id}`)).status).toBe(204);
    expect(await prisma.review.count({ where: { id } })).toBe(0);
  });
});

describe('photos', () => {
  const jpeg = () =>
    sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 150, b: 40 } },
    })
      .jpeg()
      .toBuffer();

  it('uploads through the image pipeline, attaches to my review only, and shows when approved', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const c = await buyer(p.variantIds[0]!);
    const upload = await request(ctx.app)
      .post('/api/v1/me/review-photos')
      .set(ourRouteHeaders())
      .set('Cookie', c.cookie)
      .attach('file', await jpeg(), { filename: 'my photo.jpg', contentType: 'image/jpeg' });
    expect(upload.status).toBe(201);
    const mediaId = upload.body.data.id as string;
    const media = await prisma.media.findUniqueOrThrow({ where: { id: mediaId } });
    expect(media.path).toMatch(/^reviews\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/);

    const bad = await request(ctx.app)
      .post('/api/v1/me/review-photos')
      .set(ourRouteHeaders())
      .set('Cookie', c.cookie)
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
        filename: 'x.svg',
        contentType: 'image/svg+xml',
      });
    expect(bad.status).toBe(400);

    // Someone else cannot use my upload.
    const thief = await buyer(p.variantIds[0]!);
    const stolen = await thief.api.post('/me/reviews', {
      productId: p.id,
      rating: 3,
      mediaIds: [mediaId],
    });
    expect(stolen.status).toBe(400);

    const mine = await c.api.post('/me/reviews', {
      productId: p.id,
      rating: 5,
      mediaIds: [mediaId],
    });
    expect(mine.status).toBe(201);
    await request(ctx.app).post(`/api/v1/admin/reviews/${mine.body.data.id}/approve`).set(h);
    const pub = (await publicList(p.slug)).body.data.items[0];
    expect(pub.images[0].urls['500']).toContain(media.path);

    // Shop media library never lists customer photos.
    const library = await request(ctx.app).get('/api/v1/admin/media?pageSize=100').set(h);
    expect(library.body.data.map((m: { id: string }) => m.id)).not.toContain(mediaId);
  });
});

describe('moderation', () => {
  it('rejects, replies and deletes with reviews.moderate only', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }]);
    const c = await buyer(p.variantIds[0]!);
    const id = (await c.api.post('/me/reviews', { productId: p.id, rating: 1 })).body.data
      .id as string;
    expect(
      (await request(ctx.app).post(`/api/v1/admin/reviews/${id}/approve`).set(salesman)).status,
    ).toBe(403);

    const list = await request(ctx.app)
      .get(`/api/v1/admin/reviews?status=PENDING&q=${encodeURIComponent('Fixture')}`)
      .set(h);
    expect(list.body.data.map((r: { id: string }) => r.id)).toContain(id);

    await request(ctx.app).post(`/api/v1/admin/reviews/${id}/approve`).set(h);
    await request(ctx.app)
      .post(`/api/v1/admin/reviews/${id}/reply`)
      .set(h)
      .send({ reply: 'Sorry, we will do better.' });
    expect((await publicList(p.slug)).body.data.items[0].adminReply).toBe(
      'Sorry, we will do better.',
    );

    await request(ctx.app).post(`/api/v1/admin/reviews/${id}/reject`).set(h);
    expect((await publicList(p.slug)).body.data.items).toEqual([]);
    expect(await ratingOf(p.id)).toEqual({ avg: '0.00', count: 0 });

    expect((await request(ctx.app).delete(`/api/v1/admin/reviews/${id}`).set(h)).status).toBe(204);
    expect(await prisma.auditLog.count({ where: { entityId: id } })).toBe(4);
  });
});
