import type { Metadata } from 'next';
import { PlaceholderPage } from '@/components/shop/placeholder-page';

export const metadata: Metadata = {
  title: 'Privacy policy',
  robots: { index: false, follow: true },
};

export default function PrivacyPage() {
  return <PlaceholderPage title="Privacy policy" />;
}
