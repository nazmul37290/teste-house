import { ORDER_STATUSES, PAYMENT_STATUSES } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import { apiServer } from '@/lib/api-server';
import { BulkCourierForm } from './bulk-courier-form';
import type { AdminOrderListItem } from '@/lib/admin-types';
import { apiServerList } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { formatTaka } from '@/lib/money';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/order-types';

export const metadata: Metadata = { title: 'Orders' };

const PAGE_SIZE = 25;
type Search = {
  q?: string;
  status?: string;
  paymentStatus?: string;
  from?: string;
  to?: string;
  page?: string;
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const admin = await adminForPage('orders.view');
  if (!admin) return <NoAccess />;
  const canBook = can(admin, 'orders.book_courier');
  const sp = await searchParams;
  const current = Math.max(1, Number(sp.page) || 1);
  const filters = Object.fromEntries(
    (['q', 'status', 'paymentStatus', 'from', 'to'] as const)
      .map((k) => [k, (sp[k] ?? '').trim()])
      .filter(([, v]) => v),
  ) as Record<string, string>;
  const { items, meta } = await apiServerList<AdminOrderListItem>(
    `/admin/orders?${new URLSearchParams({ page: String(current), pageSize: String(PAGE_SIZE), ...filters })}`,
  );
  const balance = canBook
    ? await apiServer<{ configured: true; balance: string } | { configured: false }>(
        '/admin/courier/balance',
      ).catch(() => null)
    : null;
  const link = (p: number) =>
    `/admin/orders?${new URLSearchParams({ page: String(p), ...filters })}`;

  return (
    <>
      <PageHeader
        title="Orders"
        description="Dates are Dhaka time."
        actions={
          canBook ? (
            <span className="text-sm text-neutral-600">
              {balance?.configured
                ? `Courier balance: ${formatTaka(balance.balance)}`
                : 'Courier not connected yet'}
            </span>
          ) : null
        }
      />
      {canBook ? <BulkCourierForm /> : null}
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/orders">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Order number, phone or name"
            aria-label="Search orders"
            className="max-w-xs"
          />
          <Select
            name="status"
            defaultValue={filters.status ?? ''}
            aria-label="Status"
            className="max-w-[12rem]"
          >
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </Select>
          <Select
            name="paymentStatus"
            defaultValue={filters.paymentStatus ?? ''}
            aria-label="Payment"
            className="max-w-[10rem]"
          >
            <option value="">Any payment</option>
            {PAYMENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase().replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
          <Input
            name="from"
            type="date"
            defaultValue={filters.from}
            aria-label="From"
            className="max-w-[10rem]"
          />
          <Input
            name="to"
            type="date"
            defaultValue={filters.to}
            aria-label="To"
            className="max-w-[10rem]"
          />
          <Button type="submit" variant="secondary">
            Filter
          </Button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-xs text-neutral-500 uppercase">
              <tr>
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Placed</th>
                <th className="py-2 pr-3">Customer</th>
                <th className="py-2 pr-3">District</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Payment</th>
                <th className="py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((o) => (
                <tr key={o.id} className="hover:bg-neutral-50">
                  <td className="py-2 pr-3">
                    {canBook && o.status === 'PROCESSING' ? (
                      <input
                        type="checkbox"
                        name="orderIds"
                        value={o.id}
                        form="bulk-courier"
                        aria-label={`Select ${o.orderNumber} for the courier`}
                        className="mr-2"
                      />
                    ) : null}
                    <Link href={`/admin/orders/${o.id}`} className="font-medium underline">
                      {o.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDhaka(o.placedAt)}</td>
                  <td className="py-2 pr-3">
                    {o.contactName}
                    <span className="block text-xs text-neutral-500">
                      {o.contactPhone}
                      {o.customerId ? ' · account' : ' · guest'}
                    </span>
                  </td>
                  <td className="py-2 pr-3">{o.district ?? '—'}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>
                      {STATUS_LABEL[o.status]}
                    </Badge>
                  </td>
                  <td className="py-2 pr-3 text-xs">
                    {o.paymentMethod.code} · {o.paymentStatus.toLowerCase().replace(/_/g, ' ')}
                  </td>
                  <td className="py-2 text-right font-medium">{formatTaka(o.grandTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">No orders match.</p>
          ) : null}
        </div>
        <div className="mt-4 flex items-center justify-between text-sm">
          {current > 1 ? (
            <Link href={link(current - 1)} className="underline">
              ← Newer
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} orders</span>
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
