import type { Db } from '../lib/prisma';

export function createQueuedEmailLog(
  prisma: Db,
  input: { template: string; recipient: string; orderId?: string },
) {
  return prisma.notificationLog.create({
    data: {
      channel: 'EMAIL',
      status: 'QUEUED',
      template: input.template,
      recipient: input.recipient,
      orderId: input.orderId,
    },
    select: { id: true },
  });
}

export function markEmailSent(prisma: Db, id: string, subject: string, providerMessageId?: string) {
  return prisma.notificationLog.update({
    where: { id },
    data: { status: 'SENT', subject, providerMessageId, error: null },
  });
}

/** Records the latest error; the status becomes FAILED only once retries are exhausted. */
export function recordEmailError(prisma: Db, id: string, error: string, final: boolean) {
  return prisma.notificationLog.update({
    where: { id },
    data: { error: error.slice(0, 1000), ...(final ? { status: 'FAILED' as const } : {}) },
  });
}
