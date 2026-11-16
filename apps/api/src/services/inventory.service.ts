import type { AdjustStockInput, ReceiveStockInput } from '@shop/shared';
import type { Redis } from 'ioredis';
import type { Env } from '../config/env';
import type { EmailQueue } from '../jobs/queues';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prisma-errors';
import * as repo from '../repositories/inventory.repository';
import { findSettingValue } from '../repositories/settings.repository';
import { recordAudit, type Actor } from './audit.service';
import { enqueueEmail } from './email.service';
import { businessRule } from './role.service';
import { notFound } from './taxonomy-common';

export type InventoryDeps = {
  prisma: Db;
  redis: Redis;
  emailQueue: () => EmailQueue;
  env: Pick<Env, 'APP_URL'>;
};

/** One low-stock email per variant per day; cleared once stock is back above the alert level. */
const ALERT_TTL_SEC = 24 * 60 * 60;
const alertKey = (variantId: string) => `lowstock:alerted:${variantId}`;

/**
 * Called after any stock change has committed (adjustments now; sales in Phase 6). Emails
 * notifications.adminEmail when the variant is at or below its alert level, at most once a day.
 */
export async function checkLowStock(
  deps: InventoryDeps,
  variantId: string,
): Promise<'sent' | 'skipped' | 'ok'> {
  const v = await repo.findVariantForStock(deps.prisma, variantId);
  if (!v) return 'ok';
  if (v.stockQty > v.lowStockThreshold) {
    await deps.redis.del(alertKey(variantId));
    return 'ok';
  }
  const to = await findSettingValue(deps.prisma, 'notifications.adminEmail');
  if (typeof to !== 'string' || !to.trim()) return 'skipped';
  // SET NX: only the first change that crosses the line in a day sends the email.
  if ((await deps.redis.set(alertKey(variantId), '1', 'EX', ALERT_TTL_SEC, 'NX')) !== 'OK')
    return 'skipped';
  await enqueueEmail(deps, {
    template: 'admin-low-stock',
    to,
    data: {
      productName: v.product.name,
      variantName: v.name,
      sku: v.sku,
      stockQty: v.stockQty,
      threshold: v.lowStockThreshold,
      url: `${deps.env.APP_URL.replace(/\/+$/, '')}/admin/inventory?q=${encodeURIComponent(v.sku)}`,
    },
  });
  return 'sent';
}

/** The low-stock check must never fail the stock change that already committed. */
async function afterChange(deps: InventoryDeps, variantId: string) {
  await checkLowStock(deps, variantId).catch((err: unknown) => {
    console.error(
      `Low-stock check failed for ${variantId}: ${err instanceof Error ? err.message : String(err)}`,
    );
  });
}

/**
 * Manual adjustment with a reason: an ADJUSTMENT movement with the exact balance, in one
 * transaction with the stock change. Never below zero.
 */
export async function adjustStock(deps: InventoryDeps, actor: Actor, input: AdjustStockInput) {
  const variant = await repo.findVariantForStock(deps.prisma, input.variantId);
  if (!variant) throw notFound('Variant');

  const balanceAfter = await deps.prisma.$transaction(async (tx) => {
    const balance = await repo.changeStock(tx, input.variantId, input.quantity);
    if (balance === null) {
      throw businessRule(
        'INSUFFICIENT_STOCK',
        `Only ${variant.stockQty} in stock; you cannot remove ${-input.quantity}`,
      );
    }
    if (
      input.batchId &&
      !(await repo.changeBatchRemaining(tx, input.batchId, input.variantId, input.quantity))
    ) {
      throw businessRule(
        'BATCH_MISMATCH',
        'That batch does not belong to this variant or has too little left',
      );
    }
    await tx.stockMovement.create({
      data: {
        variantId: input.variantId,
        batchId: input.batchId ?? null,
        type: 'ADJUSTMENT',
        quantity: input.quantity,
        balanceAfter: balance,
        reason: input.reason,
        adminUserId: actor.adminUserId,
      },
    });
    await recordAudit(tx, actor, {
      action: 'inventory.adjust',
      entityType: 'variant',
      entityId: input.variantId,
      before: { stockQty: balance - input.quantity },
      after: {
        stockQty: balance,
        quantity: input.quantity,
        reason: input.reason,
        batchId: input.batchId ?? null,
      },
    });
    return balance;
  });

  await afterChange(deps, input.variantId);
  return { variantId: input.variantId, stockQty: balanceAfter };
}

/** Goods received: PURCHASE movement, optionally as a new batch with manufacture and expiry dates. */
export async function receiveStock(deps: InventoryDeps, actor: Actor, input: ReceiveStockInput) {
  const variant = await repo.findVariantForStock(deps.prisma, input.variantId);
  if (!variant) throw notFound('Variant');

  try {
    const result = await deps.prisma.$transaction(async (tx) => {
      const batch = input.batchNo
        ? await tx.inventoryBatch.create({
            data: {
              variantId: input.variantId,
              batchNo: input.batchNo,
              manufacturedAt: input.manufacturedAt
                ? new Date(`${input.manufacturedAt}T00:00:00Z`)
                : null,
              expiryDate: input.expiryDate ? new Date(`${input.expiryDate}T00:00:00Z`) : null,
              qtyReceived: input.quantity,
              qtyRemaining: input.quantity,
            },
            select: { id: true },
          })
        : null;
      const balance = await repo.changeStock(tx, input.variantId, input.quantity);
      if (balance === null) throw notFound('Variant');
      await tx.stockMovement.create({
        data: {
          variantId: input.variantId,
          batchId: batch?.id ?? null,
          type: 'PURCHASE',
          quantity: input.quantity,
          balanceAfter: balance,
          reason:
            input.reason ?? (input.batchNo ? `Received batch ${input.batchNo}` : 'Stock received'),
          adminUserId: actor.adminUserId,
        },
      });
      await recordAudit(tx, actor, {
        action: 'inventory.receive',
        entityType: 'variant',
        entityId: input.variantId,
        before: { stockQty: balance - input.quantity },
        after: { stockQty: balance, ...input },
      });
      return { stockQty: balance, batchId: batch?.id ?? null };
    });
    await afterChange(deps, input.variantId);
    return { variantId: input.variantId, ...result };
  } catch (err) {
    if (isUniqueViolation(err))
      throw new AppError('CONFLICT', 'This variant already has a batch with that number', [
        { reason: 'BATCH_EXISTS' },
      ]);
    throw err;
  }
}

export async function listStock(deps: { prisma: Db }, query: Parameters<typeof repo.listStock>[1]) {
  const { items, total } = await repo.listStock(deps.prisma, query);
  return {
    total,
    items: items.map(({ batches, ...v }) => ({
      ...v,
      isLow: v.stockQty <= v.lowStockThreshold,
      nearestExpiry: batches[0]?.expiryDate?.toISOString().slice(0, 10) ?? null,
    })),
  };
}

export async function listMovements(
  deps: { prisma: Db },
  query: Parameters<typeof repo.listMovements>[1],
) {
  return repo.listMovements(deps.prisma, query);
}

export async function listBatches(deps: { prisma: Db }, variantId: string) {
  const batches = await repo.listBatches(deps.prisma, variantId);
  return batches.map((b) => ({
    ...b,
    manufacturedAt: b.manufacturedAt?.toISOString().slice(0, 10) ?? null,
    expiryDate: b.expiryDate?.toISOString().slice(0, 10) ?? null,
  }));
}
