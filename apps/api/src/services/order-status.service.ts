import type { Deps } from '../deps';
import type { OrderStatus, Prisma, StatusSource } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import { queueRevalidate } from '../middleware/revalidate-after-write';
import { changeStock } from '../repositories/inventory.repository';
import { enqueueEmail } from './email.service';
import { afterStockChange } from './inventory.service';
import { businessRule } from './role.service';

/**
 * The order state machine (docs/design.md section 5). Every change goes through changeOrderStatus(),
 * which writes order_status_history and applies the side effects in the same transaction.
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['HANDED_TO_COURIER', 'CANCELLED'],
  HANDED_TO_COURIER: ['IN_TRANSIT', 'DELIVERED', 'RETURNED', 'FAILED'],
  IN_TRANSIT: ['DELIVERED', 'RETURNED', 'FAILED'],
  DELIVERED: ['RETURNED'],
  CANCELLED: [],
  FAILED: [],
  RETURNED: [],
};

/** Customers may cancel only before the order is being packed. */
export const CUSTOMER_CANCELLABLE: OrderStatus[] = ['PENDING', 'CONFIRMED'];

/** Stock comes back on these; the coupon use is given back on cancel and failure (not on return). */
const RESTOCK: Partial<Record<OrderStatus, 'CANCEL_RELEASE' | 'RETURN'>> = {
  CANCELLED: 'CANCEL_RELEASE',
  FAILED: 'CANCEL_RELEASE',
  RETURNED: 'RETURN',
};
const RELEASE_COUPON: OrderStatus[] = ['CANCELLED', 'FAILED'];

export type StatusDeps = Pick<Deps, 'prisma' | 'redis' | 'env' | 'emailQueue' | 'revalidateQueue'>;

export type StatusChange = {
  orderId: string;
  to: OrderStatus;
  source: StatusSource;
  adminUserId?: string;
  note?: string;
  /** Stored on the order for CANCELLED. */
  cancelReason?: string;
  /** Extra rule for the caller (e.g. customers: only from PENDING or CONFIRMED). */
  allowedFrom?: OrderStatus[];
};

type Tx = Prisma.TransactionClient;

/** Changes the status in one transaction (row locked), then sends emails and refreshes stock state. */
export async function changeOrderStatus(deps: StatusDeps, change: StatusChange) {
  const result = await deps.prisma.$transaction((tx) => applyStatus(tx, change));
  await afterStatusChange(deps, change, result);
  return result;
}

