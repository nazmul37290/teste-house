import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, Card, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Movement } from '@/lib/admin-types';
import { apiServerList } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';

export const metadata: Metadata = { title: 'Stock movements' };

const PAGE_SIZE = 50;
const LABEL: Record<Movement['type'], string> = {
  PURCHASE: 'Received',
  SALE: 'Sold',
  CANCEL_RELEASE: 'Order cancelled',
  RETURN: 'Returned',
  ADJUSTMENT: 'Adjusted',
};

export default async function MovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ variantId?: string; page?: string }>;
}) {
  if (!(await adminForPage('inventory.view'))) return <NoAccess />;
  const { variantId = '', page = '1' } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const filters: Record<string, string> = variantId ? { variantId } : {};
  const query = new URLSearchParams({
    page: String(current),
    pageSize: String(PAGE_SIZE),
    ...filters,
  });
  const { items, meta } = await apiServerList<Movement>(`/admin/inventory/movements?${query}`);
  const link = (p: number) =>
    `/admin/inventory/movements?${new URLSearchParams({ page: String(p), ...filters })}`;
  const subject =
    variantId && items[0]
      ? `${items[0].variant.product.name} — ${items[0].variant.name} (${items[0].variant.sku})`
      : null;

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/inventory" className="text-neutral-600 underline">
          ← Inventory
        </Link>
      </p>
      <PageHeader
        title="Stock movements"
        description={subject ?? 'Every stock change, newest first. Times in Asia/Dhaka.'}
        actions={
          variantId ? (
            <Link href="/admin/inventory/movements" className="text-sm underline">
              All variants
            </Link>
          ) : null
        }
      />
      <Card>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-neutral-500">
            <tr>
              <th className="pb-2">When</th>
              {variantId ? null : <th className="pb-2">Variant</th>}
              <th className="pb-2">Change</th>
              <th className="pb-2">Stock after</th>
              <th className="pb-2">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {items.map((m) => (
              <tr key={m.id}>
                <td className="py-2 whitespace-nowrap text-neutral-600">
                  {formatDhaka(m.createdAt)}
                </td>
                {variantId ? null : (
                  <td className="py-2">
                    <Link
                      href={`/admin/inventory/movements?variantId=${m.variant.id}`}
                      className="hover:underline"
                    >
                      {m.variant.product.name}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {m.variant.name} · {m.variant.sku}
                    </p>
                  </td>
                )}
                <td className="py-2">
                  <span
                    className={
                      m.quantity > 0 ? 'font-medium text-success' : 'font-medium text-danger'
                    }
                  >
                    {m.quantity > 0 ? `+${m.quantity}` : m.quantity}
                  </span>{' '}
                  <Badge>{LABEL[m.type]}</Badge>
                </td>
                <td className="py-2">{m.balanceAfter}</td>
                <td className="py-2 text-xs text-neutral-600">
                  {[
                    m.reason,
                    m.batch ? `batch ${m.batch.batchNo}` : null,
                    m.order ? `order ${m.order.orderNumber}` : null,
                    m.adminUser ? `by ${m.adminUser.name}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
            {items.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-neutral-500">
                  No movements yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={link(current - 1)} className="underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} movements</span>
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
