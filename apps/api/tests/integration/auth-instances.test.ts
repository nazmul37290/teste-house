import { SUPER_ADMIN_ROLE } from '@shop/shared';
import { betterAuth } from 'better-auth';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createAdminUserWithPassword } from '../../src/auth/admin-users';
import { commonAuthOptions } from '../../src/auth/common';
import {
  cookiesFrom,
  createTestContext,
  ourRouteHeaders,
  uniquePhone,
  WEB_ORIGIN,
} from './helpers';

// Phase 3 spike: two Better Auth instances side by side on one Postgres and one Redis (docs/auth.md decision 1).
const ctx = createTestContext();
afterAll(() => ctx.close());

const password = 'Correct-Horse-9';

async function customerSignedIn() {
  const email = `c${Date.now()}@example.com`;
  await ctx.deps.customerAuth.api.signUpEmail({
    body: { name: 'Test Customer', email, password, phone: uniquePhone() },
  });
  // Customers sign in only through our /auth/login (Better Auth's HTTP sign-in is disabled for them).
  const res = await request(ctx.app)
    .post('/api/v1/auth/login')
    .set(ourRouteHeaders())
    .send({ identifier: email, password });
  return { email, res, cookie: cookiesFrom(res) };
}

async function adminSignedIn() {
  const role = await ctx.deps.prisma.role.findUniqueOrThrow({ where: { name: SUPER_ADMIN_ROLE } });
  const email = `a${Date.now()}@example.com`;
  await createAdminUserWithPassword(ctx.deps.adminAuth, {
    name: 'Test Admin',
    email,
    password,
    roleId: role.id,
  });
  const res = await request(ctx.app)
    .post('/api/v1/admin/auth/sign-in/email')
    .set('Origin', WEB_ORIGIN)
    .send({ email, password });
  return { email, res, cookie: cookiesFrom(res) };
}

describe('two Better Auth instances', () => {
  it('customer signs in with shop_c cookies and the session resolves', async () => {
    const { email, res, cookie } = await customerSignedIn();
    expect(res.status).toBe(200);
    expect(cookie).toContain('shop_c.session_token=');
    expect(cookie).not.toContain('shop_a.');

    const session = await request(ctx.app).get('/api/v1/auth/get-session').set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);
  });

  it('admin signs in with shop_a cookies and the session resolves', async () => {
    const { email, res, cookie } = await adminSignedIn();
    expect(res.status).toBe(200);
    expect(cookie).toContain('shop_a.session_token=');
    expect(cookie).not.toContain('shop_c.');

    const session = await request(ctx.app)
      .get('/api/v1/admin/auth/get-session')
      .set('Cookie', cookie);
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe(email);
  });

  it('a customer session is never accepted by the admin instance', async () => {
    const { cookie } = await customerSignedIn();
    const res = await request(ctx.app).get('/api/v1/admin/auth/get-session').set('Cookie', cookie);
    expect(res.body).toBeNull();
  });

  it('an admin session is never accepted by the customer instance', async () => {
    const { cookie } = await adminSignedIn();
    const res = await request(ctx.app).get('/api/v1/auth/get-session').set('Cookie', cookie);
    expect(res.body).toBeNull();
  });

  it('writes each instance to its own tables', async () => {
    const { email: customerEmail } = await customerSignedIn();
    const { email: adminEmail } = await adminSignedIn();
    const { prisma } = ctx.deps;
    expect(await prisma.customer.count({ where: { email: adminEmail } })).toBe(0);
    expect(await prisma.adminUser.count({ where: { email: customerEmail } })).toBe(0);
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { email: customerEmail },
      include: { sessions: true, accounts: true },
    });
    // Sign-up signs in automatically, then the test signs in again: two sessions, both in Postgres.
    expect(customer.sessions).toHaveLength(2);
    expect(customer.accounts[0]?.providerId).toBe('credential');
    expect(customer.accounts[0]?.password).not.toBe(password);
  });

  it('public sign-up is closed on both instances', async () => {
    const body = { name: 'X', email: `x${Date.now()}@example.com`, password, phone: uniquePhone() };
    const customer = await request(ctx.app)
      .post('/api/v1/auth/sign-up/email')
      .set('Origin', WEB_ORIGIN)
      .send(body);
    expect(customer.status).toBe(404);
    const admin = await request(ctx.app)
      .post('/api/v1/admin/auth/sign-up/email')
      .set('Origin', WEB_ORIGIN)
      .send(body);
    expect(admin.status).toBeGreaterThanOrEqual(400);
    expect(await ctx.deps.prisma.adminUser.count({ where: { email: body.email } })).toBe(0);
  });
});

describe('Better Auth schema check', () => {
  it('passes for both real configs (their expected columns match prisma/schema.prisma)', async () => {
    for (const auth of [ctx.deps.customerAuth, ctx.deps.adminAuth]) {
      const ok = await auth.handler(new Request(`${WEB_ORIGIN}${auth.options.basePath}/ok`));
      expect(ok.status).toBe(200);
    }
  });

  it('fails when a config expects a column the schema does not have', async () => {
    const drifted = betterAuth({
      ...commonAuthOptions(ctx.deps, 'ba:drift:'),
      basePath: '/drift',
      emailAndPassword: { enabled: true },
      user: {
        modelName: 'customer',
        additionalFields: { notAColumn: { type: 'string', required: true } },
      },
      session: { modelName: 'customerSession' },
      account: { modelName: 'customerAccount' },
      verification: { modelName: 'customerVerification' },
    });
    await expect(drifted.handler(new Request(`${WEB_ORIGIN}/drift/ok`))).rejects.toThrow(
      /Prisma schema mismatch/,
    );
  });
});
