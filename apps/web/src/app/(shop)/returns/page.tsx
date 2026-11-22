import { PolicyPage, policyMetadata } from '@/components/shop/policy-page';

export const generateMetadata = () => policyMetadata('returns');

export default function ReturnsPage() {
  return <PolicyPage slug="returns" />;
}
