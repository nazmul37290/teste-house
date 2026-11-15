import { describe, expect, it } from 'vitest';
import { redactForAudit } from '../src/services/audit.service';

describe('redactForAudit', () => {
  it('replaces secret fields at any depth and keeps the rest', () => {
    const out = redactForAudit({
      name: 'Rina',
      password: 'hunter2',
      nested: { apiKey: 'k', newPassword: 'x', backupCodes: ['a'], token: 't', ok: 1 },
      list: [{ secret: 's', keep: true }],
    });
    expect(out).toEqual({
      name: 'Rina',
      password: '[redacted]',
      nested: {
        apiKey: '[redacted]',
        newPassword: '[redacted]',
        backupCodes: '[redacted]',
        token: '[redacted]',
        ok: 1,
      },
      list: [{ secret: '[redacted]', keep: true }],
    });
  });

  it('stores dates as ISO strings and maps undefined to null', () => {
    expect(redactForAudit({ at: new Date('2026-11-16T00:00:00Z') })).toEqual({
      at: '2026-11-16T00:00:00.000Z',
    });
    expect(redactForAudit(undefined)).toBeNull();
  });
});
