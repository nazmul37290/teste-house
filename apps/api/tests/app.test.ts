import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app';
import { loadEnv } from '../src/config/env';
import { createDeps } from '../src/deps';

const env = loadEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  BETTER_AUTH_SECRET: 'a'.repeat(32),
});

describe('app', () => {
  // Clients connect lazily, so building the app needs neither Postgres nor Redis.
  const app = createApp(createDeps(env));

  it('GET /health returns ok', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: { status: 'ok' } });
  });

  it('unknown routes use the error format', async () => {
    const res = await request(app).get('/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('loadEnv', () => {
  it('fails loudly when required values are missing', () => {
    expect(() => loadEnv({ NODE_ENV: 'test' })).toThrow(/DATABASE_URL/);
  });
  it('rejects short secrets', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x', BETTER_AUTH_SECRET: 'short' })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
  it('requires BETTER_AUTH_SECRET', () => {
    expect(() => loadEnv({ DATABASE_URL: 'x' })).toThrow(/BETTER_AUTH_SECRET/);
  });
});
