export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRICE_CHANGED'
  | 'BUSINESS_RULE'
  | 'RATE_LIMITED'
  | 'MAINTENANCE'
  | 'INTERNAL_ERROR';

const STATUS: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PRICE_CHANGED: 409,
  BUSINESS_RULE: 422,
  RATE_LIMITED: 429,
  MAINTENANCE: 503,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: unknown;
  /** Sent as the Retry-After header (RATE_LIMITED, MAINTENANCE). */
  readonly retryAfterSec?: number;
  constructor(code: ErrorCode, message: string, details?: unknown, retryAfterSec?: number) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.details = details;
    this.retryAfterSec = retryAfterSec;
  }
}

export function rateLimited(retryAfterSec: number): AppError {
  return new AppError(
    'RATE_LIMITED',
    'Too many attempts. Please wait and try again.',
    undefined,
    retryAfterSec,
  );
}
