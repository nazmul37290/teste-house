import express from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { Deps } from '../src/deps';
import { healthRouter } from '../src/routes/health';

// Readiness with stand-in clients: only the two calls the route makes.
function appWith(db: () => Promise<unknown>, redis: () => Promise<unknown>) {
  const deps = { prisma: { $queryRaw: db }, redis: { ping: redis } } as unknown as Pick<
    Deps,
    'prisma' | 'redis'
  >;
  return express().use(healthRouter(deps));
}

describe('GET /health/ready', () => {
  it('is 200 when Postgres and Redis answer', async () => {
    const res = await request(
      appWith(
        async () => [1],
        async () => 'PONG',
      ),
    ).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.checks).toEqual({ database: 'ok', redis: 'ok' });
  });

  it('is 503 and names the failing dependency', async () => {
    const res = await request(
      appWith(
        async () => [1],
        async () => Promise.reject(new Error('down')),
      ),
    ).get('/health/ready');
    expect(res.status).toBe(503);
    expect(res.body.data).toEqual({
      status: 'unavailable',
      checks: { database: 'ok', redis: 'down' },
    });
  });
});
