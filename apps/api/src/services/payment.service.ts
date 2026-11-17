import { formatPaisa, parsePaisa, placeholderEmailFor } from '@shop/shared';
import type { Deps } from '../deps';
import { Prisma } from '../generated/prisma/client';
import { GatewayError, type VerifiedPayment } from '../integrations/payments';
import { AppError } from '../lib/errors';
import { isUniqueViolation } from '../lib/prisma-errors';
import { findSettingValue } from '../repositories/settings.repository';
import { enqueueEmail } from './email.service';
import { ONLINE_METHOD_CODES } from './order.service';
import { changeOrderStatus } from './order-status.service';
import { businessRule } from './role.service';

/**
 * Online payments (docs/design.md section 6, docs/integrations.md section 2). Money is confirmed
 * only by applyVerification(), which runs on the result of our own server-side verify() call:
 * from the return page, the webhook, the reconcile job or the expiry job. Never from the redirect.
 */

export type PaymentDeps = Pick<
  Deps,
  'prisma' | 'redis' | 'env' | 'emailQueue' | 'revalidateQueue' | 'gateways'
>;

/** Unpaid online orders are cancelled after this many minutes. */
export const PAYMENT_WINDOW_MINUTES = 30;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (v: unknown) => (v ?? Prisma.JsonNull) as Prisma.InputJsonValue;
const appUrl = (deps: PaymentDeps) => deps.env.APP_URL.replace(/\/+$/, '');

// Start a charge ---------------------------------------------------------------------------------

export type StartResult = { redirectUrl: string } | { error: string };

/**
 * New payment attempt for a pending online order: a payments row, then the gateway charge (outside
 * any transaction: it is a network call). A gateway failure is recorded, not thrown, so the order
 * that was just placed is still returned to the customer, who can pay again.
 */
export async function startPayment(deps: PaymentDeps, orderId: string): Promise<StartResult> {
  const order = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      placedAt: true,
      grandTotal: true,
      contactName: true,
      contactPhone: true,
      contactEmail: true,
      paymentMethod: { select: { id: true, code: true } },
    },
  });
  const gateway = deps.gateways[order.paymentMethod.code];
  if (!gateway) throw businessRule('PAYMENT_METHOD_UNAVAILABLE', 'Online payment is not available');
  if (order.status !== 'PENDING' || !['PENDING', 'FAILED'].includes(order.paymentStatus)) {
    throw businessRule('NOT_PAYABLE', 'This order does not need a payment');
  }
  if (Date.now() - order.placedAt.getTime() > PAYMENT_WINDOW_MINUTES * 60_000) {
    throw businessRule('PAYMENT_EXPIRED', 'The time to pay for this order has run out');
  }

  const payment = await deps.prisma.payment.create({
    data: {
      orderId: order.id,
      methodId: order.paymentMethod.id,
      amount: order.grandTotal,
      status: 'INITIATED',
    },
    select: { id: true },
  });
  try {
    const charge = await gateway.createCharge({
      orderNumber: order.orderNumber,
      paymentId: payment.id,
      amount: parsePaisa(order.grandTotal.toFixed(2)),
      customer: {
        name: order.contactName,
        phone: order.contactPhone,
        // The gateway needs an email; guests without one get the never-mailed placeholder.
        email: order.contactEmail ?? placeholderEmailFor(order.contactPhone),
      },
      returnUrl: `${appUrl(deps)}/payment/return`,
      cancelUrl: `${appUrl(deps)}/payment/return?cancelled=1`,
      webhookUrl: `${deps.env.API_URL.replace(/\/+$/, '')}/api/v1/webhooks/uddoktapay`,
    });
    await deps.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'PENDING',
        gatewayInvoiceId: charge.gatewayInvoiceId,
        rawRequest: json(charge.request),
        rawResponse: json(charge.raw),
      },
    });
    await deps.prisma.order.updateMany({
      where: { id: order.id, paymentStatus: 'FAILED' },
      data: { paymentStatus: 'PENDING' },
    });
    return { redirectUrl: charge.redirectUrl };
  } catch (err) {
    const reason = err instanceof GatewayError ? err.message : 'Gateway error';
    await deps.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: 'FAILED',
        failureReason: reason.slice(0, 500),
        rawResponse: json(err instanceof GatewayError ? err.raw : null),
      },
    });
    console.error(`Payment start for ${order.orderNumber} failed: ${reason}`);
    return { error: 'We could not open the payment page. Please try again in a moment.' };
  }
}

/** "Pay again" for guests and customers: order number + phone, like tracking. */
export async function payAgain(deps: PaymentDeps, orderNumber: string, phone: string) {
  const order = await deps.prisma.order.findFirst({
    where: { orderNumber, contactPhone: phone },
    select: { id: true },
  });
  if (!order) throw new AppError('NOT_FOUND', 'No order matches this number and phone');
  return startPayment(deps, order.id);
}

