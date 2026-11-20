import Link from 'next/link';
import { Suspense } from 'react';
import { buttonClass } from '@/components/ui';
import { formatTaka } from '@/lib/money';
import type { ListParams } from '@/lib/storefront';
import type { ProductPage } from '@/lib/storefront-types';
import { Pagination } from './bits';
import { FilterDrawer } from './filter-drawer';
import { CloseIcon, SearchIcon } from './icons';
import { ProductGrid } from './product-card';
import { SortSelect } from './sort-select';

const list = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** Whole taka for placeholders, from the money string (no floats): floor for min, ceil for max. */
const wholeTaka = (amount: string, up: boolean) => {
  const [whole = '0', frac = '00'] = amount.split('.');
  return up && /[1-9]/.test(frac) ? String(BigInt(whole) + 1n) : whole;
};

const check = 'size-4 rounded border-line accent-petrol';
const priceInput =
  'h-10 w-full rounded-control border border-line bg-surface px-3 text-[15px] focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15';

/** The same list without any filter (keeps the search term and the sort). */
function clearHref(params: ListParams, basePath: string) {
  const keep = ['q', 'sort'].flatMap((k) => list(params[k]).map((v) => [k, v] as [string, string]));
  return keep.length ? `${basePath}?${new URLSearchParams(keep)}` : basePath;
}

