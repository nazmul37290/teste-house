import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type { Env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { healthRouter } from './routes/health';

export function createApp(env: Env): Express {
  const app = express();

  // Behind Cloudflare and Traefik: trust the proxy chain so req.ip is the real client IP.
  app.set('trust proxy', true);
  app.disable('x-powered-by');

  app.use(pinoHttp({ level: env.NODE_ENV === 'test' ? 'silent' : 'info', redact: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'] }));
  app.use(helmet());
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '1mb' }));

  app.use(healthRouter());
  // Versioned routes are mounted here as phases add them: app.use('/api/v1', apiRouter(...))

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
