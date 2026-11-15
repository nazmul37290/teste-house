import {
  PUBLIC_SETTING_KEYS,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  SUPER_ADMIN_ROLE,
} from '@shop/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdminUserWithPassword } from '../../src/auth/admin-users';
import { cookiesFrom, createTestContext, WEB_ORIGIN } from './helpers';

const ctx = createTestContext();
const { prisma } = ctx.deps;
const password = 'Admin-Password-2026';

const original = await prisma.setting.findMany();
afterAll(async () => {
  // Put the shared test database back the way the seed left it.
  for (const s of original)
    await prisma.setting.update({ where: { key: s.key }, data: { value: s.value ?? undefined } });
  await ctx.close();
});

async function adminCookie(roleName: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const email = `settings${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;
  const user = await createAdminUserWithPassword(ctx.deps.adminAuth, {
    name: 'Settings Admin',
    email,
    password,
    roleId: role.id,
  });
  const login = await request(ctx.app)
    .post('/api/v1/admin/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .send({ email, password });
  return { id: user.id, cookie: cookiesFrom(login) };
}
const headers = (cookie: string) => ({
  Cookie: cookie,
  Origin: WEB_ORIGIN,
  'X-Requested-With': 'XMLHttpRequest',
});

describe('settings', () => {
  it('seeded rows match the shared definitions (keys, group, public flag)', async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: SETTING_KEYS } } });
    expect(rows.map((r) => r.key).sort()).toEqual([...SETTING_KEYS].sort());
    for (const row of rows) {
      const def = SETTING_DEFINITIONS[row.key as keyof typeof SETTING_DEFINITIONS];
      expect({ key: row.key, group: row.group, isPublic: row.isPublic }).toEqual({
        key: row.key,
        group: def.group,
        isPublic: def.isPublic,
      });
    }
  });

  it('GET /settings/public returns only public keys, with a short cache header', async () => {
    const res = await request(ctx.app).get('/api/v1/settings/public');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.data).sort()).toEqual([...PUBLIC_SETTING_KEYS].sort());
    expect(res.body.data).not.toHaveProperty('notifications.adminEmail');
    expect(res.headers['cache-control']).toBe('public, max-age=60');
  });

  it('admin settings need settings.manage', async () => {
    const manager = await adminCookie('Manager'); // Manager has everything except settings, roles, users
    expect(
      (await request(ctx.app).get('/api/v1/admin/settings').set(headers(manager.cookie))).status,
    ).toBe(403);
    expect(
      (
        await request(ctx.app)
          .put('/api/v1/admin/settings')
          .set(headers(manager.cookie))
          .send({ 'store.name': 'X' })
      ).status,
    ).toBe(403);
  });

  it('updates validated values, shows them publicly and audits only what changed', async () => {
    const owner = await adminCookie(SUPER_ADMIN_ROLE);
    const current = (
      await request(ctx.app).get('/api/v1/admin/settings').set(headers(owner.cookie))
    ).body.data.values;
    const put = await request(ctx.app)
      .put('/api/v1/admin/settings')
      .set(headers(owner.cookie))
      .send({
        'store.name': 'Honey House',
        'store.phone': '+8801812345678',
        'review.autoApprove': true,
        'seo.defaultTitle': current['seo.defaultTitle'],
      });
    expect(put.status).toBe(200);
    expect(put.body.data.values).toMatchObject({
      'store.name': 'Honey House',
      'store.phone': '01812345678',
      'review.autoApprove': true,
    });

    const pub = await request(ctx.app).get('/api/v1/settings/public');
    expect(pub.body.data['store.name']).toBe('Honey House');

    const audit = await prisma.auditLog.findFirst({
      where: { adminUserId: owner.id, action: 'settings.update' },
      orderBy: { createdAt: 'desc' },
    });
    expect(audit?.after).toEqual({
      'store.name': 'Honey House',
      'store.phone': '01812345678',
      'review.autoApprove': true,
    });
    expect(Object.keys(audit?.before as object).sort()).toEqual([
      'review.autoApprove',
      'store.name',
      'store.phone',
    ]);
  });

  it('rejects invalid values and unknown keys without saving anything', async () => {
    const owner = await adminCookie(SUPER_ADMIN_ROLE);
    const before = await prisma.setting.findUniqueOrThrow({ where: { key: 'store.name' } });
    for (const body of [
      { 'store.name': 'Ok', 'store.logo': 'ftp://x/logo.png' },
      { 'store.name': 'Ok', 'secret.flag': true },
    ]) {
      const res = await request(ctx.app)
        .put('/api/v1/admin/settings')
        .set(headers(owner.cookie))
        .send(body);
      expect(res.status).toBe(400);
    }
    expect(
      (await prisma.setting.findUniqueOrThrow({ where: { key: 'store.name' } })).value,
    ).toEqual(before.value);
  });
});
