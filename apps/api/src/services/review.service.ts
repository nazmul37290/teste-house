import {
  productPath,
  type AdminReviewListQuery,
  type CreateReviewInput,
  type UpdateReviewInput,
} from '@shop/shared';
import type { Deps } from '../deps';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prisma-errors';
import { queueRevalidate } from '../middleware/revalidate-after-write';
import { findSettingValue } from '../repositories/settings.repository';
import { recordAudit, type Actor } from './audit.service';
import { businessRule } from './role.service';
import { imageOf } from './storefront.service';

/**
 * Reviews (requirements section 9, docs/database.md section 5). Only customers with the product in
 * a DELIVERED order may review; one review per customer and product; PENDING until approved unless
 * `review.autoApprove`. The product's ratingAvg/ratingCount are recomputed from approved reviews in
 * the same transaction as every change.
 */

export type ReviewDeps = Pick<
  Deps,
  'prisma' | 'redis' | 'env' | 'revalidateQueue' | 'publicMediaUrl'
>;
type Tx = Prisma.TransactionClient;

/** A customer's uploaded photo is reserved for them for 24 h (Redis); unused ones are cleaned up. */
const PHOTO_TTL_SEC = 24 * 60 * 60;
const photoKey = (mediaId: string) => `reviewphoto:${mediaId}`;

