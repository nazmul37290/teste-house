'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Coupon } from '@/lib/admin-types';
import { formatDhaka, fromDhakaInput, toDhakaInput } from '@/lib/format';
import { formatTaka } from '@/lib/money';
import { useAction } from '@/lib/use-action';

function couponState(c: Coupon): { tone: 'green' | 'amber' | 'neutral'; text: string } {
  const now = Date.now();
  if (!c.isActive) return { tone: 'neutral', text: 'Off' };
  if (c.startsAt && new Date(c.startsAt).getTime() > now)
    return { tone: 'amber', text: 'Scheduled' };
  if (c.expiresAt && new Date(c.expiresAt).getTime() <= now)
    return { tone: 'neutral', text: 'Expired' };
  if (c.usageLimit !== null && c.usedCount >= c.usageLimit)
    return { tone: 'neutral', text: 'Used up' };
  return { tone: 'green', text: 'Live' };
}

const describe = (c: Coupon) =>
  c.type === 'PERCENT'
    ? `${c.value.replace(/\.00$/, '')}% off${c.maxDiscount ? `, up to ${formatTaka(c.maxDiscount)}` : ''}`
    : `${formatTaka(c.value)} off`;

function CouponForm({ editing, onDone }: { editing: Coupon | null; onDone: () => void }) {
  const { busy, status, run, fieldError } = useAction();
  const [type, setType] = useState<Coupon['type']>(editing?.type ?? 'PERCENT');

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const text = (name: string) => String(form.get(name) ?? '').trim() || null;
    const int = (name: string) => (text(name) ? Number(text(name)) : null);
    const body = {
      ...(editing && editing.usedCount > 0 ? {} : { code: String(form.get('code')).trim() }),
      type,
      value: String(form.get('value')).trim(),
      minOrderAmount: text('minOrderAmount'),
      maxDiscount: type === 'PERCENT' ? text('maxDiscount') : null,
      usageLimit: int('usageLimit'),
      perCustomerLimit: int('perCustomerLimit'),
      startsAt: fromDhakaInput(String(form.get('startsAt') ?? '')),
      expiresAt: fromDhakaInput(String(form.get('expiresAt') ?? '')),
      isActive: form.get('isActive') === 'on',
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/coupons/${editing.id}`, { method: 'PATCH', body })
          : api('/admin/coupons', { method: 'POST', body }),
      editing ? 'Coupon saved.' : 'Coupon created.',
    );
    if (saved && !editing) {
      formEl.reset();
      setType('PERCENT');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field
        label="Code"
        htmlFor="c-code"
        hint={
          editing && editing.usedCount > 0
            ? 'A used coupon keeps its code.'
            : 'Customers type this. Letters and numbers, e.g. SAVE10.'
        }
        error={fieldError('code')}
      >
        <Input
          id="c-code"
          name="code"
          required
          maxLength={40}
          defaultValue={editing?.code}
          disabled={Boolean(editing && editing.usedCount > 0)}
          className="uppercase"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type" htmlFor="c-type">
          <Select
            id="c-type"
            value={type}
            onChange={(e) => setType(e.target.value as Coupon['type'])}
          >
            <option value="PERCENT">Percent off</option>
            <option value="FIXED">Fixed amount off (Tk)</option>
          </Select>
        </Field>
        <Field
          label={type === 'PERCENT' ? 'Percent' : 'Amount (Tk)'}
          htmlFor="c-value"
          error={fieldError('value')}
        >
          <Input
            id="c-value"
            name="value"
            required
            inputMode="decimal"
            defaultValue={editing?.value}
          />
        </Field>
        <Field
          label="Minimum order (Tk)"
          htmlFor="c-min"
          hint="Optional. Products total before the discount."
          error={fieldError('minOrderAmount')}
        >
          <Input
            id="c-min"
            name="minOrderAmount"
            inputMode="decimal"
            defaultValue={editing?.minOrderAmount ?? ''}
          />
        </Field>
        {type === 'PERCENT' ? (
          <Field
            label="Maximum discount (Tk)"
            htmlFor="c-max"
            hint="Optional cap."
            error={fieldError('maxDiscount')}
          >
            <Input
              id="c-max"
              name="maxDiscount"
              inputMode="decimal"
              defaultValue={editing?.maxDiscount ?? ''}
            />
          </Field>
        ) : null}
        <Field
          label="Total uses"
          htmlFor="c-limit"
          hint="Optional. Empty means no limit."
          error={fieldError('usageLimit')}
        >
          <Input
            id="c-limit"
            name="usageLimit"
            type="number"
            min={1}
            defaultValue={editing?.usageLimit ?? ''}
          />
        </Field>
        <Field
          label="Uses per customer"
          htmlFor="c-per"
          hint="Counted by account and by phone number."
          error={fieldError('perCustomerLimit')}
        >
          <Input
            id="c-per"
            name="perCustomerLimit"
            type="number"
            min={1}
            defaultValue={editing?.perCustomerLimit ?? ''}
          />
        </Field>
        <Field label="Valid from (Dhaka time)" htmlFor="c-start" hint="Optional.">
          <Input
            id="c-start"
            name="startsAt"
            type="datetime-local"
            defaultValue={toDhakaInput(editing?.startsAt)}
          />
        </Field>
        <Field
          label="Valid until (Dhaka time)"
          htmlFor="c-end"
          hint="Optional."
          error={fieldError('expiresAt')}
        >
          <Input
            id="c-end"
            name="expiresAt"
            type="datetime-local"
            defaultValue={toDhakaInput(editing?.expiresAt)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Coupon
        is on
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save coupon' : 'Create coupon'}
        </Button>
        {editing ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function CouponsManager({ coupons }: { coupons: Coupon[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = coupons.find((c) => c.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_30rem]">
      <Card>
        {remove.status ? (
          <div className="mb-4">
            <Alert tone={remove.status.tone}>{remove.status.text}</Alert>
          </div>
        ) : null}
        {coupons.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No coupons yet.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {coupons.map((c) => {
            const state = couponState(c);
            return (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-sm font-medium">
                    {c.code} <Badge tone={state.tone}>{state.text}</Badge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {describe(c)}
                    {c.minOrderAmount ? ` · min ${formatTaka(c.minOrderAmount)}` : ''} · used{' '}
                    {c.usedCount}
                    {c.usageLimit !== null ? ` of ${c.usageLimit}` : ''}
                    {c.expiresAt ? ` · until ${formatDhaka(c.expiresAt)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => setEditingId(c.id)}
                >
                  Edit
                </button>
                {c.usedCount === 0 ? (
                  <button
                    type="button"
                    className="text-sm text-danger underline"
                    disabled={remove.busy}
                    onClick={() => {
                      if (window.confirm(`Delete the coupon ${c.code}?`)) {
                        void remove.run(
                          () => api(`/admin/coupons/${c.id}`, { method: 'DELETE' }),
                          'Coupon deleted.',
                        );
                      }
                    }}
                  >
                    Delete
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title={editing ? `Edit ${editing.code}` : 'New coupon'}>
        <CouponForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
