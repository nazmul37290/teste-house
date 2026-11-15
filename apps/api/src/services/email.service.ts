import { isPlaceholderEmail } from '@shop/shared';
import type { EmailTemplateName, EmailTemplates } from '../jobs/email-templates';
import type { EmailJob, EmailQueue } from '../jobs/queues';
import type { Db } from '../lib/prisma';
import { createQueuedEmailLog } from '../repositories/notification-log.repository';

export type EmailServiceDeps = { prisma: Db; emailQueue: () => EmailQueue };

export type EnqueueResult =
  { queued: true; notificationLogId: string } | { queued: false; reason: 'PLACEHOLDER_EMAIL' };

/**
 * Records a QUEUED notification log and adds the email.send job. It only enqueues; the worker sends.
 * Placeholder (@phone.invalid) addresses are never mailed.
 */
export async function enqueueEmail<K extends EmailTemplateName>(
  deps: EmailServiceDeps,
  input: { template: K; to: string; data: EmailTemplates[K]; orderId?: string },
): Promise<EnqueueResult> {
  if (isPlaceholderEmail(input.to)) return { queued: false, reason: 'PLACEHOLDER_EMAIL' };
  const to = input.to.trim().toLowerCase();
  const log = await createQueuedEmailLog(deps.prisma, {
    template: input.template,
    recipient: to,
    orderId: input.orderId,
  });
  const job = {
    notificationLogId: log.id,
    template: input.template,
    to,
    data: input.data,
  } as EmailJob;
  // jobId = log id: a retried enqueue for the same log never sends twice.
  await deps.emailQueue().add(input.template, job, { jobId: log.id });
  return { queued: true, notificationLogId: log.id };
}
