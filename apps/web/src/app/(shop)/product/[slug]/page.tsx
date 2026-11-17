import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs, PlainText, SectionHeading } from '@/components/shop/bits';
import { JsonLd } from '@/components/shop/json-ld';
import { ProductGrid } from '@/components/shop/product-card';
import { absoluteUrl } from '@/lib/site';
import { getProduct, getReviews, resolveRedirect } from '@/lib/storefront';
import { analyticsItem } from '@shop/shared';
import { TrackOnce } from '@/components/analytics/track-once';
import { ReviewsSection } from '@/components/shop/reviews-section';
import { Stars } from '@/components/shop/stars';
import { WishlistButton } from '@/components/shop/wishlist-button';
import { BuyBox } from './buy-box';
import { Gallery } from './gallery';

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return {};
  const image = product.ogImage ?? product.images[0];
  const description =
    product.seoDescription ||
    product.shortDescription ||
    product.description?.slice(0, 160) ||
    undefined;
  return {
    title: product.seoTitle || product.name,
    description,
    alternates: { canonical: product.canonicalUrl || `/product/${product.slug}` },
    openGraph: {
      type: 'website',
      title: product.seoTitle || product.name,
      description,
      images: image ? [{ url: image.urls['1000']!, alt: image.altText }] : undefined,
    },
    twitter: { card: image ? 'summary_large_image' : 'summary' },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) {
    const moved = await resolveRedirect(`/product/${slug}`);
    if (moved) permanentRedirect(moved);
    notFound();
  }
  const reviews = await getReviews(slug);
  const analyticsProduct = {
    name: product.name,
    brand: product.brand?.name ?? null,
    category: product.breadcrumbs.at(-1)?.name ?? null,
  };
  // view_item: the variant shown first (in stock if possible), as the buy box shows it.
  const shown = product.variants.find((v) => v.inStock) ?? product.variants[0]!;
  const viewItems = [
    analyticsItem({ sku: shown.sku, variant: shown.name, price: shown.price, ...analyticsProduct }),
  ];

  const facts: [string, string | null][] = [
    ['Ingredients', product.ingredients],
    ['Shelf life', product.shelfLife],
    ['Origin', product.origin],
  ];
  const url = absoluteUrl(`/product/${product.slug}`);
  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.name,
    description: product.shortDescription ?? product.description ?? undefined,
    image: product.images.map((i) => i.urls['1000']),
    brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
    offers: product.variants.map((v) => ({
      '@type': 'Offer',
      sku: v.sku,
      name: v.name,
      price: v.price,
      priceCurrency: 'BDT',
      availability: v.inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition',
      url,
    })),
    // Only with real reviews (Phase 9); an empty rating is invalid structured data.
    aggregateRating:
      product.ratingCount > 0
        ? {
            '@type': 'AggregateRating',
            ratingValue: product.ratingAvg,
            reviewCount: product.ratingCount,
          }
        : undefined,
    review: reviews?.items.slice(0, 5).map((r) => ({
      '@type': 'Review',
      author: { '@type': 'Person', name: r.author },
      datePublished: r.createdAt.slice(0, 10),
      reviewRating: { '@type': 'Rating', ratingValue: r.rating, bestRating: 5 },
      name: r.title ?? undefined,
      reviewBody: r.body ?? undefined,
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      ...product.breadcrumbs.map((b, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        name: b.name,
        item: absoluteUrl(`/category/${b.slug}`),
      })),
      {
        '@type': 'ListItem',
        position: product.breadcrumbs.length + 1,
        name: product.name,
        item: url,
      },
    ],
  };
  return (
    <div className="space-y-10">
      <JsonLd data={[productLd, breadcrumbLd]} />
      <Breadcrumbs
        items={[
          ...product.breadcrumbs.map((b) => ({ name: b.name, href: `/category/${b.slug}` })),
          { name: product.name, href: `/product/${product.slug}` },
        ]}
      />
      {/* min-w-0: grid items default to min-width:auto, so the 1000 px image would widen the page on phones. */}
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="min-w-0">
          <Gallery images={product.images} name={product.name} />
        </div>
        <div className="min-w-0 space-y-6">
          <div className="space-y-2">
            {product.brand ? (
              <Link
                href={`/search?${new URLSearchParams({ q: product.brand.name, brand: product.brand.slug })}`}
                className="text-sm uppercase tracking-wide text-neutral-500 hover:underline"
              >
                {product.brand.name}
              </Link>
            ) : null}
            <h1 className="text-2xl font-bold text-neutral-900 sm:text-3xl">{product.name}</h1>
            {product.ratingCount > 0 ? (
              <a href="#reviews" className="inline-block">
                <Stars value={product.ratingAvg} count={product.ratingCount} />
              </a>
            ) : null}
            {product.shortDescription ? (
              <p className="text-neutral-700">{product.shortDescription}</p>
            ) : null}
          </div>
          <BuyBox variants={product.variants} product={analyticsProduct} />
          <WishlistButton
            productId={product.id}
            name={product.name}
            variant="text"
            item={viewItems[0]}
          />
          <TrackOnce id={product.id} kind="ecommerce" event="view_item" items={viewItems} />
          {product.tags.length ? (
            <ul className="flex flex-wrap gap-2">
              {product.tags.map((t) => (
                <li
                  key={t.slug}
                  className="rounded-full bg-neutral-100 px-3 py-1 text-xs text-neutral-700"
                >
                  {t.name}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        {product.description ? (
          <section className="min-w-0">
            <h2 className="mb-3 text-lg font-semibold">Description</h2>
            <PlainText text={product.description} />
          </section>
        ) : (
          <div />
        )}
        <section className="min-w-0 space-y-4">
          {facts.some(([, v]) => v) ? (
            <dl className="space-y-3 text-sm">
              {facts.map(([label, value]) =>
                value ? (
                  <div key={label}>
                    <dt className="font-semibold text-neutral-900">{label}</dt>
                    <dd className="text-neutral-700">{value}</dd>
                  </div>
                ) : null,
              )}
            </dl>
          ) : null}
          {product.nutritionFacts?.length ? (
            <table className="w-full text-sm">
              <caption className="mb-2 text-left font-semibold text-neutral-900">
                Nutrition facts
              </caption>
              <tbody className="divide-y divide-neutral-200">
                {product.nutritionFacts.map((f) => (
                  <tr key={f.name}>
                    <th scope="row" className="py-1.5 text-left font-normal text-neutral-700">
                      {f.name}
                    </th>
                    <td className="py-1.5 text-right text-neutral-900">{f.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </section>
      </div>

      <ReviewsSection productId={product.id} slug={product.slug} page={reviews} />

      {product.related.length ? (
        <section>
          <SectionHeading title="You may also like" />
          <ProductGrid products={product.related} listName="Related products" />
        </section>
      ) : null}
    </div>
  );
}
