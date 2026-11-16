import Link from 'next/link';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { getCategories } from '@/lib/storefront';
import { CartButton } from './cart-button';
import { SearchBox } from './search-box';

/** Store header. Static (no session lookup) so pages stay cacheable; /account handles sign-in. */
export async function ShopHeader() {
  const [settings, name, categories] = await Promise.all([
    getPublicSettings(),
    storeName(),
    getCategories().catch(() => []),
  ]);
  const logo = settings['store.logo'];
  // Only categories with something to buy (an empty one would be a dead end).
  const top = categories.filter((c) => c.depth === 1 && c.productCount > 0);
  return (
    <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
        <Link
          href="/"
          className="shrink-0 text-lg font-bold text-neutral-900"
          aria-label={`${name} home`}
        >
          {/* The logo is an admin-set absolute URL (settings); plain img keeps it outside the image loader. */}
          {logo ? <img src={logo} alt={name} className="h-9 w-auto" /> : name}
        </Link>
        <div className="min-w-0 flex-1">
          <SearchBox />
        </div>
        <Link
          href="/account"
          className="shrink-0 text-sm font-medium text-neutral-700 hover:text-neutral-900"
        >
          Account
        </Link>
        <CartButton />
      </div>
      {top.length ? (
        <nav aria-label="Categories" className="mx-auto max-w-6xl overflow-x-auto px-4">
          <ul className="flex gap-5 whitespace-nowrap pb-2 text-sm text-neutral-700">
            {top.map((c) => (
              <li key={c.slug}>
                <Link
                  href={`/category/${c.slug}`}
                  className="hover:text-neutral-900 hover:underline"
                >
                  {c.name}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
    </header>
  );
}

export async function ShopFooter() {
  const [settings, name] = await Promise.all([getPublicSettings(), storeName()]);
  const phone = settings['store.phone'];
  const email = settings['store.email'];
  const address = settings['store.address'];
  return (
    <footer className="mt-16 border-t border-neutral-200 bg-neutral-50">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-neutral-600 sm:grid-cols-3">
        <div>
          <p className="font-semibold text-neutral-900">{name}</p>
          {address ? <p className="mt-2 whitespace-pre-line">{address}</p> : null}
        </div>
        <div>
          <p className="font-semibold text-neutral-900">Contact</p>
          <ul className="mt-2 space-y-1">
            {phone ? (
              <li>
                <a href={`tel:${phone}`} className="hover:underline">
                  {phone}
                </a>
              </li>
            ) : null}
            {email ? (
              <li>
                <a href={`mailto:${email}`} className="hover:underline">
                  {email}
                </a>
              </li>
            ) : null}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-neutral-900">Information</p>
          <ul className="mt-2 space-y-1">
            <li>
              <Link href="/returns" className="hover:underline">
                Returns and refunds
              </Link>
            </li>
            <li>
              <Link href="/privacy" className="hover:underline">
                Privacy policy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="hover:underline">
                Terms and conditions
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <p className="pb-6 text-center text-xs text-neutral-400">
        © {new Date().getUTCFullYear()} {name}. Prices in Bangladeshi Taka.
      </p>
    </footer>
  );
}
