import type { Job } from 'bullmq';
import type { MailTransport } from '../integrations/mail';
import type { Db } from '../lib/prisma';
import { markEmailSent, recordEmailError } from '../repositories/notification-log.repository';
import { findSettingValue } from '../repositories/settings.repository';
import { renderEmail, type Brand } from './email-templates';
import type { EmailJob } from './queues';

export type EmailProcessorDeps = { prisma: Db; mail: MailTransport };

/** Fallback only for a missing or empty setting; the real name lives in settings (store.name). */
const STORE_NAME_FALLBACK = 'Our store';

export async function storeBrand(prisma: Db): Promise<Brand> {
  const [name, logo] = await Promise.all([
    findSettingValue(prisma, 'store.name'),
    findSettingValue(prisma, 'store.logo'),
  ]);
  return {
    name: typeof name === 'string' && name.trim() ? name.trim() : STORE_NAME_FALLBACK,
    // Only absolute http(s) URLs are usable in an email client.
    logoUrl: typeof logo === 'string' && /^https?:\/\//.test(logo) ? logo : undefined,
  };
}

/** email.send: render, send, record the outcome in notification_logs. Throws so BullMQ retries. */
export async function processEmailJob(deps: EmailProcessorDeps, job: Job<EmailJob>): Promise<void> {
  const { notificationLogId, template, to, data } = job.data;
  try {
    // The union is keyed by template, so data always matches its template here.
    const rendered = renderEmail(template, data as never, await storeBrand(deps.prisma));
    const { providerMessageId } = await deps.mail.send({ to, ...rendered, tags: [template] });
    await markEmailSent(deps.prisma, notificationLogId, rendered.subject, providerMessageId);
  } catch (err) {
    const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
    await recordEmailError(
      deps.prisma,
      notificationLogId,
      err instanceof Error ? err.message : String(err),
      final,
    );
    throw err;
  }
}
