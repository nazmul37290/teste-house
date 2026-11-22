import type { OrderStatus } from './order-types';

/** GET /admin/dashboard (apps/api dashboard.service). Money is a string like "450.00". */
export type Dashboard = {
  period: { days: 7 | 30 | 90; from: string; to: string; timeZone: string };
  totals: {
    sales: string;
    orders: number;
    averageOrder: string;
    newCustomers: number;
    /** Percent change against the previous period of the same length; null: nothing to compare. */
    change: {
      sales: number | null;
      orders: number | null;
      averageOrder: number | null;
      newCustomers: number | null;
    };
  };
  today: { orders: number; sales: string; yesterdayOrders: number; yesterdaySales: string };
  attention: {
    pendingOrders: number;
    confirmed: number;
    packing: number;
    lowStock: number;
    outOfStock: number;
    pendingReviews: number;
  };
  salesByDay: { date: string; orders: number; sales: string }[];
  ordersByStatus: { status: OrderStatus; orders: number }[];
  paymentMethods: { name: string; orders: number; sales: string }[];
  topProducts: { productId: string; name: string; slug: string; quantity: number; sales: string }[];
  topDistricts: { district: string; orders: number }[];
  lowStock: {
    variantId: string;
    productId: string;
    productName: string;
    variantName: string;
    sku: string;
    stockQty: number;
    threshold: number;
  }[];
  /** null when the admin may see figures but not orders (no orders.view). */
  recentOrders:
    | {
        id: string;
        orderNumber: string;
        customer: string;
        district: string | null;
        status: OrderStatus;
        paymentStatus: string;
        paymentMethod: string;
        grandTotal: string;
        placedAt: string;
      }[]
    | null;
};
