import type { RequestHandler } from 'express';
import type { Deps } from '../deps';

/**
 * After a successful admin write, asks the storefront to refresh its cached data (docs/design.md
 * section 9). Every storefront fetch carries the `catalog` tag, so catalog writes refresh it all;
 * settings and the homepage have their own tags. One place instead of a call in every service.
 */
const TAGS_BY_PREFIX: [prefix: string, tags: string[]][] = [
  ['/settings', ['settings']],
  ['/banners', ['homepage']],
  ['/homepage-sections', ['homepage']],
  ['/products', ['catalog']],
  ['/variants', ['catalog']],
  ['/categories', ['catalog']],
  ['/brands', ['catalog']],
  ['/tags', ['catalog']],
  ['/attributes', ['catalog']],
  ['/attribute-values', ['catalog']],
  ['/inventory', ['catalog']],
  ['/media', ['catalog']],
];

export function tagsForWrite(method: string, path: string): string[] {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return [];
  // Uploading a new image changes nothing visible until something uses it.
  if (method === 'POST' && path === '/media') return [];
  return (
    TAGS_BY_PREFIX.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`))?.[1] ?? []
  );
}

export function revalidateAfterWrite(deps: Pick<Deps, 'env' | 'revalidateQueue'>): RequestHandler {
  return (req, res, next) => {
    const tags = tagsForWrite(req.method, req.path);
    if (tags.length && deps.env.REVALIDATE_SECRET) {
      res.on('finish', () => {
        if (res.statusCode >= 400) return;
        // Same jobId while one is waiting: a burst of writes (e.g. a CSV import) becomes one refresh.
        // (BullMQ job ids may not contain ":".)
        const key = [...tags].sort().join('-');
        deps
          .revalidateQueue()
          .add('revalidate', { tags }, { jobId: `revalidate-${key}`, delay: 1000 })
          .catch((err: unknown) => {
            console.error(
              `Could not queue a storefront refresh: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
      });
    }
    next();
  };
}
