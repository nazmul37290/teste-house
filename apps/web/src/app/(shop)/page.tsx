import Link from 'next/link';
import { connection } from 'next/server';
import { PlainText, SectionHeading } from '@/components/shop/bits';
import { ProductGrid } from '@/components/shop/product-card';
import { ShopImage } from '@/components/shop/shop-image';
import { getHomepage } from '@/lib/storefront';
import type { HeroBanner, HomeSection } from '@/lib/storefront-types';

/** Banner image, linked when the admin set a link (site paths and https only; checked by the API). */
function BannerLink({
  banner,
  priority,
  sizes,
}: {
  banner: HeroBanner;
  priority: boolean;
  sizes: string;
}) {
  const img = (
    <>
      {banner.mobileImage ? (
        <span className="block sm:hidden">
          <ShopImage
            image={banner.mobileImage}
            aspect="natural"
            sizes="100vw"
            priority={priority}
            className="h-auto w-full rounded-lg"
          />
        </span>
      ) : null}
      <span className={banner.mobileImage ? 'hidden sm:block' : 'block'}>
        <ShopImage
          image={banner.image}
          aspect="natural"
          sizes={sizes}
          priority={priority}
          className="h-auto w-full rounded-lg"
        />
      </span>
    </>
  );
  if (!banner.linkUrl) return img;
  return banner.linkUrl.startsWith('/') ? (
    <Link href={banner.linkUrl} aria-label={banner.title}>
      {img}
    </Link>
  ) : (
    <a href={banner.linkUrl} aria-label={banner.title} rel="noopener">
      {img}
    </a>
  );
}

function Section({ section, first }: { section: HomeSection; first: boolean }) {
  switch (section.type) {
    case 'PRODUCT_LIST':
      return (
        <section>
          {section.title ? (
            <SectionHeading
              title={section.title}
              action={
                section.link ? (
                  <Link href={section.link} className="text-sm font-medium underline">
                    See all
                  </Link>
                ) : null
              }
            />
          ) : null}
          <ProductGrid products={section.products} priorityFirst={first} />
        </section>
      );
    case 'CATEGORY_GRID':
      return (
        <section>
          {section.title ? <SectionHeading title={section.title} /> : null}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {section.categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="flex h-full flex-col items-center gap-2 rounded-lg border border-neutral-200 bg-white p-3 text-center hover:border-neutral-400"
                >
                  {c.image ? (
                    <ShopImage
                      image={c.image}
                      sizes="160px"
                      className="aspect-square w-full rounded object-cover"
                    />
                  ) : null}
                  <span className="text-sm font-medium text-neutral-900">{c.name}</span>
                  <span className="text-xs text-neutral-500">
                    {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      );
    case 'BANNER_STRIP':
      return (
        <section>
          {section.title ? <SectionHeading title={section.title} /> : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {section.banners.map((b) => (
              <BannerLink
                key={b.id}
                banner={b}
                priority={false}
                sizes="(min-width: 640px) 50vw, 100vw"
              />
            ))}
          </div>
        </section>
      );
    case 'TEXT':
      return (
        <section className="rounded-lg bg-neutral-50 p-6">
          {section.title ? <h2 className="mb-3 text-xl font-semibold">{section.title}</h2> : null}
          {/* Admin text is rendered as text only, never as HTML (Phase 5 decision). */}
          <PlainText text={section.text} />
        </section>
      );
  }
}

export default async function HomePage() {
  // Render per request, not at build time: the build (e.g. in Docker) has no API to read from. The
  // data itself is still cached (tagged fetch with revalidate), so this costs little.
  await connection();
  const home = await getHomepage();
  return (
    <div className="space-y-12">
      <h1 className="sr-only">Shop packaged food online</h1>
      {home.hero.length ? (
        <div
          className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 sm:mx-0 sm:px-0"
          aria-label="Offers"
        >
          {home.hero.map((b, i) => (
            <div key={b.id} className="w-full shrink-0 snap-center">
              <BannerLink banner={b} priority={i === 0} sizes="(min-width: 1152px) 1152px, 100vw" />
            </div>
          ))}
        </div>
      ) : null}
      {home.sections.map((s, i) => (
        <Section key={`${s.type}-${i}`} section={s} first={i === 0 && !home.hero.length} />
      ))}
      {!home.hero.length && !home.sections.length ? (
        <p className="py-16 text-center text-neutral-500">The shop opens soon.</p>
      ) : null}
    </div>
  );
}
