import {
  formatPaisa,
  MEDIA_WIDTHS,
  mediaUrl,
  parsePaisa,
  pricePerUnit,
  sectionConfigSchemas,
  type HomepageSectionType,
  type MeasureUnit,
  type PublicProductQuery,
} from '@shop/shared';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/storefront.repository';

/**
 * Public catalog (no auth). Only visible data leaves here: ACTIVE, not deleted, active variants,
 * active categories and brands. Exact stock never leaves the API, only in/low/out of stock.
 */
export type StorefrontDeps = { prisma: Db; publicMediaUrl: string };
type Decimalish = { toFixed(n: number): string };

const paisa = (d: Decimalish) => parsePaisa(d.toFixed(2));
const amount = (d: Decimalish | null) => (d === null ? null : String(Number(d.toFixed(3))));

function imageOf(
  base: string,
  media: { path: string; altText: string; width: number | null; height: number | null },
) {
  return {
    altText: media.altText,
    width: media.width,
    height: media.height,
    urls: Object.fromEntries(MEDIA_WIDTHS.map((w) => [w, mediaUrl(base, media.path, w)])) as Record<
      string,
      string
    >,
  };
}

// Cards ------------------------------------------------------------------------------------------

type CardRow = Awaited<ReturnType<typeof repo.productCards>>[number];

/** "From" price = cheapest effective price; regularPrice set when that variant is on sale. */
function toCard(p: CardRow, base: string) {
  const offers = p.variants.map((v) => ({
    effective: paisa(v.salePrice ?? v.price),
    regular: paisa(v.price),
    onSale: v.salePrice !== null,
  }));
  const cheapest = offers.reduce((a, b) => (b.effective < a.effective ? b : a), offers[0]!);
  return {
    slug: p.slug,
    name: p.name,
    brand: p.brand,
    image: p.images[0] ? imageOf(base, p.images[0].media) : null,
    price: formatPaisa(cheapest.effective),
    regularPrice: cheapest.onSale ? formatPaisa(cheapest.regular) : null,
    hasMultiplePrices: new Set(offers.map((o) => o.effective)).size > 1,
    variantCount: p.variants.length,
    /** Label of the only variant (e.g. "500 g"), shown on the card when there is just one. */
    variantName: p.variants.length === 1 ? p.variants[0]!.name : null,
    inStock: p.variants.some((v) => v.stockQty > 0),
    ratingAvg: Number(p.ratingAvg.toFixed(2)),
    ratingCount: p.ratingCount,
    badges: { featured: p.isFeatured, newArrival: p.isNewArrival, bestSeller: p.isBestSeller },
  };
}
export type ProductCard = ReturnType<typeof toCard>;

async function cards(deps: StorefrontDeps, ids: string[]): Promise<ProductCard[]> {
  if (!ids.length) return [];
  const rows = await repo.productCards(deps.prisma, ids);
  const byId = new Map(rows.filter((r) => r.variants.length).map((r) => [r.id, r]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row ? [toCard(row, deps.publicMediaUrl)] : [];
  });
}

// Categories -------------------------------------------------------------------------------------

type CategoryRow = {
  id: string;
  parentId: string | null;
  name: string;
  slug: string;
  isActive: boolean;
};

