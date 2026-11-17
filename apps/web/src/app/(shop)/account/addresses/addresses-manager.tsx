'use client';

import { useState, type FormEvent } from 'react';
import { AddressFields, EMPTY_ADDRESS, type AddressValue } from '@/components/shop/address-fields';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { SavedAddress } from '@/lib/order-types';
import { useAction } from '@/lib/use-action';

function AddressForm({ editing, onDone }: { editing: SavedAddress | null; onDone: () => void }) {
  const { busy, status, run, fieldError } = useAction();
  const [geo, setGeo] = useState<AddressValue>(
    editing
      ? {
          division: editing.division,
          district: editing.district,
          upazila: editing.upazila ?? '',
          addressLine: editing.addressLine,
        }
      : EMPTY_ADDRESS,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = {
      label: String(form.get('label') ?? '').trim(),
      recipientName: String(form.get('recipientName')).trim(),
      phone: String(form.get('phone')).trim(),
      division: geo.division,
      district: geo.district,
      upazila: geo.upazila,
      addressLine: geo.addressLine,
      postalCode: String(form.get('postalCode') ?? '').trim(),
      isDefault: form.get('isDefault') === 'on',
    };
    const saved = await run(
      () =>
        editing
          ? api(`/me/addresses/${editing.id}`, { method: 'PUT', body })
          : api('/me/addresses', { method: 'POST', body }),
      editing ? 'Address saved.' : 'Address added.',
    );
    if (saved) {
      if (editing) onDone();
      else {
        formEl.reset();
        setGeo(EMPTY_ADDRESS);
      }
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Label (optional)" htmlFor="ad-label" hint="e.g. Home, Office">
          <Input id="ad-label" name="label" maxLength={30} defaultValue={editing?.label ?? ''} />
        </Field>
        <Field label="Recipient name" htmlFor="ad-name" error={fieldError('recipientName')}>
          <Input
            id="ad-name"
            name="recipientName"
            required
            minLength={2}
            maxLength={100}
            defaultValue={editing?.recipientName}
          />
        </Field>
        <Field label="Mobile number" htmlFor="ad-phone" error={fieldError('phone')}>
          <Input
            id="ad-phone"
            name="phone"
            required
            inputMode="tel"
            placeholder="01XXXXXXXXX"
            defaultValue={editing?.phone}
          />
        </Field>
        <Field label="Postal code (optional)" htmlFor="ad-postal">
          <Input
            id="ad-postal"
            name="postalCode"
            maxLength={10}
            defaultValue={editing?.postalCode ?? ''}
          />
        </Field>
      </div>
      <AddressFields idPrefix="ad" value={geo} onChange={setGeo} error={fieldError} />
      {!editing?.isDefault ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isDefault" /> Use as my default address
        </label>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save address' : 'Add address'}
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

export function AddressesManager({ addresses }: { addresses: SavedAddress[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = addresses.find((a) => a.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-3">
        {remove.status ? <Alert tone={remove.status.tone}>{remove.status.text}</Alert> : null}
        {addresses.length === 0 ? (
          <p className="rounded-lg border border-neutral-200 p-6 text-center text-sm text-neutral-500">
            No saved addresses yet. Saved addresses make checkout faster.
          </p>
        ) : null}
        {addresses.map((a) => (
          <div key={a.id} className="rounded-lg border border-neutral-200 p-4 text-sm">
            <p className="font-medium">
              {a.label ?? a.recipientName}{' '}
              {a.isDefault ? <Badge tone="green">Default</Badge> : null}
            </p>
            <p className="mt-1 text-neutral-600">
              {a.recipientName}, {a.phone}
              <br />
              {a.addressLine}
              <br />
              {[a.upazila, a.district, a.division].filter(Boolean).join(', ')}
            </p>
            <div className="mt-3 flex gap-4">
              <button type="button" className="underline" onClick={() => setEditingId(a.id)}>
                Edit
              </button>
              <button
                type="button"
                className="text-red-700 underline"
                disabled={remove.busy}
                onClick={() => {
                  if (window.confirm('Delete this address?')) {
                    void remove.run(
                      () => api(`/me/addresses/${a.id}`, { method: 'DELETE' }),
                      'Address deleted.',
                    );
                  }
                }}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
      <Card title={editing ? 'Edit address' : 'Add an address'}>
        <AddressForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
