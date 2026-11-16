import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { DeliveryZone } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { ZonesManager } from './zones-manager';

export const metadata: Metadata = { title: 'Delivery zones' };

export default async function ShippingPage() {
  if (!(await adminForPage('shipping.manage'))) return <NoAccess />;
  const zones = await apiServer<DeliveryZone[]>('/admin/delivery-zones');
  return (
    <>
      <PageHeader
        title="Delivery zones"
        description="The customer's district picks the zone and its delivery charge. The default zone covers every district no other zone lists. Turn a zone off to stop delivering there."
      />
      <ZonesManager zones={zones} />
    </>
  );
}
