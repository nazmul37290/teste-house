import { z } from 'zod';
import { formatPaisa, parsePaisa } from './money';
import { MEASURE_UNITS, parseThousandths } from './product';

/** Catalog admin inputs (media, taxonomy, products, inventory). Strict: unknown fields are rejected. */

/** Alt text is required for every image (accessibility and SEO; docs/design.md section 11). */
export const mediaAltTextSchema = z
  .string()
  .trim()
  .min(3, 'Describe the image in a few words')
  .max(200);
export const updateMediaSchema = z.strictObject({ altText: mediaAltTextSchema });

/** URL slug: lowercase letters, digits and single hyphens (e.g. "pure-honey-500g"). */
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(120)
  .regex(SLUG_PATTERN, 'Use lowercase letters, numbers and hyphens only');

/** "Pure Honey (500 g)!" -> "pure-honey-500-g". Empty when nothing ASCII is left (then a slug must be typed). */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)
    .replace(/-+$/g, '');
}

/** Storefront paths (docs/requirements.md: /category/honey, /product/pure-honey-500g). */
export const categoryPath = (slug: string) => `/category/${slug}`;
export const productPath = (slug: string) => `/product/${slug}`;

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();
const seoFields = { seoTitle: optionalText(70), seoDescription: optionalText(160) };
const nonEmpty = (v: object) => Object.values(v).some((x) => x !== undefined);

const categoryFields = {
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  parentId: z.uuid().nullable().optional(),
  description: optionalText(2000),
  imageId: z.uuid().nullable().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  ...seoFields,
};
export const createCategorySchema = z.strictObject(categoryFields);
export const updateCategorySchema = z
  .strictObject({ ...categoryFields, name: categoryFields.name.optional() })
  .refine(nonEmpty, { message: 'Nothing to update' });

const brandFields = {
  name: z.string().trim().min(1).max(100),
  slug: slugSchema.optional(),
  logoId: z.uuid().nullable().optional(),
  isActive: z.boolean().optional(),
  ...seoFields,
};
export const createBrandSchema = z.strictObject(brandFields);
export const updateBrandSchema = z
  .strictObject({ ...brandFields, name: brandFields.name.optional() })
  .refine(nonEmpty, { message: 'Nothing to update' });

export const tagSchema = z.strictObject({
  name: z.string().trim().min(1).max(50),
  slug: slugSchema.optional(),
});
export const updateTagSchema = tagSchema
  .partial()
  .refine(nonEmpty, { message: 'Nothing to update' });

const attributeFields = {
  name: z.string().trim().min(1).max(50),
  slug: slugSchema.optional(),
  isFilterable: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
};
export const createAttributeSchema = z.strictObject(attributeFields);
export const updateAttributeSchema = z
  .strictObject({ ...attributeFields, name: attributeFields.name.optional() })
  .refine(nonEmpty, { message: 'Nothing to update' });

const attributeValueFields = {
  value: z.string().trim().min(1).max(50),
  slug: slugSchema.optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
};
export const createAttributeValueSchema = z.strictObject(attributeValueFields);
export const updateAttributeValueSchema = z
  .strictObject({ ...attributeValueFields, value: attributeValueFields.value.optional() })
  .refine(nonEmpty, { message: 'Nothing to update' });

export type CreateCategoryInput = z.output<typeof createCategorySchema>;
export type UpdateCategoryInput = z.output<typeof updateCategorySchema>;
export type CreateBrandInput = z.output<typeof createBrandSchema>;
export type UpdateBrandInput = z.output<typeof updateBrandSchema>;

// Products and variants ------------------------------------------------------------------------

/** Money as a string ("1250" or "1250.50"), normalized to two decimals; 0 to 9,999,999.99. */
export const moneySchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,2})?$/, 'Enter an amount like 450 or 450.50')
  .transform((v) => formatPaisa(parsePaisa(v)));

const unitValueSchema = z
  .string()
  .trim()
  .regex(/^\d{1,7}(\.\d{1,3})?$/, 'Enter an amount like 500 or 1.5')
  .refine((v) => parseThousandths(v) > 0, 'Must be more than 0');

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[A-Z0-9][A-Z0-9._-]{1,63}$/,
    'Use 2 to 64 letters, numbers, dots, dashes or underscores',
  );

export const PRODUCT_STATUSES = ['DRAFT', 'ACTIVE', 'ARCHIVED'] as const;

const variantFields = {
  sku: skuSchema,
  /** Display label override; generated from unit + unitValue when empty. */
  name: z.string().trim().max(60).nullable().optional(),
  unit: z.enum(MEASURE_UNITS).nullable().optional(),
  unitValue: unitValueSchema.nullable().optional(),
  price: moneySchema,
  salePrice: moneySchema.nullable().optional(),
  weightGrams: z.number().int().min(1).max(100_000).nullable().optional(),
  barcode: z.string().trim().max(64).nullable().optional(),
  lowStockThreshold: z.number().int().min(0).max(100_000).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(100_000).optional(),
  attributeValueIds: z.array(z.uuid()).max(10).optional(),
};

type VariantShape = {
  name?: string | null;
  unit?: string | null;
  unitValue?: string | null;
  price?: string;
  salePrice?: string | null;
};

