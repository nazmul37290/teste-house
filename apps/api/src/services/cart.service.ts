import { createHash, randomBytes } from 'node:crypto';
import {
  formatPaisa,
  MAX_CART_LINE_QUANTITY,
  MAX_CART_LINES,
  parsePaisa,
  type AddCartItemInput,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { businessRule } from './role.service';
import { imageOf } from './storefront.service';

/**
 * Carts (docs/design.md section 5). A signed-in customer has one cart; a guest's cart is found by
 * the random token in the httpOnly `shop_cart` cookie (only its SHA-256 is stored). When a request
 * is signed in and still carries a guest cookie, the guest cart is merged into the customer cart.
 *
 * Prices shown here are for display. The order recalculates everything inside its transaction.
 * Exact stock is never returned: a line's `maxQuantity` is min(stock, MAX_CART_LINE_QUANTITY).
 */

export type CartDeps = { prisma: Db; publicMediaUrl: string };

export const GUEST_CART_DAYS = 30;
const guestExpiry = () => new Date(Date.now() + GUEST_CART_DAYS * 86_400_000);

export const newGuestToken = () => randomBytes(32).toString('base64url');
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** A guest token looks like 43 base64url characters; anything else is ignored. */
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export async function findGuestCartId(prisma: Db, token: string | undefined) {
  if (!token || !TOKEN_RE.test(token)) return null;
  const cart = await prisma.cart.findFirst({
    where: {
      sessionToken: hashToken(token),
      customerId: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    select: { id: true },
  });
  return cart?.id ?? null;
}

export async function createGuestCart(prisma: Db, token: string) {
  const cart = await prisma.cart.create({
    data: { sessionToken: hashToken(token), expiresAt: guestExpiry() },
    select: { id: true },
  });
  return cart.id;
}

export async function customerCartId(prisma: Db, customerId: string) {
  const cart = await prisma.cart.upsert({
    where: { customerId },
    create: { customerId },
    update: {},
    select: { id: true },
  });
  return cart.id;
}

/** Guest lines move into the customer cart (quantities add up, capped at what can be bought). */
export async function mergeGuestCart(prisma: Db, guestCartId: string, customerCartId: string) {
  await prisma.$transaction(async (tx) => {
    const guestItems = await tx.cartItem.findMany({
      where: { cartId: guestCartId },
      select: { variantId: true, quantity: true, variant: { select: { stockQty: true } } },
    });
    for (const item of guestItems) {
      const existing = await tx.cartItem.findUnique({
        where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
        select: { quantity: true },
      });
      const cap = Math.max(1, Math.min(item.variant.stockQty, MAX_CART_LINE_QUANTITY));
      const quantity = Math.min((existing?.quantity ?? 0) + item.quantity, cap);
      await tx.cartItem.upsert({
        where: { cartId_variantId: { cartId: customerCartId, variantId: item.variantId } },
        create: { cartId: customerCartId, variantId: item.variantId, quantity },
        update: { quantity },
      });
    }
    await tx.cart.delete({ where: { id: guestCartId } });
  });
}

// View -------------------------------------------------------------------------------------------

const itemSelect = {
  id: true,
  quantity: true,
  variant: {
    select: {
      id: true,
      sku: true,
      name: true,
      price: true,
      salePrice: true,
      stockQty: true,
      isActive: true,
      product: {
        select: {
          name: true,
          slug: true,
          status: true,
          deletedAt: true,
          images: {
            where: { isPrimary: true },
            take: 1,
            select: {
              media: { select: { path: true, altText: true, width: true, height: true } },
            },
          },
        },
      },
    },
  },
} as const;

type ItemRow = Prisma.CartItemGetPayload<{ select: typeof itemSelect }>;
type Variant = ItemRow['variant'];

export type CartProblem = 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK';

const purchasable = (v: {
  isActive: boolean;
  product: { status: string; deletedAt: Date | null };
}) => v.isActive && v.product.status === 'ACTIVE' && v.product.deletedAt === null;

function problemOf(v: Variant, quantity: number): CartProblem | null {
  if (!purchasable(v)) return 'UNAVAILABLE';
  if (v.stockQty <= 0) return 'OUT_OF_STOCK';
  if (quantity > v.stockQty) return 'NOT_ENOUGH_STOCK';
  return null;
}

function toLine(item: ItemRow, base: string) {
  const v = item.variant;
  const unit = parsePaisa((v.salePrice ?? v.price).toFixed(2));
  const media = v.product.images[0]?.media;
  return {
    id: item.id,
    variantId: v.id,
    sku: v.sku,
    productName: v.product.name,
    productSlug: v.product.slug,
    variantName: v.name,
    image: media ? imageOf(base, media) : null,
    unitPrice: formatPaisa(unit),
    regularPrice: v.salePrice ? v.price.toFixed(2) : null,
    quantity: item.quantity,
    lineTotal: formatPaisa(unit * item.quantity),
    maxQuantity: Math.max(0, Math.min(v.stockQty, MAX_CART_LINE_QUANTITY)),
    problem: problemOf(v, item.quantity),
  };
}

export type CartLine = ReturnType<typeof toLine>;
export type CartView = {
  items: CartLine[];
  itemCount: number;
  subtotal: string;
  hasProblems: boolean;
};

export const EMPTY_CART: CartView = {
  items: [],
  itemCount: 0,
  subtotal: '0.00',
  hasProblems: false,
};

export async function cartView(deps: CartDeps, cartId: string | null): Promise<CartView> {
  if (!cartId) return EMPTY_CART;
  const rows = await deps.prisma.cartItem.findMany({
    where: { cartId },
    select: itemSelect,
    orderBy: { createdAt: 'asc' },
  });
  const items = rows.map((r) => toLine(r, deps.publicMediaUrl));
  const ok = items.filter((i) => !i.problem);
  return {
    items,
    itemCount: items.reduce((n, i) => n + i.quantity, 0),
    // Only lines that can be ordered count towards the subtotal.
    subtotal: formatPaisa(ok.reduce((sum, i) => sum + parsePaisa(i.lineTotal), 0)),
    hasProblems: items.length !== ok.length,
  };
}

// Writes -----------------------------------------------------------------------------------------

function enoughStock(variant: { stockQty: number }, quantity: number) {
  const max = Math.min(variant.stockQty, MAX_CART_LINE_QUANTITY);
  if (variant.stockQty <= 0) throw businessRule('OUT_OF_STOCK', 'This item is out of stock');
  if (quantity > max) {
    throw new AppError('BUSINESS_RULE', `You can have up to ${max} of this item`, [
      { reason: 'NOT_ENOUGH_STOCK', maxQuantity: max },
    ]);
  }
}

export async function addItem(prisma: Db, cartId: string, input: AddCartItemInput) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: input.variantId },
    select: {
      stockQty: true,
      isActive: true,
      product: { select: { status: true, deletedAt: true } },
    },
  });
  if (!variant || !purchasable(variant)) {
    throw businessRule('UNAVAILABLE', 'This item is not available');
  }
  const existing = await prisma.cartItem.findUnique({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    select: { quantity: true },
  });
  if (!existing && (await prisma.cartItem.count({ where: { cartId } })) >= MAX_CART_LINES) {
    throw businessRule('CART_FULL', `A cart can hold up to ${MAX_CART_LINES} different items`);
  }
  const quantity = (existing?.quantity ?? 0) + input.quantity;
  enoughStock(variant, quantity);
  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId, variantId: input.variantId } },
    create: { cartId, variantId: input.variantId, quantity },
    update: { quantity },
  });
  await touch(prisma, cartId);
}

/** 404 for an item of another cart, so ids from other people reveal nothing. */
async function ownItem(prisma: Db, cartId: string | null, itemId: string) {
  const item = cartId
    ? await prisma.cartItem.findFirst({
        where: { id: itemId, cartId },
        select: { id: true, variant: { select: { stockQty: true } } },
      })
    : null;
  if (!item) throw new AppError('NOT_FOUND', 'Cart item not found');
  return item;
}

export async function setQuantity(
  prisma: Db,
  cartId: string | null,
  itemId: string,
  quantity: number,
) {
  const item = await ownItem(prisma, cartId, itemId);
  enoughStock(item.variant, quantity);
  await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } });
  await touch(prisma, cartId!);
}

export async function removeItem(prisma: Db, cartId: string | null, itemId: string) {
  const item = await ownItem(prisma, cartId, itemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
}

/** Guest carts live 30 days from the last change. */
async function touch(prisma: Db, cartId: string) {
  await prisma.cart.updateMany({
    where: { id: cartId, customerId: null },
    data: { expiresAt: guestExpiry() },
  });
}
