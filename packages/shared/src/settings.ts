import { z } from 'zod';
import { legalPageBodySchema } from './legal-pages';
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

/** Icons the home page highlights strip can show (drawn in apps/web components/shop/icons.tsx). */
export const HIGHLIGHT_ICONS = [
  'cash',
  'truck',
  'card',
  'route',
  'phone',
  'bag',
  'heart',
  'check',
  'pin',
  'mail',
] as const;
export type HighlightIcon = (typeof HIGHLIGHT_ICONS)[number];
export const MAX_HOME_HIGHLIGHTS = 4;

export const homeHighlightSchema = z.strictObject({
  icon: z.enum(HIGHLIGHT_ICONS),
  title: z.string().trim().min(1, 'Add a title').max(60),
  text: z.string().trim().max(140),
});
export type HomeHighlight = z.output<typeof homeHighlightSchema>;

/**
 * The strip under the home hero. Empty means "automatic": the storefront builds it from payment
 * methods and delivery zones (GET /store-facts).
 */
const homeHighlightsSchema = z.array(homeHighlightSchema).max(MAX_HOME_HIGHLIGHTS);

/** PUT /admin/homepage/highlights (marketing.manage). */
export const updateHomeHighlightsSchema = z.strictObject({ items: homeHighlightsSchema });

/** Shop status: `maintenance` shows shoppers a maintenance page (HTTP 503) and refuses new orders. */
export const STORE_MODES = ['live', 'maintenance'] as const;
export type StoreMode = (typeof STORE_MODES)[number];
export const MAINTENANCE_MESSAGE_MAX = 300;

export const SETTING_DEFINITIONS = {
  'store.name': { group: 'store', isPublic: true, schema: z.string().trim().min(1).max(100) },
  'store.logo': { group: 'store', isPublic: true, schema: absoluteHttpUrl.nullable() },
  'store.phone': { group: 'store', isPublic: true, schema: optionalMobile },
  'store.email': { group: 'store', isPublic: true, schema: optionalEmail },
  'store.address': { group: 'store', isPublic: true, schema: z.string().trim().max(300) },
  'store.mode': { group: 'store', isPublic: true, schema: z.enum(STORE_MODES) },
  'store.maintenanceMessage': {
    group: 'store',
    isPublic: true,
    schema: z.string().trim().max(MAINTENANCE_MESSAGE_MAX),
  },
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
  // Direct tags, for owners who do not use a GTM container. They are public IDs (they appear in the
  // page source), not secrets. Use GA4 here or a GA4 tag inside GTM, never both: that counts twice.
  'ga4.measurementId': {
    group: 'tracking',
    isPublic: true,
    schema: emptyOr(
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^G-[A-Z0-9]{4,15}$/, 'Use the form G-XXXXXXXXXX'),
    ),
  },
  'meta.pixelId': {
    group: 'tracking',
    isPublic: true,
    schema: emptyOr(
      z
        .string()
        .trim()
        .regex(/^\d{10,20}$/, 'The Pixel ID is the number shown in Meta Events Manager'),
    ),
  },
  // Policy pages (legal-pages.ts). Not public settings: each page is fetched on its own.
  'page.privacy': { group: 'pages', isPublic: false, schema: legalPageBodySchema },
  'page.terms': { group: 'pages', isPublic: false, schema: legalPageBodySchema },
  'page.returns': { group: 'pages', isPublic: false, schema: legalPageBodySchema },
  'home.highlights': { group: 'homepage', isPublic: true, schema: homeHighlightsSchema },
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
