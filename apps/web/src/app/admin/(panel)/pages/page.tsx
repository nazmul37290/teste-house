import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { apiServer, type LegalPage } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';

export const metadata: Metadata = { title: 'Policy pages' };

export default async function PolicyPagesAdmin() {
  if (!(await adminForPage('settings.manage'))) return <NoAccess />;
  const pages = await apiServer<LegalPage[]>('/admin/pages');
  return (
    <>
      <PageHeader
        title="Policy pages"
        description="The privacy policy, terms and return policy linked in the shop footer. Until a page is written, the shop says it is being prepared and keeps it out of search results."
      />
      <ul className="grid max-w-4xl gap-4 md:grid-cols-3">
        {pages.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/admin/pages/${p.slug}`}
              className="flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-5 transition-colors hover:border-petrol"
            >
              <span className="font-semibold text-ink">{p.title}</span>
              <span>
                {p.body ? (
                  <Badge tone="green">Published</Badge>
                ) : (
                  <Badge tone="amber">Not written</Badge>
                )}
              </span>
              <span className="mt-auto text-sm text-ink-muted">
                {p.updatedAt ? `Last saved ${formatDhaka(p.updatedAt)}` : `Shown at ${p.path}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
