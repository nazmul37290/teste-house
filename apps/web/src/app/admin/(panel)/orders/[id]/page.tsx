import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { NoAccess } from '@/components/admin/no-access';
import { ItemRows, Totals } from '@/components/shop/order-summary';
import { Badge, Card, PageHeader } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import type { AdminOrder } from '@/lib/admin-types';
import { ApiError } from '@/lib/api-types';
import { apiServer } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/order-types';
import { NotesForm, OrderEditor, StatusActions } from './order-admin-actions';

export const metadata: Metadata = { title: 'Order' };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await adminForPage('orders.view');
  if (!admin) return <NoAccess />;
  const { id } = await params;
  let order: AdminOrder;
  try {
    order = await apiServer<AdminOrder>(`/admin/orders/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const a = order.address;
  const r = order.risk;
  const canStatus = can(admin, 'orders.update_status');
  const canCancel = can(admin, 'orders.cancel');

  return (
    <>
      <PageHeader
        title={`Order ${order.orderNumber}`}
        description={`Placed ${formatDhaka(order.placedAt)}`}
        actions={
          <div className="flex items-center gap-4 text-sm">
            <Link href="/admin/orders" className="underline">
              All orders
            </Link>
            <a
              href={`/api/v1/admin/orders/${order.id}/invoice`}
              target="_blank"
              className="underline"
            >
              Invoice
            </a>
            <a
              href={`/api/v1/admin/orders/${order.id}/packing-slip`}
              target="_blank"
              className="underline"
            >
              Packing slip
            </a>
          </div>
        }
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <div className="min-w-0 space-y-6">
          <Card title="Items">
            <ItemRows items={order.items} />
            <div className="mt-4">
              <Totals {...order} />
            </div>
            <p className="mt-3 text-sm text-neutral-600">
              {order.paymentMethod.name} · payment {order.paymentStatus.toLowerCase()}
              {order.deliveryZone ? ` · zone ${order.deliveryZone.name}` : ''}
            </p>
          </Card>
          {order.editable && can(admin, 'orders.edit') ? (
            <Card title="Edit order">
              <OrderEditor order={order} />
            </Card>
          ) : null}
          <Card title="History">
            <ol className="space-y-2 text-sm">
              {order.history.map((h, i) => (
                <li key={i} className="border-l-2 border-neutral-200 pl-3">
                  <span className="font-medium">
                    {h.from === h.to ? 'Edited' : STATUS_LABEL[h.to as keyof typeof STATUS_LABEL]}
                  </span>{' '}
                  <span className="text-xs text-neutral-500">
                    {formatDhaka(h.at)} · {h.by ?? h.source.toLowerCase()}
                  </span>
                  {h.note ? <span className="block text-neutral-600">{h.note}</span> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Status">
            <p className="mb-4">
              <Badge tone={STATUS_TONE[order.status]}>{STATUS_LABEL[order.status]}</Badge>
              {order.cancelReason ? (
                <span className="mt-1 block text-sm text-neutral-600">
                  Reason: {order.cancelReason}
                </span>
              ) : null}
            </p>
            <StatusActions
              orderId={order.id}
              transitions={order.allowedTransitions.filter((t) =>
                t === 'CANCELLED' ? canCancel : canStatus,
              )}
            />
          </Card>
          <Card title="Customer">
            <p className="text-sm">
              {order.contactName}
              <br />
              {order.contactPhone}
              {order.contactEmail ? (
                <>
                  <br />
                  {order.contactEmail}
                </>
              ) : null}
              <br />
              <span className="text-neutral-500">
                {order.customerId ? 'Has an account' : 'Guest'}
              </span>
            </p>
            {order.customerNote ? (
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-sm">Note: {order.customerNote}</p>
            ) : null}
            <div className="mt-3 rounded-md bg-neutral-50 p-3 text-xs text-neutral-700">
              <p className="font-medium">
                Earlier orders from this phone: {r.otherOrdersSamePhone}
              </p>
              {r.otherOrdersSamePhone ? (
                <p>
                  {r.delivered} delivered · {r.cancelled} cancelled · {r.returnedOrFailed} returned
                  or failed
                  {r.problemRate !== null ? (
                    <span className={r.problemRate >= 50 ? ' font-semibold text-red-700' : ''}>
                      {' '}
                      · {r.problemRate}% not delivered
                    </span>
                  ) : null}
                </p>
              ) : null}
              {r.sameIpLast24h ? (
                <p className="mt-1 font-semibold text-amber-800">
                  {r.sameIpLast24h} other order(s) from the same IP in the last 24 hours
                </p>
              ) : null}
            </div>
          </Card>
          {a ? (
            <Card title="Delivery address">
              <p className="text-sm">
                {a.recipientName}, {a.phone}
                <br />
                {a.addressLine}
                <br />
                {[a.upazila, a.district, a.postalCode].filter(Boolean).join(', ')}
                <br />
                {a.division}
                {a.deliveryNote ? (
                  <span className="mt-1 block text-neutral-600">Note: {a.deliveryNote}</span>
                ) : null}
              </p>
            </Card>
          ) : null}
          <Card title="Internal notes">
            {order.notes.length ? (
              <ul className="mb-4 space-y-2 text-sm">
                {order.notes.map((n) => (
                  <li key={n.id}>
                    <p className="whitespace-pre-line">{n.note}</p>
                    <p className="text-xs text-neutral-500">
                      {n.by ?? 'Staff'} · {formatDhaka(n.at)}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}
            {can(admin, 'orders.add_note') ? <NotesForm orderId={order.id} /> : null}
          </Card>
        </div>
      </div>
    </>
  );
}
