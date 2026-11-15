import type { Redis } from 'ioredis';
import { createAdminAuth, type AdminAuth } from './auth/admin-auth';
import { createCustomerAuth, type CustomerAuth } from './auth/customer-auth';
import type { Env } from './config/env';
import { createPrisma, type Db } from './lib/prisma';
import { createRedis } from './lib/redis';

/** Everything the app needs at runtime, built once per process and passed down explicitly. */
export type Deps = {
  env: Env;
  prisma: Db;
  redis: Redis;
  customerAuth: CustomerAuth;
  adminAuth: AdminAuth;
};

export function createDeps(env: Env): Deps {
  const prisma = createPrisma(env.DATABASE_URL);
  const redis = createRedis(env.REDIS_URL);
  return {
    env,
    prisma,
    redis,
    customerAuth: createCustomerAuth({ env, prisma, redis }),
    adminAuth: createAdminAuth({ env, prisma, redis }),
  };
}

export async function closeDeps(deps: Deps): Promise<void> {
  await Promise.allSettled([deps.prisma.$disconnect(), deps.redis.quit()]);
}
