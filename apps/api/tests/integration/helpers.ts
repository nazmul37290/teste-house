import request from 'supertest';
import { createApp } from '../../src/app';
import { loadEnv } from '../../src/config/env';
import { closeDeps, createDeps, type Deps } from '../../src/deps';
import { TEST_DATABASE_URL, TEST_REDIS_URL } from './test-env';

export const WEB_ORIGIN = 'http://localhost:3000';

export function createTestContext() {
  const env = loadEnv({
    NODE_ENV: 'test',
    DATABASE_URL: TEST_DATABASE_URL,
    REDIS_URL: TEST_REDIS_URL,
    BETTER_AUTH_SECRET: 'integration-test-secret-'.padEnd(40, 'x'),
    BETTER_AUTH_URL: WEB_ORIGIN,
    CORS_ORIGINS: WEB_ORIGIN,
  });
  const deps: Deps = createDeps(env);
  const app = createApp(deps);
  return { env, deps, app, close: () => closeDeps(deps) };
}

/** Cookie header value ("name=value; ...") from a response's Set-Cookie headers. */
export function cookiesFrom(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return (raw ?? []).map((c) => c.split(';')[0]).join('; ');
}

let counter = 0;
/** Unique, valid BD mobile number per call (013 prefix plus 8 digits). */
export function uniquePhone(): string {
  counter += 1;
  return `013${String((Date.now() + counter) % 100_000_000).padStart(8, '0')}`;
}
