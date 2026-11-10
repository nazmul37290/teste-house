import { Router } from 'express';

export function healthRouter(): Router {
  const router = Router();
  // Liveness: the process is up.
  router.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  // Readiness (DB + Redis checks) is added in Phase 3 when those clients exist.
  return router;
}
