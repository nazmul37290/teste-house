import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { INVALID_CREDENTIALS } from '../../src/services/customer-auth.service';
import {
  cookiesFrom,
  createTestContext,
  freshIp,
  ourRouteHeaders,
  uniquePhone,
  WEB_ORIGIN,
} from './helpers';

const ctx = createTestContext();
afterAll(() => ctx.close());

const password = 'Correct-Horse-9';
const uniqueEmail = () => `cust${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

function register(body: Record<string, unknown>, headers = ourRouteHeaders()) {
  return request(ctx.app).post('/api/v1/auth/register').set(headers).send(body);
}
function login(identifier: string, pw = password, headers = ourRouteHeaders()) {
  return request(ctx.app)
    .post('/api/v1/auth/login')
    .set(headers)
    .send({ identifier, password: pw });
}

describe('POST /api/v1/auth/register', () => {
  it('creates a customer with a real email, signs them in and queues the verification email', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const res = await register({
      name: 'Rahima Khatun',
      phone,
      email: email.toUpperCase(),
      password,
    });

    expect(res.status).toBe(201);
    expect(res.body.data.customer).toMatchObject({
      name: 'Rahima Khatun',
      phone,
      email,
      emailVerified: false,
    });
    expect(cookiesFrom(res)).toContain('shop_c.session_token=');

    const session = await request(ctx.app)
      .get('/api/v1/auth/get-session')
      .set('Cookie', cookiesFrom(res));
    expect(session.body.user.email).toBe(email);
    // sendVerificationEmail only enqueues, without awaiting: allow it a moment.
    await expect
      .poll(() =>
        ctx.deps.prisma.notificationLog.count({
          where: { recipient: email, template: 'email-verify' },
        }),
      )
      .toBe(1);
  });

  it('normalizes the phone before saving', async () => {
    const local = uniquePhone(); // 013XXXXXXXX
    const res = await register({
      name: 'Karim',
      phone: `+880 ${local.slice(1, 5)}-${local.slice(5)}`,
      password,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.phone).toBe(local);
  });

  it('gives phone-only customers a placeholder email that is never shown or mailed', async () => {
    const phone = uniquePhone();
    const res = await register({ name: 'Phone Only', phone, password });
    expect(res.status).toBe(201);
    expect(res.body.data.customer.email).toBeNull();

    const stored = await ctx.deps.prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(stored.email).toBe(`${phone}@phone.invalid`);
    expect(stored.emailVerified).toBe(false);
    await new Promise((r) => setTimeout(r, 200));
    expect(
      await ctx.deps.prisma.notificationLog.count({ where: { recipient: stored.email } }),
    ).toBe(0);
  });

  it('rejects a duplicate phone or email with 409', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    expect((await register({ name: 'First', phone, email, password })).status).toBe(201);

    const samePhone = await register({ name: 'Second', phone, email: uniqueEmail(), password });
    expect(samePhone.status).toBe(409);
    expect(samePhone.body.error.code).toBe('CONFLICT');
    expect((await register({ name: 'Third', phone: uniquePhone(), email, password })).status).toBe(
      409,
    );
  });

  it('validates input strictly', async () => {
    const bad = await register({ name: 'X Y', phone: '12345', password });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].path).toBe('phone');
    const extra = await register({
      name: 'X Y',
      phone: uniquePhone(),
      password,
      emailVerified: true,
    });
    expect(extra.status).toBe(400);
    const short = await register({ name: 'X Y', phone: uniquePhone(), password: 'short' });
    expect(short.status).toBe(400);
  });

  it('requires the X-Requested-With header', async () => {
    const res = await register(
      { name: 'No Header', phone: uniquePhone(), password },
      { Origin: WEB_ORIGIN, 'X-Forwarded-For': freshIp() },
    );
    expect(res.status).toBe(403);
  });

  it('limits registrations per IP with 429 and Retry-After', async () => {
    const ip = freshIp();
    for (let i = 0; i < 10; i++) {
      expect(
        (await register({ name: 'Bulk', phone: uniquePhone(), password }, ourRouteHeaders(ip)))
          .status,
      ).toBe(201);
    }
    const blocked = await register(
      { name: 'Bulk', phone: uniquePhone(), password },
      ourRouteHeaders(ip),
    );
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });
});

describe('POST /api/v1/auth/login', () => {
  async function customer() {
    const email = uniqueEmail();
    const phone = uniquePhone();
    await register({ name: 'Login Test', phone, email, password });
    return { email, phone };
  }

  it('logs in by email or by phone in any common format, and records lastLoginAt', async () => {
    const { email, phone } = await customer();
    const byEmail = await login(email.toUpperCase());
    expect(byEmail.status).toBe(200);
    expect(cookiesFrom(byEmail)).toContain('shop_c.session_token=');

    const byPhone = await login(`+88${phone}`);
    expect(byPhone.status).toBe(200);
    expect(byPhone.body.data.customer.email).toBe(email);

    const session = await request(ctx.app)
      .get('/api/v1/auth/get-session')
      .set('Cookie', cookiesFrom(byPhone));
    expect(session.body.user.phone).toBe(phone);
    const stored = await ctx.deps.prisma.customer.findUniqueOrThrow({ where: { phone } });
    expect(stored.lastLoginAt).toBeInstanceOf(Date);
  });

  it('lets phone-only customers log in by phone', async () => {
    const phone = uniquePhone();
    await register({ name: 'Phone Only', phone, password });
    expect((await login(phone)).status).toBe(200);
    // ...but never with the internal placeholder address.
    expect((await login(`${phone}@phone.invalid`)).status).toBe(401);
  });

  it('returns the same 401 for a wrong password, an unknown user and a malformed identifier', async () => {
    const { email } = await customer();
    for (const res of [
      await login(email, 'Wrong-Password-1'),
      await login(uniqueEmail()),
      await login('not-an-identifier'),
    ]) {
      expect(res.status).toBe(401);
      expect(res.body.error).toEqual({ code: 'UNAUTHENTICATED', message: INVALID_CREDENTIALS });
      expect(cookiesFrom(res)).toBe('');
    }
  });

  it('rejects blocked customers with the same 401, on every path that creates a session', async () => {
    const { email } = await customer();
    await ctx.deps.prisma.customer.update({ where: { email }, data: { status: 'BLOCKED' } });
    const res = await login(email);
    expect(res.status).toBe(401);
    expect(res.body.error.message).toBe(INVALID_CREDENTIALS);
    // Defence in depth: the session hook refuses even a direct server-side sign-in.
    await expect(
      ctx.deps.customerAuth.api.signInEmail({ body: { email, password } }),
    ).rejects.toThrow();
  });

  it('slows down repeated failures per identifier (429 with Retry-After), then a success resets it', async () => {
    const { email } = await customer();
    for (let i = 0; i < 3; i++) expect((await login(email, 'Wrong-Password-1')).status).toBe(401);
    const slowed = await login(email);
    expect(slowed.status).toBe(429);
    expect(Number(slowed.headers['retry-after'])).toBeGreaterThanOrEqual(1);

    await new Promise((r) => setTimeout(r, 1100));
    expect((await login(email)).status).toBe(200);
    // Counter was reset by the success: the next failures start over.
    expect((await login(email, 'Wrong-Password-1')).status).toBe(401);
    expect((await login(email)).status).toBe(200);
  });

  it("closes Better Auth's own HTTP sign-in for customers (it would bypass the lockout)", async () => {
    const { email } = await customer();
    const res = await request(ctx.app)
      .post('/api/v1/auth/sign-in/email')
      .set('Origin', WEB_ORIGIN)
      .send({ email, password });
    expect(res.status).toBe(404);
  });
});
