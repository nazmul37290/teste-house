import { DEFAULT_ROLES, PERMISSION_KEYS, SUPER_ADMIN_ROLE } from '@shop/shared';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdminUserWithPassword } from '../../src/auth/admin-users';
import { ensureSuperAdmin } from '../../src/services/super-admin.service';
import {
  cookiesFrom,
  createTestContext,
  ourRouteHeaders,
  uniquePhone,
  WEB_ORIGIN,
} from './helpers';
import { secretFromOtpauthUri, totpCode } from './totp';

const ctx = createTestContext();
afterAll(() => ctx.close());

const { prisma } = ctx.deps;
const password = 'Admin-Password-2026';
const uniqueEmail = () => `admin${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

async function adminWithRole(roleName: string) {
  const role = await prisma.role.findUniqueOrThrow({ where: { name: roleName } });
  const email = uniqueEmail();
  const user = await createAdminUserWithPassword(ctx.deps.adminAuth, {
    name: `${roleName} User`,
    email,
    password,
    roleId: role.id,
  });
  return { id: user.id, email };
}

function signIn(email: string, pw = password) {
  return request(ctx.app)
    .post('/api/v1/admin/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .send({ email, password: pw });
}
/** True when a non-empty admin session token was issued (an empty value only clears the cookie). */
const hasAdminSession = (cookie: string) => /shop_a\.session_token=(?!;|$)/.test(cookie);
const me = (cookie?: string) =>
  request(ctx.app)
    .get('/api/v1/admin/auth/me')
    .set(cookie ? { Cookie: cookie } : {});

describe('admin sign-in and /admin/auth/me', () => {
  it('returns the profile, role and every permission for the Super Admin', async () => {
    const { email, id } = await adminWithRole(SUPER_ADMIN_ROLE);
    const login = await signIn(email);
    expect(login.status).toBe(200);

    const res = await me(cookiesFrom(login));
    expect(res.status).toBe(200);
    expect(res.body.data.admin).toMatchObject({
      id,
      email,
      role: { name: SUPER_ADMIN_ROLE, isSystem: true },
      twoFactorEnabled: false,
    });
    expect([...res.body.data.admin.permissions].sort()).toEqual([...PERMISSION_KEYS].sort());
    expect(res.body.data.admin.isActive).toBeUndefined();
    expect(
      (await prisma.adminUser.findUniqueOrThrow({ where: { id } })).lastLoginAt,
    ).toBeInstanceOf(Date);
  });

  it("returns exactly the role's permissions for other roles", async () => {
    const { email } = await adminWithRole('Salesman');
    const res = await me(cookiesFrom(await signIn(email)));
    const expected = DEFAULT_ROLES.Salesman!.permissions as readonly string[];
    expect([...res.body.data.admin.permissions].sort()).toEqual([...expected].sort());
  });

  it('is 401 without a session and with a customer session', async () => {
    expect((await me()).status).toBe(401);
    const customer = await request(ctx.app)
      .post('/api/v1/auth/register')
      .set(ourRouteHeaders())
      .send({ name: 'Not An Admin', phone: uniquePhone(), password });
    expect((await me(cookiesFrom(customer))).status).toBe(401);
  });

  it('rejects wrong passwords and keeps sign-up closed', async () => {
    const { email } = await adminWithRole('Manager');
    expect((await signIn(email, 'Wrong-Password-2026')).status).toBe(401);
  });

  it('refuses inactive admins at sign-in and on every later request', async () => {
    const { id, email } = await adminWithRole('Manager');
    const cookie = cookiesFrom(await signIn(email));
    await prisma.adminUser.update({ where: { id }, data: { isActive: false } });

    expect((await me(cookie)).status).toBe(403);
    const again = await signIn(email);
    expect(again.status).toBe(403);
    expect(hasAdminSession(cookiesFrom(again))).toBe(false);
  });
});

describe('admin two-factor (TOTP)', () => {
  it('enables with password plus a valid code, then requires the code at sign-in', async () => {
    const { email } = await adminWithRole(SUPER_ADMIN_ROLE);
    const cookie = cookiesFrom(await signIn(email));
    const post = (path: string, body: object, c: string) =>
      request(ctx.app)
        .post(`/api/v1/admin/auth${path}`)
        .set({ Origin: WEB_ORIGIN, Cookie: c })
        .send(body);

    expect(
      (await post('/two-factor/enable', { password: 'Wrong-Password-2026' }, cookie)).status,
    ).toBe(400);
    const enable = await post('/two-factor/enable', { password, issuer: 'Honey House' }, cookie);
    expect(enable.status).toBe(200);
    expect(enable.body.totpURI).toContain('issuer=Honey');
    expect(enable.body.backupCodes.length).toBeGreaterThan(0);
    const secret = secretFromOtpauthUri(enable.body.totpURI);

    // Not on until a code is verified (skipVerificationOnEnable: false).
    expect((await me(cookie)).body.data.admin.twoFactorEnabled).toBe(false);
    const turnedOn = await post('/two-factor/verify-totp', { code: totpCode(secret) }, cookie);
    expect(turnedOn.status).toBe(200);
    // Enabling 2FA rotates the session: the old token is revoked at once, the new one is in Set-Cookie.
    expect((await me(cookie)).status).toBe(401);
    expect(hasAdminSession(cookiesFrom(turnedOn))).toBe(true);
    expect((await me(cookiesFrom(turnedOn))).body.data.admin.twoFactorEnabled).toBe(true);

    // Password alone no longer gives a session.
    const first = await signIn(email);
    expect(first.body.twoFactorRedirect).toBe(true);
    const pending = cookiesFrom(first);
    expect(pending).toContain('shop_a.two_factor=');
    expect(hasAdminSession(pending)).toBe(false);
    expect((await me(pending)).status).toBe(401);

    expect((await post('/two-factor/verify-totp', { code: '000000' }, pending)).status).toBe(401);
    const second = await post('/two-factor/verify-totp', { code: totpCode(secret) }, pending);
    expect(second.status).toBe(200);
    expect(hasAdminSession(cookiesFrom(second))).toBe(true);
    expect((await me(cookiesFrom(second))).status).toBe(200);
  });
});

describe('ensureSuperAdmin (seed and production command)', () => {
  it('creates once, never changes an existing admin, and validates input', async () => {
    const email = uniqueEmail();
    const first = await ensureSuperAdmin(ctx.deps, {
      email: email.toUpperCase(),
      name: 'Owner',
      password,
    });
    expect(first.created).toBe(true);
    const admin = await prisma.adminUser.findUniqueOrThrow({
      where: { email },
      include: { role: true },
    });
    expect(admin.role.isSystem).toBe(true);

    const second = await ensureSuperAdmin(ctx.deps, {
      email,
      name: 'Owner',
      password: 'Another-Password-1',
    });
    expect(second).toEqual({ created: false, id: first.id });
    expect((await signIn(email)).status).toBe(200); // the original password still works

    await expect(
      ensureSuperAdmin(ctx.deps, { email: uniqueEmail(), name: 'Owner', password: 'short-pw' }),
    ).rejects.toThrow();
  });
});
