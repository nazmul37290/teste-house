import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Banner } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { BannersManager } from './banners-manager';

export const metadata: Metadata = { title: 'Banners' };

export default async function BannersPage() {
  if (!(await adminForPage('marketing.manage'))) return <NoAccess />;
  const banners = await apiServer<Banner[]>('/admin/banners');
  return (
    <>
      <PageHeader
        title="Banners"
        description="Large images on the home page. “Home hero” is the slider at the top; “Home strip” banners appear in a banner-strip section."
      />
      <BannersManager banners={banners} />
    </>
  );
}
