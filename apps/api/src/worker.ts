import { Worker } from 'bullmq';
import { loadEnv } from './config/env';
import { closeDeps, createDeps } from './deps';
import { createMailTransport } from './integrations/mail';
import { processEmailJob } from './jobs/email.processor';
import {
  bullConnection,
  createPaymentsQueue,
  EMAIL_QUEUE,
  EXPIRE_JOB,
  PAYMENT_JOB_EVERY_MS,
  PAYMENTS_QUEUE,
  RECONCILE_JOB,
  REVALIDATE_QUEUE,
  type EmailJob,
  type RevalidateJob,
} from './jobs/queues';
import { processRevalidateJob } from './jobs/revalidate.processor';
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

console.log(
  `Worker started (${env.NODE_ENV}): ${EMAIL_QUEUE}, ${REVALIDATE_QUEUE}, ${PAYMENTS_QUEUE}` +
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
  ]);
  await closeDeps(deps);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
