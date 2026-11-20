'use client';

import { useState, type FormEvent } from 'react';
import { ItemRows, Totals } from '@/components/shop/order-summary';
import { ShipmentTimeline } from '@/components/shop/shipment-timeline';
import { Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';
import { formatDhaka } from '@/lib/format';
import { STATUS_LABEL, type OrderView } from '@/lib/order-types';

/** Guest tracking (order number + phone). The phone travels in a POST body, never in the URL. */
export function TrackForm({ initialOrder }: { initialOrder: string }) {
  const [order, setOrder] = useState<OrderView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      setOrder(
        await api<OrderView>('/orders/track', {
          method: 'POST',
          body: { orderNumber: form.get('orderNumber'), phone: form.get('phone') },
        }),
      );
    } catch (err) {
      setOrder(null);
      setError(
        err instanceof ApiError && err.code !== 'VALIDATION_ERROR'
          ? err.message
          : 'Check the order number (like ORD-000123) and mobile number.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-6 space-y-6">
      <form onSubmit={onSubmit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <Field label="Order number" htmlFor="t-order">
          <Input
            id="t-order"
            name="orderNumber"
            required
            defaultValue={initialOrder}
            placeholder="ORD-000123"
            className="uppercase"
          />
        </Field>
        <Field label="Mobile number" htmlFor="t-phone">
          <Input
            id="t-phone"
            name="phone"
            required
            inputMode="tel"
            autoComplete="tel"
            placeholder="01XXXXXXXXX"
          />
        </Field>
        <button
          type="submit"
          disabled={busy}
          className="rounded-control bg-petrol px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Looking…' : 'Track'}
        </button>
      </form>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
      {order ? (
        <section className="space-y-4 rounded-card border border-line bg-surface p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-semibold">Order {order.orderNumber}</h2>
            <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
              {STATUS_LABEL[order.status]}
            </span>
          </div>
          <ol className="space-y-1 border-l-2 border-line pl-4 text-sm">
            {order.timeline.map((t, i) => (
              <li key={i}>
                <span className="font-medium">{STATUS_LABEL[t.status]}</span>
                <span className="text-neutral-500"> · {formatDhaka(t.at)}</span>
              </li>
            ))}
          </ol>
          <ShipmentTimeline shipments={order.shipments ?? []} />
          <ItemRows items={order.items} />
          <Totals {...order} />
          <p className="text-sm text-neutral-600">
            {order.paymentMethod.name}
            {order.address ? ` · delivering to ${order.address.district}` : ''}
          </p>
        </section>
      ) : null}
    </div>
  );
}
