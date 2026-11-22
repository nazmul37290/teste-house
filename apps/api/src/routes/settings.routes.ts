import { legalPageSlugSchema } from '@shop/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { Deps } from '../deps';
import { getLegalPage, getPublicSettings } from '../services/settings.service';

/**
 * GET /api/v1/settings/public: store name, logo, contact, SEO defaults, tracking IDs. No auth.
 * GET /api/v1/pages/:slug: a policy page (privacy, terms, returns); empty body while not written.
 */
export function publicSettingsRouter(deps: Deps): Router {
  const router = Router();
  router.get('/settings/public', async (_req, res) => {
    // Short shared cache: the storefront asks on most renders; admin changes show within a minute.
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await getPublicSettings(deps.prisma) });
  });
  router.get('/pages/:slug', async (req, res) => {
    const { slug } = z.object({ slug: legalPageSlugSchema }).parse(req.params);
    const { body, title, path, updatedAt } = await getLegalPage(deps.prisma, slug);
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: { slug, title, path, body, updatedAt } });
  });
  return router;
}
