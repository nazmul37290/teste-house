import { Router } from 'express';
import type { Deps } from '../deps';
import { getPublicSettings } from '../services/settings.service';

/** GET /api/v1/settings/public: store name, logo, contact, SEO defaults, GTM ID. No auth. */
export function publicSettingsRouter(deps: Deps): Router {
  const router = Router();
  router.get('/settings/public', async (_req, res) => {
    // Short shared cache: the storefront asks on most renders; admin changes show within a minute.
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ data: await getPublicSettings(deps.prisma) });
  });
  return router;
}
