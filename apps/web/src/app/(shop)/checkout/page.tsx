import type { Metadata } from 'next';
import { CheckoutForm } from './checkout-form';

export const metadata: Metadata = { title: 'Checkout', robots: { index: false, follow: false } };

export default function CheckoutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Checkout</h1>
      <CheckoutForm />
    </div>
  );
}
