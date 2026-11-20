'use client';

import { BD_GEO } from '@shop/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { DeliveryZone } from '@/lib/admin-types';
import { formatTaka } from '@/lib/money';
import { useAction } from '@/lib/use-action';

function ZoneForm({
  editing,
  zones,
  onDone,
}: {
  editing: DeliveryZone | null;
  zones: DeliveryZone[];
  onDone: () => void;
}) {
  const { busy, status, run, fieldError } = useAction();
  const [districts, setDistricts] = useState<string[]>(editing?.districts ?? []);
  // Districts already in another zone cannot be picked here (the API refuses them too).
  const takenBy = new Map(
    zones.filter((z) => z.id !== editing?.id).flatMap((z) => z.districts.map((d) => [d, z.name])),
  );

  const toggle = (d: string) =>
    setDistricts((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]));

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const threshold = String(form.get('freeDeliveryThreshold') ?? '').trim();
    const days = String(form.get('estimatedDays') ?? '').trim();
    const body = {
      name: String(form.get('name')).trim(),
      code: String(form.get('code')).trim(),
      districts,
      charge: String(form.get('charge')).trim(),
      freeDeliveryThreshold: threshold || null,
      estimatedDays: days || null,
      isDefault: form.get('isDefault') === 'on',
      isActive: form.get('isActive') === 'on',
      sortOrder: Number(form.get('sortOrder') || 0),
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/delivery-zones/${editing.id}`, { method: 'PATCH', body })
          : api('/admin/delivery-zones', { method: 'POST', body }),
      editing ? 'Zone saved.' : 'Zone created.',
    );
    if (saved && !editing) {
      formEl.reset();
      setDistricts([]);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" htmlFor="z-name" error={fieldError('name')}>
          <Input id="z-name" name="name" required maxLength={60} defaultValue={editing?.name} />
        </Field>
        <Field label="Code" htmlFor="z-code" hint="e.g. inside-dhaka" error={fieldError('code')}>
          <Input id="z-code" name="code" required maxLength={40} defaultValue={editing?.code} />
        </Field>
        <Field label="Delivery charge (Tk)" htmlFor="z-charge" error={fieldError('charge')}>
          <Input
            id="z-charge"
            name="charge"
            required
            inputMode="decimal"
            defaultValue={editing?.charge}
          />
        </Field>
        <Field
          label="Free delivery from (Tk)"
          htmlFor="z-free"
          hint="Optional. Compared with the total after the coupon."
          error={fieldError('freeDeliveryThreshold')}
        >
          <Input
            id="z-free"
            name="freeDeliveryThreshold"
            inputMode="decimal"
            defaultValue={editing?.freeDeliveryThreshold ?? ''}
          />
        </Field>
        <Field label="Delivery time" htmlFor="z-days" hint="Shown to customers, e.g. 1-2 days">
          <Input
            id="z-days"
            name="estimatedDays"
            maxLength={40}
            defaultValue={editing?.estimatedDays ?? ''}
          />
        </Field>
        <Field label="Order" htmlFor="z-sort" hint="Lower comes first.">
          <Input
            id="z-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={editing?.sortOrder ?? 0}
          />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Districts ({districts.length} chosen)</legend>
        {fieldError('districts') ? (
          <p className="text-xs text-danger">{fieldError('districts')}</p>
        ) : null}
        <div className="max-h-72 space-y-3 overflow-y-auto rounded-control border border-line p-3">
          {Object.entries(BD_GEO).map(([division, ds]) => (
            <div key={division}>
              <p className="text-xs font-semibold text-neutral-500 uppercase">{division}</p>
              <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-1">
                {Object.keys(ds).map((d) => {
                  const owner = takenBy.get(d);
                  return (
                    <label
                      key={d}
                      className={`flex items-center gap-2 text-sm ${owner ? 'text-neutral-400' : ''}`}
                      title={owner ? `In ${owner}` : undefined}
                    >
                      <input
                        type="checkbox"
                        checked={districts.includes(d)}
                        disabled={Boolean(owner)}
                        onChange={() => toggle(d)}
                      />
                      {d}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isDefault" defaultChecked={editing?.isDefault ?? false} />
        Default zone (covers every district not listed in another zone)
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />
        Deliver to this zone
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save zone' : 'Create zone'}
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

export function ZonesManager({ zones }: { zones: DeliveryZone[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = zones.find((z) => z.id === editingId) ?? null;
  const action = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_32rem]">
      <Card>
        {action.status ? (
          <div className="mb-4">
            <Alert tone={action.status.tone}>{action.status.text}</Alert>
          </div>
        ) : null}
        {zones.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No zones yet.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {z.name}{' '}
                  {z.isActive ? <Badge tone="green">On</Badge> : <Badge tone="neutral">Off</Badge>}{' '}
                  {z.isDefault ? <Badge tone="amber">Default</Badge> : null}
                </p>
                <p className="text-xs text-neutral-500">
                  {formatTaka(z.charge)}
                  {z.freeDeliveryThreshold
                    ? ` · free from ${formatTaka(z.freeDeliveryThreshold)}`
                    : ''}
                  {z.estimatedDays ? ` · ${z.estimatedDays}` : ''} ·{' '}
                  {z.districts.length
                    ? z.districts.join(', ')
                    : z.isDefault
                      ? 'all other districts'
                      : 'no districts'}
                </p>
              </div>
              <button
                type="button"
                className="text-sm underline"
                disabled={action.busy}
                onClick={() =>
                  void action.run(
                    () =>
                      api(`/admin/delivery-zones/${z.id}`, {
                        method: 'PATCH',
                        body: { isActive: !z.isActive },
                      }),
                    z.isActive ? `${z.name} turned off.` : `${z.name} turned on.`,
                  )
                }
              >
                {z.isActive ? 'Turn off' : 'Turn on'}
              </button>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => setEditingId(z.id)}
              >
                Edit
              </button>
              {z.orderCount === 0 ? (
                <button
                  type="button"
                  className="text-sm text-danger underline"
                  disabled={action.busy}
                  onClick={() => {
                    if (window.confirm(`Delete the zone "${z.name}"?`)) {
                      void action.run(
                        () => api(`/admin/delivery-zones/${z.id}`, { method: 'DELETE' }),
                        'Zone deleted.',
                      );
                    }
                  }}
                >
                  Delete
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </Card>
      <Card title={editing ? `Edit ${editing.name}` : 'New zone'}>
        <ZoneForm
          key={editing?.id ?? 'new'}
          editing={editing}
          zones={zones}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
