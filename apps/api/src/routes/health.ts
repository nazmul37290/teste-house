import { Router } from 'express';
import type { Deps } from '../deps';

const READY_TIMEOUT_MS = 2000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout')), READY_TIMEOUT_MS).unref(),
    ),
  ]);
}

export function healthRouter(deps: Pick<Deps, 'prisma' | 'redis'>): Router {
  const router = Router();
  // Liveness: the process is up.
  router.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } });
  });
  // Readiness: Postgres and Redis answer. 503 (with which one failed) when either does not.
  router.get('/health/ready', async (_req, res) => {
    const [db, redis] = await Promise.allSettled([
      withTimeout(deps.prisma.$queryRaw`SELECT 1`),
      withTimeout(deps.redis.ping()),
    ]);
    const checks = {
      database: db.status === 'fulfilled' ? 'ok' : 'down',
      redis: redis.status === 'fulfilled' ? 'ok' : 'down',
    };
    const ready = checks.database === 'ok' && checks.redis === 'ok';
    res.status(ready ? 200 : 503).json({ data: { status: ready ? 'ok' : 'unavailable', checks } });
  });
  return router;
}
