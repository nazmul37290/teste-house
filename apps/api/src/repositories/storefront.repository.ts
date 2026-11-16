import { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

/**
 * Public catalog queries. "Visible" product = ACTIVE, not deleted, with at least one active variant.
 * Price = the product's cheapest effective price (sale price if set) over its active variants.
 * All values are bound parameters (Prisma.sql); nothing is concatenated into SQL.
 */

export type ListFilter = {
  q?: string;
  categoryIds?: string[];
  brandIds?: string[];
  /** Groups of attribute value ids: OR inside a group (same attribute), AND across groups. */
  attributeGroups?: string[][];
  minPrice?: string;
  maxPrice?: string;
  inStock?: boolean;
  rating?: number;
};
export type ListSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'popular';

/** Same expression as idx_products_fts (migration 20261116000000), so the index is used. */
const FTS = Prisma.sql`to_tsvector('simple', p.name || ' ' || coalesce(p."shortDescription", ''))`;

/** Escapes LIKE wildcards so a search for "50%" means the characters, not a pattern. */
const likeEscape = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

function whereClause(f: ListFilter): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`p.status = 'ACTIVE' AND p."deletedAt" IS NULL`];
  if (f.q) {
    const like = `%${likeEscape(f.q)}%`;
    parts.push(
      Prisma.sql`(${FTS} @@ plainto_tsquery('simple', ${f.q}) OR p.name ILIKE ${like} OR similarity(p.name, ${f.q}) > 0.25)`,
    );
  }
  if (f.categoryIds?.length) parts.push(Prisma.sql`p."categoryId" = ANY(${f.categoryIds}::uuid[])`);
  if (f.brandIds?.length) parts.push(Prisma.sql`p."brandId" = ANY(${f.brandIds}::uuid[])`);
  if (f.minPrice) parts.push(Prisma.sql`e.min_price >= ${f.minPrice}::numeric`);
  if (f.maxPrice) parts.push(Prisma.sql`e.min_price <= ${f.maxPrice}::numeric`);
  if (f.inStock) parts.push(Prisma.sql`e.in_stock`);
  if (f.rating) parts.push(Prisma.sql`p."ratingAvg" >= ${f.rating}`);
  for (const group of f.attributeGroups ?? []) {
    parts.push(Prisma.sql`EXISTS (
      SELECT 1 FROM product_variants v2
      JOIN variant_attribute_values vav ON vav."variantId" = v2.id
      WHERE v2."productId" = p.id AND v2."isActive" AND vav."attributeValueId" = ANY(${group}::uuid[]))`);
  }
  return Prisma.join(parts, ' AND ');
}

const EFFECTIVE = Prisma.sql`
  SELECT v."productId", MIN(COALESCE(v."salePrice", v.price)) AS min_price, BOOL_OR(v."stockQty" > 0) AS in_stock
  FROM product_variants v WHERE v."isActive" GROUP BY v."productId"`;

function orderBy(sort: ListSort, q?: string): Prisma.Sql {
  switch (sort) {
    case 'price_asc':
      return Prisma.sql`e.min_price ASC, p.id`;
    case 'price_desc':
      return Prisma.sql`e.min_price DESC, p.id`;
    case 'popular':
      return Prisma.sql`p."soldCount" DESC, p."createdAt" DESC, p.id`;
    case 'relevance':
      if (q) {
        return Prisma.sql`ts_rank(${FTS}, plainto_tsquery('simple', ${q})) + similarity(p.name, ${q}) DESC, p."soldCount" DESC, p.id`;
      }
      return Prisma.sql`p."createdAt" DESC, p.id`;
    case 'newest':
    default:
      return Prisma.sql`p."createdAt" DESC, p.id`;
  }
}

/** One page of matching product ids in order, plus the total. */
export async function listProductIds(
  prisma: Db,
  f: ListFilter,
  sort: ListSort,
  page: number,
  pageSize: number,
) {
  const rows = await prisma.$queryRaw<{ id: string; total: bigint }[]>`
    WITH e AS (${EFFECTIVE})
    SELECT p.id, count(*) OVER () AS total
    FROM products p JOIN e ON e."productId" = p.id
    WHERE ${whereClause(f)}
    ORDER BY ${orderBy(sort, f.q)}
    LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`;
  return { ids: rows.map((r) => r.id), total: rows.length ? Number(rows[0]!.total) : 0 };
}

