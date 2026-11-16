import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs, PlainText } from '@/components/shop/bits';
import { ProductListing } from '@/components/shop/product-listing';
import { getCategory, listProducts, resolveRedirect, type ListParams } from '@/lib/storefront';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ListParams> };

const FILTER_KEYS = ['brand', 'attr', 'minPrice', 'maxPrice', 'inStock', 'rating', 'sort'];

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategory(slug);
  if (!category) return {};
  const filtered = FILTER_KEYS.filter((k) => query[k] !== undefined).length;
  const page = Number(query.page ?? 1);
  return {
    title: category.seoTitle || category.name,
    description: category.seoDescription || category.description?.slice(0, 160) || undefined,
    // Filtered views point search engines at the plain category; several filters at once are not indexed.
    alternates: {
      canonical: page > 1 && !filtered ? `/category/${slug}?page=${page}` : `/category/${slug}`,
    },
    robots: filtered > 1 ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategory(slug);
  if (!category) {
    const moved = await resolveRedirect(`/category/${slug}`);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const data = (await listProducts({ ...query, category: slug }, [`category:${slug}`]))!;

  return (
    <div className="space-y-6">
      <Breadcrumbs
        items={category.breadcrumbs.map((b) => ({ name: b.name, href: `/category/${b.slug}` }))}
      />
      <header className="space-y-3">
        <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{category.name}</h1>
        {category.description ? (
          <div className="max-w-3xl text-sm">
            <PlainText text={category.description} />
          </div>
        ) : null}
        {category.children.length ? (
          <ul className="flex flex-wrap gap-2">
            {category.children
              .filter((c) => c.productCount > 0)
              .map((c) => (
                <li key={c.slug}>
                  <Link
                    href={`/category/${c.slug}`}
                    className="inline-block rounded-full border border-neutral-300 px-3 py-1 text-sm hover:bg-neutral-100"
                  >
                    {c.name} <span className="text-neutral-400">({c.productCount})</span>
                  </Link>
                </li>
              ))}
          </ul>
        ) : null}
      </header>
      <ProductListing
        data={data}
        params={query}
        basePath={`/category/${slug}`}
        emptyText="No products match these filters."
      />
    </div>
  );
}
