import { z } from 'zod';
import { checkBdAddress } from './bd-geo';
import { normalizePhone } from './phone';

/**
 * Order input. Every object is strict: unknown keys (including any price, total,
 * discount or delivery field) make validation fail. Prices are never accepted from the client.
 */

const phone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Invalid Bangladeshi mobile number' });
      return z.NEVER;
    }
    return n;
  });

/** A Bangladeshi mobile number, normalized to 01XXXXXXXXX. */
export const phoneSchema = phone;

const email = z.string().trim().toLowerCase().pipe(z.email()).optional();

export const orderItemInput = z.strictObject({
  variantId: z.uuid(),
  quantity: z.number().int().min(1).max(1000),
});

export const addressInput = z
  .strictObject({
    recipientName: z.string().trim().min(2).max(100),
    phone,
    division: z.string().trim().min(2).max(50),
    district: z.string().trim().min(2).max(50),
    upazila: z
      .string()
      .trim()
      .max(50)
      .optional()
      .transform((v) => v || undefined),
    addressLine: z.string().trim().min(5).max(300),
    postalCode: z.string().trim().max(10).optional(),
    deliveryNote: z.string().trim().max(300).optional(),
  })
  .superRefine((a, ctx) => {
    const geo = checkBdAddress(a.division, a.district, a.upazila);
    if (!geo.ok) ctx.addIssue({ code: 'custom', path: [geo.path], message: `Unknown ${geo.path}` });
  });

export const contactInput = z.strictObject({
  name: z.string().trim().min(2).max(100),
  phone,
  email,
});

/** `expectedGrandTotal` is compared with the server result only; it is never used as a price. */
export const createOrderSchema = z
  .strictObject({
    items: z.array(orderItemInput).min(1).max(100),
    couponCode: z.string().trim().toUpperCase().max(40).optional(),
    contact: contactInput,
    address: addressInput.optional(),
    addressId: z.uuid().optional(),
    paymentMethodCode: z.string().trim().min(2).max(30),
    customerNote: z.string().trim().max(500).optional(),
    expectedGrandTotal: z
      .string()
      .regex(/^\d+(\.\d{1,2})?$/)
      .optional(),
  })
  .refine((v) => Boolean(v.address) !== Boolean(v.addressId), {
    message: 'Provide either address or addressId',
    path: ['address'],
  })
  .refine((v) => new Set(v.items.map((i) => i.variantId)).size === v.items.length, {
    message: 'Each item may appear only once',
    path: ['items'],
  });

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export const registerSchema = z.strictObject({
  name: z.string().trim().min(2).max(100),
  phone,
  email,
  password: z.string().min(8).max(128),
});

export const loginSchema = z.strictObject({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(128),
});

/** Output types: phone already normalized, email lowercased. */
export type RegisterInput = z.output<typeof registerSchema>;
export type LoginInput = z.output<typeof loginSchema>;

/** Admin passwords are longer than customer ones (adminAuth enforces the same minimum). */
export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const adminPasswordSchema = z.string().min(ADMIN_PASSWORD_MIN_LENGTH).max(128);
