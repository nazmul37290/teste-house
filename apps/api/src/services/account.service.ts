import {
  isPlaceholderEmail,
  MAX_CART_LINE_QUANTITY,
  type CustomerAddressInput,
} from '@shop/shared';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { addItem, customerCartId } from './cart.service';
import { orderView } from './order.service';
import { changeOrderStatus, CUSTOMER_CANCELLABLE, type StatusDeps } from './order-status.service';

/**
 * The signed-in customer's own data (/me). Every query is scoped by customerId; another customer's
 * address or order is a 404, never a 403, so ids reveal nothing.
 */

export const MAX_ADDRESSES = 10;

// Profile ----------------------------------------------------------------------------------------

export async function getProfile(prisma: Db, customerId: string) {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    select: { name: true, phone: true, email: true, emailVerified: true, createdAt: true },
  });
  return { ...c, email: isPlaceholderEmail(c.email) ? null : c.email };
}

export async function updateProfile(prisma: Db, customerId: string, input: { name: string }) {
  await prisma.customer.update({ where: { id: customerId }, data: { name: input.name } });
  return getProfile(prisma, customerId);
}

// Addresses --------------------------------------------------------------------------------------

const addressSelect = {
  id: true,
  label: true,
  recipientName: true,
  phone: true,
  division: true,
  district: true,
  upazila: true,
  addressLine: true,
  postalCode: true,
  isDefault: true,
} as const;

export function listAddresses(prisma: Db, customerId: string) {
  return prisma.customerAddress.findMany({
    where: { customerId },
    select: addressSelect,
    orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
  });
}

const addressData = (input: CustomerAddressInput) => ({
  label: input.label ?? null,
  recipientName: input.recipientName,
  phone: input.phone,
  division: input.division,
  district: input.district,
  upazila: input.upazila ?? null,
  addressLine: input.addressLine,
  postalCode: input.postalCode ?? null,
});

export async function createAddress(prisma: Db, customerId: string, input: CustomerAddressInput) {
  return prisma.$transaction(async (tx) => {
    const count = await tx.customerAddress.count({ where: { customerId } });
    if (count >= MAX_ADDRESSES) {
      throw new AppError('BUSINESS_RULE', `You can save up to ${MAX_ADDRESSES} addresses`, [
        { reason: 'TOO_MANY_ADDRESSES' },
      ]);
    }
    // The first address is the default; a new default replaces the old one (uq_default_address).
    const isDefault = count === 0 || input.isDefault === true;
    if (isDefault)
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    return tx.customerAddress.create({
      data: { customerId, ...addressData(input), isDefault },
      select: addressSelect,
    });
  });
}

async function ownAddress(db: Pick<Db, 'customerAddress'>, customerId: string, id: string) {
  const found = await db.customerAddress.findFirst({
    where: { id, customerId },
    select: addressSelect,
  });
  if (!found) throw new AppError('NOT_FOUND', 'Address not found');
  return found;
}

/** Whole-address replace. Turning the default off is ignored: pick another default instead. */
export async function replaceAddress(
  prisma: Db,
  customerId: string,
  id: string,
  input: CustomerAddressInput,
) {
  return prisma.$transaction(async (tx) => {
    const before = await ownAddress(tx, customerId, id);
    const isDefault = before.isDefault || input.isDefault === true;
    if (isDefault && !before.isDefault) {
      await tx.customerAddress.updateMany({ where: { customerId }, data: { isDefault: false } });
    }
    return tx.customerAddress.update({
      where: { id },
      data: { ...addressData(input), isDefault },
      select: addressSelect,
    });
  });
}

export async function deleteAddress(prisma: Db, customerId: string, id: string) {
  await prisma.$transaction(async (tx) => {
    const before = await ownAddress(tx, customerId, id);
    await tx.customerAddress.delete({ where: { id } });
    if (before.isDefault) {
      const next = await tx.customerAddress.findFirst({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (next)
        await tx.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
}

// Orders -----------------------------------------------------------------------------------------

export async function listOrders(prisma: Db, customerId: string, page: number, pageSize: number) {
  const where = { customerId };
  const [rows, total] = await Promise.all([
    prisma.order.findMany({
      where,
      select: {
        orderNumber: true,
        status: true,
        paymentStatus: true,
        placedAt: true,
        grandTotal: true,
        paymentMethod: { select: { name: true } },
        items: { select: { quantity: true } },
      },
      orderBy: { placedAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.order.count({ where }),
  ]);
  return {
    items: rows.map(({ items, grandTotal, ...o }) => ({
      ...o,
      grandTotal: grandTotal.toFixed(2),
      itemCount: items.reduce((n, i) => n + i.quantity, 0),
    })),
    total,
  };
}

async function ownOrderId(prisma: Db, customerId: string, orderNumber: string) {
  const o = await prisma.order.findFirst({
    where: { orderNumber, customerId },
    select: { id: true },
  });
  if (!o) throw new AppError('NOT_FOUND', 'Order not found');
  return o.id;
}

export async function getOrder(prisma: Db, customerId: string, orderNumber: string) {
  const view = await orderView({ prisma }, await ownOrderId(prisma, customerId, orderNumber));
  return { ...view, canCancel: CUSTOMER_CANCELLABLE.includes(view.status) };
}

export async function cancelOrder(
  deps: StatusDeps,
  customerId: string,
  orderNumber: string,
  reason?: string,
) {
  const orderId = await ownOrderId(deps.prisma, customerId, orderNumber);
  try {
    await changeOrderStatus(deps, {
      orderId,
      to: 'CANCELLED',
      source: 'CUSTOMER',
      allowedFrom: CUSTOMER_CANCELLABLE,
      note: 'Cancelled by the customer',
      cancelReason: reason ?? 'Cancelled by the customer',
    });
  } catch (err) {
    if (err instanceof AppError && err.code === 'BUSINESS_RULE') {
      throw new AppError(
        'BUSINESS_RULE',
        'This order can no longer be cancelled. Please contact us.',
        [{ reason: 'CANNOT_CANCEL' }],
      );
    }
    throw err;
  }
  return getOrder(deps.prisma, customerId, orderNumber);
}

/** Adds the order's items that can still be bought to the cart (as much as stock allows). */
export async function reorder(prisma: Db, customerId: string, orderNumber: string) {
  const orderId = await ownOrderId(prisma, customerId, orderNumber);
  const items = await prisma.orderItem.findMany({
    where: { orderId },
    select: {
      variantId: true,
      productName: true,
      quantity: true,
      variant: { select: { stockQty: true } },
    },
  });
  const cartId = await customerCartId(prisma, customerId);
  const skipped: string[] = [];
  let added = 0;
  for (const item of items) {
    const inCart = await prisma.cartItem.findUnique({
      where: { cartId_variantId: { cartId, variantId: item.variantId } },
      select: { quantity: true },
    });
    const room = Math.min(item.variant.stockQty, MAX_CART_LINE_QUANTITY) - (inCart?.quantity ?? 0);
    const quantity = Math.min(item.quantity, room);
    if (quantity < 1) {
      skipped.push(item.productName);
      continue;
    }
    try {
      await addItem(prisma, cartId, { variantId: item.variantId, quantity });
      added += 1;
    } catch (err) {
      if (!(err instanceof AppError)) throw err;
      skipped.push(item.productName);
    }
  }
  return { added, skipped };
}

export { ownOrderId };
