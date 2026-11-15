import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { linkGuestOrders } from '../../src/services/guest-linking.service';
import {
  cookiesFrom,
  createTestContext,
  ourRouteHeaders,
  uniquePhone,
  WEB_ORIGIN,
} from './helpers';

// Guest orders link to an account only after the matching email is verified (CLAUDE.md hard rule).
const ctx = createTestContext();
afterAll(() => ctx.close());

const { prisma } = ctx.deps;
const password = 'Correct-Horse-9';
const uniqueEmail = () => `guest${Date.now()}${Math.floor(Math.random() * 1e6)}@example.com`;

/** Minimal guest order (totals satisfy chk_order_amounts). */
async function guestOrder(contact: { email?: string | null; phone: string; customerId?: string }) {
  const cod = await prisma.paymentMethod.findUniqueOrThrow({ where: { code: 'COD' } });
  return prisma.order.create({
    data: {
      orderNumber: `TEST-${randomUUID()}`,
      idempotencyKey: randomUUID(),
      customerId: contact.customerId ?? null,
      contactName: 'Guest',
      contactPhone: contact.phone,
      contactEmail: contact.email ?? null,
      paymentMethodId: cod.id,
      subtotal: '100.00',
      grandTotal: '100.00',
    },
  });
}

const ownerOf = async (orderId: string) =>
  (await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).customerId;

/** The verification link the customer would receive: read from the queued email job. */
async function verificationLinkFor(to: string): Promise<string> {
  let logId: string | undefined;
  await expect
    .poll(async () => {
      const log = await prisma.notificationLog.findFirst({
        where: { recipient: to, template: 'email-verify' },
        orderBy: { createdAt: 'desc' },
      });
      logId = log?.id;
      return logId;
    })
    .toBeTruthy();
  const job = await ctx.deps.emailQueue().getJob(logId!);
  const url = new URL((job!.data.data as { url: string }).url);
  return `${url.pathname}${url.search}`;
}

async function register(body: Record<string, unknown>) {
  const res = await request(ctx.app)
    .post('/api/v1/auth/register')
    .set(ourRouteHeaders())
    .send({ name: 'Linker', password, ...body });
  expect(res.status).toBe(201);
  return { id: res.body.data.customer.id as string, cookie: cookiesFrom(res) };
}

describe('guest-order linking', () => {
  it('links only after the email is verified, only by email, and leaves other orders alone', async () => {
    const email = uniqueEmail();
    const phone = uniquePhone();
    const byEmail = await guestOrder({ email, phone: uniquePhone() });
    const byPhoneOnly = await guestOrder({ email: uniqueEmail(), phone });
    const noEmailSamePhone = await guestOrder({ email: null, phone });
    const other = await register({ phone: uniquePhone(), email: uniqueEmail() });
    const alreadyOwned = await guestOrder({ email, phone: uniquePhone(), customerId: other.id });

    const customer = await register({ phone, email });
    // Registering (even with a matching phone and email) links nothing.
    expect(await ownerOf(byEmail.id)).toBeNull();
    expect(await ownerOf(byPhoneOnly.id)).toBeNull();

    const verify = await request(ctx.app).get(await verificationLinkFor(email));
    expect(verify.status).toBe(302);
    expect(verify.headers.location).toBe('/email-verified');
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).emailVerified,
    ).toBe(true);

    expect(await ownerOf(byEmail.id)).toBe(customer.id);
    expect(await ownerOf(byPhoneOnly.id)).toBeNull(); // never by phone
    expect(await ownerOf(noEmailSamePhone.id)).toBeNull();
    expect(await ownerOf(alreadyOwned.id)).toBe(other.id); // already linked orders never move
  });

  it('is idempotent', async () => {
    const email = uniqueEmail();
    const customer = await register({ phone: uniquePhone(), email });
    await guestOrder({ email, phone: uniquePhone() });
    await request(ctx.app).get(await verificationLinkFor(email));
    const verified = { id: customer.id, email, emailVerified: true };
    expect(await linkGuestOrders(prisma, verified)).toBe(0);
    expect(await prisma.order.count({ where: { customerId: customer.id } })).toBe(1);
  });

  it('never links for unverified or placeholder emails', async () => {
    const email = uniqueEmail();
    const order = await guestOrder({ email, phone: uniquePhone() });
    const { id } = await register({ phone: uniquePhone(), email: uniqueEmail() });
    expect(await linkGuestOrders(prisma, { id, email, emailVerified: false })).toBe(0);
    const placeholder = `${uniquePhone()}@phone.invalid`;
    await guestOrder({ email: placeholder, phone: uniquePhone() });
    expect(await linkGuestOrders(prisma, { id, email: placeholder, emailVerified: true })).toBe(0);
    expect(await ownerOf(order.id)).toBeNull();
  });

  it('links after a phone-only customer adds and verifies a real email', async () => {
    const phone = uniquePhone();
    const email = uniqueEmail();
    const order = await guestOrder({ email, phone: uniquePhone() });
    const customer = await register({ phone });

    const change = await request(ctx.app)
      .post('/api/v1/auth/change-email')
      .set({ Origin: WEB_ORIGIN, Cookie: customer.cookie })
      .send({ newEmail: email, callbackURL: '/email-verified' });
    expect(change.status).toBe(200);
    // Swapped at once but unverified: nothing links yet.
    const pending = await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(pending).toMatchObject({ email, emailVerified: false });
    expect(await ownerOf(order.id)).toBeNull();

    await request(ctx.app).get(await verificationLinkFor(email));
    expect(
      (await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).emailVerified,
    ).toBe(true);
    expect(await ownerOf(order.id)).toBe(customer.id);
  });

  it('links orders for the new address after a verified customer changes email', async () => {
    const oldEmail = uniqueEmail();
    const newEmail = uniqueEmail();
    const customer = await register({ phone: uniquePhone(), email: oldEmail });
    await request(ctx.app).get(await verificationLinkFor(oldEmail));
    const order = await guestOrder({ email: newEmail, phone: uniquePhone() });

    const login = await request(ctx.app)
      .post('/api/v1/auth/login')
      .set(ourRouteHeaders())
      .send({ identifier: oldEmail, password });
    const change = await request(ctx.app)
      .post('/api/v1/auth/change-email')
      .set({ Origin: WEB_ORIGIN, Cookie: cookiesFrom(login) })
      .send({ newEmail, callbackURL: '/email-verified' });
    expect(change.status).toBe(200);
    // Still the old address until the link at the new one is clicked.
    expect((await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).email).toBe(
      oldEmail,
    );
    expect(await ownerOf(order.id)).toBeNull();

    await request(ctx.app).get(await verificationLinkFor(newEmail));
    expect(await prisma.customer.findUniqueOrThrow({ where: { id: customer.id } })).toMatchObject({
      email: newEmail,
      emailVerified: true,
    });
    expect(await ownerOf(order.id)).toBe(customer.id);
  });
});
