'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError, type Status } from '@/lib/api-types';
import { cartApi, openCartDrawer } from '@/lib/cart-client';

/** Invoice download, reorder, and cancel (only while PENDING or CONFIRMED; the API decides). */
export function OrderActions({
  orderNumber,
  canCancel,
}: {
  orderNumber: string;
  canCancel: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
    } catch (err) {
      setStatus({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  const reorder = () =>
    run(async () => {
      const r = await api<{ added: number; skipped: string[] }>(
        `/me/orders/${orderNumber}/reorder`,
        { method: 'POST', body: {} },
      );
      await cartApi.refresh();
      setStatus({
        tone: r.added ? 'success' : 'error',
        text: r.added
          ? `Added to your cart.${r.skipped.length ? ` Not available now: ${r.skipped.join(', ')}.` : ''}`
          : 'None of these items can be ordered right now.',
      });
      if (r.added) openCartDrawer();
    });

  const cancel = () => {
    if (!window.confirm(`Cancel order ${orderNumber}?`)) return;
    void run(async () => {
      await api(`/me/orders/${orderNumber}/cancel`, { method: 'POST', body: {} });
      setStatus({ tone: 'success', text: 'Your order is cancelled.' });
      router.refresh();
    });
  };

  return (
    <section className="space-y-3 rounded-card border border-line bg-surface p-4 sm:p-5">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <a
        href={`/api/v1/me/orders/${orderNumber}/invoice`}
        className="block rounded-control border border-neutral-300 px-4 py-2 text-center text-sm font-medium"
      >
        Download invoice (PDF)
      </a>
      <Button
        type="button"
        variant="secondary"
        className="w-full"
        disabled={busy}
        onClick={() => void reorder()}
      >
        Order again
      </Button>
      {canCancel ? (
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="w-full text-sm text-danger underline disabled:opacity-50"
        >
          Cancel this order
        </button>
      ) : null}
    </section>
  );
}
