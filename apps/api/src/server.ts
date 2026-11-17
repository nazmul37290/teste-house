import { loadEnv } from './config/env';
import { createApp } from './app';
import { closeDeps, createDeps } from './deps';
import { initSentry } from './lib/sentry';

const env = loadEnv();
initSentry(env, 'api');
const deps = createDeps(env);
const app = createApp(deps);

const server = app.listen(env.PORT, () => {
  console.log(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    void closeDeps(deps).finally(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
