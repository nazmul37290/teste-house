import { legalPageSlugSchema } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { apiServer, type LegalPage } from '@/lib/api-server';
import { PageEditor } from './page-editor';

export const metadata: Metadata = { title: 'Edit policy page' };

export default async function EditPolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const parsed = legalPageSlugSchema.safeParse((await params).slug);
  if (!parsed.success) notFound();
  if (!(await adminForPage('settings.manage'))) return <NoAccess />;
  const page = await apiServer<LegalPage>(`/admin/pages/${parsed.data}`);
  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/pages" className="font-semibold text-petrol hover:underline">
          Policy pages
        </Link>
      </p>
      <PageHeader
        title={page.title}
        description={`Shown at ${page.path} and linked in the shop footer.`}
      />
      <PageEditor page={page} />
    </>
  );
}
