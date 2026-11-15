import type { Job } from 'bullmq';
import request from 'supertest';
import { afterAll, describe, expect, it } from 'vitest';
import { createSmtpTransport } from '../../src/integrations/mail/smtp-transport';
import type { MailTransport } from '../../src/integrations/mail';
import { processEmailJob } from '../../src/jobs/email.processor';
import type { EmailJob } from '../../src/jobs/queues';
import { enqueueEmail } from '../../src/services/email.service';
import { createTestContext } from './helpers';
import { TEST_MAILPIT_URL, TEST_SMTP } from './test-env';

const ctx = createTestContext();
afterAll(() => ctx.close());

const unique = () => `mail${Date.now()}${Math.floor(Math.random() * 1000)}@example.com`;

/** The processor only reads data, attemptsMade and opts.attempts. */
function jobFor(data: EmailJob, attemptsMade = 0): Job<EmailJob> {
  return { data, attemptsMade, opts: { attempts: 5 } } as unknown as Job<EmailJob>;
}

async function queued(to: string) {
  const result = await enqueueEmail(ctx.deps, {
    template: 'email-verify',
    to,
    data: { name: 'Karim', url: 'http://localhost:3000/verify?t=abc' },
  });
  if (!result.queued) throw new Error('expected the email to be queued');
  const job = await ctx.deps.emailQueue().getJob(result.notificationLogId);
  return { logId: result.notificationLogId, job };
}

describe('email.send', () => {
  it('enqueue writes a QUEUED log and a job keyed by the log id', async () => {
    const to = unique();
    const { logId, job } = await queued(to.toUpperCase());
    const log = await ctx.deps.prisma.notificationLog.findUniqueOrThrow({ where: { id: logId } });
    expect(log).toMatchObject({
      status: 'QUEUED',
      template: 'email-verify',
      recipient: to,
      channel: 'EMAIL',
    });
    expect(job?.data).toMatchObject({ notificationLogId: logId, template: 'email-verify', to });
    expect(job?.opts.attempts).toBe(5);
  });

  it('never queues or logs placeholder addresses', async () => {
    const to = '01712345678@phone.invalid';
    const before = await ctx.deps.prisma.notificationLog.count({ where: { recipient: to } });
    const result = await enqueueEmail(ctx.deps, {
      template: 'password-reset',
      to,
      data: { name: 'X', url: 'u' },
    });
    expect(result).toEqual({ queued: false, reason: 'PLACEHOLDER_EMAIL' });
    expect(await ctx.deps.prisma.notificationLog.count({ where: { recipient: to } })).toBe(before);
  });

  it('sends over SMTP (Mailpit), marks the log SENT and uses the store name setting', async () => {
    const to = unique();
    const { logId, job } = await queued(to);
    const mail = createSmtpTransport({ ...TEST_SMTP, from: 'Shop <no-reply@localhost>' });
    await processEmailJob({ prisma: ctx.deps.prisma, mail }, jobFor(job!.data));

    const log = await ctx.deps.prisma.notificationLog.findUniqueOrThrow({ where: { id: logId } });
    expect(log.status).toBe('SENT');
    expect(log.providerMessageId).toBeTruthy();
    const storeName = (
      await ctx.deps.prisma.setting.findUniqueOrThrow({ where: { key: 'store.name' } })
    ).value;
    expect(log.subject).toBe(`Verify your email for ${String(storeName)}`);

    const res = await fetch(
      `${TEST_MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
    );
    const found = (await res.json()) as { messages: { Subject: string }[] };
    expect(found.messages.map((m) => m.Subject)).toContain(log.subject);
  });

  it('records errors, keeps QUEUED while retries remain and marks FAILED on the last attempt', async () => {
    const failing: MailTransport = { send: async () => Promise.reject(new Error('smtp down')) };
    const { logId, job } = await queued(unique());

    await expect(
      processEmailJob({ prisma: ctx.deps.prisma, mail: failing }, jobFor(job!.data, 0)),
    ).rejects.toThrow('smtp down');
    expect(
      await ctx.deps.prisma.notificationLog.findUniqueOrThrow({ where: { id: logId } }),
    ).toMatchObject({ status: 'QUEUED', error: 'smtp down' });

    await expect(
      processEmailJob({ prisma: ctx.deps.prisma, mail: failing }, jobFor(job!.data, 4)),
    ).rejects.toThrow();
    expect(
      (await ctx.deps.prisma.notificationLog.findUniqueOrThrow({ where: { id: logId } })).status,
    ).toBe('FAILED');
  });
});

describe('GET /health/ready', () => {
  it('is 200 against the real Postgres and Redis', async () => {
    const res = await request(ctx.app).get('/health/ready');
    expect(res.status).toBe(200);
    expect(res.body.data.checks).toEqual({ database: 'ok', redis: 'ok' });
  });
});
