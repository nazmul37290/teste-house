'use client';

import { BANNER_POSITIONS, PRODUCT_LIST_SOURCES } from '@shop/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Category, HomepageSection, ProductListItem } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

type SectionType = HomepageSection['type'];
const TYPE_LABEL: Record<SectionType, string> = {
  CATEGORY_GRID: 'Category grid',
  PRODUCT_LIST: 'Product list',
  BANNER_STRIP: 'Banner strip',
  CUSTOM_HTML: 'Text block',
};
const SOURCE_LABEL: Record<string, string> = {
  featured: 'Featured products',
  new: 'New arrivals',
  bestsellers: 'Best sellers',
  category: 'From a category',
  manual: 'Products I pick',
};

/** Products chosen by hand for a "manual" list: search, add, reorder by removing and re-adding. */
function ProductPicker({
  value,
  onChange,
}: {
  value: { id: string; name: string }[];
  onChange: (v: { id: string; name: string }[]) => void;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<ProductListItem[]>([]);
  // Saved sections store ids only: look up the names once (at most 24 products).
  const [names, setNames] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = value.filter((p) => p.name.startsWith('Product ') && !names[p.id]);
    if (!missing.length) return;
    void Promise.all(
      missing.map((p) =>
        api<{ id: string; name: string }>(`/admin/products/${p.id}`)
          .then((d) => [p.id, d.name] as const)
          .catch(() => [p.id, '(deleted product)'] as const),
      ),
    ).then((pairs) => setNames((n) => ({ ...n, ...Object.fromEntries(pairs) })));
  }, [value, names]);
  useEffect(() => {
    if (q.trim().length < 2) return setResults([]);
    const t = setTimeout(() => {
      api<ProductListItem[]>(
        `/admin/products?${new URLSearchParams({ q, status: 'ACTIVE', pageSize: '10' })}`,
      )
        .then(setResults)
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">Products</p>
      <ol className="list-decimal space-y-1 pl-5 text-sm">
        {value.map((p) => (
          <li key={p.id}>
            {names[p.id] ?? p.name}{' '}
            <button
              type="button"
              className="text-xs text-danger underline"
              onClick={() => onChange(value.filter((x) => x.id !== p.id))}
            >
              remove
            </button>
          </li>
        ))}
      </ol>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search active products to add"
        aria-label="Search products"
      />
      <ul className="space-y-1 text-sm">
        {results
          .filter((r) => !value.some((v) => v.id === r.id))
          .map((r) => (
            <li key={r.id}>
              <button
                type="button"
                className="underline"
                onClick={() => onChange([...value, { id: r.id, name: r.name }].slice(0, 24))}
              >
                + {r.name}
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}

function SectionForm({
  editing,
  categories,
  onDone,
}: {
  editing: HomepageSection | null;
  categories: Category[];
  onDone: () => void;
}) {
  const { busy, status, run } = useAction();
  const cfg = (editing?.config ?? {}) as Record<string, unknown>;
  const [type, setType] = useState<SectionType>(editing?.type ?? 'PRODUCT_LIST');
  const [source, setSource] = useState(String(cfg.source ?? 'featured'));
  const [picked, setPicked] = useState<{ id: string; name: string }[]>(
    Array.isArray(cfg.productIds)
      ? (cfg.productIds as string[]).map((id) => ({ id, name: `Product ${id.slice(0, 8)}` }))
      : [],
  );
  const [gridIds, setGridIds] = useState(
    new Set(Array.isArray(cfg.categoryIds) ? (cfg.categoryIds as string[]) : []),
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const limit = Number(form.get('limit') || 0);
    const config =
      type === 'CATEGORY_GRID'
        ? gridIds.size
          ? { categoryIds: [...gridIds] }
          : {}
        : type === 'PRODUCT_LIST'
          ? {
              source,
              ...(source === 'category' ? { categoryId: String(form.get('categoryId')) } : {}),
              ...(source === 'manual' ? { productIds: picked.map((p) => p.id) } : {}),
              ...(limit ? { limit } : {}),
            }
          : type === 'BANNER_STRIP'
            ? { position: String(form.get('position')) }
            : { text: String(form.get('text') ?? '').trim() };
    const title = String(form.get('title') ?? '').trim();
    const body = {
      type,
      title: title || null,
      config,
      sortOrder: Number(form.get('sortOrder') || 0),
      isActive: form.get('isActive') === 'on',
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/homepage-sections/${editing.id}`, { method: 'PUT', body })
          : api('/admin/homepage-sections', { method: 'POST', body }),
      editing ? 'Section saved.' : 'Section added.',
    );
    if (saved && !editing) {
      formEl.reset();
      setPicked([]);
      setGridIds(new Set());
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Type" htmlFor="s-type">
        <Select id="s-type" value={type} onChange={(e) => setType(e.target.value as SectionType)}>
          {(Object.keys(TYPE_LABEL) as SectionType[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Heading" htmlFor="s-title" hint="Shown above the section. Optional.">
        <Input id="s-title" name="title" maxLength={80} defaultValue={editing?.title ?? ''} />
      </Field>

      {type === 'PRODUCT_LIST' ? (
        <>
          <Field label="Which products" htmlFor="s-source">
            <Select id="s-source" value={source} onChange={(e) => setSource(e.target.value)}>
              {PRODUCT_LIST_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {SOURCE_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
          {source === 'category' ? (
            <Field label="Category" htmlFor="s-cat">
              <Select
                id="s-cat"
                name="categoryId"
                required
                defaultValue={String(cfg.categoryId ?? '')}
              >
                <option value="" disabled>
                  Choose
                </option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {'— '.repeat(c.depth - 1)}
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          {source === 'manual' ? <ProductPicker value={picked} onChange={setPicked} /> : null}
          <Field label="How many" htmlFor="s-limit" hint="Up to 24. Default 8.">
            <Input
              id="s-limit"
              name="limit"
              type="number"
              min={1}
              max={24}
              defaultValue={Number(cfg.limit ?? '') || ''}
            />
          </Field>
        </>
      ) : null}

      {type === 'CATEGORY_GRID' ? (
        <fieldset className="space-y-1 text-sm">
          <legend className="mb-1 font-medium">
            Categories (none ticked: all top-level categories)
          </legend>
          {categories.map((c) => (
            <label
              key={c.id}
              className="flex items-center gap-2"
              style={{ paddingLeft: `${(c.depth - 1) * 1}rem` }}
            >
              <input
                type="checkbox"
                checked={gridIds.has(c.id)}
                onChange={(e) =>
                  setGridIds((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(c.id);
                    else next.delete(c.id);
                    return next;
                  })
                }
              />
              {c.name}
            </label>
          ))}
        </fieldset>
      ) : null}

      {type === 'BANNER_STRIP' ? (
        <Field
          label="Banners from"
          htmlFor="s-pos"
          hint="Banners with this position (see Banners)."
        >
          <Select id="s-pos" name="position" defaultValue={String(cfg.position ?? 'home_strip')}>
            {BANNER_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}

      {type === 'CUSTOM_HTML' ? (
        <Field
          label="Text"
          htmlFor="s-text"
          hint="Plain text. Separate paragraphs with an empty line. HTML is shown as text, never run."
        >
          <Textarea
            id="s-text"
            name="text"
            rows={6}
            maxLength={5000}
            required
            defaultValue={String(cfg.text ?? '')}
          />
        </Field>
      ) : null}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Order" htmlFor="s-sort" hint="Lower comes first.">
          <Input
            id="s-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={editing?.sortOrder ?? 0}
          />
        </Field>
        <label className="mt-7 flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Show
        </label>
      </div>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {editing ? 'Save section' : 'Add section'}
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

export function SectionsManager({
  sections,
  categories,
}: {
  sections: HomepageSection[];
  categories: Category[];
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = sections.find((s) => s.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <Card>
        {remove.status ? (
          <div className="mb-4">
            <Alert tone={remove.status.tone}>{remove.status.text}</Alert>
          </div>
        ) : null}
        <ol className="divide-y divide-line">
          {sections.map((s) => (
            <li key={s.id} className="flex items-center gap-3 py-3">
              <span className="w-8 text-xs text-neutral-400">{s.sortOrder}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {s.title || <span className="text-neutral-400">(no heading)</span>}{' '}
                  {!s.isActive ? <Badge>Hidden</Badge> : null}
                </p>
                <p className="text-xs text-neutral-500">{TYPE_LABEL[s.type]}</p>
              </div>
              <button
                type="button"
                className="text-sm underline"
                onClick={() => setEditingId(s.id)}
              >
                Edit
              </button>
              <button
                type="button"
                className="text-sm text-danger underline"
                disabled={remove.busy}
                onClick={() => {
                  if (window.confirm('Delete this section?')) {
                    void remove.run(
                      () => api(`/admin/homepage-sections/${s.id}`, { method: 'DELETE' }),
                      'Section deleted.',
                    );
                  }
                }}
              >
                Delete
              </button>
            </li>
          ))}
          {sections.length === 0 ? (
            <li className="py-6 text-center text-sm text-neutral-500">No sections yet.</li>
          ) : null}
        </ol>
      </Card>
      <Card title={editing ? 'Edit section' : 'New section'}>
        <SectionForm
          key={editing?.id ?? 'new'}
          editing={editing}
          categories={categories}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
