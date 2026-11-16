import request from 'supertest';
import { expect } from 'vitest';
import { cookiesFrom, ourRouteHeaders, uniquePhone, type createTestContext } from './helpers';

/** Shared fixtures for the shop tests (cart, checkout, orders, account). */

type Ctx = ReturnType<typeof createTestContext>;

export const uid = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;

export async function makeCategory(ctx: Ctx, name = 'Fixture') {
  return ctx.deps.prisma.category.create({
    data: { name, slug: `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${uid()}` },
  });
}

export type VariantSpec = { price: string; salePrice?: string; stock?: number; isActive?: boolean };

/** An ACTIVE product with the given variants (stock 10 unless set). Returns product and variant ids. */
export async function makeProduct(
  ctx: Ctx,
  variants: VariantSpec[],
  opts: { name?: string; categoryId?: string; status?: 'ACTIVE' | 'DRAFT' | 'ARCHIVED' } = {},
) {
  const categoryId = opts.categoryId ?? (await makeCategory(ctx)).id;
  const name = opts.name ?? `Fixture product ${uid()}`;
  const base = uid();
  const product = await ctx.deps.prisma.product.create({
    data: {
      name,
      slug: `fixture-${uid()}`,
      categoryId,
      status: opts.status ?? 'ACTIVE',
      variants: {
        create: variants.map((v, i) => ({
          sku: `FX-${base}-${i}`,
          name: `Option ${i}`,
          price: v.price,
          salePrice: v.salePrice,
          stockQty: v.stock ?? 10,
          isActive: v.isActive ?? true,
        })),
      },
    },
    select: { id: true, slug: true, variants: { select: { id: true }, orderBy: { sku: 'asc' } } },
  });
  return { id: product.id, slug: product.slug, variantIds: product.variants.map((v) => v.id) };
}

export const CUSTOMER_PASSWORD = 'Customer-Pass-2026';

/** Registers a customer through the real endpoint and returns the session cookie. */
export async function registerCustomer(ctx: Ctx, body: { email?: string; phone?: string } = {}) {
  const phone = body.phone ?? uniquePhone();
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .set(ourRouteHeaders())
    .send({ name: 'Shop Tester', password: CUSTOMER_PASSWORD, phone, ...body });
  expect(res.status).toBe(201);
  return { id: res.body.data.customer.id as string, phone, cookie: cookiesFrom(res) };
}

/** Merges Set-Cookie values from a response into a cookie header (later values win). */
export function mergeCookies(header: string, res: request.Response): string {
  const jar = new Map(
    header
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((c) => [c.slice(0, c.indexOf('=')), c] as const),
  );
  const raw = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  for (const c of raw) {
    const pair = c.split(';')[0]!;
    const name = pair.slice(0, pair.indexOf('='));
    // An expired cookie (cleared) is removed from the jar.
    if (/expires=Thu, 01 Jan 1970/i.test(c) || pair.endsWith('=')) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
}
