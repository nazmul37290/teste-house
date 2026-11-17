import type { Redis } from 'ioredis';
import { createAdminAuth, type AdminAuth } from './auth/admin-auth';
import { createCustomerAuth, type CustomerAuth } from './auth/customer-auth';
import type { Env } from './config/env';
import { createCourier, type CourierAdapter } from './integrations/courier';
import { createGateways, type Gateways } from './integrations/payments';
import { createLocalStorage } from './integrations/storage/local-storage';
import type { StorageDriver } from './integrations/storage/storage-driver';
import {
  createCourierQueue,
  createEmailQueue,
  createRevalidateQueue,
  type CourierQueue,
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
  /** Courier booking jobs (created on first use). */
  courierQueue: () => CourierQueue;
  /** Uploaded files (UPLOAD_DIR), served at PUBLIC_MEDIA_URL. */
  storage: StorageDriver;
  /** Configured online payment gateways by method code (empty when none are set up). */
  gateways: Gateways;
  /** The courier adapter, or null when none is configured (Steadfast awaits its official docs). */
  courier: CourierAdapter | null;
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
  let courierQ: CourierQueue | undefined;
  const courierQueue = () => (courierQ ??= createCourierQueue(env.REDIS_URL));
  return {
    env,
    prisma,
    redis,
    customerAuth: createCustomerAuth({ env, prisma, redis, emailQueue }),
    adminAuth: createAdminAuth({ env, prisma, redis }),
    emailQueue,
    revalidateQueue,
    courierQueue,
    storage: createLocalStorage(env.UPLOAD_DIR, env.PUBLIC_MEDIA_URL),
    gateways: createGateways(env),
    courier: createCourier(env),
    publicMediaUrl: env.PUBLIC_MEDIA_URL,
    close: async () => {
      await Promise.allSettled([
        prisma.$disconnect(),
        redis.quit(),
        queue?.close(),
        revalidate?.close(),
        courierQ?.close(),
      ]);
    },
  };
}

export function closeDeps(deps: Deps): Promise<void> {
  return deps.close();
}
