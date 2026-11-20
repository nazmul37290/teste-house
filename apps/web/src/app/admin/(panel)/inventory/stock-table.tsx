'use client';

import Link from 'next/link';
import { Fragment, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { StockRow } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

type Mode = { id: string; kind: 'adjust' | 'receive' } | null;

const opt = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? undefined : v;
};

/** Adjust: a signed change with a reason. Never below zero; the server checks it atomically. */
function AdjustForm({ row, onDone }: { row: StockRow; onDone: (message?: string) => void }) {
  const { busy, status, run, fieldError } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      variantId: row.id,
      quantity: Number(form.get('quantity')),
      reason: String(form.get('reason')).trim(),
    };
    const res = await run(() =>
      api<{ stockQty: number }>('/admin/inventory/adjust', { method: 'POST', body }),
    );
    if (res) onDone(`${row.sku}: stock is now ${res.stockQty}.`);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[8rem_1fr_auto] sm:items-end">
      {status?.tone === 'error' ? (
        <div className="sm:col-span-3">
          <Alert>{status.text}</Alert>
        </div>
      ) : null}
      <Field
        label="Change"
        htmlFor={`q-${row.id}`}
        hint="−3 removes, 5 adds"
        error={fieldError('quantity')}
      >
        <Input
          id={`q-${row.id}`}
          name="quantity"
          type="number"
          required
          step={1}
          min={-row.stockQty}
          autoFocus
        />
      </Field>
      <Field label="Reason" htmlFor={`r-${row.id}`} error={fieldError('reason')}>
        <Input
          id={`r-${row.id}`}
          name="reason"
          required
          minLength={3}
          maxLength={200}
          placeholder="Stock count, damaged, expired…"
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          Save
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

/** Receive: goods in, optionally as a batch with manufacture and expiry dates. */
function ReceiveForm({ row, onDone }: { row: StockRow; onDone: (message?: string) => void }) {
  const { busy, status, run, fieldError } = useAction();
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      variantId: row.id,
      quantity: Number(form.get('quantity')),
      batchNo: opt(form, 'batchNo'),
      manufacturedAt: opt(form, 'manufacturedAt'),
      expiryDate: opt(form, 'expiryDate'),
      reason: opt(form, 'reason'),
    };
    const res = await run(() =>
      api<{ stockQty: number }>('/admin/inventory/receive', { method: 'POST', body }),
    );
    if (res) onDone(`${row.sku}: received, stock is now ${res.stockQty}.`);
  }
  return (
    <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-3">
      {status?.tone === 'error' ? (
        <div className="sm:col-span-3">
          <Alert>{status.text}</Alert>
        </div>
      ) : null}
      <Field label="Quantity received" htmlFor={`rq-${row.id}`} error={fieldError('quantity')}>
        <Input id={`rq-${row.id}`} name="quantity" type="number" required min={1} autoFocus />
      </Field>
      <Field
        label="Batch number"
        htmlFor={`rb-${row.id}`}
        hint="Optional; needed for dates."
        error={fieldError('batchNo')}
      >
        <Input id={`rb-${row.id}`} name="batchNo" maxLength={50} />
      </Field>
      <Field label="Note" htmlFor={`rn-${row.id}`} hint="Optional, e.g. supplier invoice no.">
        <Input id={`rn-${row.id}`} name="reason" maxLength={200} />
      </Field>
      <Field label="Manufactured" htmlFor={`rm-${row.id}`}>
        <Input id={`rm-${row.id}`} name="manufacturedAt" type="date" />
      </Field>
      <Field label="Expires" htmlFor={`re-${row.id}`} error={fieldError('expiryDate')}>
        <Input id={`re-${row.id}`} name="expiryDate" type="date" />
      </Field>
      <div className="flex items-end gap-2">
        <Button type="submit" disabled={busy}>
          Receive
        </Button>
        <Button type="button" variant="secondary" onClick={() => onDone()}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function StockTable({ items, canAdjust }: { items: StockRow[]; canAdjust: boolean }) {
  const [mode, setMode] = useState<Mode>(null);
  const [done, setDone] = useState<string | null>(null);
  const finish = (text?: string) => {
    setMode(null);
    setDone(text ?? null);
  };

  return (
    <div className="space-y-3">
      {done ? <Alert tone="success">{done}</Alert> : null}
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr>
            <th className="pb-2">Product</th>
            <th className="pb-2">Stock</th>
            <th className="pb-2">Alert at</th>
            <th className="pb-2">Nearest expiry</th>
            <th className="pb-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((row) => (
            <Fragment key={row.id}>
              <tr>
                <td className="py-2">
                  <Link
                    href={`/admin/products/${row.product.id}`}
                    className="font-medium hover:underline"
                  >
                    {row.product.name}
                  </Link>{' '}
                  {!row.isActive ? <Badge tone="amber">Off</Badge> : null}
                  <p className="text-xs text-neutral-500">
                    {row.name} · {row.sku}
                  </p>
                </td>
                <td className="py-2 font-medium">
                  {row.stockQty} {row.isLow ? <Badge tone="red">Low</Badge> : null}
                </td>
                <td className="py-2 text-neutral-600">{row.lowStockThreshold}</td>
                <td className="py-2 text-neutral-600">{row.nearestExpiry ?? '—'}</td>
                <td className="space-x-3 py-2 text-right whitespace-nowrap">
                  <Link
                    href={`/admin/inventory/movements?variantId=${row.id}`}
                    className="underline"
                  >
                    History
                  </Link>
                  {canAdjust ? (
                    <>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setMode({ id: row.id, kind: 'adjust' })}
                      >
                        Adjust
                      </button>
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setMode({ id: row.id, kind: 'receive' })}
                      >
                        Receive
                      </button>
                    </>
                  ) : null}
                </td>
              </tr>
              {mode?.id === row.id ? (
                <tr>
                  <td colSpan={5} className="bg-neutral-50 p-4">
                    {mode.kind === 'adjust' ? (
                      <AdjustForm row={row} onDone={finish} />
                    ) : (
                      <ReceiveForm row={row} onDone={finish} />
                    )}
                  </td>
                </tr>
              ) : null}
            </Fragment>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-500">
                Nothing found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
