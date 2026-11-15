import { slugify } from '@shop/shared';
import { AppError } from '../lib/errors';
import { isForeignKeyViolation, isUniqueViolation } from '../lib/prisma-errors';

/** The given slug, or one made from the name. Names with no ASCII letters need a typed slug. */
export function resolveSlug(slug: string | undefined, name: string): string {
  const value = slug ?? slugify(name);
  if (!value) {
    throw new AppError('VALIDATION_ERROR', 'Enter a slug (only letters, numbers and hyphens)', [
      { path: 'slug', message: 'Required' },
    ]);
  }
  return value;
}

/** Maps duplicate names/slugs and unknown image ids to friendly 409/400 errors. */
export function mapWriteError(err: unknown, what: string): never {
  if (isUniqueViolation(err))
    throw new AppError('CONFLICT', `A ${what} with this name or slug already exists`);
  if (isForeignKeyViolation(err)) {
    throw new AppError('VALIDATION_ERROR', 'A linked image or record does not exist', [
      { path: 'id', message: 'Not found' },
    ]);
  }
  throw err;
}

export function notFound(what: string): AppError {
  return new AppError('NOT_FOUND', `${what} not found`);
}

export function inUse(reason: string, message: string): AppError {
  return new AppError('CONFLICT', message, [{ reason }]);
}
