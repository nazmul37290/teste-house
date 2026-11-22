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

// Meta Pixel ------------------------------------------------------------------------------------
//
// The same events, translated to Meta's standard events (developers.facebook.com/docs/meta-pixel/
// reference, checked 2026-11-22). Events Meta has no standard name for are not sent.

const META_EVENT_NAMES = {
  view_item: 'ViewContent',
  add_to_cart: 'AddToCart',
  begin_checkout: 'InitiateCheckout',
  add_payment_info: 'AddPaymentInfo',
  purchase: 'Purchase',
  add_to_wishlist: 'AddToWishlist',
  search: 'Search',
  sign_up: 'CompleteRegistration',
} as const;

export type MetaPixelEvent = {
  name: (typeof META_EVENT_NAMES)[keyof typeof META_EVENT_NAMES];
  params: Record<string, unknown>;
  /** Fourth fbq argument; the order number for Purchase, so a later server event can deduplicate. */
  options?: { eventID: string };
};

/** Event types that carry the product list (content_type is listed only for these). */
const WITH_CONTENT_TYPE = new Set(['ViewContent', 'AddToCart', 'Purchase']);

export function metaPixelEvent(
  event: string,
  data: Record<string, unknown> & { items?: AnalyticsItem[] },
): MetaPixelEvent | null {
  const name = META_EVENT_NAMES[event as keyof typeof META_EVENT_NAMES];
  if (!name) return null;
  if (name === 'Search')
    return { name, params: clean({ search_string: data.search_term as string | undefined }) };
  if (name === 'CompleteRegistration') return { name, params: {} };

  const items = data.items ?? [];
  const params: Record<string, unknown> = {
    content_ids: items.map((i) => i.item_id),
    contents: items.map((i) => ({ id: i.item_id, quantity: i.quantity })),
    currency: ANALYTICS_CURRENCY,
    value: typeof data.value === 'number' ? data.value : itemsValue(items),
  };
  if (WITH_CONTENT_TYPE.has(name)) params.content_type = 'product';
  if (name === 'InitiateCheckout' || name === 'Purchase')
    params.num_items = items.reduce((n, i) => n + i.quantity, 0);
  const transactionId = data.transaction_id;
  return name === 'Purchase' && typeof transactionId === 'string'
    ? { name, params, options: { eventID: transactionId } }
    : { name, params };
}

// Tracking IDs and the head script ---------------------------------------------------------------

export type TrackingIds = { gtm: string | null; ga4: string | null; pixel: string | null };

const GTM_ID = /^GTM-[A-Z0-9]{4,12}$/;
const GA4_ID = /^G-[A-Z0-9]{4,15}$/;
const PIXEL_ID = /^\d{10,20}$/;

/** IDs from public settings, checked again before they go into a script (anything odd is dropped). */
export function trackingIds(settings: {
  'gtm.containerId'?: string | null;
  'ga4.measurementId'?: string | null;
  'meta.pixelId'?: string | null;
}): TrackingIds {
  const pick = (v: string | null | undefined, re: RegExp) => {
    const t = v?.trim() ?? '';
    return re.test(t) ? t : null;
  };
  return {
    gtm: pick(settings['gtm.containerId'], GTM_ID),
    ga4: pick(settings['ga4.measurementId'], GA4_ID),
    pixel: pick(settings['meta.pixelId'], PIXEL_ID),
  };
}

export const hasTracking = (ids: TrackingIds) => Boolean(ids.gtm || ids.ga4 || ids.pixel);

/**
 * Runs first in <head>: dataLayer, gtag(), Consent Mode v2 defaults (everything denied), a saved
 * choice re-applied, then GA4's config, so the consent default comes before any measurement as
 * Google requires. Also records which tools are set up (window.__shopTracking) for the event
 * helper. The IDs passed the patterns above, so they can only be letters, digits and dashes.
 */
export function trackingBootScript(ids: TrackingIds, storageKey: string): string {
  const config = JSON.stringify({ ga4: ids.ga4, pixel: ids.pixel }).replace(/</g, '\u003c');
  return [
    'window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;',
    "gtag('consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',wait_for_update:500});",
    `try{var c=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}));if(c&&typeof c.analytics==='boolean'){var m=c.marketing?'granted':'denied';gtag('consent','update',{analytics_storage:c.analytics?'granted':'denied',ad_storage:m,ad_user_data:m,ad_personalization:m});}}catch(e){}`,
    `window.__shopTracking=${config};`,
    ids.ga4 ? `gtag('js',new Date());gtag('config',${JSON.stringify(ids.ga4)});` : '',
  ].join('\n');
}
