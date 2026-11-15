'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Tag } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

/** Tags are simple labels: add, rename inline, delete (removes them from their products). */
export function TagsManager({ tags }: { tags: Tag[] }) {
  const { busy, status, run } = useAction();
  const [editingId, setEditingId] = useState<string | null>(null);

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const name = String(new FormData(formEl).get('name')).trim();
    if (await run(() => api('/admin/tags', { method: 'POST', body: { name } }), 'Tag added.'))
      formEl.reset();
  }

  return (
    <Card title="Tags">
      <div className="space-y-4">
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <form onSubmit={onAdd} className="flex max-w-md gap-2">
          <Input
            name="name"
            required
            maxLength={50}
            placeholder="New tag, e.g. Organic"
            aria-label="New tag"
          />
          <Button type="submit" disabled={busy}>
            Add
          </Button>
        </form>
        <ul className="flex flex-wrap gap-2">
          {tags.map((t) =>
            editingId === t.id ? (
              <li key={t.id}>
                <form
                  className="flex gap-1"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const name = String(new FormData(e.currentTarget).get('name')).trim();
                    if (
                      await run(
                        () => api(`/admin/tags/${t.id}`, { method: 'PATCH', body: { name } }),
                        'Tag renamed.',
                      )
                    )
                      setEditingId(null);
                  }}
                >
                  <Input
                    name="name"
                    defaultValue={t.name}
                    required
                    maxLength={50}
                    className="h-8 w-40 py-1"
                    aria-label="Tag name"
                    autoFocus
                  />
                  <Button type="submit" className="px-2 py-1 text-xs" disabled={busy}>
                    Save
                  </Button>
                </form>
              </li>
            ) : (
              <li
                key={t.id}
                className="flex items-center gap-2 rounded-full border border-neutral-200 px-3 py-1 text-sm"
              >
                <span>{t.name}</span>
                <span className="text-xs text-neutral-400">{t.productCount}</span>
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => setEditingId(t.id)}
                >
                  Rename
                </button>
                <button
                  type="button"
                  className="text-xs text-red-700 underline"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Delete the tag "${t.name}"? It is removed from ${t.productCount} product(s).`,
                      )
                    ) {
                      void run(
                        () => api(`/admin/tags/${t.id}`, { method: 'DELETE' }),
                        'Tag deleted.',
                      );
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            ),
          )}
          {tags.length === 0 ? <li className="text-sm text-neutral-500">No tags yet.</li> : null}
        </ul>
      </div>
    </Card>
  );
}
