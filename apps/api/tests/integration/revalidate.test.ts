import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

// A secret turns storefront refreshes on (without one the hook does nothing).
const ctx = createTestContext({ REVALIDATE_SECRET: 'test-revalidate-secret-123456' });
afterAll(() => ctx.close());

let h: Record<string, string>;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  await ctx.deps.revalidateQueue().obliterate({ force: true }); // test Redis db only
});

describe('storefront refresh after admin writes', () => {
  it('queues one coalesced refresh for a burst of catalog writes, and none for reads or failures', async () => {
    const queue = ctx.deps.revalidateQueue();
    const name = `Refresh ${Date.now()}`;
    await request(ctx.app)
      .post('/api/v1/admin/categories')
      .set(h)
      .send({ name, slug: `refresh-${Date.now()}` });
    await request(ctx.app)
      .post('/api/v1/admin/brands')
      .set(h)
      .send({ name: `Brand ${name}` });
    await request(ctx.app).get('/api/v1/admin/products').set(h);
    await request(ctx.app).post('/api/v1/admin/categories').set(h).send({ name: '' }); // 400: no refresh

    await expect
      .poll(async () => (await queue.getJob('revalidate-catalog'))?.data)
      .toEqual({ tags: ['catalog'] });
    expect(await queue.getJobCounts('delayed', 'waiting')).toMatchObject({
      delayed: 1,
      waiting: 0,
    });

    await request(ctx.app)
      .put('/api/v1/admin/settings')
      .set(h)
      .send({ 'review.autoApprove': false });
    await expect
      .poll(async () => (await queue.getJob('revalidate-settings'))?.data)
      .toEqual({ tags: ['settings'] });
  });
});
