import Link from 'next/link';
import type { ReactNode } from 'react';
import { ShopFooter, ShopHeader } from '@/components/shop/shop-chrome';
import { getPublicSettings } from '@/lib/api-server';

/** Storefront pages: header, content, footer. Auth pages and /admin have their own layouts. */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  // In maintenance only signed-in admins get past proxy.ts, so whoever sees this is an admin.
  const maintenance = (await getPublicSettings())['store.mode'] === 'maintenance';
  return (
    <div className="flex min-h-screen flex-col">
      {maintenance ? (
        <div role="status" className="bg-haldi px-4 py-2 text-center text-sm text-petrol">
          <strong className="font-semibold">Maintenance mode is on.</strong> Shoppers see the
          maintenance page and cannot order; you see the shop because you are signed in as an admin.{' '}
          <Link href="/admin" className="font-semibold underline">
            Switch to live in the admin
          </Link>
        </div>
      ) : null}
      <ShopHeader />
      <main className="mx-auto w-full max-w-shop flex-1 px-4 py-6 sm:py-8">{children}</main>
      <ShopFooter />
    </div>
  );
}
