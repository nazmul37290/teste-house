import type { MetadataRoute } from 'next';
import { connection } from 'next/server';
import { getSitemapData } from '@/lib/storefront';
import { SITE_URL } from '@/lib/site';

/**
 * Home, visible categories and products (from GET /sitemap-data; data cached for an hour). One file
 * is fine up to 50,000 URLs; split with generateSitemaps when the catalog gets near that. Legal pages
 * are left out while they are placeholders (noindex). Rendered per request: the build has no API.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection();
  const home: MetadataRoute.Sitemap = [{ url: SITE_URL, changeFrequency: 'daily', priority: 1 }];
  try {
    const data = await getSitemapData();
    return [
      ...home,
      ...data.categories.map((c) => ({
        url: `${SITE_URL}/category/${c.slug}`,
        lastModified: c.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.7,
      })),
      ...data.products.map((p) => ({
        url: `${SITE_URL}/product/${p.slug}`,
        lastModified: p.updatedAt,
        changeFrequency: 'weekly' as const,
        priority: 0.8,
      })),
    ];
  } catch {
    return home; // API down: better a short sitemap than an error
  }
}
