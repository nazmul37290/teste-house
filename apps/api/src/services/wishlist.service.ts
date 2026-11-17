import { MAX_WISHLIST_ITEMS } from '@shop/shared';
import type { Db } from '../lib/prisma';
import { businessRule } from './role.service';
import { cardsByIds, type StorefrontDeps } from './storefront.service';

/**
 * Customer wishlist (ACC-7). Guests keep product ids in the browser; at sign-in the web app sends
 * them to merge(). Hidden products stay in the table but are never shown (cardsByIds filters them).
 */

export async function listWishlist(deps: StorefrontDeps, customerId: string) {
  const rows = await deps.prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
    orderBy: { createdAt: 'desc' },
    take: MAX_WISHLIST_ITEMS,
  });
  return cardsByIds(
    deps,
    rows.map((r) => r.productId),
  );
}

/** Product ids only, for marking hearts as filled. */
export async function wishlistIds(prisma: Db, customerId: string) {
  const rows = await prisma.wishlistItem.findMany({
    where: { customerId },
    select: { productId: true },
  });
  return rows.map((r) => r.productId);
}

async function existingProducts(prisma: Db, ids: string[]) {
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, deletedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

export async function addToWishlist(prisma: Db, customerId: string, productId: string) {
  const [exists] = await existingProducts(prisma, [productId]);
  if (!exists) throw businessRule('UNAVAILABLE', 'This product is not available');
  const count = await prisma.wishlistItem.count({ where: { customerId } });
  if (count >= MAX_WISHLIST_ITEMS) {
    throw businessRule('WISHLIST_FULL', `A wishlist can hold up to ${MAX_WISHLIST_ITEMS} products`);
  }
  await prisma.wishlistItem.createMany({ data: [{ customerId, productId }], skipDuplicates: true });
  return wishlistIds(prisma, customerId);
}

export async function removeFromWishlist(prisma: Db, customerId: string, productId: string) {
  await prisma.wishlistItem.deleteMany({ where: { customerId, productId } });
  return wishlistIds(prisma, customerId);
}

/** Guest list into the account: unknown products are ignored, duplicates are no-ops. */
export async function mergeWishlist(prisma: Db, customerId: string, productIds: string[]) {
  const valid = await existingProducts(prisma, [...new Set(productIds)]);
  const room = MAX_WISHLIST_ITEMS - (await prisma.wishlistItem.count({ where: { customerId } }));
  if (valid.length && room > 0) {
    await prisma.wishlistItem.createMany({
      data: valid.slice(0, room).map((productId) => ({ customerId, productId })),
      skipDuplicates: true,
    });
  }
  return wishlistIds(prisma, customerId);
}
