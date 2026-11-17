import type { Metadata } from 'next';
import Link from 'next/link';
import { apiServerList } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { formatTaka } from '@/lib/money';
import { STATUS_LABEL, type OrderListItem } from '@/lib/order-types';

export const metadata: Metadata = { title: 'My orders', robots: { index: false } };

const PAGE_SIZE = 10;

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const page = Math.max(1, Math.min(1000, Number((await searchParams).page) || 1));
  const { items, meta } = await apiServerList<OrderListItem>(
    `/me/orders?page=${page}&pageSize=${PAGE_SIZE}`,
  );
  const pages = Math.max(1, Math.ceil(meta.total / PAGE_SIZE));

  if (!items.length && page === 1) {
    return (
      <div className="rounded-lg border border-neutral-200 p-8 text-center text-sm">
        <p className="text-neutral-600">You have no orders yet.</p>
        <p className="mt-2 text-neutral-500">
          Ordered as a guest? Orders with your verified email appear here automatically.
        </p>
        <Link href="/" className="mt-4 inline-block font-medium underline">
          Start shopping
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y divide-neutral-100 rounded-lg border border-neutral-200">
        {items.map((o) => (
          <li key={o.orderNumber}>
            <Link
              href={`/account/orders/${o.orderNumber}`}
              className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 hover:bg-neutral-50"
            >
              <span className="font-medium">{o.orderNumber}</span>
              <span className="text-sm text-neutral-500">{formatDhaka(o.placedAt)}</span>
              <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium">
                {STATUS_LABEL[o.status]}
              </span>
              <span className="ml-auto text-sm">
                {o.itemCount} item{o.itemCount === 1 ? '' : 's'} ·{' '}
                <strong>{formatTaka(o.grandTotal)}</strong>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {pages > 1 ? (
        <nav className="flex justify-between text-sm" aria-label="Pages">
          {page > 1 ? (
            <Link href={`/account/orders?page=${page - 1}`} className="underline">
              Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">
            Page {page} of {pages}
          </span>
          {page < pages ? (
            <Link href={`/account/orders?page=${page + 1}`} className="underline">
              Older
            </Link>
          ) : (
            <span />
          )}
        </nav>
      ) : null}
    </div>
  );
}
