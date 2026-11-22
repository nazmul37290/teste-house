import { PolicyPage, policyMetadata } from '@/components/shop/policy-page';

export const generateMetadata = () => policyMetadata('terms');

export default function TermsPage() {
  return <PolicyPage slug="terms" />;
}
