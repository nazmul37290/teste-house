import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { MediaItem } from '@/lib/admin-types';
import { apiServerList } from '@/lib/api-server';
import { MediaLibrary } from './media-library';

export const metadata: Metadata = { title: 'Media' };

const PAGE_SIZE = 24;

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  if (!(await adminForPage('media.upload'))) return <NoAccess />;
  const { q = '', page = '1' } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const query = new URLSearchParams({
    page: String(current),
    pageSize: String(PAGE_SIZE),
    ...(q ? { q } : {}),
  });
  const { items, meta } = await apiServerList<MediaItem>(`/admin/media?${query}`);

  return (
    <>
      <PageHeader
        title="Media"
        description="Images for products, categories, brands and banners. Every image needs alt text."
      />
      <MediaLibrary items={items} meta={meta} q={q} />
    </>
  );
}
