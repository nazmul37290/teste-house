import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
const { prisma } = ctx.deps;
let h: Record<string, string>;

beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
});
afterAll(async () => {
  // Back to the seeded state: every page key present and empty.
  for (const key of ['page.privacy', 'page.terms', 'page.returns'])
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: '', group: 'pages', isPublic: false },
      update: { value: '' },
    });
  await ctx.close();
});

const put = (slug: string, body: object, headers = h) =>
  request(ctx.app).put(`/api/v1/admin/pages/${slug}`).set(headers).send(body);

describe('policy pages', () => {
  it('an unwritten page is empty, public and left out of the sitemap', async () => {
    await prisma.setting.deleteMany({ where: { key: 'page.returns' } });
    const res = await request(ctx.app).get('/api/v1/pages/returns');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      slug: 'returns',
      title: 'Return and refund policy',
      path: '/returns',
      body: '',
      updatedAt: null,
    });
    const sitemap = await request(ctx.app).get('/api/v1/sitemap-data');
    expect(sitemap.body.data.pages).not.toContainEqual(
      expect.objectContaining({ path: '/returns' }),
    );
  });

  it('settings.manage writes a page: public, in the sitemap, audited, not in public settings', async () => {
    const saved = await put('returns', { body: '## Returns\r\nSealed items within 3 days.  \r\n' });
    expect(saved.status).toBe(200);
    expect(saved.body.data.body).toBe('## Returns\nSealed items within 3 days.');

    const pub = await request(ctx.app).get('/api/v1/pages/returns');
    expect(pub.body.data.body).toBe('## Returns\nSealed items within 3 days.');
    expect(pub.body.data.updatedAt).not.toBeNull();

    const sitemap = await request(ctx.app).get('/api/v1/sitemap-data');
    expect(sitemap.body.data.pages).toContainEqual(expect.objectContaining({ path: '/returns' }));

    const settings = await request(ctx.app).get('/api/v1/settings/public');
    expect(settings.body.data).not.toHaveProperty('page.returns');
    // The general settings screen leaves the pages out too.
    const all = await request(ctx.app).get('/api/v1/admin/settings').set(h);
    expect(all.body.data.values).not.toHaveProperty('page.returns');

    const list = await request(ctx.app).get('/api/v1/admin/pages').set(h);
    expect(list.body.data.map((p: { slug: string }) => p.slug)).toEqual([
      'privacy',
      'terms',
      'returns',
    ]);

    expect(
      await prisma.auditLog.count({
        where: { action: 'settings.update', after: { path: ['page.returns'], not: 'null' } },
      }),
    ).toBeGreaterThan(0);
  });

  it('rejects unknown pages, extra fields and staff without settings.manage', async () => {
    expect((await request(ctx.app).get('/api/v1/pages/about')).status).toBe(400);
    expect((await put('about', { body: 'x' })).status).toBe(400);
    expect((await put('terms', { body: 'x', title: 'Mine' })).status).toBe(400);
    expect((await put('terms', { body: 'x'.repeat(50_001) })).status).toBe(400);

    const manager = adminHeaders((await adminSession(ctx, 'Manager')).cookie);
    expect((await put('terms', { body: 'x' }, manager)).status).toBe(403);
    expect((await request(ctx.app).get('/api/v1/admin/pages').set(manager)).status).toBe(403);
  });
});
