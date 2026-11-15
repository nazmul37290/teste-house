import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());

let h: Record<string, string>;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
});

const u = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
const post = (path: string, body: object, headers = h) =>
  request(ctx.app).post(`/api/v1/admin${path}`).set(headers).send(body);
const patch = (path: string, body: object) =>
  request(ctx.app).patch(`/api/v1/admin${path}`).set(h).send(body);
const del = (path: string) => request(ctx.app).delete(`/api/v1/admin${path}`).set(h);
const reason = (res: request.Response) => res.body.error?.details?.[0]?.reason;

async function category(name: string, parentId?: string) {
  const res = await post('/categories', {
    name,
    slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${u()}`,
    parentId,
  });
  expect(res.status).toBe(201);
  return res.body.data as { id: string; slug: string; depth: number };
}

describe('categories', () => {
  it('builds a tree with depth and generates slugs from names', async () => {
    const root = await category('Food');
    const child = await category('Breakfast', root.id);
    const auto = await post('/categories', { name: `Honey Jars ${u()}`, parentId: child.id });
    expect(auto.body.data.slug).toMatch(/^honey-jars-\d+$/);

    const list = (await request(ctx.app).get('/api/v1/admin/categories').set(h)).body.data as {
      id: string;
      depth: number;
    }[];
    const ids = list.map((c) => c.id);
    expect(ids.indexOf(root.id)).toBeLessThan(ids.indexOf(child.id)); // parent before child
    expect(list.find((c) => c.id === child.id)?.depth).toBe(2);
  });

  it('refuses cycles and trees deeper than 4 levels', async () => {
    const a = await category('Level A');
    const b = await category('Level B', a.id);
    const c = await category('Level C', b.id);
    expect(reason(await patch(`/categories/${a.id}`, { parentId: c.id }))).toBe('CATEGORY_CYCLE');
    expect(reason(await patch(`/categories/${a.id}`, { parentId: a.id }))).toBe('CATEGORY_CYCLE');

    const d = await category('Level D', c.id);
    expect(d.depth).toBe(4);
    expect(
      reason(
        await post('/categories', { name: 'Too deep', slug: `too-deep-${u()}`, parentId: d.id }),
      ),
    ).toBe('CATEGORY_TOO_DEEP');
    // Moving a 2-level subtree under a level-3 category would make 5 levels.
    const other = await category('Other root');
    await category('Other child', other.id);
    expect(reason(await patch(`/categories/${other.id}`, { parentId: c.id }))).toBe(
      'CATEGORY_TOO_DEEP',
    );
  });

  it('keeps the slug on rename, and redirects old URLs without chains on a slug change', async () => {
    const cat = await category('Spreads');
    expect(
      (await patch(`/categories/${cat.id}`, { name: 'Jams and Spreads' })).body.data.slug,
    ).toBe(cat.slug);

    const second = `spreads-b-${u()}`;
    const third = `spreads-c-${u()}`;
    await patch(`/categories/${cat.id}`, { slug: second });
    await patch(`/categories/${cat.id}`, { slug: third });
    const redirects = await ctx.deps.prisma.redirect.findMany({
      where: { fromPath: { in: [`/category/${cat.slug}`, `/category/${second}`] } },
    });
    expect(redirects.map((r) => r.toPath)).toEqual([`/category/${third}`, `/category/${third}`]);

    // Taking the first slug back makes it a live page again: its redirect goes.
    await patch(`/categories/${cat.id}`, { slug: cat.slug });
    expect(
      await ctx.deps.prisma.redirect.count({ where: { fromPath: `/category/${cat.slug}` } }),
    ).toBe(0);
  });

  it('refuses deleting a category with children or products, deletes an empty one', async () => {
    const parent = await category('Parent');
    const child = await category('Child', parent.id);
    expect(reason(await del(`/categories/${parent.id}`))).toBe('CATEGORY_HAS_CHILDREN');
    await ctx.deps.prisma.product.create({
      data: { name: 'P', slug: `p-${u()}`, categoryId: child.id },
    });
    expect(reason(await del(`/categories/${child.id}`))).toBe('CATEGORY_HAS_PRODUCTS');
    const empty = await category('Empty');
    expect((await del(`/categories/${empty.id}`)).status).toBe(204);
  });

  it('answers duplicate slugs with 409 and needs a slug when the name has no latin letters', async () => {
    const cat = await category('Duplicate');
    expect((await post('/categories', { name: 'Again', slug: cat.slug })).status).toBe(409);
    const bengali = await post('/categories', { name: 'মধু' });
    expect(bengali.status).toBe(400);
    expect(bengali.body.error.details[0].path).toBe('slug');
  });
});

describe('brands, tags and attributes', () => {
  it('refuses deleting a brand with live products', async () => {
    const brand = (await post('/brands', { name: `Brand ${u()}` })).body.data;
    const cat = await category('Brand cat');
    const product = await ctx.deps.prisma.product.create({
      data: { name: 'B', slug: `b-${u()}`, categoryId: cat.id, brandId: brand.id },
    });
    expect(reason(await del(`/brands/${brand.id}`))).toBe('BRAND_HAS_PRODUCTS');
    await ctx.deps.prisma.product.update({
      where: { id: product.id },
      data: { deletedAt: new Date() },
    });
    expect((await del(`/brands/${brand.id}`)).status).toBe(204);
  });

  it('manages tags', async () => {
    const tag = (await post('/tags', { name: `Organic ${u()}` })).body.data;
    expect((await patch(`/tags/${tag.id}`, { name: 'Organic food' })).body.data.name).toBe(
      'Organic food',
    );
    expect((await del(`/tags/${tag.id}`)).status).toBe(204);
  });

  it('manages attributes and values, refusing to remove values variants use', async () => {
    const attr = (await post('/attributes', { name: `Flavor ${u()}`, isFilterable: true })).body
      .data;
    const withValue = (await post(`/attributes/${attr.id}/values`, { value: 'Classic Malt' })).body
      .data;
    const value = withValue.values[0];
    expect(value).toMatchObject({ value: 'Classic Malt', slug: 'classic-malt', variantCount: 0 });
    expect((await post(`/attributes/${attr.id}/values`, { value: 'Classic Malt' })).status).toBe(
      409,
    );

    const cat = await category('Attr cat');
    const product = await ctx.deps.prisma.product.create({
      data: { name: 'V', slug: `v-${u()}`, categoryId: cat.id },
    });
    const variant = await ctx.deps.prisma.productVariant.create({
      data: { productId: product.id, sku: `SKU-${u()}`, name: '500 g', price: '100.00' },
    });
    await ctx.deps.prisma.variantAttributeValue.create({
      data: { variantId: variant.id, attributeValueId: value.id },
    });

    expect(reason(await del(`/attribute-values/${value.id}`))).toBe('VALUE_IN_USE');
    expect(reason(await del(`/attributes/${attr.id}`))).toBe('ATTRIBUTE_IN_USE');
  });

  it('needs the right permission for each area', async () => {
    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    expect((await post('/categories', { name: 'Nope' }, salesman)).status).toBe(403);
    expect((await post('/brands', { name: 'Nope' }, salesman)).status).toBe(403);
    // products.view (Salesman has it) may read the lists the product editor needs.
    expect((await request(ctx.app).get('/api/v1/admin/categories').set(salesman)).status).toBe(200);
  });
});
