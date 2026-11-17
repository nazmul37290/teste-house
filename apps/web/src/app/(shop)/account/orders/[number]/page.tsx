import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ItemRows, Totals } from '@/components/shop/order-summary';
import { ShipmentTimeline } from '@/components/shop/shipment-timeline';
import { ApiError } from '@/lib/api-types';
import { apiServer } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { STATUS_LABEL, type OrderView } from '@/lib/order-types';
import { OrderActions } from './order-actions';

export const metadata: Metadata = { title: 'Order details', robots: { index: false } };

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const number = (await params).number.toUpperCase();
  let order: OrderView & { canCancel: boolean };
  try {
    order = await apiServer(`/me/orders/${encodeURIComponent(number)}`);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 400)) notFound();
    throw err;
  }
  const a = order.address;

  return (
    <div className="space-y-6">
      <Link href="/account/orders" className="text-sm underline">
        ← All orders
      </Link>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-xl font-semibold">Order {order.orderNumber}</h2>
        <span className="rounded-full bg-neutral-100 px-3 py-1 text-sm font-medium">
          {STATUS_LABEL[order.status]}
        </span>
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_18rem]">
        <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
          <ItemRows items={order.items} />
          <Totals {...order} />
          <p className="text-sm text-neutral-600">
            {order.paymentMethod.name} · placed {formatDhaka(order.placedAt)}
          </p>
        </section>
        <div className="space-y-4">
          <section className="rounded-lg border border-neutral-200 p-4 text-sm">
            <h3 className="mb-2 font-semibold">Progress</h3>
            <ol className="space-y-1 border-l-2 border-neutral-200 pl-4">
              {order.timeline.map((t, i) => (
                <li key={i}>
                  <span className="font-medium">{STATUS_LABEL[t.status]}</span>
                  <span className="block text-xs text-neutral-500">{formatDhaka(t.at)}</span>
                </li>
              ))}
            </ol>
          </section>
          {order.shipments?.length ? (
            <section className="rounded-lg border border-neutral-200 p-4">
              <h3 className="mb-2 font-semibold">Delivery</h3>
              <ShipmentTimeline shipments={order.shipments} />
            </section>
          ) : null}
          {a ? (
            <section className="rounded-lg border border-neutral-200 p-4 text-sm">
              <h3 className="mb-2 font-semibold">Delivery address</h3>
              <p>
                {a.recipientName}, {a.phone}
                <br />
                {a.addressLine}
                <br />
                {[a.upazila, a.district, a.division].filter(Boolean).join(', ')}
              </p>
            </section>
          ) : null}
          <OrderActions orderNumber={order.orderNumber} canCancel={order.canCancel} />
        </div>
      </div>
    </div>
  );
}
