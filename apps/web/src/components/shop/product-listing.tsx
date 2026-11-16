import Link from 'next/link';
import { Suspense } from 'react';
import { formatTaka } from '@/lib/money';
import type { ListParams } from '@/lib/storefront';
import type { ProductPage } from '@/lib/storefront-types';
import { Pagination } from './bits';
import { ProductGrid } from './product-card';
import { SortSelect } from './sort-select';

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Whole taka for placeholders, from the money string (no floats): floor for min, ceil for max. */
const wholeTaka = (amount: string, up: boolean) => {
  const [whole = '0', frac = '00'] = amount.split('.');
  return up && /[1-9]/.test(frac) ? String(BigInt(whole) + 1n) : whole;
};

/** Filters as a plain GET form: works without JavaScript, URLs are shareable. */
function Filters({
  data,
  params,
  basePath,
}: {
  data: ProductPage;
  params: ListParams;
  basePath: string;
}) {
  const { facets } = data.meta;
  const brands = list(params.brand);
  const attrs = list(params.attr);
  const keep = ['q', 'sort'].flatMap((k) => list(params[k]).map((v) => [k, v] as const));
  return (
    <form action={basePath} className="space-y-6 text-sm">
      {keep.map(([k, v]) => (
        <input key={`${k}-${v}`} type="hidden" name={k} value={v} />
      ))}
      {facets.brands.length ? (
        <fieldset>
          <legend className="mb-2 font-semibold text-neutral-900">Brand</legend>
          <ul className="space-y-1">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    name="brand"
                    value={b.slug}
                    defaultChecked={brands.includes(b.slug)}
                  />
                  {b.name} <span className="text-neutral-400">({b.count})</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <fieldset>
        <legend className="mb-2 font-semibold text-neutral-900">Price (Tk)</legend>
        <div className="flex items-center gap-2">
          <input
            name="minPrice"
            inputMode="numeric"
            placeholder={facets.price.min ? wholeTaka(facets.price.min, false) : 'Min'}
            defaultValue={list(params.minPrice)[0] ?? ''}
            aria-label="Minimum price"
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
          <span>to</span>
          <input
            name="maxPrice"
            inputMode="numeric"
            placeholder={facets.price.max ? wholeTaka(facets.price.max, true) : 'Max'}
            defaultValue={list(params.maxPrice)[0] ?? ''}
            aria-label="Maximum price"
            className="w-20 rounded border border-neutral-300 px-2 py-1"
          />
        </div>
        {facets.price.min && facets.price.max ? (
          <p className="mt-1 text-xs text-neutral-500">
            {formatTaka(facets.price.min)} – {formatTaka(facets.price.max)}
          </p>
        ) : null}
      </fieldset>
      {facets.attributes.map((a) => (
        <fieldset key={a.slug}>
          <legend className="mb-2 font-semibold text-neutral-900">{a.name}</legend>
          <ul className="space-y-1">
            {a.values.map((v) => {
              const value = `${a.slug}:${v.slug}`;
              return (
                <li key={value}>
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      name="attr"
                      value={value}
                      defaultChecked={attrs.includes(value)}
                    />
                    {v.value} <span className="text-neutral-400">({v.count})</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          name="inStock"
          value="true"
          defaultChecked={list(params.inStock)[0] === 'true'}
        />
        In stock only
      </label>
      <div className="flex gap-3">
        <button
          type="submit"
          className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white hover:bg-neutral-700"
        >
          Apply
        </button>
        <Link
          href={
            keep.length
              ? `${basePath}?${new URLSearchParams(keep as [string, string][])}`
              : basePath
          }
          className="self-center underline"
        >
          Clear
        </Link>
      </div>
    </form>
  );
}

export function ProductListing({
  data,
  params,
  basePath,
  emptyText,
}: {
  data: ProductPage;
  params: ListParams;
  basePath: string;
  emptyText: string;
}) {
  const href = (page: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (k !== 'page') for (const item of list(v)) qs.append(k, item);
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="grid gap-8 lg:grid-cols-[14rem_1fr]">
      <aside className="min-w-0">
        {/* Phones: collapsed so products come first. Wide screens: always visible. (Two copies: a
            <details> cannot be open on one screen size only without JavaScript.) */}
        <details className="rounded-lg border border-neutral-200 p-4 lg:hidden">
          <summary className="cursor-pointer font-semibold">Filters</summary>
          <div className="mt-4">
            <Filters data={data} params={params} basePath={basePath} />
          </div>
        </details>
        <div className="hidden lg:block">
          <Filters data={data} params={params} basePath={basePath} />
        </div>
      </aside>
      <div className="min-w-0 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <p className="text-sm text-neutral-600">{data.meta.total} products</p>
          {/* useSearchParams needs a Suspense boundary in Next 16. */}
          <Suspense fallback={null}>
            <SortSelect />
          </Suspense>
        </div>
        {data.items.length ? (
          <ProductGrid products={data.items} priorityFirst />
        ) : (
          <p className="py-12 text-center text-neutral-500">{emptyText}</p>
        )}
        <Pagination
          page={data.meta.page}
          pageSize={data.meta.pageSize}
          total={data.meta.total}
          href={href}
        />
      </div>
    </div>
  );
}
