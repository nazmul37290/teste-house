'use client';

import { useState, type FormEvent } from 'react';
import { AddressFields, type AddressValue } from '@/components/shop/address-fields';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { AdminOrder } from '@/lib/admin-types';
import { formatTaka } from '@/lib/money';
import { STATUS_LABEL, type OrderStatus } from '@/lib/order-types';
import { useAction } from '@/lib/use-action';

/** One button per allowed next status (the API checks the state machine and permissions again). */
export function StatusActions({
  orderId,
  transitions,
}: {
  orderId: string;
  transitions: OrderStatus[];
}) {
  const { busy, status, run } = useAction();
  const [note, setNote] = useState('');
  if (!transitions.length) return <p className="text-sm text-neutral-500">No further changes.</p>;

  const go = (to: OrderStatus) => {
    if (to === 'CANCELLED' && !note.trim()) {
      window.alert('Please write the reason for cancelling in the note.');
      return;
    }
    if (
      ['CANCELLED', 'RETURNED', 'FAILED'].includes(to) &&
      !window.confirm(`Mark as ${STATUS_LABEL[to]}? Stock goes back.`)
    )
      return;
    void run(
      () =>
        api(`/admin/orders/${orderId}/status`, {
          method: 'POST',
          body: { status: to, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      `Order is now ${STATUS_LABEL[to].toLowerCase()}.`,
    ).then((ok) => ok && setNote(''));
  };

  return (
    <div className="space-y-3">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Note (optional; required to cancel)" htmlFor="st-note">
        <Input
          id="st-note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        {transitions.map((t) => (
          <Button
            key={t}
            type="button"
            variant={
              t === 'CANCELLED' || t === 'FAILED' || t === 'RETURNED' ? 'secondary' : 'primary'
            }
            disabled={busy}
            onClick={() => go(t)}
          >
            {STATUS_LABEL[t]}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function NotesForm({ orderId }: { orderId: string }) {
  const { busy, status, run } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const note = String(new FormData(formEl).get('note')).trim();
    if (
      await run(
        () => api(`/admin/orders/${orderId}/notes`, { method: 'POST', body: { note } }),
        'Note added.',
      )
    )
      formEl.reset();
  }
  return (
    <form onSubmit={onSubmit} className="space-y-2">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Textarea
        name="note"
        required
        maxLength={2000}
        rows={2}
        aria-label="New note"
        placeholder="Only staff see this"
      />
      <Button type="submit" variant="secondary" disabled={busy}>
        Add note
      </Button>
    </form>
  );
}

type Line = { variantId: string; label: string; quantity: number; price: string };
type Lookup = {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string;
  price: string;
  stockQty: number;
};

/**
 * Items, quantities, address and coupon removal (before the courier has the parcel). Only ids and
 * quantities are sent; the API recalculates every amount. Kept lines keep their order-time price.
 */
export function OrderEditor({ order }: { order: AdminOrder }) {
  const { busy, status, run, fieldError } = useAction();
  const [lines, setLines] = useState<Line[]>(
    order.items.map((i) => ({
      variantId: i.variantId,
      label: `${i.productName} · ${i.variantName}`,
      quantity: i.quantity,
      price: i.unitPrice,
    })),
  );
  const [sku, setSku] = useState('');
  const [lookupError, setLookupError] = useState<string | null>(null);
  const a = order.address;
  const [editAddress, setEditAddress] = useState(false);
  const [recipient, setRecipient] = useState({
    name: a?.recipientName ?? '',
    phone: a?.phone ?? '',
  });
  const [geo, setGeo] = useState<AddressValue>({
    division: a?.division ?? '',
    district: a?.district ?? '',
    upazila: a?.upazila ?? '',
    addressLine: a?.addressLine ?? '',
  });
  const [note, setNote] = useState('');

  const itemsChanged =
    lines.length !== order.items.length ||
    lines.some(
      (l) => order.items.find((i) => i.variantId === l.variantId)?.quantity !== l.quantity,
    );

  async function addBySku() {
    setLookupError(null);
    try {
      const v = await api<Lookup>(
        `/admin/orders/variant-lookup?sku=${encodeURIComponent(sku.trim())}`,
      );
      if (lines.some((l) => l.variantId === v.variantId)) {
        setLookupError('Already in the order; change its quantity instead.');
        return;
      }
      setLines([
        ...lines,
        {
          variantId: v.variantId,
          label: `${v.productName} · ${v.variantName}`,
          quantity: 1,
          price: v.price,
        },
      ]);
      setSku('');
    } catch {
      setLookupError('No orderable product with this SKU.');
    }
  }

  async function save(body: Record<string, unknown>, done: string) {
    const ok = await run(
      () =>
        api(`/admin/orders/${order.id}`, {
          method: 'PATCH',
          body: { ...body, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      done,
    );
    if (ok) setNote('');
  }

  return (
    <div className="space-y-5">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div>
        <ul className="divide-y divide-neutral-100 text-sm">
          {lines.map((l, i) => (
            <li key={l.variantId} className="flex items-center gap-3 py-2">
              <span className="min-w-0 flex-1">
                {l.label}
                <span className="block text-xs text-neutral-500">{formatTaka(l.price)} each</span>
              </span>
              <div className="w-20 shrink-0">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  aria-label={`Quantity of ${l.label}`}
                  value={l.quantity}
                  onChange={(e) =>
                    setLines(
                      lines.map((x, j) =>
                        j === i ? { ...x, quantity: Math.max(1, Number(e.target.value) || 1) } : x,
                      ),
                    )
                  }
                />
              </div>
              <button
                type="button"
                className="text-xs text-red-700 underline disabled:opacity-40"
                disabled={lines.length === 1}
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-2 flex gap-2">
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Add by SKU"
            aria-label="SKU to add"
            className="max-w-xs uppercase"
          />
          <Button
            type="button"
            variant="secondary"
            onClick={() => void addBySku()}
            disabled={!sku.trim()}
          >
            Add
          </Button>
        </div>
        {lookupError ? <p className="mt-1 text-xs text-red-700">{lookupError}</p> : null}
      </div>

      <Field label="Reason for the change (shown in the history)" htmlFor="ed-note">
        <Input
          id="ed-note"
          maxLength={500}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={busy || !itemsChanged}
          onClick={() =>
            void save(
              { items: lines.map((l) => ({ variantId: l.variantId, quantity: l.quantity })) },
              'Items saved; totals recalculated.',
            )
          }
        >
          Save items
        </Button>
        {order.couponCode ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() =>
              window.confirm(`Remove coupon ${order.couponCode}?`) &&
              void save({ removeCoupon: true }, 'Coupon removed.')
            }
          >
            Remove coupon {order.couponCode}
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => setEditAddress(!editAddress)}>
          {editAddress ? 'Close address' : 'Change address'}
        </Button>
      </div>

      {editAddress ? (
        <form
          className="space-y-4 rounded-md border border-neutral-200 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void save(
              {
                address: {
                  recipientName: recipient.name,
                  phone: recipient.phone,
                  division: geo.division,
                  district: geo.district,
                  ...(geo.upazila ? { upazila: geo.upazila } : {}),
                  addressLine: geo.addressLine,
                  ...(a?.deliveryNote ? { deliveryNote: a.deliveryNote } : {}),
                },
              },
              'Address saved; delivery charge rechecked.',
            );
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Recipient" htmlFor="ed-name" error={fieldError('address.recipientName')}>
              <Input
                id="ed-name"
                required
                value={recipient.name}
                onChange={(e) => setRecipient({ ...recipient, name: e.target.value })}
              />
            </Field>
            <Field label="Mobile" htmlFor="ed-phone" error={fieldError('address.phone')}>
              <Input
                id="ed-phone"
                required
                value={recipient.phone}
                onChange={(e) => setRecipient({ ...recipient, phone: e.target.value })}
              />
            </Field>
          </div>
          <AddressFields
            idPrefix="ed"
            value={geo}
            onChange={setGeo}
            error={(f) => fieldError(`address.${f}`)}
          />
          <Button type="submit" disabled={busy}>
            Save address
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** Records money already returned to the customer (the gateway is not called; PAY-7). */
export function RefundForm({
  orderId,
  paymentId,
  remaining,
}: {
  orderId: string;
  paymentId: string;
  remaining: string;
}) {
  const { busy, status, run, fieldError } = useAction();
  const [open, setOpen] = useState(false);
  if (remaining === '0.00') return null;
  if (!open) {
    return (
      <button type="button" className="mt-1 text-xs underline" onClick={() => setOpen(true)}>
        Record a refund (up to {formatTaka(remaining)})
      </button>
    );
  }
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const ok = await run(
      () =>
        api(`/admin/orders/${orderId}/refunds`, {
          method: 'POST',
          body: {
            paymentId,
            amount: String(form.get('amount')).trim(),
            reason: String(form.get('reason')).trim(),
          },
        }),
      'Refund recorded.',
    );
    if (ok) setOpen(false);
  }
  return (
    <form onSubmit={onSubmit} className="mt-2 space-y-2 rounded-md bg-neutral-50 p-3">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <p className="text-xs text-neutral-600">
        Return the money first (bKash, bank, ...), then record it here.
      </p>
      <Field label="Amount (Tk)" htmlFor={`rf-amount-${paymentId}`} error={fieldError('amount')}>
        <Input
          id={`rf-amount-${paymentId}`}
          name="amount"
          required
          inputMode="decimal"
          defaultValue={remaining}
        />
      </Field>
      <Field label="Reason" htmlFor={`rf-reason-${paymentId}`} error={fieldError('reason')}>
        <Input id={`rf-reason-${paymentId}`} name="reason" required minLength={3} maxLength={300} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Record refund
        </Button>
        <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Queues the courier booking; the order moves to "with the courier" once the parcel is booked. */
export function BookCourierButton({ orderId }: { orderId: string }) {
  const { busy, status, run } = useAction();
  return (
    <div className="space-y-2">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <p className="text-sm text-neutral-600">
        Books a parcel with the courier, with the amount to collect on delivery.
      </p>
      <Button
        type="button"
        disabled={busy}
        onClick={() =>
          void run(
            () => api(`/admin/orders/${orderId}/book-courier`, { method: 'POST', body: {} }),
            'Queued for the courier. The order updates in a moment.',
          )
        }
      >
        Send to courier
      </Button>
    </div>
  );
}
