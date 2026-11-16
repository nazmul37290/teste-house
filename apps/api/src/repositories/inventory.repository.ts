import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Tx = Prisma.TransactionClient;

/**
 * Atomic stock change: applies `delta` only if the result stays >= 0 and returns the new balance,
 * or null when there is not enough stock. One statement, so concurrent changes can never overdraw
 * (chk_variant_stock is the backstop).
 */
export async function changeStock(
  tx: Tx,
  variantId: string,
  delta: number,
): Promise<number | null> {
  const rows = await tx.$queryRaw<{ stockQty: number }[]>`
    UPDATE product_variants
    SET "stockQty" = "stockQty" + ${delta}, "updatedAt" = now()
    WHERE id = ${variantId}::uuid AND "stockQty" + ${delta} >= 0
    RETURNING "stockQty"`;
  return rows[0]?.stockQty ?? null;
}

/** Same for a batch's remaining quantity. */
export async function changeBatchRemaining(
  tx: Tx,
  batchId: string,
  variantId: string,
  delta: number,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    UPDATE inventory_batches
    SET "qtyRemaining" = "qtyRemaining" + ${delta}
    WHERE id = ${batchId}::uuid AND "variantId" = ${variantId}::uuid AND "qtyRemaining" + ${delta} >= 0
    RETURNING id`;
  return rows.length > 0;
}

export function findVariantForStock(prisma: Db | Tx, id: string) {
  return prisma.productVariant.findFirst({
    where: { id, product: { deletedAt: null } },
    select: {
      id: true,
      sku: true,
      name: true,
      stockQty: true,
      lowStockThreshold: true,
      product: { select: { name: true } },
    },
  });
}

export async function listStock(
  prisma: Db,
  q: { page: number; pageSize: number; q?: string; lowStock: boolean },
) {
  const where: Prisma.ProductVariantWhereInput = {
    product: { deletedAt: null },
    ...(q.lowStock ? { stockQty: { lte: prisma.productVariant.fields.lowStockThreshold } } : {}),
    ...(q.q
      ? {
          OR: [
            { sku: { contains: q.q, mode: 'insensitive' } },
            { name: { contains: q.q, mode: 'insensitive' } },
            { product: { name: { contains: q.q, mode: 'insensitive' } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.productVariant.findMany({
      where,
      select: {
        id: true,
        sku: true,
        name: true,
        stockQty: true,
        lowStockThreshold: true,
        isActive: true,
        product: { select: { id: true, name: true, status: true } },
        // Nearest expiry among batches that still have stock.
        batches: {
          where: { qtyRemaining: { gt: 0 }, expiryDate: { not: null } },
          select: { expiryDate: true },
          orderBy: { expiryDate: 'asc' },
          take: 1,
        },
      },
      orderBy: [{ stockQty: 'asc' }, { sku: 'asc' }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.productVariant.count({ where }),
  ]);
  return { items, total };
}

export async function listMovements(
  prisma: Db,
  q: { page: number; pageSize: number; variantId?: string },
) {
  const where: Prisma.StockMovementWhereInput = q.variantId ? { variantId: q.variantId } : {};
  const [items, total] = await Promise.all([
    prisma.stockMovement.findMany({
      where,
      select: {
        id: true,
        type: true,
        quantity: true,
        balanceAfter: true,
        reason: true,
        createdAt: true,
        variant: {
          select: { id: true, sku: true, name: true, product: { select: { name: true } } },
        },
        batch: { select: { batchNo: true } },
        order: { select: { orderNumber: true } },
        adminUser: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.stockMovement.count({ where }),
  ]);
  return { items, total };
}

export function listBatches(prisma: Db, variantId: string) {
  return prisma.inventoryBatch.findMany({
    where: { variantId },
    select: {
      id: true,
      batchNo: true,
      manufacturedAt: true,
      expiryDate: true,
      qtyReceived: true,
      qtyRemaining: true,
      createdAt: true,
    },
    orderBy: [{ expiryDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
  });
}