async function applyStatus(tx: Tx, change: StatusChange) {
  // Lock the order so two changes (admin + customer, or a double click) cannot both apply.
  const locked = await tx.$queryRaw<{ status: OrderStatus }[]>`
    SELECT status FROM orders WHERE id = ${change.orderId}::uuid FOR UPDATE`;
  const from = locked[0]?.status;
  if (!from) throw new AppError('NOT_FOUND', 'Order not found');
  if (
    !ORDER_TRANSITIONS[from].includes(change.to) ||
    (change.allowedFrom && !change.allowedFrom.includes(from))
  ) {
    throw new AppError(
      'BUSINESS_RULE',
      `An order that is ${statusText(from)} cannot become ${statusText(change.to)}`,
      [{ reason: 'INVALID_TRANSITION', from, to: change.to }],
    );
  }

  const order = await tx.order.findUniqueOrThrow({
    where: { id: change.orderId },
    select: {
      id: true,
      couponId: true,
      paymentStatus: true,
      paymentMethod: { select: { code: true } },
      items: {
        select: { variantId: true, quantity: true, variant: { select: { productId: true } } },
      },
    },
  });

  const now = new Date();
  const data: Prisma.OrderUpdateInput = { status: change.to };
  if (change.to === 'CONFIRMED') data.confirmedAt = now;
  if (change.to === 'CANCELLED') {
    data.cancelledAt = now;
    data.cancelReason = change.cancelReason ?? change.note ?? null;
  }
  if (change.to === 'DELIVERED') {
    data.deliveredAt = now;
    if (order.paymentMethod.code === 'COD') data.paymentStatus = 'PAID';
  }
  await tx.order.update({ where: { id: order.id }, data });

  const restock = RESTOCK[change.to];
  const touched: string[] = [];
  if (restock) {
    for (const item of [...order.items].sort((a, b) => a.variantId.localeCompare(b.variantId))) {
      const balance = await changeStock(tx, item.variantId, item.quantity);
      if (balance === null) throw businessRule('STOCK_ERROR', 'Stock could not be restored');
      await tx.stockMovement.create({
        data: {
          variantId: item.variantId,
          type: restock,
          quantity: item.quantity,
          balanceAfter: balance,
          orderId: order.id,
          reason: `Order ${statusText(change.to)}`,
          adminUserId: change.adminUserId ?? null,
        },
      });
      touched.push(item.variantId);
    }
    const perProduct = new Map<string, number>();
    for (const i of order.items)
      perProduct.set(i.variant.productId, (perProduct.get(i.variant.productId) ?? 0) + i.quantity);
    for (const [productId, qty] of perProduct) {
      // Never below zero, even for orders placed before soldCount was counted.
      await tx.$executeRaw`UPDATE products SET "soldCount" = GREATEST("soldCount" - ${qty}, 0) WHERE id = ${productId}::uuid`;
    }
  }
  if (RELEASE_COUPON.includes(change.to) && order.couponId) {
    const removed = await tx.couponUsage.deleteMany({ where: { orderId: order.id } });
    if (removed.count) {
      await tx.$executeRaw`UPDATE coupons SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now() WHERE id = ${order.couponId}::uuid`;
    }
  }

  await tx.orderStatusHistory.create({
    data: {
      orderId: order.id,
      fromStatus: from,
      toStatus: change.to,
      note: change.note ?? null,
      source: change.source,
      changedById: change.adminUserId ?? null,
    },
  });
  return { orderId: order.id, from, to: change.to, restockedVariantIds: touched };
}

const statusText = (s: OrderStatus) => s.toLowerCase().replace(/_/g, ' ');

async function afterStatusChange(
  deps: StatusDeps,
  change: StatusChange,
  result: { orderId: string; to: OrderStatus; restockedVariantIds: string[] },
) {
  try {
    if (result.to === 'CONFIRMED' || result.to === 'CANCELLED')
      await sendStatusEmail(deps, result.orderId, result.to, change);
  } catch (err) {
    console.error(
      `Status email for ${result.orderId} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  for (const variantId of result.restockedVariantIds) await afterStockChange(deps, variantId);
  if (result.restockedVariantIds.length) queueRevalidate(deps, ['catalog']);
}

async function sendStatusEmail(
  deps: StatusDeps,
  orderId: string,
  to: 'CONFIRMED' | 'CANCELLED',
  change: StatusChange,
) {
  const o = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      contactName: true,
      contactEmail: true,
      subtotal: true,
      discountTotal: true,
      deliveryCharge: true,
      grandTotal: true,
      paymentMethod: { select: { name: true } },
      items: { select: { productName: true, variantName: true, quantity: true, lineTotal: true } },
    },
  });
  if (!o.contactEmail) return;
  const trackUrl = `${deps.env.APP_URL.replace(/\/+$/, '')}/track?order=${encodeURIComponent(o.orderNumber)}`;
  if (to === 'CANCELLED') {
    await enqueueEmail(deps, {
      template: 'order-cancelled',
      to: o.contactEmail,
      orderId,
      data: {
        name: o.contactName,
        orderNumber: o.orderNumber,
        byCustomer: change.source === 'CUSTOMER',
        reason: change.cancelReason ?? null,
      },
    });
    return;
  }
  await enqueueEmail(deps, {
    template: 'order-confirmed',
    to: o.contactEmail,
    orderId,
    data: {
      name: o.contactName,
      orderNumber: o.orderNumber,
      items: o.items.map((i) => ({
        name: `${i.productName} (${i.variantName})`,
        quantity: i.quantity,
        lineTotal: i.lineTotal.toFixed(2),
      })),
      subtotal: o.subtotal.toFixed(2),
      discountTotal: o.discountTotal.toFixed(2),
      deliveryCharge: o.deliveryCharge.toFixed(2),
      grandTotal: o.grandTotal.toFixed(2),
      paymentMethod: o.paymentMethod.name,
      trackUrl,
    },
  });
}
