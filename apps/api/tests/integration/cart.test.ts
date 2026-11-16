import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createTestContext, ourRouteHeaders } from './helpers';
import { makeProduct, mergeCookies, registerCustomer } from './fixtures';

const ctx = createTestContext();
afterAll(() => ctx.close());
const { prisma } = ctx.deps;

/** A tiny client that keeps cookies between calls, like a browser. */
function browser(cookie = '') {
  const jar = { cookie };
  const send = async (method: 'get' | 'post' | 'patch' | 'delete', path: string, body?: object) => {
    let req = request(ctx.app)[method](`/api/v1${path}`).set(ourRouteHeaders());
    if (jar.cookie) req = req.set('Cookie', jar.cookie);
    const res = body ? await req.send(body) : await req;
    jar.cookie = mergeCookies(jar.cookie, res);
    return res;
  };
  return {
    jar,
    get: (p: string) => send('get', p),
    post: (p: string, b: object) => send('post', p, b),
    patch: (p: string, b: object) => send('patch', p, b),
    del: (p: string) => send('delete', p),
  };
}

describe('guest cart', () => {
  it('starts empty without creating anything, then adds, updates and removes lines', async () => {
    const { variantIds } = await makeProduct(ctx, [{ price: '450', salePrice: '400', stock: 5 }]);
    const guest = browser();

    const empty = await guest.get('/cart');
    expect(empty.body.data).toEqual({
      items: [],
      itemCount: 0,
      subtotal: '0.00',
      hasProblems: false,
    });
    expect(guest.jar.cookie).toBe('');

    const added = await guest.post('/cart/items', { variantId: variantIds[0], quantity: 2 });
    expect(added.status).toBe(201);
    expect(guest.jar.cookie).toMatch(/^shop_cart=/);
    expect(added.headers['set-cookie']?.[0]).toMatch(/HttpOnly/i);
    expect(added.body.data).toMatchObject({ itemCount: 2, subtotal: '800.00', hasProblems: false });
    const line = added.body.data.items[0];
    expect(line).toMatchObject({ unitPrice: '400.00', regularPrice: '450.00', maxQuantity: 5 });
    expect(line).not.toHaveProperty('stockQty');

    const again = await guest.post('/cart/items', { variantId: variantIds[0], quantity: 1 });
    expect(again.body.data.items[0].quantity).toBe(3);

    const tooMany = await guest.patch(`/cart/items/${line.id}`, { quantity: 6 });
    expect(tooMany.status).toBe(422);
    expect(tooMany.body.error.details[0]).toEqual({ reason: 'NOT_ENOUGH_STOCK', maxQuantity: 5 });

    const updated = await guest.patch(`/cart/items/${line.id}`, { quantity: 5 });
    expect(updated.body.data.subtotal).toBe('2000.00');

    const removed = await guest.del(`/cart/items/${line.id}`);
    expect(removed.body.data.items).toEqual([]);
  });

  it('refuses unavailable and sold-out variants and someone else’s line', async () => {
    const draft = await makeProduct(ctx, [{ price: '100' }], { status: 'DRAFT' });
    const soldOut = await makeProduct(ctx, [{ price: '100', stock: 0 }]);
    const ok = await makeProduct(ctx, [{ price: '100' }]);
    const a = browser();
    const b = browser();

    const r1 = await a.post('/cart/items', { variantId: draft.variantIds[0], quantity: 1 });
    expect(r1.body.error.details[0].reason).toBe('UNAVAILABLE');
    const r2 = await a.post('/cart/items', { variantId: soldOut.variantIds[0], quantity: 1 });
    expect(r2.body.error.details[0].reason).toBe('OUT_OF_STOCK');

    const mine = await a.post('/cart/items', { variantId: ok.variantIds[0], quantity: 1 });
    const lineId = mine.body.data.items[0].id as string;
    await b.post('/cart/items', { variantId: ok.variantIds[0], quantity: 1 });
    expect((await b.patch(`/cart/items/${lineId}`, { quantity: 2 })).status).toBe(404);
    expect((await b.del(`/cart/items/${lineId}`)).status).toBe(404);
  });

  it('rejects prices and unknown fields in the body', async () => {
    const ok = await makeProduct(ctx, [{ price: '100' }]);
    const res = await browser().post('/cart/items', {
      variantId: ok.variantIds[0],
      quantity: 1,
      price: '1',
    });
    expect(res.status).toBe(400);
  });

  it('flags lines that became unavailable and leaves them out of the subtotal', async () => {
    const p = await makeProduct(ctx, [{ price: '100' }, { price: '200' }]);
    const guest = browser();
    await guest.post('/cart/items', { variantId: p.variantIds[0], quantity: 1 });
    await guest.post('/cart/items', { variantId: p.variantIds[1], quantity: 2 });
    await prisma.productVariant.update({ where: { id: p.variantIds[1] }, data: { stockQty: 1 } });
    await prisma.productVariant.update({
      where: { id: p.variantIds[0] },
      data: { price: '150' },
    }); // the cart always shows the current price
    const view = (await guest.get('/cart')).body.data;
    expect(view.hasProblems).toBe(true);
    expect(view.subtotal).toBe('150.00');
    expect(view.items.map((i: { problem: string | null }) => i.problem)).toEqual([
      null,
      'NOT_ENOUGH_STOCK',
    ]);
  });

  it('needs the CSRF header for writes', async () => {
    const ok = await makeProduct(ctx, [{ price: '100' }]);
    const res = await request(ctx.app)
      .post('/api/v1/cart/items')
      .send({ variantId: ok.variantIds[0], quantity: 1 });
    expect(res.status).toBe(403);
  });
});

describe('customer cart', () => {
  it('merges the guest cart on the first signed-in request, capped at stock', async () => {
    const p = await makeProduct(ctx, [{ price: '100', stock: 4 }, { price: '50' }]);
    const customer = await registerCustomer(ctx);

    // The customer already has 3 of the first variant from another device.
    const signedIn = browser(customer.cookie);
    await signedIn.post('/cart/items', { variantId: p.variantIds[0], quantity: 3 });

    // As a guest (same browser before signing in) they add 2 more and another item.
    const guest = browser();
    await guest.post('/cart/items', { variantId: p.variantIds[0], quantity: 2 });
    await guest.post('/cart/items', { variantId: p.variantIds[1], quantity: 1 });
    const guestToken = guest.jar.cookie;

    const merged = browser(`${customer.cookie}; ${guestToken}`);
    const view = (await merged.get('/cart')).body.data;
    expect(view.items.map((i: { quantity: number }) => i.quantity)).toEqual([4, 1]);
    expect(merged.jar.cookie).not.toContain('shop_cart=');

    // The guest cart is gone: the old cookie now shows an empty cart.
    expect((await browser(guestToken).get('/cart')).body.data.items).toEqual([]);
  });
});
