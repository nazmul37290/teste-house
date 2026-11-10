import type { MetadataRoute } from 'next';

// Products and categories are added in Phase 5 from the API.
export default function sitemap(): MetadataRoute.Sitemap {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return [{ url: site, lastModified: new Date() }];
}
