import { SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(async () => {
  await ctx.deps.prisma.homepageSection.deleteMany(); // leave the shared test database without sections
  await ctx.close();
});
const { prisma } = ctx.deps;

let h: Record<string, string>;
let imageId: string;
beforeAll(async () => {
  h = adminHeaders((await adminSession(ctx, SUPER_ADMIN_ROLE)).cookie);
  imageId = (
    await prisma.media.create({
      data: {
        path: `products/2026/11/banner-${Date.now()}`,
        mime: 'image/webp',
        sizeBytes: 1,
        altText: 'Banner',
      },
    })
  ).id;
});

const api = {
  post: (p: string, b: object, headers = h) =>
    request(ctx.app).post(`/api/v1/admin${p}`).set(headers).send(b),
  patch: (p: string, b: object) => request(ctx.app).patch(`/api/v1/admin${p}`).set(h).send(b),
  put: (p: string, b: object) => request(ctx.app).put(`/api/v1/admin${p}`).set(h).send(b),
  del: (p: string) => request(ctx.app).delete(`/api/v1/admin${p}`).set(h),
};

describe('banners', () => {
  it('creates, edits and deletes banners, and the live ones show on the homepage', async () => {
    const created = await api.post('/banners', {
      title: 'Winter honey sale',
      imageId,
      linkUrl: '/category/honey',
    });
    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      position: 'home_hero',
      isActive: true,
      image: { altText: 'Banner' },
    });
    const id = created.body.data.id as string;

    const hero = async () =>
      (await request(ctx.app).get('/api/v1/homepage')).body.data.hero.map(
        (b: { id: string }) => b.id,
      );
    expect(await hero()).toContain(id);
    await api.patch(`/banners/${id}`, {
      startsAt: new Date(Date.now() + 86_400_000).toISOString(),
    }); // starts tomorrow
    expect(await hero()).not.toContain(id);

    expect((await api.del(`/banners/${id}`)).status).toBe(204);
    expect(
      (await prisma.auditLog.findFirst({ where: { entityId: id }, orderBy: { createdAt: 'desc' } }))
        ?.action,
    ).toBe('banner.delete');
  });

  it('accepts only site paths and https links, and dates in order', async () => {
    for (const linkUrl of [
      'javascript:alert(1)',
      '//evil.example',
      'http://insecure.example',
      'data:text/html,x',
    ]) {
      expect((await api.post('/banners', { title: 'Bad', imageId, linkUrl })).status).toBe(400);
    }
    expect(
      (await api.post('/banners', { title: 'Ok', imageId, linkUrl: 'https://example.com/offer' }))
        .status,
    ).toBe(201);
    const bad = await api.post('/banners', {
      title: 'Dates',
      imageId,
      startsAt: '2026-12-10T00:00:00Z',
      endsAt: '2026-12-01T00:00:00Z',
    });
    expect(bad.status).toBe(400);
    const ok = (
      await api.post('/banners', { title: 'Dates', imageId, startsAt: '2026-12-01T00:00:00Z' })
    ).body.data;
    expect((await api.patch(`/banners/${ok.id}`, { endsAt: '2026-11-01T00:00:00Z' })).status).toBe(
      400,
    ); // against the stored start
    expect(
      (
        await api.post('/banners', {
          title: 'No image',
          imageId: '00000000-0000-0000-0000-000000000001',
        })
      ).status,
    ).toBe(400);
  });
});

describe('homepage sections', () => {
  it('validates the config for each type and replaces sections as a whole', async () => {
    expect(
      (
        await api.post('/homepage-sections', {
          type: 'PRODUCT_LIST',
          config: { source: 'category' },
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await api.post('/homepage-sections', {
          type: 'PRODUCT_LIST',
          config: { source: 'featured', extra: 1 },
        })
      ).status,
    ).toBe(400);
    expect((await api.post('/homepage-sections', { type: 'CUSTOM_HTML', config: {} })).status).toBe(
      400,
    );

    const created = await api.post('/homepage-sections', {
      type: 'PRODUCT_LIST',
      title: 'Featured',
      config: { source: 'featured', limit: 4 },
      sortOrder: 2,
    });
    expect(created.status).toBe(201);
    const id = created.body.data.id as string;

    const replaced = await api.put(`/homepage-sections/${id}`, {
      type: 'CUSTOM_HTML',
      title: 'About',
      config: { text: 'Family shop' },
    });
    expect(replaced.body.data).toMatchObject({
      type: 'CUSTOM_HTML',
      title: 'About',
      config: { text: 'Family shop' },
      sortOrder: 0,
      isActive: true,
    });
    const home = (await request(ctx.app).get('/api/v1/homepage')).body.data.sections;
    expect(home).toContainEqual({ type: 'TEXT', title: 'About', text: 'Family shop' });

    expect((await api.del(`/homepage-sections/${id}`)).status).toBe(204);
  });

  it('needs marketing.manage', async () => {
    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    expect(
      (
        await api.post(
          '/homepage-sections',
          { type: 'CUSTOM_HTML', config: { text: 'x' } },
          salesman,
        )
      ).status,
    ).toBe(403);
    expect((await api.post('/banners', { title: 'x', imageId }, salesman)).status).toBe(403);
  });
});

describe('home highlights', () => {
  const items = [
    { icon: 'cash', title: 'Cash on delivery', text: 'Pay when it arrives.' },
    { icon: 'truck', title: 'Fast delivery', text: '' },
  ];

  it('marketing saves up to four items; they are public; empty means automatic', async () => {
    const manager = adminHeaders((await adminSession(ctx, 'Manager')).cookie);
    try {
      const saved = await api.put('/homepage/highlights', { items });
      expect(saved.status).toBe(200);
      expect(saved.body.data).toEqual(items);
      expect(
        (await request(ctx.app).get('/api/v1/admin/homepage/highlights').set(manager)).body.data,
      ).toEqual(items);
      const pub = await request(ctx.app).get('/api/v1/settings/public');
      expect(pub.body.data['home.highlights']).toEqual(items);
      expect(
        await prisma.auditLog.count({
          where: {
            action: 'settings.update',
            after: { path: ['home.highlights'], array_contains: [items[0]!] },
          },
        }),
      ).toBeGreaterThan(0);

      const cleared = await api.put('/homepage/highlights', { items: [] });
      expect(cleared.body.data).toEqual([]);
    } finally {
      await api.put('/homepage/highlights', { items: [] });
    }
  });

  it('validates the items and needs marketing.manage', async () => {
    const five = Array.from({ length: 5 }, () => items[0]);
    expect((await api.put('/homepage/highlights', { items: five })).status).toBe(400);
    const badIcon = await api.put('/homepage/highlights', {
      items: [{ icon: 'rocket', title: 'X', text: '' }],
    });
    expect(badIcon.status).toBe(400);
    const noTitle = await api.put('/homepage/highlights', {
      items: [{ icon: 'cash', title: ' ', text: '' }],
    });
    expect(noTitle.status).toBe(400);

    const salesman = adminHeaders((await adminSession(ctx, 'Salesman')).cookie);
    const denied = await request(ctx.app)
      .put('/api/v1/admin/homepage/highlights')
      .set(salesman)
      .send({ items });
    expect(denied.status).toBe(403);
  });
});
