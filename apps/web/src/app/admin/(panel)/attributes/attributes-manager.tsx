'use client';

import type { FormEvent } from 'react';
import { Alert, Badge, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Attribute } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

function AttributeCard({ attribute }: { attribute: Attribute }) {
  const { busy, status, run } = useAction();

  async function addValue(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const value = String(new FormData(formEl).get('value')).trim();
    if (
      await run(() =>
        api(`/admin/attributes/${attribute.id}/values`, { method: 'POST', body: { value } }),
      )
    )
      formEl.reset();
  }

  return (
    <Card>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">{attribute.name}</h2>
            <p className="text-xs text-neutral-500">
              {attribute.isFilterable ? 'Shown as a shop filter' : 'Not a shop filter'}
            </p>
          </div>
          <div className="flex gap-3 text-sm">
            <button
              type="button"
              className="underline"
              disabled={busy}
              onClick={() =>
                void run(
                  () =>
                    api(`/admin/attributes/${attribute.id}`, {
                      method: 'PATCH',
                      body: { isFilterable: !attribute.isFilterable },
                    }),
                  attribute.isFilterable ? 'No longer a shop filter.' : 'Now a shop filter.',
                )
              }
            >
              {attribute.isFilterable ? 'Hide filter' : 'Show as filter'}
            </button>
            <button
              type="button"
              className="text-danger underline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(`Delete the attribute "${attribute.name}" and all its values?`)
                ) {
                  void run(() => api(`/admin/attributes/${attribute.id}`, { method: 'DELETE' }));
                }
              }}
            >
              Delete
            </button>
          </div>
        </div>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <ul className="flex flex-wrap gap-2">
          {attribute.values.map((v) => (
            <li
              key={v.id}
              className="flex items-center gap-2 rounded-full border border-line px-3 py-1 text-sm"
            >
              {v.value}
              {v.variantCount > 0 ? <Badge>{v.variantCount}</Badge> : null}
              <button
                type="button"
                aria-label={`Remove ${v.value}`}
                className="text-neutral-400 hover:text-danger disabled:opacity-30"
                disabled={busy || v.variantCount > 0}
                title={v.variantCount > 0 ? 'Used by variants' : 'Remove'}
                onClick={() =>
                  void run(() => api(`/admin/attribute-values/${v.id}`, { method: 'DELETE' }))
                }
              >
                ×
              </button>
            </li>
          ))}
          {attribute.values.length === 0 ? (
            <li className="text-sm text-neutral-500">No values yet.</li>
          ) : null}
        </ul>
        <form onSubmit={addValue} className="flex max-w-sm gap-2">
          <Input
            name="value"
            required
            maxLength={50}
            placeholder="Add a value"
            aria-label={`New ${attribute.name} value`}
          />
          <Button type="submit" variant="secondary" disabled={busy}>
            Add
          </Button>
        </form>
      </div>
    </Card>
  );
}

export function AttributesManager({ attributes }: { attributes: Attribute[] }) {
  const { busy, status, run } = useAction();

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = {
      name: String(form.get('name')).trim(),
      isFilterable: form.get('isFilterable') === 'on',
    };
    if (await run(() => api('/admin/attributes', { method: 'POST', body }), 'Attribute created.'))
      formEl.reset();
  }

  return (
    <div className="max-w-3xl space-y-4">
      <Card title="New attribute">
        <form onSubmit={onCreate} className="flex flex-wrap items-center gap-3">
          {status ? (
            <div className="w-full">
              <Alert tone={status.tone}>{status.text}</Alert>
            </div>
          ) : null}
          <Input
            name="name"
            required
            maxLength={50}
            placeholder="e.g. Flavor"
            className="max-w-xs"
            aria-label="Attribute name"
          />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="isFilterable" defaultChecked /> Shop filter
          </label>
          <Button type="submit" disabled={busy}>
            Create
          </Button>
        </form>
      </Card>
      {attributes.map((a) => (
        <AttributeCard key={a.id} attribute={a} />
      ))}
    </div>
  );
}
