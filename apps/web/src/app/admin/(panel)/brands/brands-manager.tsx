'use client';

import { useState, type FormEvent } from 'react';
import { MediaPicker, type PickedImage } from '@/components/admin/media-picker';
import { Alert, Badge, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Brand } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

const text = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
};

function BrandForm({ editing, onDone }: { editing: Brand | null; onDone: () => void }) {
  const { busy, status, run, fieldError } = useAction();
  const [logo, setLogo] = useState<PickedImage>(
    editing?.logo && editing.logoId
      ? { id: editing.logoId, url: editing.logo.url, altText: editing.logo.altText }
      : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const body = {
      name: String(form.get('name')).trim(),
      ...(text(form, 'slug') ? { slug: text(form, 'slug') } : {}),
      logoId: logo?.id ?? null,
      isActive: form.get('isActive') === 'on',
      seoTitle: text(form, 'seoTitle'),
      seoDescription: text(form, 'seoDescription'),
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/brands/${editing.id}`, { method: 'PATCH', body })
          : api('/admin/brands', { method: 'POST', body }),
      editing ? 'Brand saved.' : 'Brand created.',
    );
    if (saved && !editing) {
      formEl.reset();
      setLogo(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Name" htmlFor="brand-name" error={fieldError('name')}>
        <Input id="brand-name" name="name" required maxLength={100} defaultValue={editing?.name} />
      </Field>
      <Field
        label="Slug"
        htmlFor="brand-slug"
        hint="Leave empty to make one from the name."
        error={fieldError('slug')}
      >
        <Input id="brand-slug" name="slug" maxLength={120} defaultValue={editing?.slug} />
      </Field>
      <MediaPicker label="Logo" value={logo} onChange={setLogo} />
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Visible
        in the shop
      </label>
      <Field label="SEO title" htmlFor="brand-seo-title" hint="Up to 70 characters. Optional.">
        <Input
          id="brand-seo-title"
          name="seoTitle"
          maxLength={70}
          defaultValue={editing?.seoTitle ?? ''}
        />
      </Field>
      <Field
        label="SEO description"
        htmlFor="brand-seo-desc"
        hint="Up to 160 characters. Optional."
      >
        <Textarea
          id="brand-seo-desc"
          name="seoDescription"
          rows={2}
          maxLength={160}
          defaultValue={editing?.seoDescription ?? ''}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save brand' : 'Create brand'}
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

export function BrandsManager({ brands }: { brands: Brand[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = brands.find((b) => b.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
      <Card title="Brands">
        {remove.status ? (
          <div className="mb-4">
            <Alert tone={remove.status.tone}>{remove.status.text}</Alert>
          </div>
        ) : null}
        {brands.length === 0 ? (
          <p className="py-4 text-sm text-neutral-500">No brands yet.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {brands.map((b) => (
            <li key={b.id} className="flex items-center gap-3 py-2">
              {b.logo ? (
                <img
                  src={b.logo.url}
                  alt={b.logo.altText}
                  className="h-8 w-8 rounded object-contain"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {b.name} {!b.isActive ? <Badge tone="amber">Hidden</Badge> : null}
                </p>
                <p className="text-xs text-neutral-500">{b.productCount} products</p>
              </div>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => setEditingId(b.id)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-danger underline disabled:text-neutral-300 disabled:no-underline"
                disabled={remove.busy || b.productCount > 0}
                title={b.productCount > 0 ? 'Change the brand of its products first' : undefined}
                onClick={() => {
                  if (window.confirm(`Delete "${b.name}"?`)) {
                    void remove.run(
                      () => api(`/admin/brands/${b.id}`, { method: 'DELETE' }),
                      'Brand deleted.',
                    );
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      </Card>
      <Card title={editing ? `Edit ${editing.name}` : 'New brand'}>
        <BrandForm key={editing?.id ?? 'new'} editing={editing} onDone={() => setEditingId(null)} />
      </Card>
    </div>
  );
}
