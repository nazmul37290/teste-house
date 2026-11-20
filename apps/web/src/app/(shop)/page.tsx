import type { Metadata } from 'next';
import Link from 'next/link';
import { connection } from 'next/server';
import { Carousel } from '@/components/carousel';
import { PlainText, SectionHeading } from '@/components/shop/bits';
import {
  FactsStrip,
  FaqSection,
  factsFrom,
  faqsFrom,
  HomeHero,
  RecentReviews,
} from '@/components/shop/home';
import { JsonLd } from '@/components/shop/json-ld';
import { ProductRow } from '@/components/shop/product-card';
import { ShopImage } from '@/components/shop/shop-image';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { SITE_URL } from '@/lib/site';
import { getHomepage, getRecentReviews, getStoreFacts } from '@/lib/storefront';
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
            className="h-auto w-full"
          />
        </span>
      ) : null}
      <span className={banner.mobileImage ? 'hidden sm:block' : 'block'}>
        <ShopImage
          image={banner.image}
          aspect="natural"
          sizes={sizes}
          priority={priority}
          className="h-auto w-full"
        />
      </span>
    </>
  );
  const frame = 'block overflow-hidden rounded-feature border border-line bg-surface';
  if (!banner.linkUrl)
    return (
      <span className={frame} role="img" aria-label={banner.title}>
        {img}
      </span>
    );
  return banner.linkUrl.startsWith('/') ? (
    <Link href={banner.linkUrl} aria-label={banner.title} className={frame}>
      {img}
    </Link>
  ) : (
    <a href={banner.linkUrl} aria-label={banner.title} rel="noopener" className={frame}>
      {img}
    </a>
  );
}

function Section({ section, first }: { section: HomeSection; first: boolean }) {
  switch (section.type) {
    case 'PRODUCT_LIST':
      return (
        <section>
          <SectionHeading
            title={section.title ?? 'Products'}
            action={
              section.link ? (
                <Link
                  href={section.link}
                  className="mr-24 hidden text-sm font-semibold text-petrol hover:underline sm:inline"
                >
                  See all
                </Link>
              ) : null
            }
          />
          <ProductRow
            products={section.products}
            listName={section.title ?? 'Home'}
            label={section.title ?? 'Products'}
            priorityFirst={first}
          />
          {section.link ? (
            <Link
              href={section.link}
              className="mt-3 inline-block text-sm font-semibold text-petrol hover:underline sm:hidden"
            >
              See all
            </Link>
          ) : null}
        </section>
      );
    case 'CATEGORY_GRID':
      return (
        <section>
          <SectionHeading title={section.title ?? 'Shop by category'} />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
            {section.categories.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="group flex h-full flex-col overflow-hidden rounded-card border border-line bg-surface transition-colors hover:border-petrol"
                >
                  {c.image ? (
                    <ShopImage
                      image={c.image}
                      sizes="(min-width: 1024px) 180px, (min-width: 640px) 33vw, 50vw"
                      className="aspect-[4/3] w-full object-cover"
                    />
                  ) : (
                    <span
                      aria-hidden
                      className="flex aspect-[4/3] w-full items-center justify-center bg-petrol-tint font-display text-3xl text-petrol"
                    >
                      {c.name.charAt(0)}
                    </span>
                  )}
                  <span className="flex flex-1 flex-col p-3">
                    <span className="font-semibold leading-snug text-ink group-hover:text-petrol">
                      {c.name}
                    </span>
                    <span className="text-[13px] text-ink-muted">
                      {c.productCount} {c.productCount === 1 ? 'product' : 'products'}
                    </span>
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
        <section className="rounded-card border border-line bg-surface p-6 sm:p-8">
          {section.title ? (
            <h2 className="mb-3 font-display text-2xl text-petrol">{section.title}</h2>
          ) : null}
          {/* Admin text is rendered as text only, never as HTML (Phase 5 decision). */}
          <PlainText text={section.text} />
        </section>
      );
  }
}

/** Home: canonical, description (settings, else a plain default) and social preview tags. */
export async function generateMetadata(): Promise<Metadata> {
  const [settings, name] = await Promise.all([getPublicSettings(), storeName()]);
  const title = settings['seo.defaultTitle']?.trim() || name;
  const description =
    settings['seo.defaultDescription']?.trim() ||
    `Order honey, ghee, tea, dates and packaged food from ${name}, delivered in Bangladesh.`;
  return {
    description,
    alternates: { canonical: '/' },
    openGraph: { type: 'website', title, description, siteName: name, url: '/' },
    twitter: { card: 'summary' },
  };
}

export default async function HomePage() {
  // Render per request, not at build time: the build (e.g. in Docker) has no API to read from. The
  // data itself is still cached (tagged fetch with revalidate), so this costs little.
  await connection();
  const [home, name, settings, facts, reviews] = await Promise.all([
    getHomepage(),
    storeName(),
    getPublicSettings(),
    getStoreFacts(),
    getRecentReviews(),
  ]);
  const logo = settings['store.logo'];
  const faqs = faqsFrom(facts);
  const siteLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name,
      url: SITE_URL,
      ...(logo ? { logo } : {}),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name,
      url: SITE_URL,
      potentialAction: {
        '@type': 'SearchAction',
        target: `${SITE_URL}/search?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];
  return (
    <div className="space-y-14 sm:space-y-20">
      <JsonLd data={siteLd} />
      <div className="space-y-4 sm:space-y-5">
        <HomeHero name={name} />
        <FactsStrip facts={factsFrom(facts)} />
      </div>
      {home.hero.length ? (
        <section aria-label="Offers">
          <Carousel label="Offers" itemClass="auto-cols-[100%]" arrows="inside" gapClass="gap-4">
            {home.hero.map((b, i) => (
              <BannerLink
                key={b.id}
                banner={b}
                priority={i === 0}
                sizes="(min-width: 1152px) 1152px, 100vw"
              />
            ))}
          </Carousel>
        </section>
      ) : null}
      <div id="shop" className="scroll-mt-44 space-y-14 sm:space-y-20">
        {home.sections.map((s, i) => (
          <Section key={`${s.type}-${i}`} section={s} first={i === 0 && !home.hero.length} />
        ))}
        {!home.hero.length && !home.sections.length ? (
          <p className="py-16 text-center text-ink-muted">The shop opens soon.</p>
        ) : null}
      </div>
      <RecentReviews reviews={reviews} />
      <FaqSection faqs={faqs} phone={settings['store.phone']} email={settings['store.email']} />
    </div>
  );
}
