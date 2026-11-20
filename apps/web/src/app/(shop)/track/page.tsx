import type { Metadata } from 'next';
import { TrackForm } from './track-form';

export const metadata: Metadata = {
  title: 'Track your order',
  robots: { index: false, follow: true },
};

export default async function TrackPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Track your order</h1>
      <p className="mt-1 text-sm text-neutral-600">
        Enter your order number and the mobile number you ordered with.
      </p>
      <TrackForm initialOrder={typeof order === 'string' ? order.slice(0, 20) : ''} />
    </div>
  );
}
