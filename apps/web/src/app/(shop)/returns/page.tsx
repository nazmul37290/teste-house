import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shop/placeholder-page';

export const metadata: Metadata = {
  title: 'Returns and refunds',
  robots: { index: false, follow: true },
};

export default function ReturnsPage() {
  return <PlaceholderPage title="Returns and refunds" />;
}
