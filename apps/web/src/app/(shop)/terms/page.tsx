import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shop/placeholder-page';

export const metadata: Metadata = {
  title: 'Terms and conditions',
  robots: { index: false, follow: true },
};

export default function TermsPage() {
  return <PlaceholderPage title="Terms and conditions" />;
}
