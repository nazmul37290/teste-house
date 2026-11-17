import {
  dhakaDayRange,
  formatPaisa,
  parsePaisa,
  type AdminPaymentListQuery,
  type RecordRefundInput,
} from '@shop/shared';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { recordAudit, type Actor } from './audit.service';
import { businessRule } from './role.service';

/** Payment records [orders.view] and manually recorded refunds [payments.refund] (PAY-5, PAY-7). */

export async function listPayments(prisma: Db, q: AdminPaymentListQuery) {
  const search = q.q?.trim().toUpperCase();
  const where: Prisma.PaymentWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.method ? { method: { code: q.method } } : {}),
    ...(q.from || q.to ? { createdAt: dhakaDayRange(q.from, q.to) } : {}),
    ...(search
      ? {
          OR: [
            { order: { orderNumber: { contains: search } } },
            { gatewayTxnId: { contains: search, mode: 'insensitive' } },
            { gatewayInvoiceId: { contains: search, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    prisma.payment.findMany({
      where,
      select: {
        id: true,
        amount: true,
        status: true,
        gatewayInvoiceId: true,
        gatewayTxnId: true,
        failureReason: true,
        paidAt: true,
        createdAt: true,
        method: { select: { code: true, name: true } },
        order: { select: { id: true, orderNumber: true, status: true, contactName: true } },
        refunds: { select: { amount: true } },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.payment.count({ where }),
  ]);
  return {
    items: rows.map(({ amount, refunds, ...p }) => ({
      ...p,
      amount: amount.toFixed(2),
      refunded: formatPaisa(refunds.reduce((n, r) => n + parsePaisa(r.amount.toFixed(2)), 0)),
    })),
    total,
  };
}

/**
 * Records money already returned to the customer (the gateway is not called). Only for successful
 * payments of this order; refunds never exceed what was paid. The order's payment status follows.
 */
export async function recordRefund(
  prisma: Db,
  actor: Actor,
  orderId: string,
  input: RecordRefundInput,
) {
  return prisma.$transaction(async (tx) => {
    // Lock the payment so two refunds at once cannot both pass the limit check.
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT id FROM payments WHERE id = ${input.paymentId}::uuid AND "orderId" = ${orderId}::uuid FOR UPDATE`;
    if (!locked.length) throw new AppError('NOT_FOUND', 'Payment not found for this order');
    const payment = await tx.payment.findUniqueOrThrow({
      where: { id: input.paymentId },
      select: { amount: true, status: true, refunds: { select: { amount: true } } },
    });
    if (payment.status !== 'SUCCESS') {
      throw businessRule('PAYMENT_NOT_PAID', 'Only a successful payment can be refunded');
    }
    const paid = parsePaisa(payment.amount.toFixed(2));
    const already = payment.refunds.reduce((n, r) => n + parsePaisa(r.amount.toFixed(2)), 0);
    const amount = parsePaisa(input.amount);
    if (already + amount > paid) {
      throw new AppError(
        'BUSINESS_RULE',
        `At most Tk ${formatPaisa(paid - already)} can still be refunded`,
        [{ reason: 'REFUND_TOO_LARGE', maxAmount: formatPaisa(paid - already) }],
      );
    }
    const refund = await tx.refund.create({
      data: {
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
        status: 'COMPLETED',
        createdById: actor.adminUserId,
      },
      select: { id: true },
    });
    const fully = already + amount === paid;
    await tx.order.update({
      where: { id: orderId },
      data: { paymentStatus: fully ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
    });
    await tx.orderNote.create({
      data: {
        orderId,
        adminUserId: actor.adminUserId,
        note: `Refund recorded: Tk ${input.amount} (${input.reason})`,
      },
    });
    await recordAudit(tx, actor, {
      action: 'payment.refund',
      entityType: 'order',
      entityId: orderId,
      after: {
        paymentId: input.paymentId,
        amount: input.amount,
        reason: input.reason,
        refundId: refund.id,
      },
    });
    return { refundId: refund.id, refunded: formatPaisa(already + amount), fully };
  });
}
