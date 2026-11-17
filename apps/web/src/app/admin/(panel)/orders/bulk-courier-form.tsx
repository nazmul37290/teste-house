'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button } from '@/components/ui';
import { api } from '@/lib/api-client';
import { useAction } from '@/lib/use-action';

type Result = {
  orderId: string;
  orderNumber: string | null;
  queued: boolean;
  reason: string | null;
};

const REASON: Record<string, string> = {
  ALREADY_BOOKED: 'already with the courier',
  NOT_PROCESSING: 'not being packed',
  NOT_FOUND: 'not found',
};

/**
 * Sends the ticked "being packed" orders to the courier (STF-4). The checkboxes live in the table
 * rows and belong to this form through their `form="bulk-courier"` attribute.
 */
export function BulkCourierForm() {
  const { busy, status, run } = useAction();
  const [skipped, setSkipped] = useState<Result[]>([]);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const orderIds = new FormData(e.currentTarget).getAll('orderIds').map(String);
    if (!orderIds.length) return;
    setSkipped([]);
    const results = await run(
      () =>
        api<Result[]>('/admin/orders/bulk/book-courier', { method: 'POST', body: { orderIds } }),
      'Sent to the courier queue. Orders update as each parcel is booked.',
    );
    if (!results) return;
    setSkipped(results.filter((r) => !r.queued));
  }

  return (
    <form id="bulk-courier" onSubmit={onSubmit} className="mb-4 space-y-2">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      {skipped.length ? (
        <Alert tone="error">
          Not sent:{' '}
          {skipped
            .map((r) => `${r.orderNumber ?? r.orderId} (${REASON[r.reason ?? ''] ?? r.reason})`)
            .join(', ')}
        </Alert>
      ) : null}
      <div className="flex items-center gap-3 text-sm">
        <Button type="submit" variant="secondary" disabled={busy}>
          Send ticked orders to courier
        </Button>
        <span className="text-neutral-500">
          Tick orders that are being packed in the list below.
        </span>
      </div>
    </form>
  );
}
