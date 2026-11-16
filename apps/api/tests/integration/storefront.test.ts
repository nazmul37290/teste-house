import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestContext, freshIp } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());
const { prisma } = ctx.deps;

function u() {
  return `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
}
const get = (path: string, ip = freshIp()) =>
  request(ctx.app).get(`/api/v1${path}`).set('X-Forwarded-For', ip);

async function category(name: string, extra: { parentId?: string; isActive?: boolean } = {}) {
  return prisma.category.create({
    data: { name, slug: `${name.toLowerCase().replace(/\s+/g, '-')}-${u()}`, ...extra },
  });
}

type VariantSpec = {
  price: string;
  salePrice?: string;
  stock?: number;
  isActive?: boolean;
  unit?: 'G';
  unitValue?: string;
  threshold?: number;
};
async function product(
  categoryId: string,
  name: string,
  variants: VariantSpec[],
  extra: {
    status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED';
    deletedAt?: Date;
    brandId?: string;
    isFeatured?: boolean;
    soldCount?: number;
    shortDescription?: string;
  } = {},
) {
  return prisma.product.create({
    data: {
      name,
      slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${u()}`,
      categoryId,
      status: extra.status ?? 'ACTIVE',
      deletedAt: extra.deletedAt,
      brandId: extra.brandId,
      isFeatured: extra.isFeatured ?? false,
      soldCount: extra.soldCount ?? 0,
      shortDescription: extra.shortDescription,
      variants: {
        create: variants.map((v, i) => ({
          sku: `SF-${u()}-${i}`,
          name: v.unitValue ? `${v.unitValue} g` : `Option ${i}`,
          unit: v.unit,
          unitValue: v.unitValue,
          price: v.price,
          salePrice: v.salePrice,
          stockQty: v.stock ?? 10,
          lowStockThreshold: v.threshold ?? 5,
          isActive: v.isActive ?? true,
        })),
      },
    },
  });
}
const slugs = (res: request.Response) => (res.body.data as { slug: string }[]).map((p) => p.slug);

describe('visibility', () => {
  it('shows only ACTIVE, not deleted products with an active variant, everywhere', async () => {
    const cat = await category('Visibility');
    const visible = await product(cat.id, 'Visible honey', [{ price: '100' }]);
    const hidden = [
      await product(cat.id, 'Draft honey', [{ price: '100' }], { status: 'DRAFT' }),
      await product(cat.id, 'Archived honey', [{ price: '100' }], { status: 'ARCHIVED' }),
      await product(cat.id, 'Deleted honey', [{ price: '100' }], { deletedAt: new Date() }),
      await product(cat.id, 'No active variant honey', [{ price: '100', isActive: false }]),
    ];
    expect(slugs(await get(`/products?category=${cat.slug}`))).toEqual([visible.slug]);
    expect((await get(`/products/${visible.slug}`)).status).toBe(200);
    for (const p of hidden) expect((await get(`/products/${p.slug}`)).status).toBe(404);

    const sitemap = (await get('/sitemap-data')).body.data.products.map(
      (p: { slug: string }) => p.slug,
    );
    expect(sitemap).toContain(visible.slug);
    for (const p of hidden) expect(sitemap).not.toContain(p.slug);

    // "ACTIVE with no active variant" cannot be made through the admin (LAST_ACTIVE_VARIANT); remove
    // the fixture so later tests on this shared database (e.g. the CSV round trip) never see it.
    await prisma.product.update({ where: { id: hidden[3]!.id }, data: { deletedAt: new Date() } });
  });

  it('includes subcategories, but not hidden ones or anything below them', async () => {
    const root = await category('Root');
    const child = await category('Child', { parentId: root.id });
    const hiddenChild = await category('Hidden child', { parentId: root.id, isActive: false });
    const below = await category('Below hidden', { parentId: hiddenChild.id });
    const inChild = await product(child.id, 'In child', [{ price: '10' }]);
    await product(hiddenChild.id, 'In hidden', [{ price: '10' }]);
    await product(below.id, 'Below hidden product', [{ price: '10' }]);

    expect(slugs(await get(`/products?category=${root.slug}`))).toEqual([inChild.slug]);
    expect((await get(`/categories/${hiddenChild.slug}`)).status).toBe(404);
    expect((await get(`/products?category=${below.slug}`)).status).toBe(404);
    const tree = (await get('/categories')).body.data as { slug: string; productCount: number }[];
    expect(tree.find((c) => c.slug === root.slug)?.productCount).toBe(1);
    expect(tree.some((c) => c.slug === hiddenChild.slug)).toBe(false);
  });
});

