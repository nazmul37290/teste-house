import type { Redis } from 'ioredis';
import { createAdminAuth, type AdminAuth } from './auth/admin-auth';
import { createCustomerAuth, type CustomerAuth } from './auth/customer-auth';
import type { Env } from './config/env';
import { createGateways, type Gateways } from './integrations/payments';
import { createLocalStorage } from './integrations/storage/local-storage';
import type { StorageDriver } from './integrations/storage/storage-driver';
import {
  createEmailQueue,
  createRevalidateQueue,
  type EmailQueue,
  type RevalidateQueue,
} from './jobs/queues';
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
  /** Storefront cache refresh jobs (created on first use). */
  revalidateQueue: () => RevalidateQueue;
  /** Uploaded files (UPLOAD_DIR), served at PUBLIC_MEDIA_URL. */
  storage: StorageDriver;
  /** Configured online payment gateways by method code (empty when none are set up). */
  gateways: Gateways;
  publicMediaUrl: string;
  /** Closes every connection this bundle opened. */
  close: () => Promise<void>;
};

export function createDeps(env: Env): Deps {
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  let queue: EmailQueue | undefined;
  const emailQueue = () => (queue ??= createEmailQueue(env.REDIS_URL));
  let revalidate: RevalidateQueue | undefined;
  const revalidateQueue = () => (revalidate ??= createRevalidateQueue(env.REDIS_URL));
  return {
    env,
    prisma,
    redis,
    customerAuth: createCustomerAuth({ env, prisma, redis, emailQueue }),
    adminAuth: createAdminAuth({ env, prisma, redis }),
    emailQueue,
    revalidateQueue,
    storage: createLocalStorage(env.UPLOAD_DIR, env.PUBLIC_MEDIA_URL),
    gateways: createGateways(env),
    publicMediaUrl: env.PUBLIC_MEDIA_URL,
    close: async () => {
      await Promise.allSettled([
        prisma.$disconnect(),
        redis.quit(),
        queue?.close(),
        revalidate?.close(),
      ]);
    },
  };
}

export function closeDeps(deps: Deps): Promise<void> {
  return deps.close();
}
