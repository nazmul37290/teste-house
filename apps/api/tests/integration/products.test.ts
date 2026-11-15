import { SUPER_ADMIN_ROLE } from '@shop/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
const { prisma } = ctx.deps;

let h: Record<string, string>;
let ownerId: string;
let categoryId: string;
beforeAll(async () => {
  const owner = await adminSession(ctx, SUPER_ADMIN_ROLE);
  h = adminHeaders(owner.cookie);
  ownerId = owner.id;
  categoryId = (await prisma.category.create({ data: { name: 'Honey', slug: `honey-${u()}` } })).id;
});

function u() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}
const api = {
  get: (p: string) => request(ctx.app).get(`/api/v1/admin${p}`).set(h),
  post: (p: string, b: object, headers = h) =>
    request(ctx.app).post(`/api/v1/admin${p}`).set(headers).send(b),
  patch: (p: string, b: object) => request(ctx.app).patch(`/api/v1/admin${p}`).set(h).send(b),
  put: (p: string, b: object) => request(ctx.app).put(`/api/v1/admin${p}`).set(h).send(b),
  del: (p: string) => request(ctx.app).delete(`/api/v1/admin${p}`).set(h),
};
const reason = (res: request.Response) => res.body.error?.details?.[0]?.reason;

async function product(
  extra: object = {},
  variants: object[] = [{ sku: `SKU-${u()}`, unit: 'G', unitValue: '500', price: '450' }],
) {
  const res = await api.post('/products', {
    name: `Sundarbans Honey ${u()}`,
    categoryId,
    variants,
    ...extra,
  });
  expect(res.status).toBe(201);
  return res.body.data;
}

