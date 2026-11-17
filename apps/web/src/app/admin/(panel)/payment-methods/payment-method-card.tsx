'use client';

import type { FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { PaymentMethodAdmin } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

export function PaymentMethodCard({ method }: { method: PaymentMethodAdmin }) {
  const { busy, status, run, fieldError } = useAction();
  const isCod = method.code === 'COD';

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const amount = (name: string) => String(form.get(name) ?? '').trim() || null;
    const body = {
      name: String(form.get('name')).trim(),
      isActive: form.get('isActive') === 'on',
      sortOrder: Number(form.get('sortOrder') || 0),
      config: {
        ...(isCod ? { scope: String(form.get('scope')) } : {}),
        minAmount: amount('minAmount'),
        maxAmount: amount('maxAmount'),
      },
    };
    await run(
      () => api(`/admin/payment-methods/${method.id}`, { method: 'PATCH', body }),
      'Saved.',
    );
  }

  return (
    <Card title={method.name}>
      <form onSubmit={onSubmit} className="space-y-4">
        <p>
          {method.isActive ? (
            <Badge tone="green">On at checkout</Badge>
          ) : (
            <Badge tone="neutral">Off</Badge>
          )}
        </p>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <Field label="Name shown at checkout" htmlFor={`pm-name-${method.id}`}>
          <Input
            id={`pm-name-${method.id}`}
            name="name"
            required
            maxLength={60}
            defaultValue={method.name}
          />
        </Field>
        {isCod ? (
          <Field
            label="Where Cash on Delivery is offered"
            htmlFor={`pm-scope-${method.id}`}
            hint="Inside Dhaka only means the inside-dhaka delivery zone."
          >
            <Select
              id={`pm-scope-${method.id}`}
              name="scope"
              defaultValue={method.config.scope ?? 'DHAKA_ONLY'}
            >
              <option value="DHAKA_ONLY">Inside Dhaka only</option>
              <option value="NATIONWIDE">All of Bangladesh</option>
            </Select>
          </Field>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Minimum order (Tk)"
            htmlFor={`pm-min-${method.id}`}
            hint="Optional."
            error={fieldError('config.minAmount')}
          >
            <Input
              id={`pm-min-${method.id}`}
              name="minAmount"
              inputMode="decimal"
              defaultValue={method.config.minAmount ?? ''}
            />
          </Field>
          <Field
            label="Maximum order (Tk)"
            htmlFor={`pm-max-${method.id}`}
            hint="Optional."
            error={fieldError('config.maxAmount')}
          >
            <Input
              id={`pm-max-${method.id}`}
              name="maxAmount"
              inputMode="decimal"
              defaultValue={method.config.maxAmount ?? ''}
            />
          </Field>
          <Field label="Order" htmlFor={`pm-sort-${method.id}`}>
            <Input
              id={`pm-sort-${method.id}`}
              name="sortOrder"
              type="number"
              min={0}
              defaultValue={method.sortOrder}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={method.isActive} /> Offer this
          method at checkout
        </label>
        <Button type="submit" disabled={busy}>
          Save
        </Button>
      </form>
    </Card>
  );
}
