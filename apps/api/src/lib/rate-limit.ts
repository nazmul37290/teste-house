import type { Redis } from 'ioredis';
import { rateLimited } from './errors';

/**
 * Fixed-window rate limit in Redis (for public endpoints such as search suggestions). Throws
 * 429 RATE_LIMITED with Retry-After when the window is used up.
 */
export async function enforceRateLimit(
  redis: Redis,
  key: string,
  limit: number,
  windowSec: number,
): Promise<void> {
  const fullKey = `ratelimit:${key}`;
  const [[, count], [, ttl]] = (await redis.multi().incr(fullKey).ttl(fullKey).exec()) as [
    [null, number],
    [null, number],
  ];
  if (ttl < 0) await redis.expire(fullKey, windowSec);
  if (count > limit) throw rateLimited(ttl > 0 ? ttl : windowSec);
}
