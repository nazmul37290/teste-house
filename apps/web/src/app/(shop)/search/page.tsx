import type { Metadata } from 'next';
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
      <div className="py-12 text-center">
        <h1 className="text-2xl font-bold">Search</h1>
        <p className="mt-2 text-neutral-600">
          Type what you are looking for in the search box above.
        </p>
      </div>
    );
  }
  const data = (await listProducts(query))!;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-neutral-900">Results for “{term}”</h1>
      <ProductListing
        data={data}
        params={query}
        basePath="/search"
        emptyText="Nothing found. Try another word or check the spelling."
      />
    </div>
  );
}
