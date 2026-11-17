import { REVIEW_STATUSES } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { apiServerList } from '@/lib/api-server';
import { ReviewModeration, type AdminReview } from './review-moderation';

export const metadata: Metadata = { title: 'Reviews' };

type Search = { status?: string; q?: string; page?: string };

export default async function ReviewsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await adminForPage('reviews.moderate'))) return <NoAccess />;
  const sp = await searchParams;
  const current = Math.max(1, Number(sp.page) || 1);
  // Pending first: that is the work queue.
  const status = sp.status ?? 'PENDING';
  const filters = Object.fromEntries(
    Object.entries({ status: status === 'ALL' ? '' : status, q: (sp.q ?? '').trim() }).filter(
      ([, v]) => v,
    ),
  );
  const { items, meta } = await apiServerList<AdminReview>(
    `/admin/reviews?${new URLSearchParams({ page: String(current), pageSize: '20', ...filters })}`,
  );
  const link = (p: number) =>
    `/admin/reviews?${new URLSearchParams({ page: String(p), status, ...(filters.q ? { q: filters.q } : {}) })}`;

  return (
    <>
      <PageHeader
        title="Reviews"
        description="Only approved reviews are shown in the shop and count towards a product's rating. The auto-approve switch is in Settings."
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/reviews">
          <Select name="status" defaultValue={status} aria-label="Status" className="max-w-[12rem]">
            {REVIEW_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
              </option>
            ))}
            <option value="ALL">all</option>
          </Select>
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Product, customer or text"
            aria-label="Search"
            className="max-w-xs"
          />
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No reviews here.</p>
        ) : (
          <ul className="space-y-4">
            {items.map((r) => (
              <ReviewModeration key={r.id} review={r} />
            ))}
          </ul>
        )}
        <div className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={link(current - 1)} className="underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} reviews</span>
          {meta.page * meta.pageSize < meta.total ? (
            <Link href={link(current + 1)} className="underline">
              Older →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>
    </>
  );
}
