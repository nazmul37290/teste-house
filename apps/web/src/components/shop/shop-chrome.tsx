import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { getCategories } from '@/lib/storefront';
import { CookieSettingsLink } from '@/components/analytics/consent-and-gtm';
import { CartButton } from './cart-button';
import { HeartIcon, MailIcon, PhoneIcon, PinIcon, UserIcon } from './icons';
import { SearchBox } from './search-box';
import { StickyHeader } from './sticky-header';

export const headerIconLink =
  'flex shrink-0 flex-col items-center gap-0.5 rounded-control px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:text-petrol sm:flex-row sm:gap-1.5 sm:text-sm';

/** Store header. Static (no session lookup) so pages stay cacheable; /account handles sign-in. */
export async function ShopHeader() {
  const [settings, name, categories] = await Promise.all([
    getPublicSettings(),
    storeName(),
    getCategories().catch(() => []),
  ]);
  const logo = settings['store.logo'];
  const phone = settings['store.phone'];
  // Only categories with something to buy (an empty one would be a dead end).
  const top = categories.filter((c) => c.depth === 1 && c.productCount > 0);
  return (
    <StickyHeader>
      {phone ? (
        <div className="bg-petrol text-[13px] text-white/85">
          <div className="mx-auto flex h-8 max-w-6xl items-center justify-end px-4">
            <a href={`tel:${phone}`} className="inline-flex items-center gap-1.5 hover:text-white">
              <PhoneIcon className="size-3.5" />
              Order by phone: {phone}
            </a>
          </div>
        </div>
      ) : null}
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3 md:flex-nowrap">
        <Link href="/" className="shrink-0" aria-label={`${name} home`}>
          {/* The logo is an admin-set absolute URL (settings); plain img keeps it outside the image loader. */}
          {logo ? (
            <img src={logo} alt={name} width={160} height={48} className="h-10 w-auto sm:h-12" />
          ) : (
            <span className="font-display text-xl text-petrol">{name}</span>
          )}
        </Link>
        <div className="order-last w-full md:order-none md:mx-4 md:flex-1">
          <SearchBox />
        </div>
        <nav aria-label="Your shop" className="ml-auto flex items-center gap-1 md:ml-0">
          <Link href="/account" className={headerIconLink}>
            <UserIcon />
            Account
          </Link>
          <Link href="/wishlist" className={headerIconLink}>
            <HeartIcon />
            Wishlist
          </Link>
          <CartButton />
        </nav>
      </div>
      {top.length ? (
        <nav aria-label="Categories" className="border-t border-line">
          <ul className="snap-row mx-auto max-w-6xl auto-cols-max justify-start gap-1 px-2 text-sm font-medium text-ink-muted sm:px-3">
            {top.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="block whitespace-nowrap rounded-control px-2 py-2.5 transition-colors hover:text-petrol"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </StickyHeader>
  );
}

const footLink = 'text-white/75 transition-colors hover:text-white';

export async function ShopFooter() {
  const [settings, name, categories] = await Promise.all([
    getPublicSettings(),
    storeName(),
    getCategories().catch(() => []),
  ]);
  const logo = settings['store.logo'];
  const phone = settings['store.phone'];
  const email = settings['store.email'];
  const address = settings['store.address'];
  const top = categories.filter((c) => c.depth === 1 && c.productCount > 0).slice(0, 6);
  return (
    <footer className="mt-20 bg-petrol text-sm text-white">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-10 px-4 py-14 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="col-span-2 space-y-5 lg:col-span-1">
          {/* The settings logo is dark ink; the filter turns it white for the petrol band. */}
          {logo ? (
            <img
              src={logo}
              alt={name}
              width={200}
              height={60}
              className="h-14 w-auto brightness-0 invert"
            />
          ) : (
            <p className="font-display text-2xl">{name}</p>
          )}
          <ul className="space-y-2.5 text-white/80">
            {phone ? (
              <li className="flex items-center gap-2">
                <PhoneIcon className="size-4 shrink-0 text-haldi" />
                <a href={`tel:${phone}`} className={footLink}>
                  {phone}
                </a>
              </li>
            ) : null}
            {email ? (
              <li className="flex items-center gap-2">
                <MailIcon className="size-4 shrink-0 text-haldi" />
                <a href={`mailto:${email}`} className={footLink}>
                  {email}
                </a>
              </li>
            ) : null}
            {address ? (
              <li className="flex items-start gap-2">
                <PinIcon className="mt-0.5 size-4 shrink-0 text-haldi" />
                <span className="whitespace-pre-line">{address}</span>
              </li>
            ) : null}
          </ul>
        </div>
        {top.length ? (
          <FooterColumn title="Shop">
            {top.map((c) => (
              <li key={c.slug}>
                <Link href={`/category/${c.slug}`} className={footLink}>
                  {c.name}
                </Link>
              </li>
            ))}
          </FooterColumn>
        ) : null}
        <FooterColumn title="Your orders">
          <li>
            <Link href="/track" className={footLink}>
              Track an order
            </Link>
          </li>
          <li>
            <Link href="/account" className={footLink}>
              Your account
            </Link>
          </li>
          <li>
            <Link href="/wishlist" className={footLink}>
              Wishlist
            </Link>
          </li>
          <li>
            <Link href="/cart" className={footLink}>
              Cart
            </Link>
          </li>
        </FooterColumn>
        <FooterColumn title="Information">
          <li>
            <Link href="/returns" className={footLink}>
              Returns and refunds
            </Link>
          </li>
          <li>
            <Link href="/privacy" className={footLink}>
              Privacy policy
            </Link>
          </li>
          <li>
            <Link href="/terms" className={footLink}>
              Terms and conditions
            </Link>
          </li>
          <li className={footLink}>
            <CookieSettingsLink />
          </li>
        </FooterColumn>
      </div>
      <div className="border-t border-white/10">
        <p className="mx-auto max-w-6xl px-4 py-5 text-[13px] text-white/60">
          © {new Date().getUTCFullYear()} {name}. Prices in Bangladeshi Taka.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h2 className="font-display text-lg text-white">{title}</h2>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}