describe('listing filters and sorting', () => {
  it('sorts and filters by the effective price (sale price when set)', async () => {
    const cat = await category('Prices');
    const onSale = await product(cat.id, 'On sale', [{ price: '300', salePrice: '100' }]);
    const plain = await product(cat.id, 'Plain', [{ price: '200' }]);
    const twoSizes = await product(cat.id, 'Two sizes', [{ price: '150' }, { price: '500' }]);

    expect(slugs(await get(`/products?category=${cat.slug}&sort=price_asc`))).toEqual([
      onSale.slug,
      twoSizes.slug,
      plain.slug,
    ]);
    expect(slugs(await get(`/products?category=${cat.slug}&sort=price_desc`))).toEqual([
      plain.slug,
      twoSizes.slug,
      onSale.slug,
    ]);
    expect(slugs(await get(`/products?category=${cat.slug}&minPrice=120&maxPrice=180`))).toEqual([
      twoSizes.slug,
    ]);

    const card = (await get(`/products?category=${cat.slug}&sort=price_asc`)).body.data[0];
    expect(card).toMatchObject({ price: '100.00', regularPrice: '300.00', inStock: true });
    expect(card).not.toHaveProperty('stockQty');
    const facets = (await get(`/products?category=${cat.slug}&minPrice=999`)).body.meta.facets;
    expect(facets.price).toEqual({ min: '100.00', max: '200.00' }); // facets ignore the price filter
  });

  it('filters by brand, stock and attribute, and pages', async () => {
    const cat = await category('Filters');
    const brand = await prisma.brand.create({
      data: { name: `Brand ${u()}`, slug: `brand-${u()}` },
    });
    const attrSlug = `flavor-${u()}`;
    const attr = await prisma.attribute.create({
      data: {
        name: `Flavor ${u()}`,
        slug: attrSlug,
        isFilterable: true,
        values: { create: [{ value: 'Chocolate', slug: 'chocolate' }] },
      },
      include: { values: true },
    });
    const branded = await product(cat.id, 'Branded', [{ price: '10' }], { brandId: brand.id });
    const soldOut = await product(cat.id, 'Sold out', [{ price: '10', stock: 0 }]);
    const choco = await product(cat.id, 'Choco', [{ price: '10' }]);
    const v = await prisma.productVariant.findFirstOrThrow({ where: { productId: choco.id } });
    await prisma.variantAttributeValue.create({
      data: { variantId: v.id, attributeValueId: attr.values[0]!.id },
    });

    expect(slugs(await get(`/products?category=${cat.slug}&brand=${brand.slug}`))).toEqual([
      branded.slug,
    ]);
    expect(slugs(await get(`/products?category=${cat.slug}&brand=no-such-brand`))).toEqual([]);
    expect(slugs(await get(`/products?category=${cat.slug}&inStock=true`))).not.toContain(
      soldOut.slug,
    );
    expect(slugs(await get(`/products?category=${cat.slug}&attr=${attrSlug}:chocolate`))).toEqual([
      choco.slug,
    ]);

    const facets = (await get(`/products?category=${cat.slug}`)).body.meta.facets;
    expect(facets.brands).toEqual([{ slug: brand.slug, name: brand.name, count: 1 }]);
    expect(facets.attributes[0]).toMatchObject({
      slug: attrSlug,
      values: [{ slug: 'chocolate', count: 1 }],
    });

    const page = await get(`/products?category=${cat.slug}&pageSize=2&page=2&sort=newest`);
    expect(page.body.meta).toMatchObject({ page: 2, pageSize: 2, total: 3 });
    expect(page.body.data).toHaveLength(1);
    expect((await get('/products?pageSize=500')).status).toBe(400);
  });
});