/**
 * Rules shared by create and update (docs/pricing.md, docs/database.md section 3a). On create the
 * unit and amount come together or not at all; on update either may be sent alone (the service
 * checks the result against the stored values), so the pair is checked only when both are sent.
 */
function variantRules(mode: 'create' | 'update') {
  return (v: VariantShape, ctx: z.RefinementCtx) => {
    const checkPair = mode === 'create' || (v.unit !== undefined && v.unitValue !== undefined);
    if (checkPair && (v.unit == null) !== (v.unitValue == null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['unitValue'],
        message: 'Set both the unit and the amount, or neither',
      });
    }
    if (
      v.price !== undefined &&
      v.salePrice != null &&
      parsePaisa(v.salePrice) >= parsePaisa(v.price)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['salePrice'],
        message: 'The sale price must be lower than the price',
      });
    }
  };
}

export const createVariantSchema = z
  .strictObject({
    ...variantFields,
    initialStock: z.number().int().min(0).max(1_000_000).optional(),
  })
  .superRefine((v, ctx) => {
    variantRules('create')(v, ctx);
    if (!v.unit && !v.name)
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Enter a label (or set the net content)',
      });
  });

/** Partial update; sale price vs price is re-checked by the service against stored values too. */
export const updateVariantSchema = z
  .strictObject({ ...variantFields, sku: skuSchema.optional(), price: moneySchema.optional() })
  .superRefine(variantRules('update'))
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export const nutritionFactsSchema = z
  .array(
    z.strictObject({
      name: z.string().trim().min(1).max(50),
      amount: z.string().trim().min(1).max(30),
    }),
  )
  .max(30);

const productText = (max: number) => z.string().trim().max(max).nullable().optional();

const productFields = {
  name: z.string().trim().min(1).max(150),
  slug: slugSchema.optional(),
  shortDescription: productText(300),
  /** Plain text: paragraphs and "- " bullet lines, never HTML (decision for Phase 4). */
  description: productText(10_000),
  categoryId: z.uuid(),
  brandId: z.uuid().nullable().optional(),
  tagIds: z.array(z.uuid()).max(30).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  isFeatured: z.boolean().optional(),
  isNewArrival: z.boolean().optional(),
  isBestSeller: z.boolean().optional(),
  ingredients: productText(2000),
  nutritionFacts: nutritionFactsSchema.nullable().optional(),
  shelfLife: productText(100),
  origin: productText(100),
  seoTitle: productText(70),
  seoDescription: productText(160),
  canonicalUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .nullable()
    .optional(),
  ogImageId: z.uuid().nullable().optional(),
};

export const createProductSchema = z.strictObject({
  ...productFields,
  variants: z.array(createVariantSchema).max(30).optional(),
});

export const updateProductSchema = z
  .strictObject({
    ...productFields,
    name: productFields.name.optional(),
    categoryId: productFields.categoryId.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Nothing to update' });

export const productListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  q: z.string().trim().max(100).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  categoryId: z.uuid().optional(),
  brandId: z.uuid().optional(),
});

export const bulkStatusSchema = z.strictObject({
  ids: z.array(z.uuid()).min(1).max(200),
  status: z.enum(PRODUCT_STATUSES),
});

/** The full, ordered image list; the first image is the primary one. */
export const setProductImagesSchema = z.strictObject({
  mediaIds: z
    .array(z.uuid())
    .max(20)
    .refine((ids) => new Set(ids).size === ids.length, 'Each image only once'),
});

export type CreateVariantInput = z.output<typeof createVariantSchema>;
export type UpdateVariantInput = z.output<typeof updateVariantSchema>;
export type CreateProductInput = z.output<typeof createProductSchema>;
export type UpdateProductInput = z.output<typeof updateProductSchema>;
export type ProductListQuery = z.output<typeof productListQuerySchema>;

// Inventory ------------------------------------------------------------------------------------

/** Signed change to stock with a reason (docs/requirements.md: adjustments with reason). */
export const adjustStockSchema = z.strictObject({
  variantId: z.uuid(),
  quantity: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((q) => q !== 0, 'Enter how many to add (positive) or remove (negative)'),
  reason: z.string().trim().min(3, 'Say why (for example: damaged, stock count)').max(200),
  /** Optional: take the change from (or add it to) a specific batch. */
  batchId: z.uuid().optional(),
});

const isoDate = z.iso.date();

/** Goods received: adds stock as a PURCHASE, optionally as a new batch with dates. */
export const receiveStockSchema = z
  .strictObject({
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(1_000_000),
    reason: z.string().trim().max(200).optional(),
    batchNo: z.string().trim().min(1).max(50).optional(),
    manufacturedAt: isoDate.optional(),
    expiryDate: isoDate.optional(),
  })
  .refine((v) => v.batchNo || (!v.manufacturedAt && !v.expiryDate), {
    message: 'Dates need a batch number',
    path: ['batchNo'],
  })
  .refine((v) => !v.manufacturedAt || !v.expiryDate || v.manufacturedAt <= v.expiryDate, {
    message: 'The expiry date must be after the manufacturing date',
    path: ['expiryDate'],
  });

export const inventoryListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  q: z.string().trim().max(100).optional(),
  lowStock: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const movementListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  variantId: z.uuid().optional(),
});

export type AdjustStockInput = z.output<typeof adjustStockSchema>;
export type ReceiveStockInput = z.output<typeof receiveStockSchema>;
