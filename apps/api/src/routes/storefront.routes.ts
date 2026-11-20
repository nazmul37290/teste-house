import {
  productIdsQuerySchema,
  publicReviewsQuerySchema,
  publicProductQuerySchema,
  slugSchema,
  suggestQuerySchema,
} from '@shop/shared';
import { Router, type Request } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps';
import { clientIp } from '../lib/client-ip';
import { enforceRateLimit } from '../lib/rate-limit';
import * as reviews from '../services/review.service';
import * as storefront from '../services/storefront.service';

const slugParam = (req: Request) => z.object({ slug: slugSchema }).parse(req.params).slug;
const pathQuery = z.object({ path: z.string().regex(/^\/[a-z0-9/-]{1,250}$/) });

/**
 * Public catalog under /api/v1 (docs/api-conventions.md, Public). No auth; read-only; only visible
 * data (see storefront.service). Search suggestions are rate limited per IP.
 */
export function storefrontRouter(deps: Deps): Router {
  const router = Router();
  const svc = { prisma: deps.prisma, publicMediaUrl: deps.publicMediaUrl };

  router.get('/products', async (req, res) => {
    const query = publicProductQuerySchema.parse(req.query);
    const { items, total, facets } = await storefront.listProducts(svc, query);
    res.json({ data: items, meta: { page: query.page, pageSize: query.pageSize, total, facets } });
  });
  // Cards for a guest's wishlist (ids kept in the browser). Registered before /products/:slug.
  router.get('/products/cards', async (req, res) => {
    const { ids } = productIdsQuerySchema.parse(req.query);
    res.json({ data: await storefront.cardsByIds(svc, ids) });
  });
  router.get('/products/:slug/reviews', async (req, res) => {
    const { page } = publicReviewsQuerySchema.parse(req.query);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await reviews.publicReviews(deps, slugParam(req), page) });
  });
  router.get('/products/:slug', async (req, res) => {
    res.json({ data: await storefront.getProduct(svc, slugParam(req)) });
  });
  router.get('/categories', async (_req, res) => {
    res.json({ data: await storefront.listCategories(svc) });
  });
  router.get('/categories/:slug', async (req, res) => {
    res.json({ data: await storefront.getCategory(svc, slugParam(req)) });
  });
  router.get('/brands', async (_req, res) => {
    res.json({ data: await storefront.listBrands(svc) });
  });
  router.get('/search/suggest', async (req, res) => {
    await enforceRateLimit(deps.redis, `suggest:${clientIp(req, deps.env)}`, 60, 60);
    const { q } = suggestQuerySchema.parse(req.query);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await storefront.suggest(svc, q) });
  });
  router.get('/reviews/recent', async (_req, res) => {
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await reviews.recentReviews(deps.prisma) });
  });
  router.get('/store-facts', async (_req, res) => {
    res.json({ data: await storefront.storeFacts(deps.prisma, Object.keys(deps.gateways)) });
  });
  router.get('/homepage', async (_req, res) => {
    res.json({ data: await storefront.getHomepage(svc) });
  });
  router.get('/redirects/resolve', async (req, res) => {
    res.json({
      data: await storefront.resolveRedirect(deps.prisma, pathQuery.parse(req.query).path),
    });
  });
  router.get('/sitemap-data', async (_req, res) => {
    res.json({ data: await storefront.sitemapData(svc) });
  });

  return router;
}
