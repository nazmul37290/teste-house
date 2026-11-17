import 'server-only';
import { cache } from 'react';
import { ApiError, parseEnvelope, parseFullEnvelope } from './api-types';
import type {
  CategoryDetail,
  CategoryNode,
  Facets,
  Homepage,
  ProductDetail,
  ProductPage,
  ProductCard,
  ReviewPage,
} from './storefront-types';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * Public catalog reads for the storefront. Cached by Next with tags; the API asks the web app to
 * revalidate a tag after admin changes (POST /api/revalidate), and `revalidate` is the safety net.
 * Tags: catalog (everything), product:<slug>, category:<slug>, homepage.
 */
async function shopFetch<T>(path: string, tags: string[], revalidate = 300): Promise<T> {
  const res = await fetch(`${API}/api/v1${path}`, {
    next: { tags: ['catalog', ...tags], revalidate },
  });
  return parseEnvelope<T>(res);
}

/** null for 404, so pages can try a redirect and then show "not found". */
async function orNull<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export const getHomepage = cache(() => shopFetch<Homepage>('/homepage', ['homepage']));
export const getCategories = cache(() => shopFetch<CategoryNode[]>('/categories', []));
export const getCategory = cache((slug: string) =>
  orNull(shopFetch<CategoryDetail>(`/categories/${slug}`, [`category:${slug}`])),
);
export const getProduct = cache((slug: string) =>
  orNull(shopFetch<ProductDetail>(`/products/${slug}`, [`product:${slug}`])),
);

/** First page of approved reviews, cached with the product (refreshed when a review changes). */
export const getReviews = cache((slug: string) =>
  orNull(shopFetch<ReviewPage>(`/products/${slug}/reviews`, [`product:${slug}`])),
);

export type ListParams = Record<string, string | string[] | undefined>;

/** The query parameters the product list understands (anything else in the URL is ignored). */
const LIST_KEYS = [
  'q',
  'category',
  'brand',
  'attr',
  'minPrice',
  'maxPrice',
  'inStock',
  'rating',
  'sort',
  'page',
  'pageSize',
];

export function toListQuery(params: ListParams): URLSearchParams {
  const qs = new URLSearchParams();
  for (const key of LIST_KEYS) {
    const v = params[key];
    for (const item of Array.isArray(v) ? v : v ? [v] : [])
      if (item.trim()) qs.append(key, item.trim());
  }
  return qs;
}

export async function listProducts(
  params: ListParams,
  tags: string[] = [],
): Promise<ProductPage | null> {
  try {
    const res = await fetch(`${API}/api/v1/products?${toListQuery(params)}`, {
      next: { tags: ['catalog', ...tags], revalidate: 300 },
    });
    const { data, meta } = await parseFullEnvelope<ProductCard[]>(res);
    return { items: data, meta: meta as unknown as ProductPage['meta'] };
  } catch (err) {
    // A bad filter value (400) or an unknown category (404): show an empty result, not an error page.
    if (err instanceof ApiError && (err.status === 400 || err.status === 404)) {
      return { items: [], meta: { page: 1, pageSize: 24, total: 0, facets: EMPTY_FACETS } };
    }
    throw err;
  }
}

const EMPTY_FACETS: Facets = { brands: [], price: { min: null, max: null }, attributes: [] };

/** Where an old URL moved to (slug change), or null. */
export async function resolveRedirect(path: string): Promise<string | null> {
  const found = await orNull(
    shopFetch<{ toPath: string }>(
      `/redirects/resolve?path=${encodeURIComponent(path)}`,
      ['redirects'],
      600,
    ),
  );
  return found?.toPath ?? null;
}

export async function getSitemapData() {
  return shopFetch<{
    products: { slug: string; updatedAt: string }[];
    categories: { slug: string; updatedAt: string }[];
  }>('/sitemap-data', [], 3600);
}
