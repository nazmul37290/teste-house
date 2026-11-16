import { toNodeHandler } from 'better-auth/node';
import path from 'node:path';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ADMIN_AUTH_BASE_PATH } from './auth/admin-auth';
import { CUSTOMER_AUTH_BASE_PATH } from './auth/customer-auth';
import type { Deps } from './deps';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { adminAuthRouter } from './routes/admin-auth.routes';
import { adminRouter } from './routes/admin.routes';
import { customerAuthRouter } from './routes/customer-auth.routes';
import { healthRouter } from './routes/health';
import { publicSettingsRouter } from './routes/settings.routes';
import { storefrontRouter } from './routes/storefront.routes';

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

  app.use(healthRouter(deps));

  // Uploaded images: random names, immutable. cross-origin CORP so the web origin can show them
  // (helmet's default same-origin would block <img> from the API host).
  app.use(
    '/media',
    (_req, res, next) => {
      res.set('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(path.resolve(env.UPLOAD_DIR), {
      immutable: true,
      maxAge: '1y',
      index: false,
      dotfiles: 'deny',
    }),
  );

  // docs/auth.md section 7: our own auth routes first (route-level JSON parser), then the Better Auth
  // catch-alls, and only then the global JSON parser, which would otherwise consume their bodies.
  app.use(CUSTOMER_AUTH_BASE_PATH, customerAuthRouter(deps));
  app.use(ADMIN_AUTH_BASE_PATH, adminAuthRouter(deps));
  app.all(`${CUSTOMER_AUTH_BASE_PATH}/*splat`, toNodeHandler(deps.customerAuth));
  app.all(`${ADMIN_AUTH_BASE_PATH}/*splat`, toNodeHandler(deps.adminAuth));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/v1', publicSettingsRouter(deps));
  app.use('/api/v1', storefrontRouter(deps));
  app.use('/api/v1/admin', adminRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