// Apply a verification ---------------------------------------------------------------------------

export type ApplyOutcome =
  'PAID' | 'ALREADY_PAID' | 'PENDING' | 'FAILED' | 'MISMATCH' | 'LATE_PAYMENT' | 'UNKNOWN';

async function findPayment(deps: PaymentDeps, v: VerifiedPayment) {
  const select = { id: true, orderId: true } as const;
  if (v.paymentId && UUID_RE.test(v.paymentId)) {
    const byId = await deps.prisma.payment.findUnique({ where: { id: v.paymentId }, select });
    if (byId) return byId;
  }
  return deps.prisma.payment.findFirst({
    where: { gatewayInvoiceId: v.gatewayInvoiceId },
    select,
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * The only place that records money as received. Idempotent: a payment already SUCCESS is left
 * alone. Amount and order reference must match our records exactly, or the payment is FAILED and the
 * order flagged for review; it is never marked paid.
 */
export async function applyVerification(deps: PaymentDeps, v: VerifiedPayment) {
  const found = await findPayment(deps, v);
  if (!found) return { outcome: 'UNKNOWN' as ApplyOutcome, orderId: null };

  let review: string | null = null;
  let confirm = false;
  let outcome: ApplyOutcome;
  try {
    outcome = await deps.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM orders WHERE id = ${found.orderId}::uuid FOR UPDATE`;
      const payment = await tx.payment.findUniqueOrThrow({
        where: { id: found.id },
        select: { id: true, status: true, amount: true },
      });
      const order = await tx.order.findUniqueOrThrow({
        where: { id: found.orderId },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          paymentStatus: true,
          grandTotal: true,
        },
      });
      if (payment.status === 'SUCCESS') return 'ALREADY_PAID';

      const base = {
        gatewayInvoiceId: v.gatewayInvoiceId,
        rawResponse: json(v.raw),
      };
      if (v.status === 'PENDING') {
        await tx.payment.update({
          where: { id: payment.id },
          data: { ...base, status: 'PENDING', failureReason: null },
        });
        if (order.status === 'PENDING' && order.paymentStatus === 'FAILED') {
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PENDING' } });
        }
        return 'PENDING';
      }
      if (v.status === 'FAILED') {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...base,
            status: 'FAILED',
            failureReason: 'Gateway reported the payment as failed',
          },
        });
        if (order.status === 'PENDING' && order.paymentStatus === 'PENDING') {
          await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
        }
        return 'FAILED';
      }

      // SUCCESS from the gateway: check it is exactly our order and our amount.
      const expected = parsePaisa(order.grandTotal.toFixed(2));
      const problems = [
        v.amount === null || v.amount !== expected
          ? `amount ${v.amount === null ? 'missing' : formatPaisa(v.amount)} instead of ${formatPaisa(expected)}`
          : null,
        v.amount !== null && v.amount !== parsePaisa(payment.amount.toFixed(2))
          ? 'amount differs from the attempt'
          : null,
        v.orderNumber && v.orderNumber !== order.orderNumber ? `reference ${v.orderNumber}` : null,
      ].filter(Boolean);
      if (problems.length) {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            ...base,
            status: 'FAILED',
            failureReason: `Verification mismatch: ${problems.join('; ')}`,
          },
        });
        review = `Online payment could not be accepted (${problems.join('; ')}). Check it in the gateway panel.`;
        await tx.orderNote.create({ data: { orderId: order.id, note: review } });
        return 'MISMATCH';
      }

      await tx.payment.update({
        where: { id: payment.id },
        data: {
          ...base,
          status: 'SUCCESS',
          gatewayTxnId: v.gatewayTxnId ?? null,
          paidAt: new Date(),
        },
      });
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID' } });
      if (order.status === 'CANCELLED') {
        review =
          'Payment arrived after the order was cancelled. Refund the customer or reinstate the order.';
        await tx.orderNote.create({ data: { orderId: order.id, note: review } });
        return 'LATE_PAYMENT';
      }
      confirm = order.status === 'PENDING';
      return 'PAID';
    });
  } catch (err) {
    // The same gateway transaction already recorded on another attempt: nothing more to do.
    if (isUniqueViolation(err))
      return { outcome: 'ALREADY_PAID' as ApplyOutcome, orderId: found.orderId };
    throw err;
  }

  if (confirm) {
    await changeOrderStatus(deps, {
      orderId: found.orderId,
      to: 'CONFIRMED',
      source: 'SYSTEM',
      note: 'Paid online',
    }).catch((err: unknown) => {
      console.error(
        `Auto-confirm of ${found.orderId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }
  if (review) await alertAdmin(deps, found.orderId, review);
  return { outcome, orderId: found.orderId };
}

async function alertAdmin(deps: PaymentDeps, orderId: string, problem: string) {
  try {
    const to = await findSettingValue(deps.prisma, 'notifications.adminEmail');
    if (typeof to !== 'string' || !to.trim()) return;
    const o = await deps.prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { orderNumber: true },
    });
    await enqueueEmail(deps, {
      template: 'admin-payment-review',
      to,
      orderId,
      data: { orderNumber: o.orderNumber, problem, url: `${appUrl(deps)}/admin/orders/${orderId}` },
    });
  } catch (err) {
    console.error(
      `Payment review email for ${orderId} failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/** Verify one invoice with its gateway and apply the result. */
export async function verifyInvoice(deps: PaymentDeps, code: string, invoiceId: string) {
  const gateway = deps.gateways[code];
  if (!gateway) throw businessRule('PAYMENT_METHOD_UNAVAILABLE', 'Online payment is not available');
  const verified = await gateway.verify({ gatewayInvoiceId: invoiceId });
  return applyVerification(deps, verified);
}

/** For the return page: verifies, then reports what the customer should see (display only). */
export async function confirmFromReturn(deps: PaymentDeps, code: string, invoiceId: string) {
  const { outcome, orderId } = await verifyInvoice(deps, code, invoiceId);
  if (!orderId) throw new AppError('NOT_FOUND', 'Payment not found');
  const o = await deps.prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: { orderNumber: true, status: true, paymentStatus: true },
  });
  return { outcome, ...o };
}

// Jobs -------------------------------------------------------------------------------------------

/** Re-verifies open attempts (the gateway does not push webhooks on its own). */
export async function reconcilePayments(deps: PaymentDeps, now = new Date()) {
  const open = await deps.prisma.payment.findMany({
    where: {
      status: { in: ['INITIATED', 'PENDING'] },
      gatewayInvoiceId: { not: null },
      createdAt: {
        lt: new Date(now.getTime() - 2 * 60_000),
        gt: new Date(now.getTime() - 3 * 86_400_000),
      },
    },
    select: { gatewayInvoiceId: true, method: { select: { code: true } } },
    take: 100,
  });
  let checked = 0;
  for (const p of open) {
    if (!deps.gateways[p.method.code]) continue;
    try {
      await verifyInvoice(deps, p.method.code, p.gatewayInvoiceId!);
      checked += 1;
    } catch (err) {
      console.error(
        `Reconcile ${p.gatewayInvoiceId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return checked;
}

/**
 * Cancels online orders still unpaid PAYMENT_WINDOW_MINUTES after placement (stock and coupon are
 * released by changeOrderStatus). Each order's open attempts are verified once more first.
 */
export async function expireUnpaidOrders(deps: PaymentDeps, now = new Date()) {
  const stale = await deps.prisma.order.findMany({
    where: {
      status: 'PENDING',
      paymentStatus: { in: ['PENDING', 'FAILED'] },
      paymentMethod: { code: { in: ONLINE_METHOD_CODES } },
      placedAt: { lt: new Date(now.getTime() - PAYMENT_WINDOW_MINUTES * 60_000) },
    },
    select: {
      id: true,
      payments: {
        where: { status: { in: ['INITIATED', 'PENDING'] }, gatewayInvoiceId: { not: null } },
        select: { gatewayInvoiceId: true, method: { select: { code: true } } },
      },
    },
    take: 100,
  });
  let cancelled = 0;
  for (const order of stale) {
    for (const p of order.payments) {
      if (!deps.gateways[p.method.code]) continue;
      await verifyInvoice(deps, p.method.code, p.gatewayInvoiceId!).catch((err: unknown) => {
        console.error(
          `Verify before expiry failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      });
    }
    const fresh = await deps.prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      select: { status: true, paymentStatus: true },
    });
    if (fresh.status !== 'PENDING' || fresh.paymentStatus === 'PAID') continue;
    try {
      await changeOrderStatus(deps, {
        orderId: order.id,
        to: 'CANCELLED',
        source: 'SYSTEM',
        note: `Not paid within ${PAYMENT_WINDOW_MINUTES} minutes`,
        cancelReason: 'Online payment was not completed in time',
      });
      await deps.prisma.payment.updateMany({
        where: { orderId: order.id, status: { in: ['INITIATED', 'PENDING'] } },
        data: { status: 'CANCELLED', failureReason: 'Order expired' },
      });
      cancelled += 1;
    } catch (err) {
      console.error(
        `Expiry of ${order.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
  return cancelled;
}