export async function reservePhoto(deps: Pick<Deps, 'redis'>, mediaId: string, customerId: string) {
  await deps.redis.set(photoKey(mediaId), customerId, 'EX', PHOTO_TTL_SEC);
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? 'Customer';

// Ratings ----------------------------------------------------------------------------------------

export async function recomputeRating(tx: Tx, productId: string) {
  const agg = await tx.review.aggregate({
    where: { productId, status: 'APPROVED' },
    _avg: { rating: true },
    _count: { _all: true },
  });
  const count = agg._count._all;
  // Two decimals, as stored (Decimal(3,2)): an exact string, not float arithmetic on money-like data.
  const avg = count ? (Math.round((agg._avg.rating ?? 0) * 100) / 100).toFixed(2) : '0.00';
  await tx.product.update({
    where: { id: productId },
    data: { ratingAvg: avg, ratingCount: count },
  });
}

async function refreshProduct(deps: ReviewDeps, productId: string) {
  const p = await deps.prisma.product.findUnique({
    where: { id: productId },
    select: { slug: true },
  });
  if (p) queueRevalidate(deps, ['catalog', `product:${p.slug}`]);
}

// Public -----------------------------------------------------------------------------------------

const PAGE_SIZE = 10;

export async function publicReviews(deps: ReviewDeps, slug: string, page: number) {
  const product = await deps.prisma.product.findFirst({
    where: { slug, status: 'ACTIVE', deletedAt: null },
    select: { id: true, ratingAvg: true, ratingCount: true },
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  const where = { productId: product.id, status: 'APPROVED' as const };
  const [rows, total, perStar] = await Promise.all([
    deps.prisma.review.findMany({
      where,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        isVerifiedPurchase: true,
        adminReply: true,
        repliedAt: true,
        createdAt: true,
        customer: { select: { name: true } },
        images: {
          select: { media: { select: { path: true, altText: true, width: true, height: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    deps.prisma.review.count({ where }),
    deps.prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true } }),
  ]);
  return {
    summary: {
      average: Number(product.ratingAvg.toFixed(2)),
      count: product.ratingCount,
      stars: Object.fromEntries(
        [5, 4, 3, 2, 1].map((s) => [s, perStar.find((r) => r.rating === s)?._count._all ?? 0]),
      ),
    },
    items: rows.map(({ customer, images, ...r }) => ({
      ...r,
      author: firstName(customer.name),
      images: images.map((i) => imageOf(deps.publicMediaUrl, i.media)),
    })),
    meta: { page, pageSize: PAGE_SIZE, total },
  };
}

// Customer ---------------------------------------------------------------------------------------

/** The newest delivered order item of this product for this customer, if any. */
async function deliveredItem(db: Db | Tx, customerId: string, productId: string) {
  return db.orderItem.findFirst({
    where: { variant: { productId }, order: { customerId, status: 'DELIVERED' } },
    select: { id: true },
    orderBy: { order: { deliveredAt: 'desc' } },
  });
}

export async function eligibility(prisma: Db, customerId: string, productId: string) {
  const [item, existing] = await Promise.all([
    deliveredItem(prisma, customerId, productId),
    prisma.review.findUnique({
      where: { productId_customerId: { productId, customerId } },
      select: { id: true, status: true, rating: true, title: true, body: true },
    }),
  ]);
  return { canReview: Boolean(item) && !existing, hasPurchased: Boolean(item), review: existing };
}

/** Photos must be this customer's fresh uploads (or already on this review when editing). */
async function checkPhotos(
  deps: ReviewDeps,
  tx: Tx,
  customerId: string,
  mediaIds: string[],
  reviewId?: string,
) {
  const already = reviewId
    ? new Set(
        (await tx.reviewImage.findMany({ where: { reviewId }, select: { mediaId: true } })).map(
          (i) => i.mediaId,
        ),
      )
    : new Set<string>();
  for (const id of mediaIds) {
    if (already.has(id)) continue;
    if ((await deps.redis.get(photoKey(id))) !== customerId) {
      throw new AppError('VALIDATION_ERROR', 'A photo could not be used; please upload it again', [
        { path: 'mediaIds', message: 'Unknown photo' },
      ]);
    }
  }
}

async function autoApprove(prisma: Db) {
  return (await findSettingValue(prisma, 'review.autoApprove')) === true;
}

export async function createReview(deps: ReviewDeps, customerId: string, input: CreateReviewInput) {
  const product = await deps.prisma.product.findFirst({
    where: { id: input.productId, deletedAt: null },
    select: { id: true },
  });
  if (!product) throw new AppError('NOT_FOUND', 'Product not found');
  const item = await deliveredItem(deps.prisma, customerId, input.productId);
  if (!item) {
    throw businessRule(
      'NOT_PURCHASED',
      'You can review products from orders that were delivered to you',
    );
  }
  const status = (await autoApprove(deps.prisma)) ? 'APPROVED' : 'PENDING';
  try {
    const review = await deps.prisma.$transaction(async (tx) => {
      await checkPhotos(deps, tx, customerId, input.mediaIds);
      const r = await tx.review.create({
        data: {
          productId: input.productId,
          customerId,
          orderItemId: item.id,
          isVerifiedPurchase: true,
          rating: input.rating,
          title: input.title ?? null,
          body: input.body ?? null,
          status,
          images: { create: input.mediaIds.map((mediaId) => ({ mediaId })) },
        },
        select: { id: true, status: true },
      });
      if (status === 'APPROVED') await recomputeRating(tx, input.productId);
      return r;
    });
    await Promise.all(input.mediaIds.map((id) => deps.redis.del(photoKey(id))));
    if (status === 'APPROVED') await refreshProduct(deps, input.productId);
    return review;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw new AppError('CONFLICT', 'You have already reviewed this product', [
        { reason: 'ALREADY_REVIEWED' },
      ]);
    }
    throw err;
  }
}

async function ownReview(db: Db | Tx, customerId: string, id: string) {
  const r = await db.review.findFirst({
    where: { id, customerId },
    select: { id: true, productId: true, status: true },
  });
  if (!r) throw new AppError('NOT_FOUND', 'Review not found');
  return r;
}

/** An edit is moderated again (unless auto-approve), and replaces the photos. */
export async function updateReview(
  deps: ReviewDeps,
  customerId: string,
  id: string,
  input: UpdateReviewInput,
) {
  const status = (await autoApprove(deps.prisma)) ? 'APPROVED' : 'PENDING';
  const review = await deps.prisma.$transaction(async (tx) => {
    const own = await ownReview(tx, customerId, id);
    await checkPhotos(deps, tx, customerId, input.mediaIds, id);
    await tx.reviewImage.deleteMany({ where: { reviewId: id } });
    const r = await tx.review.update({
      where: { id },
      data: {
        rating: input.rating,
        title: input.title ?? null,
        body: input.body ?? null,
        status,
        images: { create: input.mediaIds.map((mediaId) => ({ mediaId })) },
      },
      select: { id: true, status: true, productId: true },
    });
    if (own.status === 'APPROVED' || status === 'APPROVED')
      await recomputeRating(tx, own.productId);
    return r;
  });
  await Promise.all(input.mediaIds.map((m) => deps.redis.del(photoKey(m))));
  await refreshProduct(deps, review.productId);
  return { id: review.id, status: review.status };
}

export async function deleteOwnReview(deps: ReviewDeps, customerId: string, id: string) {
  const own = await ownReview(deps.prisma, customerId, id);
  await deps.prisma.$transaction(async (tx) => {
    await tx.review.delete({ where: { id } });
    if (own.status === 'APPROVED') await recomputeRating(tx, own.productId);
  });
  if (own.status === 'APPROVED') await refreshProduct(deps, own.productId);
}

export async function myReviews(prisma: Db, customerId: string) {
  const rows = await prisma.review.findMany({
    where: { customerId },
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      status: true,
      createdAt: true,
      product: { select: { id: true, name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
  return rows;
}

/** Delivered products without a review yet, for "Review your purchases". */
export async function toReview(prisma: Db, customerId: string) {
  const items = await prisma.orderItem.findMany({
    where: {
      order: { customerId, status: 'DELIVERED' },
      variant: { product: { deletedAt: null, reviews: { none: { customerId } } } },
    },
    select: { variant: { select: { product: { select: { id: true, name: true, slug: true } } } } },
    take: 200,
  });
  const seen = new Map<string, { id: string; name: string; slug: string }>();
  for (const i of items) seen.set(i.variant.product.id, i.variant.product);
  return [...seen.values()];
}

// Admin ------------------------------------------------------------------------------------------

export async function adminList(deps: ReviewDeps, q: AdminReviewListQuery) {
  const where: Prisma.ReviewWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.q
      ? {
          OR: [
            { product: { name: { contains: q.q, mode: 'insensitive' } } },
            { customer: { name: { contains: q.q, mode: 'insensitive' } } },
            { body: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const [rows, total] = await Promise.all([
    deps.prisma.review.findMany({
      where,
      select: {
        id: true,
        rating: true,
        title: true,
        body: true,
        status: true,
        isVerifiedPurchase: true,
        adminReply: true,
        createdAt: true,
        product: { select: { name: true, slug: true } },
        customer: { select: { name: true, phone: true } },
        images: {
          select: { media: { select: { path: true, altText: true, width: true, height: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    deps.prisma.review.count({ where }),
  ]);
  return {
    items: rows.map(({ images, product, ...r }) => ({
      ...r,
      product: { ...product, path: productPath(product.slug) },
      images: images.map((i) => imageOf(deps.publicMediaUrl, i.media)),
    })),
    total,
  };
}

async function moderate(
  deps: ReviewDeps,
  actor: Actor,
  id: string,
  action: string,
  change: (tx: Tx) => Promise<unknown>,
) {
  const before = await deps.prisma.review.findUnique({
    where: { id },
    select: { id: true, productId: true, status: true, adminReply: true },
  });
  if (!before) throw new AppError('NOT_FOUND', 'Review not found');
  await deps.prisma.$transaction(async (tx) => {
    await change(tx);
    await recomputeRating(tx, before.productId);
    await recordAudit(tx, actor, { action, entityType: 'review', entityId: id, before });
  });
  await refreshProduct(deps, before.productId);
}

export const setStatus = (
  deps: ReviewDeps,
  actor: Actor,
  id: string,
  status: 'APPROVED' | 'REJECTED',
) =>
  moderate(deps, actor, id, status === 'APPROVED' ? 'review.approve' : 'review.reject', (tx) =>
    tx.review.update({ where: { id }, data: { status } }),
  );

export const reply = (deps: ReviewDeps, actor: Actor, id: string, text: string) =>
  moderate(deps, actor, id, 'review.reply', (tx) =>
    tx.review.update({
      where: { id },
      data: text
        ? { adminReply: text, repliedAt: new Date() }
        : { adminReply: null, repliedAt: null },
    }),
  );

export const adminDelete = (deps: ReviewDeps, actor: Actor, id: string) =>
  moderate(deps, actor, id, 'review.delete', (tx) => tx.review.delete({ where: { id } }));

/** Newest approved reviews that have text, for the home page. First names only, no ids of people. */
export async function recentReviews(prisma: Db, limit = 6) {
  const rows = await prisma.review.findMany({
    where: {
      status: 'APPROVED',
      AND: [{ body: { not: null } }, { NOT: { body: '' } }],
      product: { status: 'ACTIVE', deletedAt: null },
    },
    select: {
      id: true,
      rating: true,
      title: true,
      body: true,
      isVerifiedPurchase: true,
      createdAt: true,
      customer: { select: { name: true } },
      product: { select: { name: true, slug: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
  return rows.map(({ customer, ...r }) => ({ ...r, author: firstName(customer.name) }));
}
