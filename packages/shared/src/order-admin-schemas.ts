import { z } from 'zod';
import { MAX_CART_LINE_QUANTITY } from './checkout-schemas';
import { addressInput } from './schemas';

/** Admin order management (docs/api-conventions.md, Admin > Orders). */

export const ORDER_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'PROCESSING',
  'HANDED_TO_COURIER',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
  'RETURNED',
  'FAILED',
] as const;
export type OrderStatusValue = (typeof ORDER_STATUSES)[number];

export const PAYMENT_STATUSES = [
  'UNPAID',
  'PENDING',
  'PAID',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
] as const;

const dhakaDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** Dates are calendar days in Asia/Dhaka (UTC+6); `to` includes the whole day. */
export const adminOrderListQuerySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(ORDER_STATUSES).optional(),
    paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
    from: dhakaDay.optional(),
    to: dhakaDay.optional(),
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'The end date is before the start date',
    path: ['to'],
  });
export type AdminOrderListQuery = z.output<typeof adminOrderListQuerySchema>;

export const changeOrderStatusSchema = z.strictObject({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional(),
});

export const orderNoteSchema = z.strictObject({ note: z.string().trim().min(1).max(2000) });

/**
 * Admin edit before the courier has the parcel (docs/pricing.md section 7). `items` is the complete
 * new list: kept lines keep their order-time price, new lines use the current price. Never a price.
 */
export const editOrderSchema = z
  .strictObject({
    items: z
      .array(
        z.strictObject({
          variantId: z.uuid(),
          quantity: z.number().int().min(1).max(MAX_CART_LINE_QUANTITY),
        }),
      )
      .min(1)
      .max(100)
      .refine((items) => new Set(items.map((i) => i.variantId)).size === items.length, {
        message: 'Each item may appear only once',
      })
      .optional(),
    address: addressInput.optional(),
    removeCoupon: z.literal(true).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => v.items || v.address || v.removeCoupon, 'Nothing to change');
export type EditOrderInput = z.output<typeof editOrderSchema>;

/** Start (inclusive) and end (exclusive) instants of Dhaka calendar days. */
export function dhakaDayRange(from?: string, to?: string): { gte?: Date; lt?: Date } {
  const start = (d: string) => new Date(`${d}T00:00:00+06:00`);
  return {
    ...(from ? { gte: start(from) } : {}),
    ...(to ? { lt: new Date(start(to).getTime() + 86_400_000) } : {}),
  };
}
