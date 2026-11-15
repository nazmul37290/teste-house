import type { Redis } from 'ioredis';
import { createAdminAuth, type AdminAuth } from './auth/admin-auth';
import { createCustomerAuth, type CustomerAuth } from './auth/customer-auth';
import type { Env } from './config/env';
import { createEmailQueue, type EmailQueue } from './jobs/queues';
import { createPrisma, type Db } from './lib/prisma';
import { createRedis } from './lib/redis';

/** Everything the app needs at runtime, built once per process and passed down explicitly. */
export type Deps = {
  env: Env;
  prisma: Db;
  redis: Redis;
  customerAuth: CustomerAuth;
  adminAuth: AdminAuth;
  /** Created on first use, so building the app never opens a BullMQ connection. */
  emailQueue: () => EmailQueue;
  /** Closes every connection this bundle opened. */
  close: () => Promise<void>;
};

export function createDeps(env: Env): Deps {
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  let emailQueue: EmailQueue | undefined;
  return {
    env,
    prisma,
    redis,
    customerAuth: createCustomerAuth({ env, prisma, redis }),
    adminAuth: createAdminAuth({ env, prisma, redis }),
    emailQueue: () => (emailQueue ??= createEmailQueue(env.REDIS_URL)),
    close: async () => {
      await Promise.allSettled([prisma.$disconnect(), redis.quit(), emailQueue?.close()]);
    },
  };
}

export function closeDeps(deps: Deps): Promise<void> {
  return deps.close();
}
