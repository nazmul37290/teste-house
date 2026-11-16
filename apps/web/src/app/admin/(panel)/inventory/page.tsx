import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Button, Card, Input, PageHeader } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import type { StockRow } from '@/lib/admin-types';
import { apiServerList } from '@/lib/api-server';
import { StockTable } from './stock-table';

export const metadata: Metadata = { title: 'Inventory' };

const PAGE_SIZE = 25;

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; lowStock?: string; page?: string }>;
}) {
  const admin = await adminForPage('inventory.view');
  if (!admin) return <NoAccess />;
  const { q = '', lowStock = '', page = '1' } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const filters = { ...(q ? { q } : {}), ...(lowStock === 'true' ? { lowStock: 'true' } : {}) };
  const query = new URLSearchParams({
    page: String(current),
    pageSize: String(PAGE_SIZE),
    ...filters,
  });
  const { items, meta } = await apiServerList<StockRow>(`/admin/inventory?${query}`);
  const link = (p: number) =>
    `/admin/inventory?${new URLSearchParams({ page: String(p), ...filters })}`;

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Stock per variant, lowest first. Every change is recorded in the movement log."
        actions={
          <Link href="/admin/inventory/movements" className="text-sm underline">
            Movement log
          </Link>
        }
      />
      <Card>
        <form className="mb-4 flex flex-wrap items-center gap-3" action="/admin/inventory">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Product, variant or SKU"
            aria-label="Search stock"
            className="max-w-xs"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="lowStock"
              value="true"
              defaultChecked={lowStock === 'true'}
            />{' '}
            Low stock only
          </label>
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>
        <StockTable items={items} canAdjust={can(admin, 'inventory.adjust')} />
        <div className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={link(current - 1)} className="underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} variants</span>
          {meta.page * meta.pageSize < meta.total ? (
            <Link href={link(current + 1)} className="underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>
    </>
  );
}
