import type { CreateCouponInput, UpdateCouponInput } from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prisma-errors';
import { recordAudit, type Actor } from './audit.service';
import { notFound } from './taxonomy-common';

/**
 * Coupon admin [coupons.manage]. Codes are stored uppercase and unique. A coupon that has been used
 * is never deleted (orders point at it); turn it off instead. Validation at checkout lives in the
 * order service.
 */

const couponSelect = {
  id: true,
  code: true,
  type: true,
  value: true,
  minOrderAmount: true,
  maxDiscount: true,
  usageLimit: true,
  perCustomerLimit: true,
  usedCount: true,
  startsAt: true,
  expiresAt: true,
  isActive: true,
  createdAt: true,
} as const;

type CouponRow = Prisma.CouponGetPayload<{ select: typeof couponSelect }>;
const toCoupon = ({ value, minOrderAmount, maxDiscount, ...c }: CouponRow) => ({
  ...c,
  value: value.toFixed(2),
  minOrderAmount: minOrderAmount?.toFixed(2) ?? null,
  maxDiscount: maxDiscount?.toFixed(2) ?? null,
});

export async function listCoupons(prisma: Db, q?: string) {
  const rows = await prisma.coupon.findMany({
    where: q ? { code: { contains: q.trim().toUpperCase() } } : {},
    select: couponSelect,
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows.map(toCoupon);
}

function mapCouponError(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new AppError('CONFLICT', 'A coupon with this code already exists', [
      { reason: 'CODE_TAKEN' },
    ]);
  }
  throw err;
}

export async function createCoupon(prisma: Db, actor: Actor, input: CreateCouponInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const coupon = await tx.coupon.create({ data: input, select: couponSelect });
      await recordAudit(tx, actor, {
        action: 'coupon.create',
        entityType: 'coupon',
        entityId: coupon.id,
        after: input,
      });
      return toCoupon(coupon);
    });
  } catch (err) {
    mapCouponError(err);
  }
}

export async function updateCoupon(prisma: Db, actor: Actor, id: string, input: UpdateCouponInput) {
  try {
    return await prisma.$transaction(async (tx) => {
      const before = await tx.coupon.findUnique({ where: { id }, select: couponSelect });
      if (!before) throw notFound('Coupon');
      // The date order must also hold against the stored dates.
      const startsAt = input.startsAt !== undefined ? input.startsAt : before.startsAt;
      const expiresAt = input.expiresAt !== undefined ? input.expiresAt : before.expiresAt;
      if (startsAt && expiresAt && startsAt >= expiresAt) {
        throw new AppError('VALIDATION_ERROR', 'The end must be after the start', [
          { path: 'expiresAt', message: 'Before the start' },
        ]);
      }
      if (input.code && input.code !== before.code && before.usedCount > 0) {
        throw new AppError('BUSINESS_RULE', 'A used coupon keeps its code', [
          { reason: 'COUPON_USED' },
        ]);
      }
      const coupon = await tx.coupon.update({ where: { id }, data: input, select: couponSelect });
      await recordAudit(tx, actor, {
        action: 'coupon.update',
        entityType: 'coupon',
        entityId: id,
        before: toCoupon(before),
        after: input,
      });
      return toCoupon(coupon);
    });
  } catch (err) {
    mapCouponError(err);
  }
}

export async function deleteCoupon(prisma: Db, actor: Actor, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await tx.coupon.findUnique({
      where: { id },
      select: { ...couponSelect, _count: { select: { orders: true, usages: true } } },
    });
    if (!before) throw notFound('Coupon');
    const { _count, ...row } = before;
    if (row.usedCount > 0 || _count.orders > 0 || _count.usages > 0) {
      throw new AppError('CONFLICT', 'This coupon has been used; turn it off instead', [
        { reason: 'COUPON_IN_USE' },
      ]);
    }
    await tx.coupon.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: 'coupon.delete',
      entityType: 'coupon',
      entityId: id,
      before: toCoupon(row),
    });
  });
}
