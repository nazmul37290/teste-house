import express, { Router } from 'express';
import { loginHandler, registerHandler } from '../controllers/customer-auth.controller';
import type { Deps } from '../deps';
import { requireCsrfHeader } from '../middleware/require-csrf-header';

/**
 * Our own customer auth routes under /api/v1/auth (docs/auth.md section 3). Mounted before the
 * Better Auth catch-all, so these paths are ours; everything else falls through to Better Auth.
 * Public by design (no session needed); protected by Zod validation, the CSRF header and the lockout.
 */
export function customerAuthRouter(deps: Deps): Router {
  const router = Router();
  const json = express.json({ limit: '16kb' });
  router.post('/register', json, requireCsrfHeader, registerHandler(deps));
  router.post('/login', json, requireCsrfHeader, loginHandler(deps));
  return router;
}
