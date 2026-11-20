import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { Alert, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Category, HomepageSection } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import type { HomeHighlight } from '@shop/shared';
import { factsFrom } from '@/components/shop/home';
import { getStoreFacts } from '@/lib/storefront';
import { HighlightsEditor } from './highlights-editor';
import { SectionsManager } from './sections-manager';

export const metadata: Metadata = { title: 'Homepage' };

export default async function HomepageSectionsPage() {
  if (!(await adminForPage('marketing.manage'))) return <NoAccess />;
  const [sections, categories, highlights, facts] = await Promise.all([
    apiServer<HomepageSection[]>('/admin/homepage-sections'),
    apiServer<Category[]>('/admin/categories'),
    apiServer<HomeHighlight[]>('/admin/homepage/highlights'),
    getStoreFacts(),
  ]);
  return (
    <>
      <PageHeader
        title="Homepage"
        description="The top slider shows the banners placed at “Home hero” (Banners page). Below it: the highlights strip, then the sections in order."
      />
      <div className="mb-8">
        <HighlightsEditor saved={highlights} automatic={factsFrom(facts)} />
      </div>
      <h2 className="mb-3 font-display text-xl text-petrol">Sections</h2>
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
