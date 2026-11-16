import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Breadcrumbs, PlainText, SectionHeading } from '@/components/shop/bits';
import { ProductGrid } from '@/components/shop/product-card';
import { getProduct, resolveRedirect } from '@/lib/storefront';
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

  const facts: [string, string | null][] = [
    ['Ingredients', product.ingredients],
    ['Shelf life', product.shelfLife],
    ['Origin', product.origin],
  ];
  return (
    <div className="space-y-10">
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
            {product.shortDescription ? (
              <p className="text-neutral-700">{product.shortDescription}</p>
            ) : null}
          </div>
          <BuyBox variants={product.variants} />
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

      {product.related.length ? (
        <section>
          <SectionHeading title="You may also like" />
          <ProductGrid products={product.related} />
        </section>
      ) : null}
    </div>
  );
}
