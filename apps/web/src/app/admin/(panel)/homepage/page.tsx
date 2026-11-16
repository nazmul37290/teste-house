import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { Alert, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Category, HomepageSection } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { SectionsManager } from './sections-manager';

export const metadata: Metadata = { title: 'Homepage' };

export default async function HomepageSectionsPage() {
  if (!(await adminForPage('marketing.manage'))) return <NoAccess />;
  const [sections, categories] = await Promise.all([
    apiServer<HomepageSection[]>('/admin/homepage-sections'),
    apiServer<Category[]>('/admin/categories'),
  ]);
  return (
    <>
      <PageHeader
        title="Homepage"
        description="The blocks below the top banners, in order. Empty sections are hidden automatically."
      />
      {sections.length === 0 ? (
        <div className="mb-6 max-w-3xl">
          <Alert tone="info">
            No sections yet, so the shop shows the defaults: Featured, Shop by category, New
            arrivals and Best sellers. Add a section to take control.
          </Alert>
        </div>
      ) : null}
      <SectionsManager sections={sections} categories={categories} />
    </>
  );
}
