'use client';

import {
  ANALYTICS_CURRENCY,
  analyticsItem,
  itemsValue,
  metaPixelEvent,
  purchasePayload,
  purchaseSentKey,
  type AnalyticsItem,
} from '@shop/shared';
import type { CartLine } from './cart-client';
import { loadMetaPixel, readConsent } from './consent';
import type { OrderView } from './order-types';
import type { ProductCard } from './storefront-types';

/**
 * The only place that sends analytics events (docs/design.md section 10). Each event goes to:
 * - the dataLayer, for a GTM container (GA4 ecommerce events get `ecommerce: null` first, so values
 *   from an earlier event never leak into the next one);
 * - GA4 directly with gtag('event'), when a measurement ID is set (Consent Mode decides what GA4
 *   may store, exactly as with GTM);
 * - the Meta Pixel, when a Pixel ID is set and the visitor allowed marketing cookies.
 * No personal data is sent.
 */

function push(entry: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(entry);
}

function sendDirect(event: string, params: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  const cfg = window.__shopTracking;
  if (!cfg) return;
  if (cfg.ga4 && window.gtag) window.gtag('event', event, params);
  if (cfg.pixel && readConsent()?.marketing) {
    const meta = metaPixelEvent(event, params);
    if (!meta) return;
    loadMetaPixel(cfg.pixel); // no-op once loaded
    if (meta.options) window.fbq?.('track', meta.name, meta.params, meta.options);
    else window.fbq?.('track', meta.name, meta.params);
  }
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
  const ecommerce = {
    currency: ANALYTICS_CURRENCY,
    value: data.value ?? itemsValue(data.items),
    ...data,
  };
  push({ ecommerce: null });
  push({ event, ecommerce });
  sendDirect(event, ecommerce);
}

/** Non-ecommerce events (search, sign_up, login). */
export function track(event: 'search' | 'sign_up' | 'login', params: Record<string, unknown>) {
  push({ event, ...params });
  sendDirect(event, params);
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
