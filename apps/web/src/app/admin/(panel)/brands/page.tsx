import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Brand, Tag } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { BrandsManager } from './brands-manager';
import { TagsManager } from './tags-manager';

export const metadata: Metadata = { title: 'Brands and tags' };

export default async function BrandsPage() {
  if (!(await adminForPage('brands.manage'))) return <NoAccess />;
  const [brands, tags] = await Promise.all([
    apiServer<Brand[]>('/admin/brands'),
    apiServer<Tag[]>('/admin/tags'),
  ]);
  return (
    <>
      <PageHeader
        title="Brands and tags"
        description="Brands appear on products; tags are free labels such as Organic or Halal."
      />
      <div className="space-y-8">
        <BrandsManager brands={brands} />
        <TagsManager tags={tags} />
      </div>
    </>
  );
}
