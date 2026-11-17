import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, ourRouteHeaders } from './helpers';
import { makeProduct, registerCustomer } from './fixtures';

const ctx = createTestContext();
afterAll(() => ctx.close());
const { prisma } = ctx.deps;

const as = (cookie: string) => ({
  get: (p: string) => request(ctx.app).get(`/api/v1${p}`).set('Cookie', cookie),
  post: (p: string, b: object) =>
    request(ctx.app).post(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie).send(b),
  del: (p: string) =>
    request(ctx.app).delete(`/api/v1${p}`).set(ourRouteHeaders()).set('Cookie', cookie),
});

describe('wishlist', () => {
  it('adds, lists as cards, removes; adding twice is harmless', async () => {
    const me = as((await registerCustomer(ctx)).cookie);
    const a = await makeProduct(ctx, [{ price: '100' }]);
    const b = await makeProduct(ctx, [{ price: '200' }]);
    expect((await me.post('/me/wishlist', { productId: a.id })).status).toBe(201);
    await me.post('/me/wishlist', { productId: b.id });
    await me.post('/me/wishlist', { productId: a.id });
    const list = await me.get('/me/wishlist');
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([b.id, a.id]);
    expect(list.body.data[0]).toMatchObject({ slug: b.slug, price: '200.00' });

    const after = await me.del(`/me/wishlist/${a.id}`);
    expect(after.body.data).toEqual([b.id]);
  });

  it('merges a guest list, ignoring unknown products, and never shows hidden ones', async () => {
    const me = as((await registerCustomer(ctx)).cookie);
    const visible = await makeProduct(ctx, [{ price: '100' }]);
    const drafted = await makeProduct(ctx, [{ price: '100' }]);
    const merged = await me.post('/me/wishlist/merge', {
      productIds: [visible.id, drafted.id, randomUUID(), visible.id],
    });
    expect(merged.body.data.sort()).toEqual([visible.id, drafted.id].sort());

    await prisma.product.update({ where: { id: drafted.id }, data: { status: 'DRAFT' } });
    const list = await me.get('/me/wishlist');
    expect(list.body.data.map((c: { id: string }) => c.id)).toEqual([visible.id]);
  });

  it('keeps each customer’s list private and needs a session', async () => {
    const a = as((await registerCustomer(ctx)).cookie);
    const b = as((await registerCustomer(ctx)).cookie);
    const p = await makeProduct(ctx, [{ price: '100' }]);
    await a.post('/me/wishlist', { productId: p.id });
    expect((await b.get('/me/wishlist')).body.data).toEqual([]);
    expect((await b.del(`/me/wishlist/${p.id}`)).status).toBe(200);
    expect((await a.get('/me/wishlist/ids')).body.data).toEqual([p.id]);
    expect((await request(ctx.app).get('/api/v1/me/wishlist')).status).toBe(401);
  });

  it('shows cards for a guest list, visible products only', async () => {
    const p = await makeProduct(ctx, [{ price: '150' }]);
    const hidden = await makeProduct(ctx, [{ price: '150' }], { status: 'ARCHIVED' });
    const res = await request(ctx.app).get(`/api/v1/products/cards?ids=${hidden.id},${p.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((c: { id: string }) => c.id)).toEqual([p.id]);
    expect((await request(ctx.app).get('/api/v1/products/cards?ids=not-a-uuid')).status).toBe(400);
  });
});
