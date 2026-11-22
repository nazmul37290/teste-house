import { formatTaka } from '@shop/shared';
import type { Metadata } from 'next';
import Link from 'next/link';
import { AttentionItem, BarList, Delta, Panel, StatTile } from '@/components/admin/dashboard/parts';
import { SalesChart } from '@/components/admin/dashboard/sales-chart';
import {
  BagIcon,
  CheckIcon,
  CloseIcon,
  HeartIcon,
  RouteIcon,
  TruckIcon,
} from '@/components/shop/icons';
import { Alert, Badge, Card, cx, PageHeader } from '@/components/ui';
import { can } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import { apiServer } from '@/lib/api-server';
import type { Dashboard } from '@/lib/dashboard-types';
import { formatDhaka } from '@/lib/format';
import { STATUS_LABEL, STATUS_TONE } from '@/lib/order-types';

export const metadata: Metadata = { title: 'Dashboard' };

const PERIODS = [7, 30, 90] as const;
const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
const fmtDay = (d: string) => longDate.format(new Date(`${d}T00:00:00Z`));

function greeting(): string {
  const hour = Number(
    new Intl.DateTimeFormat('en-GB', {
      hour: 'numeric',
      hour12: false,
      timeZone: 'Asia/Dhaka',
    }).format(new Date()),
  );
  return hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
}

