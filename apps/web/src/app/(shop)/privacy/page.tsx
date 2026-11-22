import { PolicyPage, policyMetadata } from '@/components/shop/policy-page';

export const generateMetadata = () => policyMetadata('privacy');

export default function PrivacyPage() {
  return <PolicyPage slug="privacy" />;
}
