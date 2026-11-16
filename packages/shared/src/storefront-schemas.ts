import { z } from 'zod';
import { moneySchema, slugSchema } from './catalog-schemas';

/** Public catalog query (GET /products). Unknown params are ignored; bad values are 400. */
export const PRODUCT_SORTS = ['relevance', 'newest', 'price_asc', 'price_desc', 'popular'] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

/** "a,b" or repeated params -> unique list of slugs. */
const slugList = z
  .union([z.string(), z.array(z.string())])
  .transform((v) =>
    (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean),
  )
  .pipe(z.array(slugSchema).max(20))
  .transform((list) => [...new Set(list)]);

export const publicProductQuerySchema = z.object({
  q: z.string().trim().min(1).max(100).optional(),
  category: slugSchema.optional(),
  brand: slugList.optional(),
  /** Attribute value slugs as "attribute-slug:value-slug". */
  attr: z
    .union([z.string(), z.array(z.string())])
    .transform((v) =>
      (Array.isArray(v) ? v : v.split(',')).map((s) => s.trim().toLowerCase()).filter(Boolean),
    )
    .pipe(z.array(z.string().regex(/^[a-z0-9-]+:[a-z0-9-]+$/, 'Use attribute:value')).max(20))
    .optional(),
  minPrice: moneySchema.optional(),
  maxPrice: moneySchema.optional(),
  inStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(PRODUCT_SORTS).optional(),
  page: z.coerce.number().int().min(1).max(500).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
});
export type PublicProductQuery = z.output<typeof publicProductQuerySchema>;

export const suggestQuerySchema = z.object({ q: z.string().trim().min(2).max(60) });

// Homepage sections ------------------------------------------------------------------------------

export const HOMEPAGE_SECTION_TYPES = [
  'CATEGORY_GRID',
  'PRODUCT_LIST',
  'BANNER_STRIP',
  'CUSTOM_HTML',
] as const;
export type HomepageSectionType = (typeof HOMEPAGE_SECTION_TYPES)[number];

export const PRODUCT_LIST_SOURCES = [
  'featured',
  'new',
  'bestsellers',
  'category',
  'manual',
] as const;

/**
 * Config per section type. CUSTOM_HTML is shown as a plain text block (decision for Phase 5): the
 * text is never rendered as HTML.
 */
export const sectionConfigSchemas = {
  CATEGORY_GRID: z.strictObject({
    /** Empty: the active top-level categories. */
    categoryIds: z.array(z.uuid()).max(24).optional(),
  }),
  PRODUCT_LIST: z
    .strictObject({
      source: z.enum(PRODUCT_LIST_SOURCES),
      categoryId: z.uuid().optional(),
      productIds: z.array(z.uuid()).max(24).optional(),
      limit: z.number().int().min(1).max(24).optional(),
    })
    .refine((c) => c.source !== 'category' || c.categoryId, {
      message: 'Choose a category',
      path: ['categoryId'],
    })
    .refine((c) => c.source !== 'manual' || c.productIds?.length, {
      message: 'Choose products',
      path: ['productIds'],
    }),
  BANNER_STRIP: z.strictObject({ position: z.string().trim().min(1).max(40) }),
  CUSTOM_HTML: z.strictObject({ text: z.string().trim().min(1).max(5000) }),
} as const;

export type SectionConfig<T extends HomepageSectionType> = z.output<
  (typeof sectionConfigSchemas)[T]
>;

/** Banner positions the storefront shows. */
export const BANNER_POSITIONS = ['home_hero', 'home_strip'] as const;

// Admin: banners and homepage sections ------------------------------------------------------------

/** A site path ("/category/honey") or an https URL; never javascript: or other schemes. */
export const bannerLinkSchema = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => /^\/(?!\/)[^\s]*$/.test(v) || /^https:\/\/[^\s]+$/.test(v),
    'Use a path like /category/honey or an https:// link',
  );

const isoDateTime = z.iso.datetime({ offset: true });

const bannerFields = {
  title: z.string().trim().min(1).max(100),
  imageId: z.uuid(),
  mobileImageId: z.uuid().nullable().optional(),
  linkUrl: bannerLinkSchema.nullable().optional(),
  position: z.enum(BANNER_POSITIONS).optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  startsAt: isoDateTime.nullable().optional(),
  endsAt: isoDateTime.nullable().optional(),
};
const datesInOrder = (v: { startsAt?: string | null; endsAt?: string | null }) =>
  !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt);

export const createBannerSchema = z
  .strictObject(bannerFields)
  .refine(datesInOrder, { message: 'The end must be after the start', path: ['endsAt'] });
export const updateBannerSchema = z
  .strictObject({
    ...bannerFields,
    title: bannerFields.title.optional(),
    imageId: bannerFields.imageId.optional(),
  })
  .refine(datesInOrder, { message: 'The end must be after the start', path: ['endsAt'] })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

/** A whole section (PUT): the config is checked against the schema of its type. */
export const homepageSectionSchema = z
  .strictObject({
    type: z.enum(HOMEPAGE_SECTION_TYPES),
    title: z.string().trim().max(80).nullable().optional(),
    config: z.unknown(),
    sortOrder: z.number().int().min(0).max(100_000).optional(),
    isActive: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    const result = sectionConfigSchemas[v.type].safeParse(v.config ?? {});
    if (!result.success) {
      for (const issue of result.error.issues)
        ctx.addIssue({
          code: 'custom',
          path: ['config', ...issue.path.map(String)],
          message: issue.message,
        });
    }
  })
  .transform((v) => ({
    ...v,
    config: sectionConfigSchemas[v.type].parse(v.config ?? {}) as Record<string, unknown>,
  }));

export type CreateBannerInput = z.output<typeof createBannerSchema>;
export type UpdateBannerInput = z.output<typeof updateBannerSchema>;
export type HomepageSectionInput = z.output<typeof homepageSectionSchema>;
