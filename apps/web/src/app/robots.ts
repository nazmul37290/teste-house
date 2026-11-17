import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Private or per-visitor pages (they are also noindex).
        disallow: [
          '/admin',
          '/cart',
          '/checkout',
          '/account',
          '/api',
          '/wishlist',
          '/order/',
          '/payment/',
          '/track',
        ],
      },
    ],
    sitemap: `${site}/sitemap.xml`,
  };
}
