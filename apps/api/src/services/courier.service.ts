import { formatPaisa, parsePaisa } from '@shop/shared';
import type { Deps } from '../deps';
import type { CourierEventSource, Prisma } from '../generated/prisma/client';
import { CourierError, type CourierState } from '../integrations/courier';
import { BOOK_JOB } from '../jobs/queues';
import { AppError } from '../lib/errors';
import { findSettingValue } from '../repositories/settings.repository';
import { recordAudit, type Actor } from './audit.service';
import { orderStatusForCourierState, SYNCABLE_ORDER_STATUSES } from './courier-state';
import { changeOrderStatus, ORDER_TRANSITIONS } from './order-status.service';
import { businessRule } from './role.service';

/**
 * Courier booking and tracking (requirements section 13, docs/integrations.md section 1). Booking
 * runs in the `courier.book` queue job, so a courier outage never blocks anything else (STF-8).
 */

export type CourierDeps = Pick<
  Deps,
  'prisma' | 'redis' | 'env' | 'emailQueue' | 'revalidateQueue' | 'courier' | 'courierQueue'
>;

const json = (v: unknown) => (v ?? {}) as Prisma.InputJsonValue;

/** Booking is possible only with a configured courier and the setting switched on. */
async function assertCourierReady(deps: CourierDeps) {
  if (!deps.courier) {
    throw businessRule(
      'COURIER_NOT_CONFIGURED',
      'The courier is not connected yet. Steadfast needs its API details first.',
    );
  }
  if ((await findSettingValue(deps.prisma, 'shipping.steadfastEnabled')) !== true) {
    throw businessRule('COURIER_DISABLED', 'Courier booking is switched off in Settings');
  }
}

type BookingCheck = { orderId: string; orderNumber?: string; ok: boolean; reason?: string };

async function checkBookable(deps: CourierDeps, orderId: string): Promise<BookingCheck> {
  const o = await deps.prisma.order.findUnique({
    where: { id: orderId },
    select: {
      orderNumber: true,
      status: true,
      shipments: { where: { consignmentId: { not: null } }, select: { id: true } },
    },
  });
  if (!o) return { orderId, ok: false, reason: 'NOT_FOUND' };
  if (o.shipments.length)
    return { orderId, orderNumber: o.orderNumber, ok: false, reason: 'ALREADY_BOOKED' };
  if (o.status !== 'PROCESSING') {
    return { orderId, orderNumber: o.orderNumber, ok: false, reason: 'NOT_PROCESSING' };
  }
  return { orderId, orderNumber: o.orderNumber, ok: true };
}

/**
 * Queues bookings for PROCESSING orders without a consignment. Returns, per order, whether it was
 * queued or why not. One job per order (job id = order id), so a double click queues it once.
 */
export async function requestBooking(deps: CourierDeps, actor: Actor, orderIds: string[]) {
  await assertCourierReady(deps);
  const results: BookingCheck[] = [];
  for (const orderId of [...new Set(orderIds)]) {
    const check = await checkBookable(deps, orderId);
    if (check.ok) {
      await deps
        .courierQueue()
        .add(BOOK_JOB, { orderId, adminUserId: actor.adminUserId }, { jobId: `book-${orderId}` });
      await recordAudit(deps.prisma, actor, {
        action: 'order.book_courier',
        entityType: 'order',
        entityId: orderId,
      });
    }
    results.push(check);
  }
  return results.map(({ orderId, orderNumber, ok, reason }) => ({
    orderId,
    orderNumber: orderNumber ?? null,
    queued: ok,
    reason: reason ?? null,
  }));
}

/**
 * The `courier.book` job. Re-checks the order (it may have changed since queueing), creates the
 * parcel, stores the shipment and moves the order to HANDED_TO_COURIER. Throws on courier errors so
 * BullMQ retries with backoff; `onFinalFailure` writes the staff note.
 */
