'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, type Status } from './api-types';

/**
 * Runs one admin mutation: busy flag, success or error message, then refreshes the server-rendered
 * page so lists show the change. Returns the action's result, or undefined when it failed.
 */
export function useAction() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState<ApiError | null>(null);

  async function run<T>(action: () => Promise<T>, success?: string): Promise<T | undefined> {
    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      const result = await action();
      if (success) setStatus({ tone: 'success', text: success });
      router.refresh();
      return result;
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
      setError(apiErr);
      setStatus({
        tone: 'error',
        text:
          apiErr.code === 'VALIDATION_ERROR' && apiErr.details?.length
            ? 'Please check the highlighted fields.'
            : apiErr.message,
      });
      return undefined;
    } finally {
      setBusy(false);
    }
  }

  return {
    busy,
    status,
    error,
    run,
    setStatus,
    fieldError: (path: string) => error?.fieldError(path),
  };
}
