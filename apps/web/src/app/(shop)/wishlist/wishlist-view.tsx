'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProductCard } from '@/components/shop/product-card';
import { api } from '@/lib/api-client';
import type { ProductCard as Card } from '@/lib/storefront-types';
import { useWishlist } from '@/lib/wishlist-client';

/** Saved products: from the account when signed in, else from this browser. */
export function WishlistView() {
  const { ids, signedIn, ready } = useWishlist();
  const [cards, setCards] = useState<Card[] | null>(null);
  const key = ids.join(',');

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    const load = signedIn
      ? api<Card[]>('/me/wishlist')
      : key
        ? api<Card[]>(`/products/cards?ids=${encodeURIComponent(key)}`)
        : Promise.resolve([]);
    void load.then((c) => alive && setCards(c)).catch(() => alive && setCards([]));
    return () => {
      alive = false;
    };
  }, [ready, signedIn, key]);

  if (!cards) return <p className="mt-6 text-sm text-neutral-500">Loading…</p>;
  if (!cards.length) {
    return (
      <div className="mt-6 rounded-card border border-line p-8 text-center text-sm">
        <p className="text-neutral-600">
          Nothing saved yet. Tap the heart on a product to save it here.
        </p>
        <Link href="/" className="mt-4 inline-block font-medium underline">
          Start shopping
        </Link>
      </div>
    );
  }
  return (
    <>
      {!signedIn ? (
        <p className="mt-2 text-sm text-neutral-600">
          Saved in this browser.{' '}
          <Link href="/login?next=/wishlist" className="underline">
            Sign in
          </Link>{' '}
          to keep it in your account.
        </p>
      ) : null}
      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6">
        {cards.map((c) => (
          <ProductCard key={c.id} product={c} />
        ))}
      </div>
    </>
  );
}
