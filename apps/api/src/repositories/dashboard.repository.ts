import { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

/**
 * Aggregates for the admin dashboard. Orders that count as sales leave out CANCELLED, FAILED and
 * RETURNED (dashboard.service explains the rule). Days are Asia/Dhaka calendar days: `placedAt` is
 * stored in UTC without a zone, hence the double AT TIME ZONE.
 */
const NOT_SALES = Prisma.sql`('CANCELLED', 'FAILED', 'RETURNED')`;
const dhakaDay = Prisma.sql`(("placedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Dhaka')::date`;

export type DayRow = { day: string; orders: number; sales: Prisma.Decimal };

/** Orders and sales per Dhaka day from `from` (UTC instant) onward. */
export function salesByDay(prisma: Db, from: Date) {
  return prisma.$queryRaw<DayRow[]>`
    SELECT to_char(${dhakaDay}, 'YYYY-MM-DD') AS day,
           count(*)::int AS orders,
           coalesce(sum("grandTotal"), 0) AS sales
    FROM orders
    WHERE "placedAt" >= ${from} AND status::text NOT IN ${NOT_SALES}
    GROUP BY 1
    ORDER BY 1`;
}

export type TopProductRow = {
  productId: string;
  name: string;
  slug: string;
  quantity: number;
  sales: Prisma.Decimal;
};

/** Best sellers by units in the period; sales are line totals after the coupon share. */
export function topProducts(prisma: Db, from: Date, limit: number) {
  return prisma.$queryRaw<TopProductRow[]>`
    SELECT p.id AS "productId", p.name, p.slug,
           sum(oi.quantity)::int AS quantity,
           coalesce(sum(oi."lineTotal" - oi."discountAmount"), 0) AS sales
    FROM order_items oi
    JOIN orders o ON o.id = oi."orderId"
    JOIN product_variants v ON v.id = oi."variantId"
    JOIN products p ON p.id = v."productId"
    WHERE o."placedAt" >= ${from} AND o.status::text NOT IN ${NOT_SALES}
    GROUP BY p.id, p.name, p.slug
    ORDER BY quantity DESC, sales DESC
    LIMIT ${limit}`;
}

export type DistrictRow = { district: string; orders: number };

export function topDistricts(prisma: Db, from: Date, limit: number) {
  return prisma.$queryRaw<DistrictRow[]>`
    SELECT a.district, count(*)::int AS orders
    FROM orders o
    JOIN order_addresses a ON a."orderId" = o.id
    WHERE o."placedAt" >= ${from} AND o.status::text NOT IN ${NOT_SALES}
    GROUP BY a.district
    ORDER BY orders DESC, a.district
    LIMIT ${limit}`;
}

export type StockRow = {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  stockQty: number;
  threshold: number;
};

/** Active variants of live products at or below their low-stock threshold, emptiest first. */
export function lowStock(prisma: Db, limit: number) {
  return prisma.$queryRaw<StockRow[]>`
    SELECT v.id AS "variantId", p.id AS "productId", p.name AS "productName",
           v.name AS "variantName", v.sku, v."stockQty", v."lowStockThreshold" AS threshold
    FROM product_variants v
    JOIN products p ON p.id = v."productId"
    WHERE v."isActive" AND p."deletedAt" IS NULL AND p.status::text = 'ACTIVE'
      AND v."stockQty" <= v."lowStockThreshold"
    ORDER BY v."stockQty", p.name
    LIMIT ${limit}`;
}

export async function stockCounts(prisma: Db) {
  const [row] = await prisma.$queryRaw<{ low: number; out: number }[]>`
    SELECT count(*) FILTER (WHERE v."stockQty" > 0)::int AS low,
           count(*) FILTER (WHERE v."stockQty" = 0)::int AS out
    FROM product_variants v
    JOIN products p ON p.id = v."productId"
    WHERE v."isActive" AND p."deletedAt" IS NULL AND p.status::text = 'ACTIVE'
      AND v."stockQty" <= v."lowStockThreshold"`;
  return row ?? { low: 0, out: 0 };
}
