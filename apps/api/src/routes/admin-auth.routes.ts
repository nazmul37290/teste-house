import { Router } from 'express';
import type { Deps } from '../deps';
import { currentAdmin, requireAdmin } from '../middleware/require-admin';

/**
 * Our own routes under /api/v1/admin/auth, mounted before the adminAuth catch-all.
 * GET /me: profile, role and permission keys for the admin UI (the API still checks every request).
 */
export function adminAuthRouter(deps: Deps): Router {
  const router = Router();
  router.get('/me', requireAdmin(deps), (req, res) => {
    const { isActive: _isActive, ...admin } = currentAdmin(req);
    res.json({ data: { admin } });
  });
  return router;
}
