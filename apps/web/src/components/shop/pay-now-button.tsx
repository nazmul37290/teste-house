'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';

/** Opens a fresh gateway charge for an unpaid online order (order number + phone, like tracking). */
export function PayNowButton({
  orderNumber,
  phone,
  label = 'Pay now',
}: {
  orderNumber: string;
  phone: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setBusy(true);
    setError(null);
    try {
      const res = await api<{ redirectUrl: string } | { error: string }>('/orders/pay', {
        method: 'POST',
        body: { orderNumber, phone },
      });
      if ('redirectUrl' in res) {
        window.location.assign(res.redirectUrl);
        return;
      }
      setError(res.error);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.');
    }
    setBusy(false);
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={() => void pay()}
        disabled={busy}
        className="rounded-md bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? 'Opening payment…' : label}
      </button>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
