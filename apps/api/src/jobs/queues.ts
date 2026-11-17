import { Queue, type ConnectionOptions } from 'bullmq';
import { Redis } from 'ioredis';
import type { EmailTemplateName, EmailTemplates } from './email-templates';

export const EMAIL_QUEUE = 'email.send';

export type EmailJob = {
  [K in EmailTemplateName]: {
    notificationLogId: string;
    template: K;
    to: string;
    data: EmailTemplates[K];
  };
}[EmailTemplateName];

export type EmailQueue = Queue<EmailJob>;

/** BullMQ needs its own connection with maxRetriesPerRequest: null (required for workers). */
export function bullConnection(redisUrl: string): ConnectionOptions {
  return new Redis(redisUrl, { maxRetriesPerRequest: null });
}

export const REVALIDATE_QUEUE = 'cache.revalidate';
export type RevalidateJob = { tags: string[] };
export type RevalidateQueue = Queue<RevalidateJob>;

export function createRevalidateQueue(redisUrl: string): RevalidateQueue {
  return new Queue<RevalidateJob>(REVALIDATE_QUEUE, {
    connection: bullConnection(redisUrl),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: true,
      removeOnFail: 1000,
    },
  });
}

export function createEmailQueue(redisUrl: string): EmailQueue {
  return new Queue<EmailJob>(EMAIL_QUEUE, {
    connection: bullConnection(redisUrl),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

/** Scheduled payment upkeep (worker): re-verify open attempts and expire unpaid online orders. */
export const PAYMENTS_QUEUE = 'payments.maintenance';
export const RECONCILE_JOB = 'payment.reconcile';
export const EXPIRE_JOB = 'order.expire-unpaid';
export const PAYMENT_JOB_EVERY_MS = 5 * 60_000;

export function createPaymentsQueue(redisUrl: string): Queue {
  return new Queue(PAYMENTS_QUEUE, {
    connection: bullConnection(redisUrl),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 500 },
  });
}
