/** Feedback line shown above a form after it is submitted. */
export type Status = { tone: 'success' | 'error'; text: string } | null;

/** The API's JSON envelope (docs/api-conventions.md section 1). */
export type ApiErrorBody = {
  code: string;
  message: string;
  details?: { path?: string; message?: string; reason?: string }[];
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: ApiErrorBody['details'] = [],
  ) {
    super(message);
    this.name = 'ApiError';
  }

  /** Message for one form field, from VALIDATION_ERROR details. */
  fieldError(path: string): string | undefined {
    return this.details?.find((d) => d.path === path)?.message;
  }
}

export type ListMeta = { page: number; pageSize: number; total: number };

export async function parseEnvelope<T>(res: Response): Promise<T> {
  return (await parseFullEnvelope<T>(res)).data;
}

/** data plus meta (lists). */
export async function parseFullEnvelope<T>(res: Response): Promise<{ data: T; meta?: ListMeta }> {
  if (res.status === 204) return { data: undefined as T };
  const body = (await res.json().catch(() => null)) as {
    data?: T;
    meta?: ListMeta;
    error?: ApiErrorBody;
  } | null;
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    throw new ApiError(
      res.status,
      err?.code ?? 'INTERNAL_ERROR',
      err?.message ?? 'Something went wrong',
      err?.details,
    );
  }
  return { data: body.data as T, meta: body.meta };
}
