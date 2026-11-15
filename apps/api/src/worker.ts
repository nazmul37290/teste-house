import { Worker } from 'bullmq';
import { loadEnv } from './config/env';
import { closeDeps, createDeps } from './deps';
import { createMailTransport } from './integrations/mail';
import { processEmailJob } from './jobs/email.processor';
import { bullConnection, EMAIL_QUEUE, type EmailJob } from './jobs/queues';

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
console.log(`Worker started (${env.NODE_ENV}): ${EMAIL_QUEUE}`);

async function shutdown(signal: string) {
  console.log(`${signal} received, closing worker`);
  setTimeout(() => process.exit(1), 10_000).unref();
  await emailWorker.close();
  await closeDeps(deps);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
