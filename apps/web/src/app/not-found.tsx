import Link from 'next/link';
import { SearchBox } from '@/components/shop/search-box';
import { buttonClass } from '@/components/ui';

/** 404 for any path (outside the shop layout): say what happened and offer the next step. */
export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-rice px-4 py-16">
      <div className="w-full max-w-lg text-center">
        <p className="font-display text-6xl text-petrol/25">404</p>
        <h1 className="mt-2 font-display text-[32px] leading-tight text-petrol">
          This page is not on our shelves
        </h1>
        <p className="mt-3 text-ink-muted">
          The link may be old, or the product may have moved. Search for it, or go back to the shop.
        </p>
        <div className="mt-8 text-left">
          <SearchBox />
        </div>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link href="/" className={buttonClass('primary', 'lg')}>
            Go to the shop
          </Link>
          <Link href="/track" className={buttonClass('secondary', 'lg')}>
            Track an order
          </Link>
        </div>
      </div>
    </main>
  );
}