/**
 * Filter options for a listing: brands, price range and filterable attribute values, counted over
 * the base set (category and search only), so choosing a filter never hides the other options.
 */
export async function listFacets(prisma: Db, base: Pick<ListFilter, 'q' | 'categoryIds'>) {
  const where = whereClause(base);
  const [brands, price, attributes] = await Promise.all([
    prisma.$queryRaw<{ slug: string; name: string; count: bigint }[]>`
      WITH e AS (${EFFECTIVE})
      SELECT b.slug, b.name, count(*) AS count
      FROM products p JOIN e ON e."productId" = p.id JOIN brands b ON b.id = p."brandId"
      WHERE ${where} AND b."isActive"
      GROUP BY b.slug, b.name ORDER BY b.name`,
    prisma.$queryRaw<{ min: string | null; max: string | null }[]>`
      WITH e AS (${EFFECTIVE})
      SELECT MIN(e.min_price)::text AS min, MAX(e.min_price)::text AS max
      FROM products p JOIN e ON e."productId" = p.id
      WHERE ${where}`,
    prisma.$queryRaw<
      {
        attribute: string;
        attributeSlug: string;
        value: string;
        valueSlug: string;
        count: bigint;
      }[]
    >`
      WITH e AS (${EFFECTIVE})
      SELECT a.name AS attribute, a.slug AS "attributeSlug", av.value, av.slug AS "valueSlug", count(DISTINCT p.id) AS count
      FROM products p JOIN e ON e."productId" = p.id
      JOIN product_variants v ON v."productId" = p.id AND v."isActive"
      JOIN variant_attribute_values vav ON vav."variantId" = v.id
      JOIN attribute_values av ON av.id = vav."attributeValueId"
      JOIN attributes a ON a.id = av."attributeId" AND a."isFilterable"
      WHERE ${where}
      GROUP BY a.name, a.slug, a."sortOrder", av.value, av.slug, av."sortOrder"
      ORDER BY a."sortOrder", a.name, av."sortOrder", av.value`,
  ]);
  return { brands, price: price[0] ?? { min: null, max: null }, attributes };
}

/** Product names for the search box: prefix and fuzzy matches, best first. */
export function suggestProducts(prisma: Db, q: string, limit = 8) {
  const like = `%${likeEscape(q)}%`;
  return prisma.$queryRaw<{ slug: string; name: string }[]>`
    SELECT p.slug, p.name
    FROM products p
    WHERE p.status = 'ACTIVE' AND p."deletedAt" IS NULL
      AND EXISTS (SELECT 1 FROM product_variants v WHERE v."productId" = p.id AND v."isActive")
      AND (p.name ILIKE ${like} OR similarity(p.name, ${q}) > 0.25)
    ORDER BY (p.name ILIKE ${`${likeEscape(q)}%`}) DESC, similarity(p.name, ${q}) DESC, p."soldCount" DESC
    LIMIT ${limit}`;
}

/** Card data for a set of product ids (order is restored by the caller). */
export function productCards(prisma: Db, ids: string[]) {
  return prisma.product.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      slug: true,
      name: true,
      isFeatured: true,
      isNewArrival: true,
      isBestSeller: true,
      ratingAvg: true,
      ratingCount: true,
      brand: { select: { name: true, slug: true } },
      images: {
        orderBy: { sortOrder: 'asc' },
        take: 1,
        select: { media: { select: { path: true, altText: true, width: true, height: true } } },
      },
      variants: {
        where: { isActive: true },
        select: {
          price: true,
          salePrice: true,
          stockQty: true,
          unit: true,
          unitValue: true,
          name: true,
        },
      },
    },
  });
}

/** Ids of visible products, newest first, for a simple Prisma filter (homepage lists, related). */
export async function visibleProductIds(
  prisma: Db,
  where: Prisma.ProductWhereInput,
  orderBy: Prisma.ProductOrderByWithRelationInput,
  take: number,
) {
  const rows = await prisma.product.findMany({
    where: { ...where, status: 'ACTIVE', deletedAt: null, variants: { some: { isActive: true } } },
    select: { id: true },
    orderBy: [orderBy, { id: 'asc' }],
    take,
  });
  return rows.map((r) => r.id);
}
