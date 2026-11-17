/**
 * GA4 ecommerce payloads (requirements section 15, docs/design.md section 10). Pure functions; the
 * web app's track() helper is the only place that pushes them to the dataLayer. Prices come from API
 * money strings and are sent as numbers with two decimals, as GA4 expects; they are display data for
 * analytics, never used to charge anyone. No personal data (names, phones, emails) ever goes here.
 */

export const ANALYTICS_CURRENCY = 'BDT';

export type AnalyticsItem = {
  item_id: string; // SKU
  item_name: string;
  item_brand?: string;
  item_category?: string;
  item_variant?: string;
  item_list_name?: string;
  index?: number;
  price: number;
  quantity: number;
};

/** "1680.00" -> 1680 (two decimals kept). Unparseable values become 0 rather than NaN. */
export function moneyToNumber(value: string | null | undefined): number {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return 0;
  const [whole = '0', frac = ''] = value.split('.');
  return Number(whole) + Number(frac.padEnd(2, '0')) / 100;
}

const clean = <T extends Record<string, unknown>>(o: T): T =>
  Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''),
  ) as T;

export function analyticsItem(input: {
  sku: string;
  name: string;
  brand?: string | null;
  category?: string | null;
  variant?: string | null;
  price: string;
  quantity?: number;
  listName?: string;
  index?: number;
}): AnalyticsItem {
  return clean({
    item_id: input.sku,
    item_name: input.name,
    item_brand: input.brand ?? undefined,
    item_category: input.category ?? undefined,
    item_variant: input.variant ?? undefined,
    item_list_name: input.listName,
    index: input.index,
    price: moneyToNumber(input.price),
    quantity: input.quantity ?? 1,
  });
}

/** Sum of price x quantity in paisa, back to a number with two decimals. */
export function itemsValue(items: AnalyticsItem[]): number {
  const paisa = items.reduce((sum, i) => sum + Math.round(i.price * 100) * i.quantity, 0);
  return paisa / 100;
}

/** localStorage key that marks an order's purchase event as sent (one purchase per order). */
export const purchaseSentKey = (orderNumber: string) => `shop:purchased:${orderNumber}`;

/** GA4 purchase payload from the server's order view (never from the cart). */
export function purchasePayload(order: {
  orderNumber: string;
  grandTotal: string;
  deliveryCharge: string;
  discountTotal: string;
  couponCode: string | null;
  items: {
    sku: string;
    productName: string;
    variantName: string;
    unitPrice: string;
    quantity: number;
  }[];
}) {
  return clean({
    transaction_id: order.orderNumber,
    value: moneyToNumber(order.grandTotal),
    currency: ANALYTICS_CURRENCY,
    shipping: moneyToNumber(order.deliveryCharge),
    discount: moneyToNumber(order.discountTotal) || undefined,
    coupon: order.couponCode ?? undefined,
    items: order.items.map((i) =>
      analyticsItem({
        sku: i.sku,
        name: i.productName,
        variant: i.variantName,
        price: i.unitPrice,
        quantity: i.quantity,
      }),
    ),
  });
}
