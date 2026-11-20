'use client';

import { useState, type FormEvent } from 'react';
import { MediaPicker, type PickedImage } from '@/components/admin/media-picker';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Category } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

const text = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
};

/** Ids of a category and everything below it (not allowed as its new parent). */
function subtreeIds(categories: Category[], rootId: string): Set<string> {
  const ids = new Set([rootId]);
  for (const c of categories) if (c.parentId && ids.has(c.parentId)) ids.add(c.id); // list is depth-first
  return ids;
}

function CategoryForm({
  categories,
  editing,
  onDone,
}: {
  categories: Category[];
  editing: Category | null;
  onDone: () => void;
}) {
  const { busy, status, run, fieldError } = useAction();
  const [image, setImage] = useState<PickedImage>(
    editing?.image && editing.imageId
      ? { id: editing.imageId, url: editing.image.url, altText: editing.image.altText }
      : null,
  );
  const excluded = editing ? subtreeIds(categories, editing.id) : new Set<string>();

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget; // React clears currentTarget after the first await
    const form = new FormData(formEl);
    const body = {
      name: String(form.get('name')).trim(),
      ...(text(form, 'slug') ? { slug: text(form, 'slug') } : {}),
      parentId: text(form, 'parentId'),
      description: text(form, 'description'),
      imageId: image?.id ?? null,
      sortOrder: Number(form.get('sortOrder') || 0),
      isActive: form.get('isActive') === 'on',
      seoTitle: text(form, 'seoTitle'),
      seoDescription: text(form, 'seoDescription'),
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/categories/${editing.id}`, { method: 'PATCH', body })
          : api('/admin/categories', { method: 'POST', body }),
      editing ? 'Category saved.' : 'Category created.',
    );
    if (saved && !editing) {
      formEl.reset();
      setImage(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Name" htmlFor="cat-name" error={fieldError('name')}>
        <Input id="cat-name" name="name" required maxLength={100} defaultValue={editing?.name} />
      </Field>
      <Field
        label="Slug"
        htmlFor="cat-slug"
        hint={
          editing ? 'Changing it redirects the old URL.' : 'Leave empty to make one from the name.'
        }
        error={fieldError('slug')}
      >
        <Input
          id="cat-slug"
          name="slug"
          maxLength={120}
          defaultValue={editing?.slug}
          placeholder="honey"
        />
      </Field>
      <Field label="Parent" htmlFor="cat-parent">
        <Select id="cat-parent" name="parentId" defaultValue={editing?.parentId ?? ''}>
          <option value="">None (top level)</option>
          {categories
            .filter((c) => !excluded.has(c.id))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {'— '.repeat(c.depth - 1)}
                {c.name}
              </option>
            ))}
        </Select>
      </Field>
      <Field label="Description" htmlFor="cat-description" hint="Optional, plain text.">
        <Textarea
          id="cat-description"
          name="description"
          rows={3}
          maxLength={2000}
          defaultValue={editing?.description ?? ''}
        />
      </Field>
      <MediaPicker value={image} onChange={setImage} />
      <div className="grid grid-cols-2 gap-4">
        <Field label="Sort order" htmlFor="cat-sort" hint="Lower comes first.">
          <Input
            id="cat-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={editing?.sortOrder ?? 0}
          />
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} />{' '}
          Visible in the shop
        </label>
      </div>
      <Field label="SEO title" htmlFor="cat-seo-title" hint="Up to 70 characters. Optional.">
        <Input
          id="cat-seo-title"
          name="seoTitle"
          maxLength={70}
          defaultValue={editing?.seoTitle ?? ''}
        />
      </Field>
      <Field label="SEO description" htmlFor="cat-seo-desc" hint="Up to 160 characters. Optional.">
        <Textarea
          id="cat-seo-desc"
          name="seoDescription"
          rows={2}
          maxLength={160}
          defaultValue={editing?.seoDescription ?? ''}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save category' : 'Create category'}
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

export function CategoriesManager({ categories }: { categories: Category[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = categories.find((c) => c.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
      <Card>
        {remove.status ? (
          <div className="mb-4">
            <Alert tone={remove.status.tone}>{remove.status.text}</Alert>
          </div>
        ) : null}
        {categories.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No categories yet.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center gap-3 py-2"
              style={{ paddingLeft: `${(c.depth - 1) * 1.5}rem` }}
            >
              {c.image ? (
                <img
                  src={c.image.url}
                  alt={c.image.altText}
                  className="h-8 w-8 rounded object-cover"
                />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-neutral-900">
                  {c.name} {!c.isActive ? <Badge tone="amber">Hidden</Badge> : null}
                </p>
                <p className="text-xs text-neutral-500">
                  /category/{c.slug} · {c.productCount} products
                </p>
              </div>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => setEditingId(c.id)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-danger underline disabled:text-neutral-300 disabled:no-underline"
                disabled={remove.busy || c.childCount > 0 || c.productCount > 0}
                title={
                  c.childCount > 0 || c.productCount > 0
                    ? 'Only empty categories can be deleted'
                    : undefined
                }
                onClick={() => {
                  if (window.confirm(`Delete "${c.name}"?`)) {
                    void remove.run(
                      () => api(`/admin/categories/${c.id}`, { method: 'DELETE' }),
                      'Category deleted.',
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
      <Card title={editing ? `Edit ${editing.name}` : 'New category'}>
        {/* key: a fresh form (and image state) for each category being edited */}
        <CategoryForm
          key={editing?.id ?? 'new'}
          categories={categories}
          editing={editing}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
