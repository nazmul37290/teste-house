import type { Metadata } from 'next';
import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-neutral-900">Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
