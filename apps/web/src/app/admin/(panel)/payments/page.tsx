import { PAYMENT_ATTEMPT_STATUSES } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, Button, Card, Input, PageHeader, Select } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { apiServerList } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { formatTaka } from '@/lib/money';

export const metadata: Metadata = { title: 'Payments' };

type PaymentRow = {
  id: string;
  amount: string;
  refunded: string;
  status: string;
  gatewayInvoiceId: string | null;
  gatewayTxnId: string | null;
  failureReason: string | null;
  paidAt: string | null;
  createdAt: string;
  method: { code: string; name: string };
  order: { id: string; orderNumber: string; status: string; contactName: string };
};

const TONE: Record<string, 'green' | 'amber' | 'neutral'> = {
  SUCCESS: 'green',
  PENDING: 'amber',
  INITIATED: 'amber',
  FAILED: 'neutral',
  CANCELLED: 'neutral',
};

type Search = { q?: string; status?: string; from?: string; to?: string; page?: string };

/** Every online payment attempt (PAY-5): what the gateway said, linked to its order. */
export default async function PaymentsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await adminForPage('orders.view'))) return <NoAccess />;
  const sp = await searchParams;
  const current = Math.max(1, Number(sp.page) || 1);
  const filters = Object.fromEntries(
    (['q', 'status', 'from', 'to'] as const)
      .map((k) => [k, (sp[k] ?? '').trim()])
      .filter(([, v]) => v),
  ) as Record<string, string>;
  const { items, meta } = await apiServerList<PaymentRow>(
    `/admin/payments?${new URLSearchParams({ page: String(current), pageSize: '25', ...filters })}`,
  );
  const link = (p: number) =>
    `/admin/payments?${new URLSearchParams({ page: String(p), ...filters })}`;

  return (
    <>
      <PageHeader
        title="Payments"
        description="Online payment attempts as verified with the gateway. Refunds are recorded on the order page."
      />
      <Card>
        <form className="mb-4 flex flex-wrap gap-2" action="/admin/payments">
          <Input
            name="q"
            defaultValue={filters.q}
            placeholder="Order number or transaction id"
            aria-label="Search payments"
            className="max-w-xs"
          />
          <Select
            name="status"
            defaultValue={filters.status ?? ''}
            aria-label="Status"
            className="max-w-[10rem]"
          >
            <option value="">All statuses</option>
            {PAYMENT_ATTEMPT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.toLowerCase()}
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
                <th className="py-2 pr-3">Started</th>
                <th className="py-2 pr-3">Order</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Gateway reference</th>
                <th className="py-2 pr-3 text-right">Amount</th>
                <th className="py-2 text-right">Refunded</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {items.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-3 whitespace-nowrap">{formatDhaka(p.createdAt)}</td>
                  <td className="py-2 pr-3">
                    <Link href={`/admin/orders/${p.order.id}`} className="font-medium underline">
                      {p.order.orderNumber}
                    </Link>
                    <span className="block text-xs text-neutral-500">{p.order.contactName}</span>
                  </td>
                  <td className="py-2 pr-3">
                    <Badge tone={TONE[p.status] ?? 'neutral'}>{p.status.toLowerCase()}</Badge>
                    {p.failureReason ? (
                      <span className="block max-w-xs text-xs text-neutral-500">
                        {p.failureReason}
                      </span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">
                    {p.gatewayTxnId ?? '—'}
                    {p.gatewayInvoiceId ? (
                      <span className="block text-neutral-500">inv {p.gatewayInvoiceId}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3 text-right">{formatTaka(p.amount)}</td>
                  <td className="py-2 text-right">
                    {p.refunded === '0.00' ? '—' : formatTaka(p.refunded)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length === 0 ? (
            <p className="py-6 text-center text-sm text-neutral-500">No payments match.</p>
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
          <span className="text-neutral-500">{meta.total} payments</span>
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
