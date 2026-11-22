import type { Metadata } from 'next';
import { WishlistView } from './wishlist-view';

export const metadata: Metadata = { title: 'Wishlist', robots: { index: false, follow: false } };

export default function WishlistPage() {
  return (
    <div className="py-2">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Wishlist</h1>
      <WishlistView />
    </div>
  );
}
