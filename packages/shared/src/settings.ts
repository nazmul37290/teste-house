import { z } from 'zod';
import { normalizePhone } from './phone';

/**
 * Store settings (`settings` table, docs/database.md section 6). One definition per key: its value
 * schema, whether the storefront may read it, and its group. The seed creates every key; the admin
 * API accepts only these keys and validates each value with its schema.
 */

const emptyOr = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema]);

const optionalEmail = emptyOr(z.string().trim().toLowerCase().pipe(z.email()));

const optionalMobile = z
  .string()
  .trim()
  .transform((v, ctx) => {
    if (v === '') return '';
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Invalid Bangladeshi mobile number' });
      return z.NEVER;
    }
    return n;
  });

const absoluteHttpUrl = z
  .url({ protocol: /^https?$/ })
  .max(500)
  .describe('Absolute http(s) URL, also used in emails');

export const SETTING_DEFINITIONS = {
  'store.name': { group: 'store', isPublic: true, schema: z.string().trim().min(1).max(100) },
  'store.logo': { group: 'store', isPublic: true, schema: absoluteHttpUrl.nullable() },
  'store.phone': { group: 'store', isPublic: true, schema: optionalMobile },
  'store.email': { group: 'store', isPublic: true, schema: optionalEmail },
  'store.address': { group: 'store', isPublic: true, schema: z.string().trim().max(300) },
  'seo.defaultTitle': { group: 'seo', isPublic: true, schema: z.string().trim().max(70) },
  'seo.defaultDescription': { group: 'seo', isPublic: true, schema: z.string().trim().max(160) },
  'gtm.containerId': {
    group: 'tracking',
    isPublic: true,
    schema: emptyOr(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^GTM-[A-Z0-9]{4,12}$/, 'Use the form GTM-XXXXXXX'),
    ),
  },
  'review.autoApprove': { group: 'reviews', isPublic: false, schema: z.boolean() },
  'notifications.adminEmail': { group: 'notifications', isPublic: false, schema: optionalEmail },
  'shipping.steadfastEnabled': { group: 'shipping', isPublic: false, schema: z.boolean() },
} as const satisfies Record<string, { group: string; isPublic: boolean; schema: z.ZodType }>;

export type SettingKey = keyof typeof SETTING_DEFINITIONS;
export type SettingValues = {
  [K in SettingKey]: z.output<(typeof SETTING_DEFINITIONS)[K]['schema']>;
};

export const SETTING_KEYS = Object.keys(SETTING_DEFINITIONS) as SettingKey[];
export const PUBLIC_SETTING_KEYS = SETTING_KEYS.filter((k) => SETTING_DEFINITIONS[k].isPublic);

/** PUT /admin/settings body: any subset of the known keys; unknown keys are rejected. */
export const updateSettingsSchema = z
  .strictObject(
    Object.fromEntries(SETTING_KEYS.map((k) => [k, SETTING_DEFINITIONS[k].schema.optional()])) as {
      [K in SettingKey]: z.ZodOptional<(typeof SETTING_DEFINITIONS)[K]['schema']>;
    },
  )
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export type UpdateSettingsInput = z.output<typeof updateSettingsSchema>;
