import { redisStorage } from '@better-auth/redis-storage';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { BetterAuthOptions } from 'better-auth';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import type { Db } from '../lib/prisma';

export type AuthDeps = { env: Env; prisma: Db; redis: Redis };

export const DAY = 60 * 60 * 24;

/** Session settings shared by both instances; each adds its own expiresIn. */
export const sessionDefaults = {
  updateAge: DAY,
  // With secondary storage Better Auth keeps sessions in Redis only by default; keep them in Postgres too.
  storeSessionInDatabase: true,
  cookieCache: { enabled: true, maxAge: 300 },
} satisfies BetterAuthOptions['session'];

/** Options shared by customerAuth and adminAuth (docs/auth.md section 2, "Common options"). */
export function commonAuthOptions({ env, prisma, redis }: AuthDeps, keyPrefix: string) {
  return {
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: env.CORS_ORIGINS,
    secondaryStorage: redisStorage({ client: redis, keyPrefix }),
    verification: { storeInDatabase: true },
    rateLimit: {
      enabled: env.NODE_ENV !== 'test',
      storage: 'secondary-storage',
      window: 60,
      max: 100,
    },
    telemetry: { enabled: false },
    advanced: {
      database: { generateId: 'uuid' },
      useSecureCookies: env.NODE_ENV === 'production',
      // In production the proxy in front sets this header (CLIENT_IP_HEADER, docs/auth.md section 6).
      ...(env.NODE_ENV === 'production'
        ? { ipAddress: { ipAddressHeaders: [env.CLIENT_IP_HEADER] } }
        : {}),
    },
  } satisfies Partial<BetterAuthOptions>;
}
