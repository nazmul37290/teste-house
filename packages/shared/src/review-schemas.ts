import { z } from 'zod';

/** Reviews (requirements section 9). Text is plain text, never HTML. */

export const MAX_REVIEW_PHOTOS = 3;
export const REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => v || undefined);

const reviewFields = {
  rating: z.number().int().min(1).max(5),
  title: optionalText(100),
  body: optionalText(2000),
  mediaIds: z
    .array(z.uuid())
    .max(MAX_REVIEW_PHOTOS)
    .refine((ids) => new Set(ids).size === ids.length, 'A photo is listed twice')
    .default([]),
};

export const createReviewSchema = z.strictObject({ productId: z.uuid(), ...reviewFields });
/** Whole-review replace by its author. */
export const updateReviewSchema = z.strictObject(reviewFields);
export type CreateReviewInput = z.output<typeof createReviewSchema>;
export type UpdateReviewInput = z.output<typeof updateReviewSchema>;

export const reviewEligibilityQuerySchema = z.object({ productId: z.uuid() });

export const publicReviewsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).default(1),
});

export const adminReviewListQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type AdminReviewListQuery = z.output<typeof adminReviewListQuerySchema>;

/** An empty reply removes the shop's reply. */
export const reviewReplySchema = z.strictObject({ reply: z.string().trim().max(1000) });
