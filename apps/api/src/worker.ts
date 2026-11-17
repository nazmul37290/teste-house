import { Worker } from 'bullmq';
import { loadEnv } from './config/env';
import { closeDeps, createDeps } from './deps';
import { createMailTransport } from './integrations/mail';
import { processEmailJob } from './jobs/email.processor';
import {
  BOOK_JOB,
  bullConnection,
  COURIER_QUEUE,
  COURIER_SYNC_EVERY_MS,
  createCourierQueue,
  SYNC_JOB,
  type CourierBookJob,
  createPaymentsQueue,
  EMAIL_QUEUE,
  EXPIRE_JOB,
  MEDIA_CLEANUP_JOB,
  PAYMENT_JOB_EVERY_MS,
  PAYMENTS_QUEUE,
  RECONCILE_JOB,
  REVALIDATE_QUEUE,
  type EmailJob,
  type RevalidateJob,
} from './jobs/queues';
import { processRevalidateJob } from './jobs/revalidate.processor';
import { bookShipment, onBookingFailed, syncShipments } from './services/courier.service';
import { cleanupOrphanReviewPhotos } from './services/media.service';
import { expireUnpaidOrders, reconcilePayments } from './services/payment.service';

/** Background worker: same image as the API, started with `node dist/worker.js`. */
const env = loadEnv();
const deps = createDeps(env);
const mail = createMailTransport(env);

const emailWorker = new Worker<EmailJob>(
  EMAIL_QUEUE,
  (job) => processEmailJob({ prisma: deps.prisma, mail }, job),
  {
    connection: bullConnection(env.REDIS_URL),
    concurrency: 5,
  },
);
emailWorker.on('failed', (job, err) => {
  // Recipient and template only; never the message body or links (they carry tokens).
  console.error(`email.send job ${job?.id} (${job?.data.template}) failed: ${err.message}`);
});

const revalidateWorker = new Worker<RevalidateJob>(
  REVALIDATE_QUEUE,
  (job) => processRevalidateJob(env, job),
  {
    connection: bullConnection(env.REDIS_URL),
    concurrency: 2,
  },
);
revalidateWorker.on('failed', (job, err) => {
  console.error(`cache.revalidate job ${job?.id} failed: ${err.message}`);
});
if (!env.REVALIDATE_SECRET) {
  console.warn(
    'REVALIDATE_SECRET is not set: storefront pages refresh on their timer only (up to 5 minutes).',
  );
}

// Payments: verify open attempts and cancel online orders not paid in time, every 5 minutes.
const paymentsQueue = createPaymentsQueue(env.REDIS_URL);
const paymentsWorker = new Worker(
  PAYMENTS_QUEUE,
  async (job) => {
    if (job.name === RECONCILE_JOB) return { verified: await reconcilePayments(deps) };
    if (job.name === EXPIRE_JOB) return { cancelled: await expireUnpaidOrders(deps) };
    if (job.name === MEDIA_CLEANUP_JOB) return { removed: await cleanupOrphanReviewPhotos(deps) };
    return null;
  },
  { connection: bullConnection(env.REDIS_URL), concurrency: 1 },
);
paymentsWorker.on('failed', (job, err) => {
  console.error(`${job?.name} failed: ${err.message}`);
});
await paymentsQueue.upsertJobScheduler(
  RECONCILE_JOB,
  { every: PAYMENT_JOB_EVERY_MS },
  { name: RECONCILE_JOB },
);
await paymentsQueue.upsertJobScheduler(
  EXPIRE_JOB,
  { every: PAYMENT_JOB_EVERY_MS },
  { name: EXPIRE_JOB },
);
// Hourly, on the same maintenance queue: review photos uploaded but never used.
await paymentsQueue.upsertJobScheduler(
  MEDIA_CLEANUP_JOB,
  { every: 60 * 60_000 },
  { name: MEDIA_CLEANUP_JOB },
);

// Courier: one booking job per order (retried with backoff), and a status sync every 30 minutes.
const courierQueue = createCourierQueue(env.REDIS_URL);
const courierWorker = new Worker(
  COURIER_QUEUE,
  async (job) => {
    if (job.name === BOOK_JOB) {
      const { orderId, adminUserId } = job.data as CourierBookJob;
      return bookShipment(deps, orderId, adminUserId);
    }
    if (job.name === SYNC_JOB) return { changed: await syncShipments(deps) };
    return null;
  },
  { connection: bullConnection(env.REDIS_URL), concurrency: 2 },
);
courierWorker.on('failed', (job, err) => {
  console.error(`${job?.name} ${job?.id} failed: ${err.message}`);
  // Out of retries: tell staff on the order (the order itself is left as it was).
  if (job?.name === BOOK_JOB && job.attemptsMade >= (job.opts.attempts ?? 1)) {
    void onBookingFailed(deps, (job.data as CourierBookJob).orderId, err.message).catch(
      () => undefined,
    );
  }
});
await courierQueue.upsertJobScheduler(
  SYNC_JOB,
  { every: COURIER_SYNC_EVERY_MS },
  { name: SYNC_JOB },
);

console.log(
  `Worker started (${env.NODE_ENV}): ${EMAIL_QUEUE}, ${REVALIDATE_QUEUE}, ${PAYMENTS_QUEUE}, ${COURIER_QUEUE}` +
    (Object.keys(deps.gateways).length ? '' : ' (no payment gateway configured)'),
);

async function shutdown(signal: string) {
  console.log(`${signal} received, closing worker`);
  setTimeout(() => process.exit(1), 10_000).unref();
  await Promise.all([
    emailWorker.close(),
    revalidateWorker.close(),
    paymentsWorker.close(),
    paymentsQueue.close(),
    courierWorker.close(),
    courierQueue.close(),
  ]);
  await closeDeps(deps);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
