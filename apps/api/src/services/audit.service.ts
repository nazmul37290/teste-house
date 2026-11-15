import type { Request } from 'express';
import type { Env } from '../config/env';
import { Prisma } from '../generated/prisma/client';
import { clientIp } from '../lib/client-ip';
import type { Db } from '../lib/prisma';

/** Field names that never reach the audit log, at any depth. */
const SECRET_FIELD = /pass(word)?|secret|token|hash|backup.?codes?|api.?key/i;

/** Deep copy with secret fields replaced, dates as ISO strings; safe to store as JSON. */
export function redactForAudit(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((v) => redactForAudit(v));
  if (typeof value === 'object') {
    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, v] of Object.entries(value))
      out[key] = SECRET_FIELD.test(key) ? '[redacted]' : redactForAudit(v);
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value as Prisma.InputJsonValue;
}

export type AuditEntry = {
  action: string; // module.verb, e.g. role.update, admin_user.deactivate
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
};

/**
 * Records one admin write (who, what, before and after; docs/design.md section 12). Call it from
 * services after the change succeeds, inside the same transaction when there is one.
 */
export async function recordAudit(
  prisma: Db | Prisma.TransactionClient,
  actor: { adminUserId: string | null; ipAddress?: string | null },
  entry: AuditEntry,
): Promise<void> {
  const json = (v: unknown) => {
    const redacted = redactForAudit(v);
    return redacted === null ? Prisma.DbNull : redacted;
  };
  await prisma.auditLog.create({
    data: {
      adminUserId: actor.adminUserId,
      ipAddress: actor.ipAddress ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      before: json(entry.before),
      after: json(entry.after),
    },
  });
}

export type Actor = {
  adminUserId: string;
  ipAddress: string;
  isSuperAdmin: boolean;
  permissions: readonly string[];
};

/** The acting admin, as services need it (from req.admin, set by requireAdmin). */
export function actorFrom(req: Request, env: Pick<Env, 'NODE_ENV'>): Actor {
  if (!req.admin) throw new Error('actorFrom() needs requireAdmin before it');
  return {
    adminUserId: req.admin.id,
    ipAddress: clientIp(req, env),
    isSuperAdmin: req.admin.role.isSystem,
    permissions: req.admin.permissions,
  };
}
