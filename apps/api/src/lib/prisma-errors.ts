/** Prisma unique-constraint violation (P2002), e.g. a duplicate slug, SKU or email. */
export function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002';
}

/** Prisma foreign-key violation (P2003), e.g. an image or parent id that does not exist. */
export function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2003';
}