export async function bookShipment(deps: CourierDeps, orderId: string, adminUserId: string | null) {
  if (!deps.courier) throw new CourierError('No courier configured');
  const check = await checkBookable(deps, orderId);
  if (!check.ok) return { skipped: check.reason };

  const o = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      orderNumber: true,
      grandTotal: true,
      paymentStatus: true,
      contactName: true,
      contactPhone: true,
      paymentMethod: { select: { code: true } },
      address: true,
    },
  });
  const a = o.address;
  // Cash on Delivery collects the full total unless it was already paid; prepaid orders collect 0.
  const cod =
    o.paymentMethod.code === 'COD' && o.paymentStatus !== 'PAID'
      ? parsePaisa(o.grandTotal.toFixed(2))
      : 0;
  const parcel = await deps.courier.createParcel({
    invoice: o.orderNumber,
    recipientName: a?.recipientName ?? o.contactName,
    recipientPhone: a?.phone ?? o.contactPhone,
    recipientAddress: a
      ? [a.addressLine, a.upazila, a.district, a.postalCode].filter(Boolean).join(', ')
      : '',
    codAmount: cod,
    note: a?.deliveryNote ?? undefined,
  });

  const shipment = await deps.prisma.shipment.create({
    data: {
      orderId,
      provider: deps.courier.provider,
      consignmentId: parcel.consignmentId,
      trackingCode: parcel.trackingCode,
      trackingUrl: parcel.trackingUrl ?? null,
      courierStatus: parcel.status,
      codAmount: formatPaisa(cod),
      bookedById: adminUserId,
      rawResponse: json(parcel.raw),
      events: {
        create: {
          status: parcel.status,
          message: 'Parcel booked',
          source: 'MANUAL',
          payload: json(parcel.raw),
        },
      },
    },
    select: { id: true },
  });
  await changeOrderStatus(deps, {
    orderId,
    to: 'HANDED_TO_COURIER',
    source: 'COURIER',
    adminUserId: adminUserId ?? undefined,
    note: `Sent to the courier (tracking ${parcel.trackingCode})`,
  });
  return { shipmentId: shipment.id, trackingCode: parcel.trackingCode };
}

/** After the last retry: tell staff on the order; the order itself is left as it was (STF-8). */
export async function onBookingFailed(deps: CourierDeps, orderId: string, message: string) {
  await deps.prisma.orderNote.create({
    data: { orderId, note: `Courier booking failed: ${message.slice(0, 400)}` },
  });
}

// Status updates ---------------------------------------------------------------------------------

/**
 * One courier status report (poll, webhook or manual). Same status as last time: nothing happens.
 * A new status is written to the timeline, and the order moves when the state maps to a transition
 * the state machine allows (anything else is recorded only, for a person to look at).
 */
export async function applyCourierUpdate(
  deps: CourierDeps,
  shipmentId: string,
  update: { status: string; state: CourierState; message?: string; raw?: unknown },
  source: CourierEventSource,
) {
  const shipment = await deps.prisma.shipment.findUniqueOrThrow({
    where: { id: shipmentId },
    select: { id: true, orderId: true, courierStatus: true, order: { select: { status: true } } },
  });
  if (shipment.courierStatus === update.status) return { changed: false, orderMovedTo: null };

  await deps.prisma.$transaction([
    deps.prisma.shipment.update({
      where: { id: shipmentId },
      data: { courierStatus: update.status },
    }),
    deps.prisma.courierEvent.create({
      data: {
        shipmentId,
        status: update.status,
        message: update.message ?? null,
        source,
        payload: json(update.raw),
      },
    }),
  ]);

  const target = orderStatusForCourierState(update.state);
  const from = shipment.order.status;
  // DELIVERED can be reported without an IN_TRANSIT first; RETURNED after DELIVERED is allowed too.
  if (!target || target === from || !ORDER_TRANSITIONS[from].includes(target)) {
    return { changed: true, orderMovedTo: null };
  }
  await changeOrderStatus(deps, {
    orderId: shipment.orderId,
    to: target,
    source: 'COURIER',
    note: update.message ? `Courier: ${update.message}` : `Courier status: ${update.status}`,
  });
  return { changed: true, orderMovedTo: target };
}

/** The `courier.sync` job (STF-5 polling): asks the courier about every parcel still moving. */
export async function syncShipments(deps: CourierDeps) {
  if (!deps.courier) return 0;
  const moving = await deps.prisma.shipment.findMany({
    where: { consignmentId: { not: null }, order: { status: { in: SYNCABLE_ORDER_STATUSES } } },
    select: { id: true, consignmentId: true, trackingCode: true },
    take: 500,
  });
  let changed = 0;
  for (const s of moving) {
    try {
      const status = await deps.courier.getStatus({
        consignmentId: s.consignmentId ?? undefined,
        trackingCode: s.trackingCode ?? undefined,
      });
      if ((await applyCourierUpdate(deps, s.id, status, 'POLL')).changed) changed += 1;
    } catch (err) {
      console.error(
        `Courier sync for ${s.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return changed;
}

/** Courier balance for reconciliation (STF-7). */
export async function courierBalance(deps: CourierDeps) {
  if (!deps.courier) return { configured: false as const };
  try {
    const { balance } = await deps.courier.getBalance();
    return { configured: true as const, balance: formatPaisa(balance) };
  } catch (err) {
    throw new AppError(
      'INTERNAL_ERROR',
      `Could not read the courier balance: ${err instanceof Error ? err.message : 'error'}`,
    );
  }
}
