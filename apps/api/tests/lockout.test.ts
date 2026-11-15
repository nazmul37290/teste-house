import { describe, expect, it } from 'vitest';
import { decide, POLICIES, type LockoutPolicy } from '../src/lib/lockout';

const policy: LockoutPolicy = POLICIES.loginIdentifier; // 3 free, 1 s doubling to 60 s, lock at 10, 15 min
const now = 1_000_000;
const windowEnd = now + 10 * 60_000;
const state = (failures: number, secondsAgo = 0) => ({
  failures,
  lastFailureMs: now - secondsAgo * 1000,
});

describe('lockout decide()', () => {
  it('allows the first attempts freely', () => {
    expect(decide(policy, null, now, windowEnd)).toEqual({ allowed: true });
    expect(decide(policy, state(2), now, windowEnd)).toEqual({ allowed: true });
  });

  it('requires a doubling wait after the free attempts', () => {
    expect(decide(policy, state(3), now, windowEnd)).toEqual({ allowed: false, retryAfterSec: 1 });
    expect(decide(policy, state(4), now, windowEnd)).toEqual({ allowed: false, retryAfterSec: 2 });
    expect(decide(policy, state(6), now, windowEnd)).toEqual({ allowed: false, retryAfterSec: 8 });
  });

  it('allows the next attempt once the wait has passed', () => {
    expect(decide(policy, state(4, 2), now, windowEnd)).toEqual({ allowed: true });
    expect(decide(policy, state(4, 1), now, windowEnd)).toEqual({
      allowed: false,
      retryAfterSec: 1,
    });
  });

  it('caps the wait at maxDelaySec', () => {
    const steep = { ...policy, lockAt: 100 };
    expect(decide(steep, state(20), now, windowEnd)).toEqual({ allowed: false, retryAfterSec: 60 });
  });

  it('locks until the window ends at lockAt failures', () => {
    expect(decide(policy, state(10, 3600), now, windowEnd)).toEqual({
      allowed: false,
      retryAfterSec: 600,
    });
  });

  it('policies without delays only lock', () => {
    const ip = POLICIES.loginIp;
    expect(decide(ip, state(ip.lockAt - 1), now, windowEnd)).toEqual({ allowed: true });
    expect(decide(ip, state(ip.lockAt), now, windowEnd).allowed).toBe(false);
  });
});