/** Filters as a plain GET form: URLs are shareable and the page renders on the server. */
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
  const legend = 'mb-3 font-semibold text-ink';
  return (
    <form action={basePath} className="space-y-7 text-[15px]">
      {keep.map(([k, v]) => (
        <input key={`${k}-${v}`} type="hidden" name={k} value={v} />
      ))}
      {facets.brands.length ? (
        <fieldset>
          <legend className={legend}>Brand</legend>
          <ul className="space-y-2">
            {facets.brands.map((b) => (
              <li key={b.slug}>
                <label className="flex cursor-pointer items-center gap-2.5">
                  <input
                    type="checkbox"
                    name="brand"
                    value={b.slug}
                    defaultChecked={brands.includes(b.slug)}
                    className={check}
                  />
                  <span className="flex-1">{b.name}</span>
                  <span className="text-[13px] text-ink-muted">{b.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}
      <fieldset>
        <legend className={legend}>Price (Tk)</legend>
        <div className="flex items-center gap-2">
          <input
            name="minPrice"
            inputMode="numeric"
            placeholder={facets.price.min ? wholeTaka(facets.price.min, false) : 'Min'}
            defaultValue={list(params.minPrice)[0] ?? ''}
            aria-label="Minimum price"
            className={priceInput}
          />
          <span className="text-ink-muted">to</span>
          <input
            name="maxPrice"
            inputMode="numeric"
            placeholder={facets.price.max ? wholeTaka(facets.price.max, true) : 'Max'}
            defaultValue={list(params.maxPrice)[0] ?? ''}
            aria-label="Maximum price"
            className={priceInput}
          />
        </div>
        {facets.price.min && facets.price.max ? (
          <p className="mt-1.5 text-[13px] text-ink-muted">
            Prices here run from {formatTaka(facets.price.min)} to {formatTaka(facets.price.max)}
          </p>
        ) : null}
      </fieldset>
      {facets.attributes.map((a) => (
        <fieldset key={a.slug}>
          <legend className={legend}>{a.name}</legend>
          <ul className="space-y-2">
            {a.values.map((v) => {
              const value = `${a.slug}:${v.slug}`;
              return (
                <li key={value}>
                  <label className="flex cursor-pointer items-center gap-2.5">
                    <input
                      type="checkbox"
                      name="attr"
                      value={value}
                      defaultChecked={attrs.includes(value)}
                      className={check}
                    />
                    <span className="flex-1">{v.value}</span>
                    <span className="text-[13px] text-ink-muted">{v.count}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      <label className="flex cursor-pointer items-center gap-2.5 font-semibold">
        <input
          type="checkbox"
          name="inStock"
          value="true"
          defaultChecked={list(params.inStock)[0] === 'true'}
          className={check}
        />
        In stock only
      </label>
      <div className="flex items-center gap-4 border-t border-line pt-5">
        <button type="submit" className={buttonClass('primary', 'md', 'flex-1 lg:flex-none')}>
          Show products
        </button>
        <Link
          href={clearHref(params, basePath)}
          className="text-sm font-semibold text-petrol hover:underline"
        >
          Clear all
        </Link>
      </div>
    </form>
  );
}

/** Applied filters as chips; each one links to the same page without it. */
function ActiveFilters({
  data,
  params,
  basePath,
}: {
  data: ProductPage;
  params: ListParams;
  basePath: string;
}) {
  const { facets } = data.meta;
  const without = (key: string, value?: string) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      for (const item of list(v))
        if (k !== 'page' && !(k === key && (value === undefined || item === value)))
          qs.append(k, item);
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const chips: { label: string; href: string }[] = [];
  for (const b of list(params.brand))
    chips.push({
      label: facets.brands.find((x) => x.slug === b)?.name ?? b,
      href: without('brand', b),
    });
  for (const a of list(params.attr)) {
    const [attr, value] = a.split(':');
    const v = facets.attributes.find((x) => x.slug === attr)?.values.find((x) => x.slug === value);
    chips.push({ label: v?.value ?? a, href: without('attr', a) });
  }
  const min = list(params.minPrice)[0];
  const max = list(params.maxPrice)[0];
  if (min) chips.push({ label: `From Tk ${min}`, href: without('minPrice') });
  if (max) chips.push({ label: `Up to Tk ${max}`, href: without('maxPrice') });
  if (list(params.inStock)[0] === 'true')
    chips.push({ label: 'In stock only', href: without('inStock') });
  if (!chips.length) return null;
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Applied filters">
      {chips.map((c) => (
        <li key={c.href + c.label}>
          <Link
            href={c.href}
            className="inline-flex h-8 items-center gap-1.5 rounded-full border border-petrol/30 bg-petrol-tint pl-3 pr-2 text-sm font-semibold text-petrol hover:border-petrol"
            aria-label={`Remove filter ${c.label}`}
          >
            {c.label}
            <CloseIcon className="size-3.5" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const activeCount = (params: ListParams) =>
  list(params.brand).length +
  list(params.attr).length +
  (list(params.minPrice)[0] ? 1 : 0) +
  (list(params.maxPrice)[0] ? 1 : 0) +
  (list(params.inStock)[0] === 'true' ? 1 : 0);

export function ProductListing({
  data,
  params,
  basePath,
  emptyText,
  listName,
}: {
  data: ProductPage;
  params: ListParams;
  basePath: string;
  emptyText: string;
  /** For analytics: the category name or "Search results". */
  listName: string;
}) {
  const href = (page: number) => {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params))
      if (k !== 'page') for (const item of list(v)) qs.append(k, item);
    if (page > 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  const active = activeCount(params);
  return (
    <div className="grid gap-8 lg:grid-cols-[15rem_1fr]">
      <aside className="hidden min-w-0 lg:block">
        <div className="sticky top-40 rounded-card border border-line bg-surface p-5">
          <Filters data={data} params={params} basePath={basePath} />
        </div>
      </aside>
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="lg:hidden">
              <FilterDrawer active={active}>
                <Filters data={data} params={params} basePath={basePath} />
              </FilterDrawer>
            </span>
            <p className="text-sm text-ink-muted">
              {data.meta.total} {data.meta.total === 1 ? 'product' : 'products'}
            </p>
          </div>
          {/* useSearchParams needs a Suspense boundary in Next 16. */}
          <Suspense fallback={null}>
            <SortSelect />
          </Suspense>
        </div>
        <ActiveFilters data={data} params={params} basePath={basePath} />
        {data.items.length ? (
          <ProductGrid products={data.items} listName={listName} priorityFirst />
        ) : (
          <div className="flex flex-col items-center rounded-card border border-dashed border-line bg-surface px-6 py-14 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-petrol-tint text-petrol">
              <SearchIcon />
            </span>
            <p className="mt-4 max-w-sm text-ink">{emptyText}</p>
            {active ? (
              <Link
                href={clearHref(params, basePath)}
                className={buttonClass('secondary', 'md', 'mt-5')}
              >
                Clear filters
              </Link>
            ) : null}
          </div>
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
