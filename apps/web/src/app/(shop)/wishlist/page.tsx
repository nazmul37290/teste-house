import type { Metadata } from 'next';
import { WishlistView } from './wishlist-view';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false, follow: false } };

export default function WishlistPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Wishlist</h1>
      <WishlistView />
    </div>
  );
}
