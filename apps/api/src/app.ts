import { toNodeHandler } from 'better-auth/node';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ADMIN_AUTH_BASE_PATH } from './auth/admin-auth';
import { CUSTOMER_AUTH_BASE_PATH } from './auth/customer-auth';
import type { Deps } from './deps';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';

export function createApp(deps: Deps): Express {
  const { env } = deps;
  const app = express();

  // Behind Cloudflare and Traefik: trust the proxy chain so req.ip is the real client IP.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(
    pinoHttp({
      level: env.NODE_ENV === 'test' ? 'silent' : 'info',
      redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
    }),
  );
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));

  app.use(healthRouter());

  // docs/auth.md section 7: our own auth routes first (route-level JSON parser), then the Better Auth
  // catch-alls, and only then the global JSON parser, which would otherwise consume their bodies.
  app.all(`${CUSTOMER_AUTH_BASE_PATH}/*splat`, toNodeHandler(deps.customerAuth));
  app.all(`${ADMIN_AUTH_BASE_PATH}/*splat`, toNodeHandler(deps.adminAuth));
  app.use(express.json({ limit: '1mb' }));

  // Versioned routes are mounted here as phases add them: app.use('/api/v1', apiRouter(...))

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
