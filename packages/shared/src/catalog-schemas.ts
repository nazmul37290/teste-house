import { z } from 'zod';

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