describe('search', () => {
  it('finds by words, prefix and small typos, and suggests names', async () => {
    const cat = await category('Search');
    const word = `zorbalicious${u().slice(-4)}`;
    const p = await product(cat.id, `Organic ${word} Honey`, [{ price: '10' }], {
      shortDescription: 'From the hills',
    });
    expect(slugs(await get(`/products?q=${word}`))).toContain(p.slug);
    expect(slugs(await get(`/products?q=${word.slice(0, 6)}&category=${cat.slug}`))).toContain(
      p.slug,
    );
    expect(slugs(await get(`/products?q=hills&category=${cat.slug}`))).toContain(p.slug); // short description
    expect(slugs(await get(`/products?q=%25&category=${cat.slug}`))).toEqual([]); // "%" is a character, not a wildcard

    const suggest = await get(`/search/suggest?q=${word}`);
    expect(suggest.body.data.map((s: { slug: string }) => s.slug)).toContain(p.slug);
    expect(suggest.headers['cache-control']).toContain('max-age=60');
  });

  it('rate limits suggestions per IP', async () => {
    const ip = freshIp();
    for (let i = 0; i < 60; i++)
      expect((await get('/search/suggest?q=honey', ip)).status).toBe(200);
    const blocked = await get('/search/suggest?q=honey', ip);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('product detail', () => {
  it('returns variants with effective price, price per unit and stock flags only, breadcrumbs and related products', async () => {
    const root = await category('Detail root');
    const leaf = await category('Detail leaf', { parentId: root.id });
    const p = await product(leaf.id, 'Detail honey', [
      { price: '650', salePrice: '599', unit: 'G', unitValue: '500', stock: 3, threshold: 5 },
      { price: '1200', unit: 'G', unitValue: '1000', stock: 0 },
      { price: '1', isActive: false },
    ]);
    const related = await product(leaf.id, 'Related honey', [{ price: '10' }]);
    const d = (await get(`/products/${p.slug}`)).body.data;

    expect(d.breadcrumbs.map((b: { slug: string }) => b.slug)).toEqual([root.slug, leaf.slug]);
    expect(d.variants).toHaveLength(2); // the inactive variant is not shown
    expect(d.variants[0]).toMatchObject({
      price: '599.00',
      regularPrice: '650.00',
      pricePerUnit: { price: '119.80', per: '100 g' },
      inStock: true,
      lowStock: true,
    });
    expect(d.variants[1]).toMatchObject({
      price: '1200.00',
      regularPrice: null,
      inStock: false,
      lowStock: false,
    });
    expect(d.variants[0]).not.toHaveProperty('stockQty');
    expect(d.related.map((r: { slug: string }) => r.slug)).toEqual([related.slug]);
  });
});

describe('homepage, redirects', () => {
  beforeAll(async () => {
    await prisma.homepageSection.deleteMany(); // test database only: start from "no sections configured"
  });

  it('uses default sections when none are configured, and configured ones otherwise', async () => {
    const cat = await category('Home');
    const featured = await product(cat.id, 'Featured honey', [{ price: '10' }], {
      isFeatured: true,
    });
    const home = (await get('/homepage')).body.data;
    const featuredSection = home.sections.find((s: { title: string }) => s.title === 'Featured');
    expect(featuredSection.products.map((p: { slug: string }) => p.slug)).toContain(featured.slug);

    await prisma.homepageSection.createMany({
      data: [
        {
          type: 'CUSTOM_HTML',
          title: 'About us',
          config: { text: '<script>alert(1)</script> Family shop since 1990' },
          sortOrder: 1,
        },
        { type: 'PRODUCT_LIST', title: 'Broken', config: { source: 'nope' }, sortOrder: 2 },
        {
          type: 'PRODUCT_LIST',
          title: 'Picked',
          config: { source: 'manual', productIds: [featured.id] },
          sortOrder: 3,
        },
      ],
    });
    const configured = (await get('/homepage')).body.data.sections;
    expect(configured.map((s: { title: string }) => s.title)).toEqual(['About us', 'Picked']); // broken config is skipped
    expect(configured[0]).toEqual({
      type: 'TEXT',
      title: 'About us',
      text: '<script>alert(1)</script> Family shop since 1990',
    });
    await prisma.homepageSection.deleteMany();
  });

  it('resolves redirects for old slugs', async () => {
    const from = `/product/old-${u()}`;
    await prisma.redirect.create({ data: { fromPath: from, toPath: '/product/new-name' } });
    expect((await get(`/redirects/resolve?path=${from}`)).body.data).toEqual({
      toPath: '/product/new-name',
      statusCode: 301,
    });
    expect((await get('/redirects/resolve?path=/product/nothing-here')).status).toBe(404);
    expect((await get('/redirects/resolve?path=https://evil.example')).status).toBe(400);
  });
});
