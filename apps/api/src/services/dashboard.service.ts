import { formatPaisa, parsePaisa, type DashboardPeriod, type Paisa } from '@shop/shared';
import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/dashboard.repository';

/**
 * Admin dashboard (requirements section 12: today's orders and revenue, pending count, low stock,
 * top products, sales chart). Read-only.
 *
 * Rules:
 * - "Sales" is the grand total of orders placed in the period, leaving out CANCELLED, FAILED and
 *   RETURNED orders. It is ordered value, not cash collected (COD is collected on delivery).
 * - Days are Asia/Dhaka calendar days. A period of N days ends today (Dhaka) and starts N-1 days
 *   before; the previous period is the N days before that, for the comparison.
 * - Money is summed in the database (numeric) and handled here in integer paisa.
 */

const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000; // UTC+6, no daylight saving
const DAY_MS = 24 * 60 * 60 * 1000;

const toPaisa = (d: Prisma.Decimal | null | undefined): Paisa =>
  d === null || d === undefined ? 0 : parsePaisa(d.toFixed(2));

/** YYYY-MM-DD of the Dhaka day `offset` days from the one containing `now`. */
function dhakaDate(now: Date, offset = 0): string {
  return new Date(now.getTime() + DHAKA_OFFSET_MS + offset * DAY_MS).toISOString().slice(0, 10);
}
/** UTC instant of Dhaka midnight at the start of that YYYY-MM-DD. */
const dhakaMidnight = (day: string) => new Date(Date.parse(`${day}T00:00:00Z`) - DHAKA_OFFSET_MS);

/** Change in percent, one decimal; null when there is nothing to compare with. */
function change(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

export async function getDashboard(
  prisma: Db,
  days: DashboardPeriod,
  opts: { includeOrders: boolean },
  now = new Date(),
) {
  const today = dhakaDate(now);
  const periodStartDay = dhakaDate(now, -(days - 1));
  const prevStartDay = dhakaDate(now, -(2 * days - 1));
  const periodStart = dhakaMidnight(periodStartDay);
  const prevStart = dhakaMidnight(prevStartDay);

  const [
    dayRows,
    statusRows,
    methodRows,
    methods,
    topProducts,
    districts,
    lowStock,
    stock,
    pendingOrders,
    confirmed,
    packing,
    pendingReviews,
    newCustomers,
    prevNewCustomers,
    recent,
  ] = await Promise.all([
    repo.salesByDay(prisma, prevStart),
    prisma.order.groupBy({
      by: ['status'],
      where: { placedAt: { gte: periodStart } },
      _count: { _all: true },
    }),
    prisma.order.groupBy({
      by: ['paymentMethodId'],
      where: {
        placedAt: { gte: periodStart },
        status: { notIn: ['CANCELLED', 'FAILED', 'RETURNED'] },
      },
      _count: { _all: true },
      _sum: { grandTotal: true },
    }),
    prisma.paymentMethod.findMany({ select: { id: true, name: true, code: true } }),
    repo.topProducts(prisma, periodStart, 5),
    repo.topDistricts(prisma, periodStart, 5),
    repo.lowStock(prisma, 6),
    repo.stockCounts(prisma),
    prisma.order.count({ where: { status: 'PENDING' } }),
    prisma.order.count({ where: { status: 'CONFIRMED' } }),
    prisma.order.count({ where: { status: 'PROCESSING' } }),
    prisma.review.count({ where: { status: 'PENDING' } }),
    prisma.customer.count({ where: { createdAt: { gte: periodStart } } }),
    prisma.customer.count({ where: { createdAt: { gte: prevStart, lt: periodStart } } }),
    opts.includeOrders
      ? prisma.order.findMany({
          orderBy: { placedAt: 'desc' },
          take: 8,
          select: {
            id: true,
            orderNumber: true,
            contactName: true,
            status: true,
            paymentStatus: true,
            grandTotal: true,
            placedAt: true,
            paymentMethod: { select: { name: true } },
            address: { select: { district: true } },
          },
        })
      : Promise.resolve(null),
  ]);

  // Daily series for the current period, zero-filled; totals for both periods.
  const byDay = new Map(dayRows.map((r) => [r.day, r]));
  const series = Array.from({ length: days }, (_, i) => {
    const day = dhakaDate(now, i - (days - 1));
    const row = byDay.get(day);
    return { date: day, orders: row?.orders ?? 0, sales: toPaisa(row?.sales) };
  });
  const sum = (from: string, to: string) =>
    dayRows
      .filter((r) => r.day >= from && r.day <= to)
      .reduce(
        (acc, r) => ({ orders: acc.orders + r.orders, sales: acc.sales + toPaisa(r.sales) }),
        {
          orders: 0,
          sales: 0,
        },
      );
  const current = sum(periodStartDay, today);
  const previous = sum(prevStartDay, dhakaDate(now, -days));
  const todayTotals = sum(today, today);
  const yesterday = dhakaDate(now, -1);
  const yesterdayTotals = sum(yesterday, yesterday);
  const avg = (t: { orders: number; sales: number }) =>
    t.orders ? Math.round(t.sales / t.orders) : 0;

  const methodName = new Map(methods.map((m) => [m.id, m.name]));

  return {
    period: { days, from: periodStartDay, to: today, timeZone: 'Asia/Dhaka' },
    totals: {
      sales: formatPaisa(current.sales),
      orders: current.orders,
      averageOrder: formatPaisa(avg(current)),
      newCustomers,
      change: {
        sales: change(current.sales, previous.sales),
        orders: change(current.orders, previous.orders),
        averageOrder: change(avg(current), avg(previous)),
        newCustomers: change(newCustomers, prevNewCustomers),
      },
    },
    today: {
      orders: todayTotals.orders,
      sales: formatPaisa(todayTotals.sales),
      yesterdayOrders: yesterdayTotals.orders,
      yesterdaySales: formatPaisa(yesterdayTotals.sales),
    },
    attention: {
      pendingOrders,
      confirmed,
      packing,
      lowStock: stock.low,
      outOfStock: stock.out,
      pendingReviews,
    },
    salesByDay: series.map((d) => ({ ...d, sales: formatPaisa(d.sales) })),
    ordersByStatus: statusRows
      .map((r) => ({ status: r.status, orders: r._count._all }))
      .sort((a, b) => b.orders - a.orders),
    paymentMethods: methodRows
      .map((r) => ({
        name: methodName.get(r.paymentMethodId) ?? 'Unknown',
        orders: r._count._all,
        sales: formatPaisa(toPaisa(r._sum.grandTotal)),
      }))
      .sort((a, b) => b.orders - a.orders),
    topProducts: topProducts.map((p) => ({
      productId: p.productId,
      name: p.name,
      slug: p.slug,
      quantity: p.quantity,
      sales: formatPaisa(toPaisa(p.sales)),
    })),
    topDistricts: districts,
    lowStock,
    recentOrders:
      recent?.map((o) => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: o.contactName,
        district: o.address?.district ?? null,
        status: o.status,
        paymentStatus: o.paymentStatus,
        paymentMethod: o.paymentMethod.name,
        grandTotal: o.grandTotal.toFixed(2),
        placedAt: o.placedAt,
      })) ?? null,
  };
}
export type Dashboard = Awaited<ReturnType<typeof getDashboard>>;
