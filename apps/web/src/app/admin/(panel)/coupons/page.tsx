import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Coupon } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { CouponsManager } from './coupons-manager';

export const metadata: Metadata = { title: 'Coupons' };

export default async function CouponsPage() {
  if (!(await adminForPage('coupons.manage'))) return <NoAccess />;
  const coupons = await apiServer<Coupon[]>('/admin/coupons');
  return (
    <>
      <PageHeader
        title="Coupons"
        description="One coupon per order. Discounts apply to products only, never to delivery. A used coupon cannot be deleted; turn it off instead."
      />
      <CouponsManager coupons={coupons} />
    </>
  );
}
