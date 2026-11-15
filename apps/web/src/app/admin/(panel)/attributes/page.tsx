import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Attribute } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { AttributesManager } from './attributes-manager';

export const metadata: Metadata = { title: 'Attributes' };

export default async function AttributesPage() {
  if (!(await adminForPage('categories.manage'))) return <NoAccess />;
  const attributes = await apiServer<Attribute[]>('/admin/attributes');
  return (
    <>
      <PageHeader
        title="Attributes"
        description="Options that tell variants apart, such as Flavor (Plain, Chocolate) or Type (Regular, Organic)."
      />
      <AttributesManager attributes={attributes} />
    </>
  );
}
