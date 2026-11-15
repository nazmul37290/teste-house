import { z } from 'zod';

/** Catalog admin inputs (media, taxonomy, products, inventory). Strict: unknown fields are rejected. */

/** Alt text is required for every image (accessibility and SEO; docs/design.md section 11). */
export const mediaAltTextSchema = z
  .string()
  .trim()
  .min(3, 'Describe the image in a few words')
  .max(200);
export const updateMediaSchema = z.strictObject({ altText: mediaAltTextSchema });
