import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs, PlainText } from '@/components/shop/bits';
import { JsonLd } from '@/components/shop/json-ld';
import { ProductListing } from '@/components/shop/product-listing';
import { storeName } from '@/lib/api-server';
import { absoluteUrl } from '@/lib/site';
import { getCategory, listProducts, resolveRedirect, type ListParams } from '@/lib/storefront';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<ListParams> };

const FILTER_KEYS = ['brand', 'attr', 'minPrice', 'maxPrice', 'inStock', 'rating', 'sort'];

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const category = await getCategory(slug);
  if (!category) return {};
  const filtered = FILTER_KEYS.filter((k) => query[k] !== undefined).length;
  const page = Number(query.page ?? 1);
  const name = await storeName();
  const title = category.seoTitle || category.name;
  const description =
    category.seoDescription ||
    category.description?.slice(0, 160) ||
    `Buy ${category.name} online from ${name}. Cash on Delivery and delivery across Bangladesh.`;
  const image = category.image?.urls['1000'];
  return {
    title,
    description,
    openGraph: {
      type: 'website',
      title,
      description,
      siteName: name,
      url: `/category/${slug}`,
      images: image ? [{ url: image, alt: category.image!.altText }] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary' },
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

  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: category.breadcrumbs.map((b, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: b.name,
      item: absoluteUrl(`/category/${b.slug}`),
    })),
  };
  return (
    <div className="space-y-6">
      <JsonLd data={breadcrumbLd} />
      <Breadcrumbs
        items={category.breadcrumbs.map((b) => ({ name: b.name, href: `/category/${b.slug}` }))}
      />
      <header className="space-y-3">
        <h1 className="font-display text-[32px] leading-tight text-petrol sm:text-[40px]">
          {category.name}
        </h1>
        {category.description ? (
          <div className="max-w-3xl text-[15px] text-ink-muted">
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
                    className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-petrol hover:text-petrol"
                  >
                    {c.name} <span className="font-normal text-ink-muted">{c.productCount}</span>
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
        listName={category.name}
      />
    </div>
  );
}
