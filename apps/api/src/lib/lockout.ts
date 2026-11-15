import type { Redis } from 'ioredis';

/**
 * Lockout for our own /auth/login and /auth/register (docs/auth.md section 6). Better Auth does not
 * rate limit server-side auth.api calls, so these endpoints count failures in Redis themselves.
 * A required wait is answered with 429 + Retry-After instead of sleeping, so nobody can hold
 * connections open.
 */
export type LockoutPolicy = {
  /** Failures allowed before any wait is required. */
  freeAttempts: number;
  /** Wait after the first failure beyond freeAttempts; doubles per further failure. 0 = no delays. */
  baseDelaySec: number;
  maxDelaySec: number;
  /** Failures at which the key is locked for the rest of the window. */
  lockAt: number;
  windowSec: number;
};

export const POLICIES = {
  // Per normalized email or phone.
  loginIdentifier: {
    freeAttempts: 3,
    baseDelaySec: 1,
    maxDelaySec: 60,
    lockAt: 10,
    windowSec: 15 * 60,
  },
  // Per IP. Loose on purpose: mobile carriers put many customers behind one IP (CGNAT).
  loginIp: { freeAttempts: 50, baseDelaySec: 0, maxDelaySec: 0, lockAt: 50, windowSec: 15 * 60 },
  // Per IP, every attempt counts (success or not).
  registerIp: { freeAttempts: 10, baseDelaySec: 0, maxDelaySec: 0, lockAt: 10, windowSec: 60 * 60 },
} satisfies Record<string, LockoutPolicy>;

export type LockoutState = { failures: number; lastFailureMs: number };
export type LockoutDecision = { allowed: true } | { allowed: false; retryAfterSec: number };

/** Pure rule: may another attempt be made now, and if not, how long to wait. */
export function decide(
  policy: LockoutPolicy,
  state: LockoutState | null,
  nowMs: number,
  windowEndsMs: number,
): LockoutDecision {
  if (!state || state.failures < policy.freeAttempts) return { allowed: true };
  if (state.failures >= policy.lockAt) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((windowEndsMs - nowMs) / 1000)) };
  }
  if (policy.baseDelaySec <= 0) return { allowed: true };
  const delaySec = Math.min(
    policy.maxDelaySec,
    policy.baseDelaySec * 2 ** (state.failures - policy.freeAttempts),
  );
  const waitMs = state.lastFailureMs + delaySec * 1000 - nowMs;
  return waitMs > 0
    ? { allowed: false, retryAfterSec: Math.ceil(waitMs / 1000) }
    : { allowed: true };
}

export class Lockout {
  constructor(
    private readonly redis: Redis,
    private readonly name: keyof typeof POLICIES,
    private readonly now: () => number = Date.now,
  ) {}

  private get policy(): LockoutPolicy {
    return POLICIES[this.name];
  }

  private key(subject: string): string {
    return `lockout:${this.name}:${subject}`;
  }

  async check(subject: string): Promise<LockoutDecision> {
    const key = this.key(subject);
    const [raw, ttlMs] = await Promise.all([this.redis.hgetall(key), this.redis.pttl(key)]);
    const state = raw.n ? { failures: Number(raw.n), lastFailureMs: Number(raw.last) } : null;
    const now = this.now();
    return decide(this.policy, state, now, now + Math.max(ttlMs, 0));
  }

  /** Counts one failure. The window starts at the first failure and is not extended by later ones. */
  async fail(subject: string): Promise<void> {
    const key = this.key(subject);
    await this.redis
      .multi()
      .hincrby(key, 'n', 1)
      .hset(key, 'last', String(this.now()))
      .expire(key, this.policy.windowSec, 'NX')
      .exec();
  }

  async reset(subject: string): Promise<void> {
    await this.redis.del(this.key(subject));
  }
}
