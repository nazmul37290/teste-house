import { z } from 'zod';
import { BD_GEO } from './bd-geo';
import { moneySchema } from './catalog-schemas';
import { parsePaisa } from './money';

/** All district names (delivery zones list districts; the address form picks one). */
export const BD_DISTRICTS: readonly string[] = Object.values(BD_GEO)
  .flatMap((d) => Object.keys(d))
  .sort();

const nonEmpty = (v: object) => Object.values(v).some((x) => x !== undefined);

// Delivery zones ---------------------------------------------------------------------------------

const zoneCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and dashes')
  .max(40);

const districtListSchema = z
  .array(z.string().trim())
  .max(64)
  .refine((list) => list.every((d) => BD_DISTRICTS.includes(d)), 'Unknown district')
  .refine((list) => new Set(list).size === list.length, 'A district is listed twice')
  .transform((list) => [...list].sort());

const zoneFields = {
  name: z.string().trim().min(2).max(60),
  code: zoneCodeSchema,
  districts: districtListSchema,
  charge: moneySchema,
  freeDeliveryThreshold: moneySchema.nullable().optional(),
  estimatedDays: z.string().trim().max(40).nullable().optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
};

/** The default zone covers every district no other zone lists, so its own list may be empty. */
export const createDeliveryZoneSchema = z.strictObject(zoneFields);
export const updateDeliveryZoneSchema = z
  .strictObject(zoneFields)
  .partial()
  .refine(nonEmpty, 'Nothing to update');

// Payment methods --------------------------------------------------------------------------------

export const COD_SCOPES = ['DHAKA_ONLY', 'NATIONWIDE'] as const;
export type CodScope = (typeof COD_SCOPES)[number];

/** Stored in `payment_methods.config`. Amounts are money strings. */
export const paymentMethodConfigSchema = z.strictObject({
  scope: z.enum(COD_SCOPES).optional(),
  minAmount: moneySchema.nullable().optional(),
  maxAmount: moneySchema.nullable().optional(),
});
export type PaymentMethodConfig = z.output<typeof paymentMethodConfigSchema>;

export const updatePaymentMethodSchema = z
  .strictObject({
    name: z.string().trim().min(2).max(60).optional(),
    isActive: z.boolean().optional(),
    sortOrder: z.number().int().min(0).max(9999).optional(),
    config: paymentMethodConfigSchema.optional(),
  })
  .refine(nonEmpty, 'Nothing to update')
  .refine(
    (v) =>
      !v.config?.minAmount ||
      !v.config.maxAmount ||
      parsePaisa(v.config.minAmount) <= parsePaisa(v.config.maxAmount),
    { message: 'Minimum must not exceed maximum', path: ['config', 'maxAmount'] },
  );

/** Read a stored config leniently (older rows may hold numbers); unknown shapes count as empty. */
export function readPaymentMethodConfig(raw: unknown): PaymentMethodConfig {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const money = (v: unknown) =>
    typeof v === 'string' || typeof v === 'number'
      ? moneySchema.safeParse(String(v)).data
      : undefined;
  const scope = COD_SCOPES.find((s) => s === r.scope);
  return {
    ...(scope ? { scope } : {}),
    ...(money(r.minAmount) ? { minAmount: money(r.minAmount) } : {}),
    ...(money(r.maxAmount) ? { maxAmount: money(r.maxAmount) } : {}),
  };
}

// Coupons ----------------------------------------------------------------------------------------

export const COUPON_TYPES = ['FIXED', 'PERCENT'] as const;

export const couponCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9_-]{2,39}$/, 'Use 3 to 40 letters, numbers, dashes or underscores');

const isoDate = z.iso.datetime({ offset: true }).transform((v) => new Date(v));

const couponFields = {
  code: couponCodeSchema,
  type: z.enum(COUPON_TYPES),
  /** FIXED: taka amount. PERCENT: percent, up to two decimals (12.5). */
  value: moneySchema,
  minOrderAmount: moneySchema.nullable().optional(),
  maxDiscount: moneySchema.nullable().optional(),
  usageLimit: z.number().int().min(1).max(1_000_000).nullable().optional(),
  perCustomerLimit: z.number().int().min(1).max(1000).nullable().optional(),
  startsAt: isoDate.nullable().optional(),
  expiresAt: isoDate.nullable().optional(),
  isActive: z.boolean().optional(),
};

type CouponShape = {
  type?: 'FIXED' | 'PERCENT';
  value?: string;
  startsAt?: Date | null;
  expiresAt?: Date | null;
};
const couponRules = <T extends z.ZodType<CouponShape>>(schema: T) =>
  schema
    .refine((v) => v.value === undefined || parsePaisa(v.value) > 0, {
      message: 'Must be more than 0',
      path: ['value'],
    })
    .refine((v) => v.type !== 'PERCENT' || v.value === undefined || parsePaisa(v.value) <= 10000, {
      message: 'A percentage cannot exceed 100',
      path: ['value'],
    })
    .refine((v) => !v.startsAt || !v.expiresAt || v.startsAt < v.expiresAt, {
      message: 'The end must be after the start',
      path: ['expiresAt'],
    });

export const createCouponSchema = couponRules(z.strictObject(couponFields));
/** On update, type and value travel together so a percent limit can always be checked. */
export const updateCouponSchema = couponRules(
  z
    .strictObject(couponFields)
    .partial()
    .refine(nonEmpty, 'Nothing to update')
    .refine((v) => (v.type === undefined) === (v.value === undefined), {
      message: 'Send type and value together',
      path: ['value'],
    }),
);

export type CreateDeliveryZoneInput = z.output<typeof createDeliveryZoneSchema>;
export type UpdateDeliveryZoneInput = z.output<typeof updateDeliveryZoneSchema>;
export type UpdatePaymentMethodInput = z.output<typeof updatePaymentMethodSchema>;
export type CreateCouponInput = z.output<typeof createCouponSchema>;
export type UpdateCouponInput = z.output<typeof updateCouponSchema>;

// Cart -------------------------------------------------------------------------------------------

/** Most of one variant a cart line (and an order line) may hold. */
export const MAX_CART_LINE_QUANTITY = 50;
/** Most distinct lines in one cart. */
export const MAX_CART_LINES = 50;

const cartQuantity = z.number().int().min(1).max(MAX_CART_LINE_QUANTITY);

export const addCartItemSchema = z.strictObject({ variantId: z.uuid(), quantity: cartQuantity });
export const updateCartItemSchema = z.strictObject({ quantity: cartQuantity });

export type AddCartItemInput = z.output<typeof addCartItemSchema>;
