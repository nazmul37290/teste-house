import type { ReactNode } from 'react';
import { ShopFooter, ShopHeader } from '@/components/shop/shop-chrome';

/** Storefront pages: header, content, footer. Auth pages and /admin have their own layouts. */
export default function ShopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <ShopHeader />
      <main className="mx-auto w-full max-w-shop flex-1 px-4 py-6 sm:py-8">{children}</main>
      <ShopFooter />
    </div>
  );
}
