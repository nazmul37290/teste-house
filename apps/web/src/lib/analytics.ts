'use client';

import {
  ANALYTICS_CURRENCY,
  analyticsItem,
  itemsValue,
  purchasePayload,
  purchaseSentKey,
  type AnalyticsItem,
} from '@shop/shared';
import type { CartLine } from './cart-client';
import type { OrderView } from './order-types';
import type { ProductCard } from './storefront-types';

/**
 * The only place that pushes analytics events (docs/design.md section 10). GA4 ecommerce events get
 * `ecommerce: null` first, so values from an earlier event never leak into the next one. Whether
 * tags may use the data is decided by Consent Mode in GTM, not here. No personal data is sent.
 */

type DataLayer = Record<string, unknown>[];
declare global {
  interface Window {
    dataLayer?: DataLayer;
  }
}

function push(entry: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(entry);
}

export type EcommerceEvent =
  | 'view_item_list'
  | 'select_item'
  | 'view_item'
  | 'add_to_cart'
  | 'remove_from_cart'
  | 'view_cart'
  | 'begin_checkout'
  | 'add_shipping_info'
  | 'add_payment_info'
  | 'purchase'
  | 'add_to_wishlist';

export function trackEcommerce(
  event: EcommerceEvent,
  data: { items: AnalyticsItem[]; value?: number } & Record<string, unknown>,
) {
  push({ ecommerce: null });
  push({
    event,
    ecommerce: {
      currency: ANALYTICS_CURRENCY,
      value: data.value ?? itemsValue(data.items),
      ...data,
    },
  });
}

/** Non-ecommerce events (search, sign_up, login). */
export function track(event: 'search' | 'sign_up' | 'login', params: Record<string, unknown>) {
  push({ event, ...params });
}

// Item builders ----------------------------------------------------------------------------------

export const cardItem = (c: ProductCard, listName?: string, index?: number) =>
  analyticsItem({
    sku: c.sku,
    name: c.name,
    brand: c.brand?.name,
    category: c.category,
    variant: c.variantName,
    price: c.price,
    listName,
    index,
  });

export const cartLineItem = (l: CartLine, quantity = l.quantity) =>
  analyticsItem({
    sku: l.sku,
    name: l.productName,
    brand: l.brand,
    category: l.category,
    variant: l.variantName,
    price: l.unitPrice,
    quantity,
  });

/** Purchase once per order: a flag in this browser stops a reload from counting it twice. */
export function trackPurchaseOnce(order: OrderView) {
  const key = purchaseSentKey(order.orderNumber);
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, '1');
  } catch {
    // No storage: still send once for this page view.
  }
  const payload = purchasePayload({
    orderNumber: order.orderNumber,
    grandTotal: order.grandTotal,
    deliveryCharge: order.deliveryCharge,
    discountTotal: order.discountTotal,
    couponCode: order.couponCode,
    items: order.items,
  });
  trackEcommerce('purchase', payload);
  return true;
}
