import { Redis } from 'ioredis';

/**
 * Shared ioredis client (Better Auth secondary storage, rate limits, lockout, cache).
 * lazyConnect: nothing connects until the first command, so building the app never needs Redis.
 */
export function createRedis(url: string): Redis {
  return new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 3 });
}
