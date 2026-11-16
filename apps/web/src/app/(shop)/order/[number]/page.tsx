import type { Metadata } from 'next';
import { OrderConfirmation } from './order-confirmation';

export const metadata: Metadata = {
  title: 'Order received',
  robots: { index: false, follow: false },
};

export default async function OrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <OrderConfirmation orderNumber={number.toUpperCase()} />
    </div>
  );
}
