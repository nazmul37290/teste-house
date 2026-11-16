import type { Metadata } from 'next';
import { CartPageView } from './cart-page-view';

export const metadata: Metadata = { title: 'Your cart', robots: { index: false, follow: false } };

export default function CartPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Your cart</h1>
      <CartPageView />
    </div>
  );
}
