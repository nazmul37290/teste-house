'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { value: '', label: 'Recommended' },
  { value: 'newest', label: 'Newest' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'popular', label: 'Most popular' },
];

/** Changes ?sort= and goes back to page 1, keeping the other filters. */
export function SortSelect() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="sr-only sm:not-sr-only">Sort</span>
      <select
        className="h-10 rounded-control border border-line bg-surface px-3 text-sm font-semibold text-ink focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15"
        value={params.get('sort') ?? ''}
        onChange={(e) => {
          const next = new URLSearchParams(params);
          if (e.target.value) next.set('sort', e.target.value);
          else next.delete('sort');
          next.delete('page');
          router.push(`${pathname}?${next}`);
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
