import { existsSync } from 'node:fs';
import path from 'node:path';
import { MEDIA_WIDTHS, SUPER_ADMIN_ROLE } from '@shop/shared';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { adminHeaders, adminSession, createTestContext } from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());

let owner: { cookie: string };
beforeAll(async () => {
  owner = await adminSession(ctx, SUPER_ADMIN_ROLE);
});

const photo = (w = 2000, h = 1500) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: 230, g: 180, b: 30 } } })
    .jpeg()
    .toBuffer();

function upload(
  cookie: string,
  file: Buffer | null,
  fields: Record<string, string>,
  filename = 'honey.jpg',
) {
  const req = request(ctx.app).post('/api/v1/admin/media').set(adminHeaders(cookie));
  for (const [k, v] of Object.entries(fields)) req.field(k, v);
  return file ? req.attach('file', file, { filename, contentType: 'image/jpeg' }) : req;
}

const onDisk = (p: string, w: number) => path.join(ctx.env.UPLOAD_DIR, `${p}-${w}.webp`);

describe('media upload', () => {
  it('stores every WebP size under a random name and serves it immutable and cross-origin', async () => {
    const res = await upload(
      owner.cookie,
      await photo(),
      { altText: 'Jar of Sundarbans honey' },
      '../../etc/passwd.jpg',
    );
    expect(res.status).toBe(201);
    const media = res.body.data;
    expect(media).toMatchObject({
      altText: 'Jar of Sundarbans honey',
      width: 2000,
      height: 1500,
      mime: 'image/webp',
    });
    expect(media.path).toMatch(/^products\/\d{4}\/\d{2}\/[0-9a-f-]{36}$/); // never the uploaded name
    for (const w of MEDIA_WIDTHS) expect(existsSync(onDisk(media.path, w))).toBe(true);
    expect(media.urls['500']).toBe(`http://localhost:4000/media/${media.path}-500.webp`);

    const file = await request(ctx.app).get(`/media/${media.path}-500.webp`);
    expect(file.status).toBe(200);
    expect(file.headers['content-type']).toBe('image/webp');
    expect(file.headers['cache-control']).toContain('immutable');
    expect(file.headers['cross-origin-resource-policy']).toBe('cross-origin');
  });

  it('requires alt text and a real image', async () => {
    expect((await upload(owner.cookie, await photo(), {})).status).toBe(400);
    const fake = await upload(owner.cookie, Buffer.from('not really a jpeg'), {
      altText: 'Pretend photo',
    });
    expect(fake.status).toBe(400);
    expect(fake.body.error.details[0].path).toBe('file');
    expect((await upload(owner.cookie, null, { altText: 'No file at all' })).status).toBe(400);
  });

  it('refuses files over 5 MB before processing them', async () => {
    const big = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff]),
      Buffer.alloc(5 * 1024 * 1024 + 10),
    ]);
    const res = await upload(owner.cookie, big, { altText: 'Too big' });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toContain('5 MB');
  });

  it('needs media.upload', async () => {
    const salesman = await adminSession(ctx, 'Salesman');
    expect(
      (await upload(salesman.cookie, await photo(400, 400), { altText: 'Not allowed' })).status,
    ).toBe(403);
  });

  it('lists, edits alt text, and deletes unused images (files too), refusing images in use', async () => {
    const a = (await upload(owner.cookie, await photo(600, 600), { altText: 'Horlicks jar' })).body
      .data;
    const b = (await upload(owner.cookie, await photo(600, 600), { altText: 'Canned tuna' })).body
      .data;
    const h = adminHeaders(owner.cookie);

    const list = await request(ctx.app).get('/api/v1/admin/media?q=horlicks').set(h);
    expect(list.body.data.map((m: { id: string }) => m.id)).toContain(a.id);

    const edited = await request(ctx.app)
      .patch(`/api/v1/admin/media/${a.id}`)
      .set(h)
      .send({ altText: 'Horlicks 500 g jar' });
    expect(edited.body.data.altText).toBe('Horlicks 500 g jar');

    await ctx.deps.prisma.category.create({
      data: { name: `Cat ${Date.now()}`, slug: `cat-${Date.now()}`, imageId: b.id },
    });
    const inUse = await request(ctx.app).delete(`/api/v1/admin/media/${b.id}`).set(h);
    expect(inUse.status).toBe(409);
    expect(inUse.body.error.details[0].reason).toBe('MEDIA_IN_USE');

    expect((await request(ctx.app).delete(`/api/v1/admin/media/${a.id}`).set(h)).status).toBe(204);
    for (const w of MEDIA_WIDTHS) expect(existsSync(onDisk(a.path, w))).toBe(false);
    const audit = await ctx.deps.prisma.auditLog.findFirst({
      where: { entityId: a.id },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.action).toBe('media.delete');
  });

  it('the image used as the store logo cannot be deleted until another logo is chosen', async () => {
    const h = adminHeaders(owner.cookie);
    const logo = (await upload(owner.cookie, await photo(900, 300), { altText: 'Store logo' })).body
      .data;
    const set = (value: string | null) =>
      request(ctx.app).put('/api/v1/admin/settings').set(h).send({ 'store.logo': value });
    expect((await set(logo.urls['500'])).status).toBe(200);
    try {
      const blocked = await request(ctx.app).delete(`/api/v1/admin/media/${logo.id}`).set(h);
      expect(blocked.status).toBe(409);
      expect(blocked.body.error.message).toContain('store logo');
    } finally {
      await set(null);
    }
    expect((await request(ctx.app).delete(`/api/v1/admin/media/${logo.id}`).set(h)).status).toBe(
      204,
    );
  });
});
