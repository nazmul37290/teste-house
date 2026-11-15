import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Category } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { CategoriesManager } from './categories-manager';

export const metadata: Metadata = { title: 'Categories' };

export default async function CategoriesPage() {
  if (!(await adminForPage('categories.manage'))) return <NoAccess />;
  const categories = await apiServer<Category[]>('/admin/categories');
  return (
    <>
      <PageHeader
        title="Categories"
        description="Up to 4 levels deep. Changing a slug keeps old links working (automatic redirect)."
      />
      <CategoriesManager categories={categories} />
    </>
  );
}