/** Active categories whose ancestors are all active, depth-first. */
async function visibleCategories(prisma: Db) {
  const all = await prisma.category.findMany({
    select: {
      id: true,
      parentId: true,
      name: true,
      slug: true,
      isActive: true,
      description: true,
      sortOrder: true,
      seoTitle: true,
      seoDescription: true,
      updatedAt: true,
      image: { select: { path: true, altText: true, width: true, height: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
  const out: ((typeof all)[number] & { depth: number })[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const c of all.filter((x) => x.parentId === parentId && x.isActive)) {
      out.push({ ...c, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

function subtreeIds(categories: CategoryRow[], rootId: string): string[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++)
    for (const c of categories) if (c.parentId === ids[i]) ids.push(c.id);
  return ids;
}

function breadcrumbs(categories: CategoryRow[], id: string) {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const trail: { name: string; slug: string }[] = [];
  for (let cur = byId.get(id); cur; cur = cur.parentId ? byId.get(cur.parentId) : undefined)
    trail.unshift({ name: cur.name, slug: cur.slug });
  return trail;
}

export async function listCategories(deps: StorefrontDeps) {
  const categories = await visibleCategories(deps.prisma);
  const counts = await deps.prisma.product.groupBy({
    by: ['categoryId'],
    where: { status: 'ACTIVE', deletedAt: null, variants: { some: { isActive: true } } },
    _count: { _all: true },
  });
  const direct = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({
    name: c.name,
    slug: c.slug,
    parentSlug: categories.find((p) => p.id === c.parentId)?.slug ?? null,
    depth: c.depth,
    image: c.image ? imageOf(deps.publicMediaUrl, c.image) : null,
    /** Visible products in this category and all its subcategories. */
    productCount: subtreeIds(categories, c.id).reduce((n, id) => n + (direct.get(id) ?? 0), 0),
  }));
}

export async function getCategory(deps: StorefrontDeps, slug: string) {
  const categories = await visibleCategories(deps.prisma);
  const c = categories.find((x) => x.slug === slug);
  if (!c) throw new AppError('NOT_FOUND', 'Category not found');
  const all = await listCategories(deps);
  return {
    name: c.name,
    slug: c.slug,
    description: c.description,
    seoTitle: c.seoTitle,
    seoDescription: c.seoDescription,
    image: c.image ? imageOf(deps.publicMediaUrl, c.image) : null,
    breadcrumbs: breadcrumbs(categories, c.id),
    children: all.filter((x) => x.parentSlug === c.slug),
  };
}

export async function listBrands(deps: StorefrontDeps) {
  const brands = await deps.prisma.brand.findMany({
    where: { isActive: true },
    select: {
      name: true,
      slug: true,
      logo: { select: { path: true, altText: true, width: true, height: true } },
      _count: {
        select: {
          products: {
            where: { status: 'ACTIVE', deletedAt: null, variants: { some: { isActive: true } } },
          },
        },
      },
    },
    orderBy: { name: 'asc' },
  });
  return brands
    .filter((b) => b._count.products > 0)
    .map((b) => ({
      name: b.name,
      slug: b.slug,
      logo: b.logo ? imageOf(deps.publicMediaUrl, b.logo) : null,
      productCount: b._count.products,
    }));
}

// Listing ----------------------------------------------------------------------------------------

/** Resolves slugs to ids. Unknown slugs match nothing (never "no filter"). */
const NONE = ['00000000-0000-0000-0000-000000000000'];

export async function listProducts(deps: StorefrontDeps, q: PublicProductQuery) {
  const { prisma } = deps;
  let categoryIds: string[] | undefined;
  if (q.category) {
    const categories = await visibleCategories(prisma);
    const root = categories.find((c) => c.slug === q.category);
    if (!root) throw new AppError('NOT_FOUND', 'Category not found');
    categoryIds = subtreeIds(categories, root.id);
  }
  let brandIds: string[] | undefined;
  if (q.brand?.length) {
    const found = await prisma.brand.findMany({
      where: { slug: { in: q.brand }, isActive: true },
      select: { id: true },
    });
    brandIds = found.length ? found.map((b) => b.id) : NONE;
  }
  let attributeGroups: string[][] | undefined;
  if (q.attr?.length) {
    const pairs = q.attr.map((a) => a.split(':') as [string, string]);
    const values = await prisma.attributeValue.findMany({
      where: {
        OR: pairs.map(([attr, value]) => ({
          slug: value,
          attribute: { slug: attr, isFilterable: true },
        })),
      },
      select: { id: true, attributeId: true },
    });
    const groups = new Map<string, string[]>();
    for (const v of values) groups.set(v.attributeId, [...(groups.get(v.attributeId) ?? []), v.id]);
    attributeGroups = groups.size ? [...groups.values()] : [NONE];
  }

  const filter: repo.ListFilter = {
    q: q.q,
    categoryIds,
    brandIds,
    attributeGroups,
    minPrice: q.minPrice,
    maxPrice: q.maxPrice,
    inStock: q.inStock,
    rating: q.rating,
  };
  const sort = q.sort ?? (q.q ? 'relevance' : 'newest');
  const [{ ids, total }, facets] = await Promise.all([
    repo.listProductIds(prisma, filter, sort, q.page, q.pageSize),
    repo.listFacets(prisma, { q: q.q, categoryIds }),
  ]);
  return {
    items: await cards(deps, ids),
    total,
    facets: {
      brands: facets.brands.map((b) => ({ slug: b.slug, name: b.name, count: Number(b.count) })),
      price: {
        // numeric(12,2) as text ("190.00"): exact, no float on the way.
        min: facets.price.min === null ? null : formatPaisa(parsePaisa(facets.price.min)),
        max: facets.price.max === null ? null : formatPaisa(parsePaisa(facets.price.max)),
      },
      attributes: groupAttributeFacets(facets.attributes),
    },
  };
}

function groupAttributeFacets(
  rows: {
    attribute: string;
    attributeSlug: string;
    value: string;
    valueSlug: string;
    count: bigint;
  }[],
) {
  const out: {
    name: string;
    slug: string;
    values: { value: string; slug: string; count: number }[];
  }[] = [];
  for (const r of rows) {
    let group = out.find((g) => g.slug === r.attributeSlug);
    if (!group) out.push((group = { name: r.attribute, slug: r.attributeSlug, values: [] }));
    group.values.push({ value: r.value, slug: r.valueSlug, count: Number(r.count) });
  }
  return out;
}

export async function suggest(deps: StorefrontDeps, q: string) {
  return repo.suggestProducts(deps.prisma, q);
}

// Product detail ---------------------------------------------------------------------------------

export async function getProduct(deps: StorefrontDeps, slug: string) {
  const { prisma, publicMediaUrl: base } = deps;
  const p = await prisma.product.findFirst({
    where: { slug, status: 'ACTIVE', deletedAt: null, variants: { some: { isActive: true } } },
    select: {
      id: true,
      slug: true,
      name: true,
      shortDescription: true,
      description: true,
      categoryId: true,
      ingredients: true,
      nutritionFacts: true,
      shelfLife: true,
      origin: true,
      seoTitle: true,
      seoDescription: true,
      canonicalUrl: true,
      ratingAvg: true,
      ratingCount: true,
      updatedAt: true,
      isFeatured: true,
      isNewArrival: true,
      isBestSeller: true,
      brand: { select: { name: true, slug: true, isActive: true } },
      ogImage: { select: { path: true, altText: true, width: true, height: true } },
      tags: { select: { tag: { select: { name: true, slug: true } } } },
      images: {
        orderBy: { sortOrder: 'asc' },
        select: { media: { select: { path: true, altText: true, width: true, height: true } } },
      },
      variants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          sku: true,
          name: true,
          unit: true,
          unitValue: true,
          price: true,
          salePrice: true,
          stockQty: true,
          lowStockThreshold: true,
          attributeValues: {
            select: {
              attributeValue: { select: { value: true, attribute: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });
  if (!p) throw new AppError('NOT_FOUND', 'Product not found');

  const categories = await visibleCategories(prisma);
  const relatedIds = (
    await repo.visibleProductIds(
      prisma,
      { categoryId: p.categoryId, id: { not: p.id } },
      { soldCount: 'desc' },
      8,
    )
  ).slice(0, 8);

  return {
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription,
    description: p.description,
    ingredients: p.ingredients,
    nutritionFacts: Array.isArray(p.nutritionFacts)
      ? (p.nutritionFacts as { name: string; amount: string }[])
      : null,
    shelfLife: p.shelfLife,
    origin: p.origin,
    seoTitle: p.seoTitle,
    seoDescription: p.seoDescription,
    canonicalUrl: p.canonicalUrl,
    ratingAvg: Number(p.ratingAvg.toFixed(2)),
    ratingCount: p.ratingCount,
    updatedAt: p.updatedAt,
    badges: { featured: p.isFeatured, newArrival: p.isNewArrival, bestSeller: p.isBestSeller },
    brand: p.brand?.isActive ? { name: p.brand.name, slug: p.brand.slug } : null,
    tags: p.tags.map((t) => t.tag),
    breadcrumbs: breadcrumbs(categories, p.categoryId),
    ogImage: p.ogImage ? imageOf(base, p.ogImage) : null,
    images: p.images.map((i) => imageOf(base, i.media)),
    variants: p.variants.map((v) => {
      const effective = paisa(v.salePrice ?? v.price);
      const perUnit = pricePerUnit(effective, v.unit as MeasureUnit | null, amount(v.unitValue));
      return {
        id: v.id,
        sku: v.sku,
        name: v.name,
        unit: v.unit,
        unitValue: amount(v.unitValue),
        price: formatPaisa(effective),
        regularPrice: v.salePrice ? v.price.toFixed(2) : null,
        pricePerUnit: perUnit ? { price: formatPaisa(perUnit.paisa), per: perUnit.per } : null,
        inStock: v.stockQty > 0,
        lowStock: v.stockQty > 0 && v.stockQty <= v.lowStockThreshold,
        attributes: v.attributeValues.map((a) => ({
          name: a.attributeValue.attribute.name,
          value: a.attributeValue.value,
        })),
      };
    }),
    related: await cards(deps, relatedIds),
  };
}

// Homepage ---------------------------------------------------------------------------------------

async function bannersAt(deps: StorefrontDeps, position: string) {
  const now = new Date();
  const rows = await deps.prisma.banner.findMany({
    where: {
      position,
      isActive: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      title: true,
      linkUrl: true,
      image: { select: { path: true, altText: true, width: true, height: true } },
      mobileImage: { select: { path: true, altText: true, width: true, height: true } },
    },
  });
  return rows.map((b) => ({
    id: b.id,
    title: b.title,
    linkUrl: b.linkUrl,
    image: imageOf(deps.publicMediaUrl, b.image),
    mobileImage: b.mobileImage ? imageOf(deps.publicMediaUrl, b.mobileImage) : null,
  }));
}

const PRODUCT_LIST_ORDER: Record<
  string,
  { where: Prisma.ProductWhereInput; orderBy: Prisma.ProductOrderByWithRelationInput }
> = {
  featured: { where: { isFeatured: true }, orderBy: { updatedAt: 'desc' } },
  new: { where: { isNewArrival: true }, orderBy: { createdAt: 'desc' } },
  bestsellers: { where: { isBestSeller: true }, orderBy: { soldCount: 'desc' } },
};

type ResolvedSection =
  | {
      type: 'CATEGORY_GRID';
      title: string | null;
      categories: Awaited<ReturnType<typeof listCategories>>;
    }
  | { type: 'PRODUCT_LIST'; title: string | null; products: ProductCard[]; link: string | null }
  | { type: 'BANNER_STRIP'; title: string | null; banners: Awaited<ReturnType<typeof bannersAt>> }
  | { type: 'TEXT'; title: string | null; text: string };

async function resolveSection(
  deps: StorefrontDeps,
  type: HomepageSectionType,
  title: string | null,
  rawConfig: unknown,
): Promise<ResolvedSection | null> {
  const parsed = sectionConfigSchemas[type].safeParse(rawConfig ?? {});
  if (!parsed.success) return null; // a broken config hides the section rather than breaking the page
  switch (type) {
    case 'CATEGORY_GRID': {
      const config = parsed.data as { categoryIds?: string[] };
      const all = await listCategories(deps);
      const ids = config.categoryIds?.length ? config.categoryIds : null;
      const byId = new Map(
        (await deps.prisma.category.findMany({ select: { id: true, slug: true } })).map((c) => [
          c.id,
          c.slug,
        ]),
      );
      const categories = ids
        ? ids.flatMap((id) => all.filter((c) => c.slug === byId.get(id)))
        : all.filter((c) => c.depth === 1);
      return categories.length ? { type, title, categories } : null;
    }
    case 'PRODUCT_LIST': {
      const config = parsed.data as {
        source: string;
        categoryId?: string;
        productIds?: string[];
        limit?: number;
      };
      const limit = config.limit ?? 8;
      let ids: string[];
      let link: string | null = null;
      if (config.source === 'manual') {
        const visible = new Set(
          await repo.visibleProductIds(
            deps.prisma,
            { id: { in: config.productIds } },
            { createdAt: 'desc' },
            24,
          ),
        );
        ids = (config.productIds ?? []).filter((id) => visible.has(id)).slice(0, limit);
      } else if (config.source === 'category') {
        const categories = await visibleCategories(deps.prisma);
        const root = categories.find((c) => c.id === config.categoryId);
        if (!root) return null;
        ids = await repo.visibleProductIds(
          deps.prisma,
          { categoryId: { in: subtreeIds(categories, root.id) } },
          { soldCount: 'desc' },
          limit,
        );
        link = `/category/${root.slug}`;
      } else {
        const rule = PRODUCT_LIST_ORDER[config.source]!;
        ids = await repo.visibleProductIds(deps.prisma, rule.where, rule.orderBy, limit);
      }
      const products = await cards(deps, ids);
      return products.length ? { type, title, products, link } : null;
    }
    case 'BANNER_STRIP': {
      const banners = await bannersAt(deps, (parsed.data as { position: string }).position);
      return banners.length ? { type, title, banners } : null;
    }
    case 'CUSTOM_HTML':
      // Shown as plain text, never as HTML (Phase 5 decision).
      return { type: 'TEXT', title, text: (parsed.data as { text: string }).text };
  }
}

/** Used when the admin has not configured any sections yet. */
const DEFAULT_SECTIONS: { type: HomepageSectionType; title: string; config: unknown }[] = [
  { type: 'PRODUCT_LIST', title: 'Featured', config: { source: 'featured' } },
  { type: 'CATEGORY_GRID', title: 'Shop by category', config: {} },
  { type: 'PRODUCT_LIST', title: 'New arrivals', config: { source: 'new' } },
  { type: 'PRODUCT_LIST', title: 'Best sellers', config: { source: 'bestsellers' } },
];

export async function getHomepage(deps: StorefrontDeps) {
  const configured = await deps.prisma.homepageSection.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    select: { type: true, title: true, config: true },
  });
  const specs = configured.length ? configured : DEFAULT_SECTIONS;
  const sections = await Promise.all(
    specs.map((s) => resolveSection(deps, s.type, s.title, s.config)),
  );
  return {
    hero: await bannersAt(deps, 'home_hero'),
    sections: sections.filter((s): s is ResolvedSection => s !== null),
  };
}

// Redirects and sitemap --------------------------------------------------------------------------

export async function resolveRedirect(prisma: Db, path: string) {
  const r = await prisma.redirect.findUnique({
    where: { fromPath: path },
    select: { toPath: true, statusCode: true },
  });
  if (!r) throw new AppError('NOT_FOUND', 'No redirect');
  return r;
}

export async function sitemapData(deps: StorefrontDeps) {
  const [products, categories] = await Promise.all([
    deps.prisma.product.findMany({
      where: { status: 'ACTIVE', deletedAt: null, variants: { some: { isActive: true } } },
      select: { slug: true, updatedAt: true },
      orderBy: { slug: 'asc' },
    }),
    visibleCategories(deps.prisma),
  ]);
  return {
    products: products.map((p) => ({ slug: p.slug, updatedAt: p.updatedAt })),
    categories: categories.map((c) => ({ slug: c.slug, updatedAt: c.updatedAt })),
  };
}