export default async function AdminHome({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const admin = (await adminForPage())!;
  const sp = await searchParams;
  const days = PERIODS.find((p) => String(p) === sp.days) ?? 30;
  const canReport = can(admin, 'reports.view');
  const data = canReport ? await apiServer<Dashboard>(`/admin/dashboard?days=${days}`) : null;

  const twoFactor = !admin.twoFactorEnabled ? (
    <Alert tone={admin.role.isSystem ? 'warning' : 'info'}>
      Two-factor authentication is off for your account.{' '}
      <Link href="/admin/security" className="font-semibold underline">
        Turn it on
      </Link>
      {admin.role.isSystem ? ' (strongly recommended for Super Admins).' : '.'}
    </Alert>
  ) : null;

  if (!data) {
    return (
      <>
        <PageHeader
          title={`${greeting()}, ${admin.name}`}
          description={`Signed in as ${admin.role.name}.`}
        />
        <div className="max-w-2xl space-y-4">
          {twoFactor}
          <Card title="Your account">
            <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
              <dt className="text-ink-muted">Email</dt>
              <dd>{admin.email}</dd>
              <dt className="text-ink-muted">Role</dt>
              <dd>{admin.role.name}</dd>
              <dt className="text-ink-muted">Last sign-in</dt>
              <dd>{formatDhaka(admin.lastLoginAt)}</dd>
            </dl>
          </Card>
          <p className="text-sm text-ink-muted">
            Sales figures need the “View dashboard and reports” permission.
          </p>
        </div>
      </>
    );
  }

  const { totals, today, attention, period } = data;
  const todayChange =
    today.yesterdayOrders === 0 && today.orders === 0
      ? 'No orders yesterday either'
      : `Yesterday: ${today.yesterdayOrders} ${today.yesterdayOrders === 1 ? 'order' : 'orders'}, ${formatTaka(today.yesterdaySales)}`;
  const statusTotal = data.ordersByStatus.reduce((a, s) => a + s.orders, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] leading-tight text-petrol">
            {greeting()}, {admin.name}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {fmtDay(period.from)} to {fmtDay(period.to)}, Dhaka time. Sales leave out cancelled,
            failed and returned orders.
          </p>
        </div>
        {/* One filter row above everything it scopes. */}
        <nav aria-label="Period" className="flex rounded-control border border-line bg-surface p-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={p === 30 ? '/admin' : `/admin?days=${p}`}
              aria-current={p === days ? 'page' : undefined}
              className={cx(
                'rounded-[6px] px-3 py-1.5 text-sm font-semibold transition-colors',
                p === days
                  ? 'bg-petrol text-white'
                  : 'text-ink-muted hover:bg-neutral-100 hover:text-ink',
              )}
            >
              Last {p} days
            </Link>
          ))}
        </nav>
      </div>

      {twoFactor}

      <section
        aria-label="Needs attention"
        className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6"
      >
        <AttentionItem
          count={attention.pendingOrders}
          label="New orders to confirm"
          href="/admin/orders?status=PENDING"
          icon={<BagIcon />}
        />
        <AttentionItem
          count={attention.confirmed}
          label="Confirmed, to pack"
          href="/admin/orders?status=CONFIRMED"
          icon={<CheckIcon />}
        />
        <AttentionItem
          count={attention.packing}
          label="Being packed, to send"
          href="/admin/orders?status=PROCESSING"
          icon={<TruckIcon />}
        />
        <AttentionItem
          count={attention.lowStock}
          label="Running low"
          href="/admin/inventory?lowStock=true"
          icon={<RouteIcon />}
        />
        <AttentionItem
          count={attention.outOfStock}
          label="Out of stock"
          href="/admin/inventory?lowStock=true"
          icon={<CloseIcon />}
          tone="danger"
        />
        <AttentionItem
          count={attention.pendingReviews}
          label="Reviews to check"
          href="/admin/reviews"
          icon={<HeartIcon />}
        />
      </section>

      <section
        aria-label="Totals"
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]"
      >
        <StatTile label={`Sales, last ${days} days`} value={formatTaka(totals.sales)} hero>
          <Delta value={totals.change.sales} days={days} />
        </StatTile>
        <StatTile label="Orders" value={totals.orders.toLocaleString('en-US')}>
          <Delta value={totals.change.orders} days={days} />
        </StatTile>
        <StatTile label="Average order" value={formatTaka(totals.averageOrder)}>
          <Delta value={totals.change.averageOrder} days={days} />
        </StatTile>
        <StatTile label="Today" value={formatTaka(today.sales)}>
          <span className="text-[13px] text-ink-muted">
            {today.orders} {today.orders === 1 ? 'order' : 'orders'} so far. {todayChange}
          </span>
        </StatTile>
      </section>

      <Panel
        title="Sales per day"
        description={`${formatTaka(totals.sales)} from ${totals.orders} ${totals.orders === 1 ? 'order' : 'orders'}; ${totals.newCustomers} new ${totals.newCustomers === 1 ? 'account' : 'accounts'} in the same days.`}
      >
        <SalesChart data={data.salesByDay} />
      </Panel>

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Top products"
          description="By units sold; sales after coupons."
          action={
            <Link
              href="/admin/products"
              className="text-sm font-semibold text-petrol hover:underline"
            >
              All products
            </Link>
          }
        >
          <BarList
            empty="No sales in these days yet."
            rows={data.topProducts.map((p) => ({
              key: p.productId,
              label: p.name,
              value: p.quantity,
              href: `/admin/products/${p.productId}`,
              figure: (
                <>
                  {p.quantity} sold
                  <span className="ml-2 font-normal text-ink-muted">{formatTaka(p.sales)}</span>
                </>
              ),
            }))}
          />
        </Panel>
        <Panel
          title="Orders by status"
          description={`All ${statusTotal} orders placed in these days, cancelled ones included.`}
        >
          <BarList
            empty="No orders in these days yet."
            rows={data.ordersByStatus.map((s) => ({
              key: s.status,
              label: STATUS_LABEL[s.status] ?? s.status,
              value: s.orders,
              href: `/admin/orders?status=${s.status}`,
              figure: s.orders,
            }))}
          />
        </Panel>
        <Panel title="Payment methods" description="Orders that count as sales.">
          <BarList
            empty="No sales in these days yet."
            rows={data.paymentMethods.map((m) => ({
              key: m.name,
              label: m.name,
              value: m.orders,
              figure: (
                <>
                  {m.orders} {m.orders === 1 ? 'order' : 'orders'}
                  <span className="ml-2 font-normal text-ink-muted">{formatTaka(m.sales)}</span>
                </>
              ),
            }))}
          />
        </Panel>
        <Panel title="Top districts" description="Where the orders went.">
          <BarList
            empty="No sales in these days yet."
            rows={data.topDistricts.map((d) => ({
              key: d.district,
              label: d.district,
              value: d.orders,
              figure: `${d.orders} ${d.orders === 1 ? 'order' : 'orders'}`,
            }))}
          />
        </Panel>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {data.recentOrders ? (
          <Panel
            title="Recent orders"
            action={
              <Link
                href="/admin/orders"
                className="text-sm font-semibold text-petrol hover:underline"
              >
                All orders
              </Link>
            }
          >
            {data.recentOrders.length ? (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[36rem] text-left text-sm">
                  <thead className="border-b border-line text-ink-muted">
                    <tr>
                      <th className="px-5 py-2 font-semibold">Order</th>
                      <th className="px-3 py-2 font-semibold">Customer</th>
                      <th className="px-3 py-2 font-semibold">Status</th>
                      <th className="px-5 py-2 text-right font-semibold">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {data.recentOrders.map((o) => (
                      <tr key={o.id} className="hover:bg-neutral-50">
                        <td className="px-5 py-2.5">
                          <Link
                            href={`/admin/orders/${o.id}`}
                            className="font-semibold text-petrol hover:underline"
                          >
                            {o.orderNumber}
                          </Link>
                          <span className="block text-[12px] text-ink-muted">
                            {formatDhaka(o.placedAt)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          {o.customer}
                          <span className="block text-[12px] text-ink-muted">
                            {[o.district, o.paymentMethod].filter(Boolean).join(', ')}
                          </span>
                        </td>
                        <td className="px-3 py-2.5">
                          <Badge tone={STATUS_TONE[o.status] ?? 'neutral'}>
                            {STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </td>
                        <td className="px-5 py-2.5 text-right font-semibold tabular-nums">
                          {formatTaka(o.grandTotal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-ink-muted">No orders yet.</p>
            )}
          </Panel>
        ) : null}
        <Panel
          title="Low stock"
          description="At or below each variant's alert level."
          action={
            <Link
              href="/admin/inventory?lowStock=true"
              className="text-sm font-semibold text-petrol hover:underline"
            >
              Inventory
            </Link>
          }
        >
          {data.lowStock.length ? (
            <ul className="divide-y divide-line">
              {data.lowStock.map((v) => (
                <li key={v.variantId}>
                  <Link
                    href={`/admin/products/${v.productId}`}
                    className="flex items-center justify-between gap-3 py-2.5 hover:bg-neutral-50"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-ink">
                        {v.productName}
                      </span>
                      <span className="block text-[12px] text-ink-muted">
                        {v.variantName}, {v.sku}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <Badge tone={v.stockQty === 0 ? 'red' : 'amber'}>
                        {v.stockQty === 0 ? 'Out of stock' : `${v.stockQty} left`}
                      </Badge>
                      <span className="mt-0.5 block text-[12px] text-ink-muted">
                        alert at {v.threshold}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-ink-muted">
              Everything is above its alert level.
            </p>
          )}
        </Panel>
      </div>
    </div>
  );
}
