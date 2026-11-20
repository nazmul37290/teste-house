import type { Metadata } from 'next';
import { CartPageView } from './cart-page-view';

export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Your cart</h1>
      <CartPageView />
    </div>
  );
}
