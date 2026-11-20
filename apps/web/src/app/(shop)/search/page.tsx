import type { Metadata } from 'next';
import { TrackOnce } from '@/components/analytics/track-once';
import { ProductListing } from '@/components/shop/product-listing';
import { listProducts, type ListParams } from '@/lib/storefront';

type Props = { searchParams: Promise<ListParams> };

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { q } = await searchParams;
  const term = Array.isArray(q) ? q[0] : q;
  // Search result pages are useful to people, not to search engines.
  return { title: term ? `Search: ${term}` : 'Search', robots: { index: false, follow: true } };
}

export default async function SearchPage({ searchParams }: Props) {
  const query = await searchParams;
  const term = (Array.isArray(query.q) ? query.q[0] : query.q)?.trim() ?? '';
  if (!term) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <h1 className="font-display text-[32px] text-petrol">Search the shop</h1>
        <p className="mt-2 text-ink-muted">
          Type a product, brand or ingredient in the search box above, for example honey or ghee.
        </p>
      </div>
    );
  }
  const data = (await listProducts(query))!;
  return (
    <div className="space-y-6">
      <h1 className="font-display text-[28px] leading-tight text-petrol sm:text-[34px]">
        Results for “{term}”
      </h1>
      <ProductListing
        data={data}
        params={query}
        basePath="/search"
        emptyText="Nothing found. Try another word or check the spelling."
        listName="Search results"
      />
      <TrackOnce id={term} kind="search" term={term} />
    </div>
  );
}
