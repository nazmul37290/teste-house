import {
  calculateOrderTotals,
  dhakaDayRange,
  formatPaisa,
  normalizePhone,
  parsePaisa,
  PricingError,
  type AdminOrderListQuery,
  type EditOrderInput,
  type OrderStatusValue,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { queueRevalidate } from '../middleware/revalidate-after-write';
import { changeStock } from '../repositories/inventory.repository';
import { recordAudit, type Actor } from './audit.service';
import { afterStockChange } from './inventory.service';
import { orderView, resolveZone } from './order.service';
import { changeOrderStatus, ORDER_TRANSITIONS, type StatusDeps } from './order-status.service';
import { businessRule } from './role.service';

/** Admin order management [orders.*]. Every write is audited. */

const paisaOf = (d: { toFixed(n: number): string }) => parsePaisa(d.toFixed(2));

// List -------------------------------------------------------------------------------------------

export async function listOrders(prisma: Db, q: AdminOrderListQuery) {
  const search = q.q?.trim();
  const phone = search ? normalizePhone(search) : null;
  const where: Prisma.OrderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.from || q.to ? { placedAt: dhakaDayRange(q.from, q.to) } : {}),
    ...(search
      ? {
          OR: [
            { orderNumber: { contains: search.toUpperCase() } },
            { contactName: { contains: search, mode: 'insensitive' } },
            ...(phone ? [{ contactPhone: phone }] : []),
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        paymentStatus: true,
        placedAt: true,
        contactName: true,
        contactPhone: true,
        grandTotal: true,
        customerId: true,
        paymentMethod: { select: { code: true, name: true } },
        address: { select: { district: true } },
        _count: { select: { items: true } },
      },
      orderBy: { placedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: rows.map(({ _count, grandTotal, address, ...o }) => ({
      ...o,
      grandTotal: grandTotal.toFixed(2),
      district: address?.district ?? null,
      lineCount: _count.items,
    })),
    total,
  };
}

// Detail -----------------------------------------------------------------------------------------

/** COD risk signals (requirements section 8): other orders by the same phone or IP. */
async function riskInfo(
  prisma: Db,
  order: { id: string; contactPhone: string; ipAddress: string | null },
) {
  const byPhone = await prisma.order.groupBy({
    by: ['status'],
    where: { contactPhone: order.contactPhone, id: { not: order.id } },
    _count: { _all: true },
  });
  const count = (s: OrderStatusValue) => byPhone.find((r) => r.status === s)?._count._all ?? 0;
  const otherOrders = byPhone.reduce((n, r) => n + r._count._all, 0);
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const sameIpLast24h = order.ipAddress
    ? await prisma.order.count({
        where: { ipAddress: order.ipAddress, id: { not: order.id }, placedAt: { gte: since } },
      })
    : 0;
  const finished = count('DELIVERED') + count('CANCELLED') + count('RETURNED') + count('FAILED');
  const bad = count('CANCELLED') + count('RETURNED') + count('FAILED');
  return {
    otherOrdersSamePhone: otherOrders,
    delivered: count('DELIVERED'),
    cancelled: count('CANCELLED'),
    returnedOrFailed: count('RETURNED') + count('FAILED'),
    /** Share of finished orders that did not end delivered, 0..100, or null with no history. */
    problemRate: finished ? Math.round((bad / finished) * 100) : null,
    sameIpLast24h,
  };
}

export async function getOrder(prisma: Db, id: string) {
  const meta = await prisma.order.findUnique({
    where: { id },
    select: {
      id: true,
      contactPhone: true,
      ipAddress: true,
      customerId: true,
      cancelReason: true,
      confirmedAt: true,
      deliveredAt: true,
      cancelledAt: true,
      notes: {
        select: { id: true, note: true, createdAt: true, adminUser: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      },
      statusHistory: {
        select: {
          fromStatus: true,
          toStatus: true,
          note: true,
          source: true,
          createdAt: true,
          changedBy: { select: { name: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      payments: {
        select: {
          id: true,
          amount: true,
          status: true,
          gatewayTxnId: true,
          gatewayInvoiceId: true,
          failureReason: true,
          paidAt: true,
          createdAt: true,
          method: { select: { name: true } },
          refunds: {
            select: {
              id: true,
              amount: true,
              reason: true,
              createdAt: true,
              createdBy: { select: { name: true } },
            },
            orderBy: { createdAt: 'asc' },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!meta) throw new AppError('NOT_FOUND', 'Order not found');
  const view = await orderView({ prisma }, id);
  return {
    id,
    ...view,
    customerId: meta.customerId,
    cancelReason: meta.cancelReason,
    confirmedAt: meta.confirmedAt,
    deliveredAt: meta.deliveredAt,
    cancelledAt: meta.cancelledAt,
    history: meta.statusHistory.map((h) => ({
      from: h.fromStatus,
      to: h.toStatus,
      note: h.note,
      source: h.source,
      by: h.changedBy?.name ?? null,
      at: h.createdAt,
    })),
    notes: meta.notes.map((n) => ({
      id: n.id,
      note: n.note,
      by: n.adminUser?.name ?? null,
      at: n.createdAt,
    })),
    payments: meta.payments.map((p) => ({
      ...p,
      amount: p.amount.toFixed(2),
      refunds: p.refunds.map((r) => ({
        id: r.id,
        amount: r.amount.toFixed(2),
        reason: r.reason,
        by: r.createdBy?.name ?? null,
        at: r.createdAt,
      })),
    })),
    allowedTransitions: ORDER_TRANSITIONS[view.status],
    editable: EDITABLE.includes(view.status),
    risk: await riskInfo(prisma, {
      id,
      contactPhone: meta.contactPhone,
      ipAddress: meta.ipAddress,
    }),
  };
}

// Status and notes -------------------------------------------------------------------------------

export async function setStatus(
  deps: StatusDeps,
  actor: Actor,
  id: string,
  input: { status: OrderStatusValue; note?: string },
) {
  const result = await changeOrderStatus(deps, {
    orderId: id,
    to: input.status,
    source: 'ADMIN',
    adminUserId: actor.adminUserId,
    note: input.note,
    cancelReason: input.status === 'CANCELLED' ? input.note : undefined,
  });
  await recordAudit(deps.prisma, actor, {
    action: 'order.status',
    entityType: 'order',
    entityId: id,
    before: { status: result.from },
    after: { status: result.to, note: input.note ?? null },
  });
  return getOrder(deps.prisma, id);
}

export async function addNote(prisma: Db, actor: Actor, id: string, note: string) {
  const exists = await prisma.order.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw new AppError('NOT_FOUND', 'Order not found');
  await prisma.$transaction(async (tx) => {
    const row = await tx.orderNote.create({
      data: { orderId: id, note, adminUserId: actor.adminUserId },
    });
    await recordAudit(tx, actor, {
      action: 'order.note',
      entityType: 'order',
      entityId: id,
      after: { noteId: row.id },
    });
  });
  return getOrder(prisma, id);
}

// Edit -------------------------------------------------------------------------------------------

/** Before the courier has the parcel (docs/pricing.md section 7). */
const EDITABLE: OrderStatusValue[] = ['PENDING', 'CONFIRMED', 'PROCESSING'];

/**
 * Items, quantities, address and coupon removal. Kept lines keep their order-time prices; new lines
 * use the current price. Totals are re-run with calculateOrderTotals() and the stored coupon; the
 * delivery charge comes from the zone of the (new) district. Stock is adjusted with movements.
 */
export async function editOrder(deps: StatusDeps, actor: Actor, id: string, input: EditOrderInput) {
  const touched = await deps.prisma.$transaction(async (tx) => {
    const locked = await tx.$queryRaw<{ status: OrderStatusValue }[]>`
      SELECT status FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    const status = locked[0]?.status;
    if (!status) throw new AppError('NOT_FOUND', 'Order not found');
    if (!EDITABLE.includes(status)) {
      throw businessRule('ORDER_NOT_EDITABLE', 'This order can no longer be edited');
    }
    const order = await tx.order.findUniqueOrThrow({
      where: { id },
      include: { items: true, address: true, coupon: true, deliveryZone: true },
    });
    const totalChanges = Boolean(input.items || input.removeCoupon);
    if (order.paymentStatus === 'PAID' && totalChanges) {
      throw businessRule(
        'ORDER_PAID',
        'A paid order cannot change its total; cancel and refund instead',
      );
    }

    // New item list with prices: kept lines keep their snapshot, new lines read the current price.
    const wanted =
      input.items ?? order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity }));
    const kept = new Map(order.items.map((i) => [i.variantId, i]));
    const newIds = wanted.filter((w) => !kept.has(w.variantId)).map((w) => w.variantId);
    const fresh = newIds.length
      ? await tx.productVariant.findMany({
          where: { id: { in: newIds } },
          include: {
            product: {
              select: {
                name: true,
                status: true,
                deletedAt: true,
                images: {
                  where: { isPrimary: true },
                  take: 1,
                  select: { media: { select: { path: true } } },
                },
              },
            },
          },
        })
      : [];
    const freshById = new Map(fresh.map((v) => [v.id, v]));
    for (const variantId of newIds) {
      const v = freshById.get(variantId);
      if (!v || !v.isActive || v.product.status !== 'ACTIVE' || v.product.deletedAt) {
        throw new AppError('BUSINESS_RULE', 'An added item is not available', [
          { reason: 'UNAVAILABLE', variantIds: [variantId] },
        ]);
      }
    }
    const lines = wanted.map((w) => {
      const old = kept.get(w.variantId);
      if (old) {
        return {
          ...w,
          listPrice: paisaOf(old.listPrice),
          unitPrice: paisaOf(old.unitPrice),
          snapshot: null,
        };
      }
      const v = freshById.get(w.variantId)!;
      return {
        ...w,
        listPrice: paisaOf(v.price),
        unitPrice: paisaOf(v.salePrice ?? v.price),
        snapshot: {
          productName: v.product.name,
          variantName: v.name,
          sku: v.sku,
          imagePath: v.product.images[0]?.media.path ?? null,
          weightGrams: v.weightGrams,
        },
      };
    });

    // Zone: the new district's zone when the address changes, else the order's zone.
    const district = input.address?.district ?? order.address?.district;
    const zone =
      input.address || !order.deliveryZone
        ? await resolveZone(tx, district ?? '')
        : order.deliveryZone;
    const coupon = input.removeCoupon ? null : order.coupon;

    let totals;
    try {
      totals = calculateOrderTotals({
        items: lines.map((l) => ({
          variantId: l.variantId,
          quantity: l.quantity,
          price: l.listPrice,
          salePrice: l.unitPrice < l.listPrice ? l.unitPrice : null,
        })),
        coupon: coupon
          ? {
              type: coupon.type,
              value: paisaOf(coupon.value),
              minOrderAmount: coupon.minOrderAmount ? paisaOf(coupon.minOrderAmount) : null,
              maxDiscount: coupon.maxDiscount ? paisaOf(coupon.maxDiscount) : null,
            }
          : null,
        zone: {
          charge: paisaOf(zone.charge),
          freeDeliveryThreshold: zone.freeDeliveryThreshold
            ? paisaOf(zone.freeDeliveryThreshold)
            : null,
        },
      });
    } catch (err) {
      if (err instanceof PricingError && err.code === 'COUPON_MIN_ORDER') {
        throw businessRule(
          'COUPON_MIN_ORDER',
          'The order is now below the coupon minimum; remove the coupon to continue',
        );
      }
      throw err;
    }

    // Stock: the difference per variant, in a fixed order.
    const oldQty = new Map(order.items.map((i) => [i.variantId, i.quantity]));
    const newQty = new Map(lines.map((l) => [l.variantId, l.quantity]));
    const variantIds = [...new Set([...oldQty.keys(), ...newQty.keys()])].sort();
    const changed: string[] = [];
    for (const variantId of variantIds) {
      const delta = (newQty.get(variantId) ?? 0) - (oldQty.get(variantId) ?? 0);
      if (!delta) continue;
      const balance = await changeStock(tx, variantId, -delta);
      if (balance === null) {
        throw new AppError('BUSINESS_RULE', 'Not enough stock for this change', [
          { reason: 'OUT_OF_STOCK', variantIds: [variantId] },
        ]);
      }
      await tx.stockMovement.create({
        data: {
          variantId,
          type: delta > 0 ? 'SALE' : 'CANCEL_RELEASE',
          quantity: -delta,
          balanceAfter: balance,
          orderId: id,
          adminUserId: actor.adminUserId,
          reason: 'Order edited',
        },
      });
      changed.push(variantId);
    }

    // Items: update kept, create new, delete removed.
    for (const [i, line] of lines.entries()) {
      const t = totals.lines[i]!;
      const amounts = {
        quantity: t.quantity,
        lineTotal: formatPaisa(t.lineTotal),
        discountAmount: formatPaisa(t.discountAmount),
      };
      const old = kept.get(line.variantId);
      if (old) {
        await tx.orderItem.update({ where: { id: old.id }, data: amounts });
      } else {
        await tx.orderItem.create({
          data: {
            orderId: id,
            variantId: line.variantId,
            ...line.snapshot!,
            listPrice: formatPaisa(t.listPrice),
            unitPrice: formatPaisa(t.unitPrice),
            ...amounts,
          },
        });
      }
    }
    const removed = order.items.filter((i) => !newQty.has(i.variantId)).map((i) => i.id);
    if (removed.length) await tx.orderItem.deleteMany({ where: { id: { in: removed } } });

    if (input.removeCoupon && order.couponId) {
      const gone = await tx.couponUsage.deleteMany({ where: { orderId: id } });
      if (gone.count) {
        await tx.$executeRaw`UPDATE coupons SET "usedCount" = GREATEST("usedCount" - 1, 0), "updatedAt" = now() WHERE id = ${order.couponId}::uuid`;
      }
    } else if (coupon) {
      await tx.couponUsage.updateMany({
        where: { orderId: id },
        data: { discountAmount: formatPaisa(totals.discountTotal) },
      });
    }

    await tx.order.update({
      where: { id },
      data: {
        subtotal: formatPaisa(totals.subtotal),
        discountTotal: formatPaisa(totals.discountTotal),
        deliveryCharge: formatPaisa(totals.deliveryCharge),
        grandTotal: formatPaisa(totals.grandTotal),
        deliveryZoneId: zone.id,
        ...(input.removeCoupon ? { couponId: null, couponCode: null } : {}),
      },
    });
    if (input.address) {
      const a = input.address;
      const data = {
        recipientName: a.recipientName,
        phone: a.phone,
        division: a.division,
        district: a.district,
        upazila: a.upazila ?? null,
        addressLine: a.addressLine,
        postalCode: a.postalCode ?? null,
        deliveryNote: a.deliveryNote ?? null,
      };
      await tx.orderAddress.upsert({
        where: { orderId: id },
        create: { orderId: id, ...data },
        update: data,
      });
    }

    const what = [
      input.items && 'items',
      input.address && 'address',
      input.removeCoupon && 'coupon removed',
    ]
      .filter(Boolean)
      .join(', ');
    await tx.orderStatusHistory.create({
      data: {
        orderId: id,
        fromStatus: status,
        toStatus: status,
        source: 'ADMIN',
        changedById: actor.adminUserId,
        note: `Edited (${what})${input.note ? `: ${input.note}` : ''}`,
      },
    });
    await recordAudit(tx, actor, {
      action: 'order.edit',
      entityType: 'order',
      entityId: id,
      before: {
        items: order.items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
        grandTotal: order.grandTotal.toFixed(2),
        address: order.address,
        couponCode: order.couponCode,
      },
      after: { ...input, grandTotal: formatPaisa(totals.grandTotal) },
    });
    return changed;
  });

  for (const variantId of touched) await afterStockChange(deps, variantId);
  if (touched.length) queueRevalidate(deps, ['catalog']);
  return getOrder(deps.prisma, id);
}