describe('products', () => {
  it('creates a product with variants: generated labels, money as strings, initial stock as a PURCHASE movement', async () => {
    const sku = `HNY-${u()}`;
    const p = await product(
      {
        status: 'ACTIVE',
        isFeatured: true,
        nutritionFacts: [{ name: 'Energy', amount: '304 kcal' }],
      },
      [
        {
          sku: sku.toLowerCase(),
          unit: 'G',
          unitValue: '500.000',
          price: '450',
          salePrice: '420.5',
          initialStock: 12,
        },
        { sku: `${sku}-1L`, unit: 'L', unitValue: '1.5', price: '900', name: 'Family jar' },
      ],
    );
    expect(p).toMatchObject({
      status: 'ACTIVE',
      isFeatured: true,
      nutritionFacts: [{ name: 'Energy', amount: '304 kcal' }],
    });
    expect(p.variants[0]).toMatchObject({
      sku,
      name: '500 g',
      unitValue: '500',
      price: '450.00',
      salePrice: '420.50',
      stockQty: 12,
      hasHistory: true,
    });
    expect(p.variants[1]).toMatchObject({
      name: 'Family jar',
      unitValue: '1.5',
      stockQty: 0,
      hasHistory: false,
    });

    const movement = await prisma.stockMovement.findFirstOrThrow({
      where: { variantId: p.variants[0].id },
    });
    expect(movement).toMatchObject({
      type: 'PURCHASE',
      quantity: 12,
      balanceAfter: 12,
      adminUserId: ownerId,
    });
    expect((await prisma.auditLog.findFirst({ where: { entityId: p.id } }))?.action).toBe(
      'product.create',
    );
  });

  it('needs an active variant to be ACTIVE, unique SKUs and one value per attribute', async () => {
    expect(
      reason(await api.post('/products', { name: 'Empty', categoryId, status: 'ACTIVE' })),
    ).toBe('PRODUCT_NEEDS_VARIANT');
    const sku = `DUP-${u()}`;
    await product({}, [{ sku, name: 'One', price: '10' }]);
    expect(
      reason(
        await api.post('/products', {
          name: 'Again',
          categoryId,
          variants: [{ sku, name: 'Two', price: '10' }],
        }),
      ),
    ).toBe('SKU_TAKEN');
    const first = await product();
    const slugClash = await api.post('/products', { name: 'Other', slug: first.slug, categoryId });
    expect(slugClash.status).toBe(409);
    expect(reason(slugClash)).toBe('SLUG_TAKEN');

    const attr = await prisma.attribute.create({
      data: {
        name: `Flavor ${u()}`,
        slug: `flavor-${u()}`,
        values: {
          create: [
            { value: 'Plain', slug: 'plain' },
            { value: 'Malt', slug: 'malt' },
          ],
        },
      },
      include: { values: true },
    });
    const twoFlavors = await api.post('/products', {
      name: 'Two flavors',
      categoryId,
      variants: [
        {
          sku: `FL-${u()}`,
          name: 'x',
          price: '10',
          attributeValueIds: attr.values.map((v) => v.id),
        },
      ],
    });
    expect(reason(twoFlavors)).toBe('ONE_VALUE_PER_ATTRIBUTE');
  });

  it('rejects any stock or money field it does not own, and sale prices at or above the price', async () => {
    expect((await api.post('/products', { name: 'X', categoryId, ratingAvg: 5 })).status).toBe(400);
    const p = await product();
    expect((await api.patch(`/variants/${p.variants[0].id}`, { stockQty: 999 })).status).toBe(400);
    const bad = await api.patch(`/variants/${p.variants[0].id}`, { salePrice: '450' });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('salePrice');
    // The database CHECK is the last line of defence.
    await expect(
      prisma.productVariant.update({
        where: { id: p.variants[0].id },
        data: { salePrice: '999.00' },
      }),
    ).rejects.toThrow();
  });

  it('keeps the slug on rename and redirects /product/old on a slug change', async () => {
    const p = await product();
    expect((await api.patch(`/products/${p.id}`, { name: 'Renamed honey' })).body.data.slug).toBe(
      p.slug,
    );
    const newSlug = `new-honey-${u()}`;
    await api.patch(`/products/${p.id}`, { slug: newSlug });
    const r = await prisma.redirect.findUniqueOrThrow({
      where: { fromPath: `/product/${p.slug}` },
    });
    expect(r).toMatchObject({ toPath: `/product/${newSlug}`, statusCode: 301 });
  });

  it('updates variant labels with the net content when they were generated', async () => {
    const p = await product();
    const v = (await api.patch(`/variants/${p.variants[0].id}`, { unit: 'KG', unitValue: '1' }))
      .body.data.variants[0];
    expect(v).toMatchObject({ name: '1 kg', unit: 'KG', unitValue: '1' });
    const custom = (await api.patch(`/variants/${v.id}`, { name: 'Big jar' })).body.data
      .variants[0];
    const after = (await api.patch(`/variants/${custom.id}`, { unitValue: '2' })).body.data
      .variants[0];
    expect(after.name).toBe('Big jar'); // a custom label is kept
  });

  it('protects the last active variant and refuses to delete variants with history', async () => {
    const p = await product({ status: 'ACTIVE' }, [
      { sku: `LA-${u()}`, name: 'Only', price: '10', initialStock: 3 },
    ]);
    const vid = p.variants[0].id;
    expect(reason(await api.patch(`/variants/${vid}`, { isActive: false }))).toBe(
      'LAST_ACTIVE_VARIANT',
    );
    expect(reason(await api.del(`/variants/${vid}`))).toBe('VARIANT_HAS_HISTORY');

    const added = (
      await api.post(`/products/${p.id}/variants`, {
        sku: `LB-${u()}`,
        name: 'Second',
        price: '20',
      })
    ).body.data;
    const second = added.variants.find((v: { name: string }) => v.name === 'Second');
    expect((await api.del(`/variants/${second.id}`)).status).toBe(200);
  });

  it('sets ordered images with the first as primary (one primary, enforced by the database)', async () => {
    const p = await product();
    const media = await Promise.all(
      [1, 2].map(async (n) => {
        const file = await sharp({
          create: { width: 300, height: 300, channels: 3, background: { r: 10 * n, g: 0, b: 0 } },
        })
          .png()
          .toBuffer();
        return (
          await request(ctx.app)
            .post('/api/v1/admin/media')
            .set(h)
            .field('altText', `Photo ${n}`)
            .attach('file', file, 'p.png')
        ).body.data;
      }),
    );
    const set = (ids: string[]) => api.put(`/products/${p.id}/images`, { mediaIds: ids });
    expect(
      (await set([media[1].id, media[0].id])).body.data.images.map(
        (i: { isPrimary: boolean }) => i.isPrimary,
      ),
    ).toEqual([true, false]);
    const reordered = (await set([media[0].id, media[1].id])).body.data.images;
    expect(reordered[0]).toMatchObject({
      mediaId: media[0].id,
      isPrimary: true,
      altText: 'Photo 1',
    });
    expect((await set([media[0].id, media[0].id])).status).toBe(400);
    // The image is now in use: the media library refuses to delete it.
    expect((await api.del(`/media/${media[0].id}`)).status).toBe(409);
  });

  it('lists with search by SKU and filters; soft-deletes; bulk status needs active variants', async () => {
    const sku = `FIND-${u()}`;
    const p = await product({}, [
      { sku, name: 'x', price: '100', salePrice: '80' },
      { sku: `${sku}-B`, name: 'y', price: '300' },
    ]);
    const list = await api.get(`/products?q=${sku.toLowerCase()}&categoryId=${categoryId}`);
    expect(list.body.data).toHaveLength(1);
    expect(list.body.data[0]).toMatchObject({
      id: p.id,
      variantCount: 2,
      priceFrom: '80.00',
      priceTo: '300.00',
    });

    const empty = (await api.post('/products', { name: `No variants ${u()}`, categoryId })).body
      .data;
    expect(
      reason(await api.post('/products/bulk-status', { ids: [p.id, empty.id], status: 'ACTIVE' })),
    ).toBe('PRODUCT_NEEDS_VARIANT');
    expect(
      (await api.post('/products/bulk-status', { ids: [p.id], status: 'ACTIVE' })).body.data,
    ).toEqual({ updated: 1 });

    expect((await api.del(`/products/${p.id}`)).status).toBe(204);
    expect((await api.get(`/products/${p.id}`)).status).toBe(404);
    expect(
      (await prisma.product.findUniqueOrThrow({ where: { id: p.id } })).deletedAt,
    ).toBeInstanceOf(Date);
  });

  it('needs the products.* permissions', async () => {
    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie); // products.view only
    expect((await request(ctx.app).get('/api/v1/admin/products').set(salesman)).status).toBe(200);
    expect((await api.post('/products', { name: 'Nope', categoryId }, salesman)).status).toBe(403);
  });
});
