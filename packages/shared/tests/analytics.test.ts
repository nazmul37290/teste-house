import { describe, expect, it } from 'vitest';
import {
  analyticsItem,
  itemsValue,
  metaPixelEvent,
  trackingBootScript,
  trackingIds,
  moneyToNumber,
  purchasePayload,
  purchaseSentKey,
} from '../src/analytics';

describe('analytics payloads', () => {
  it('turns API money strings into GA4 numbers', () => {
    expect(moneyToNumber('1680.00')).toBe(1680);
    expect(moneyToNumber('450.5')).toBe(450.5);
    expect(moneyToNumber('0.07')).toBe(0.07);
    expect(moneyToNumber('abc')).toBe(0);
    expect(moneyToNumber(null)).toBe(0);
  });

  it('builds items with SKU as item_id and drops empty fields', () => {
    expect(
      analyticsItem({
        sku: 'GH-HONEY-250',
        name: 'Wild Honey',
        brand: null,
        category: 'Honey',
        price: '380.00',
      }),
    ).toEqual({
      item_id: 'GH-HONEY-250',
      item_name: 'Wild Honey',
      item_category: 'Honey',
      price: 380,
      quantity: 1,
    });
  });

  it('adds values without float drift', () => {
    const items = [
      analyticsItem({ sku: 'A', name: 'A', price: '0.10', quantity: 3 }),
      analyticsItem({ sku: 'B', name: 'B', price: '0.20', quantity: 1 }),
    ];
    expect(itemsValue(items)).toBe(0.5);
  });

  it('builds the purchase from the order view, without personal data', () => {
    const payload = purchasePayload({
      orderNumber: 'ORD-000123',
      grandTotal: '1660.00',
      deliveryCharge: '130.00',
      discountTotal: '150.00',
      couponCode: 'SAVE10',
      items: [
        {
          sku: 'H-500',
          productName: 'Honey',
          variantName: '500 g',
          unitPrice: '450.00',
          quantity: 2,
        },
      ],
    });
    expect(payload).toEqual({
      transaction_id: 'ORD-000123',
      value: 1660,
      currency: 'BDT',
      shipping: 130,
      discount: 150,
      coupon: 'SAVE10',
      items: [
        { item_id: 'H-500', item_name: 'Honey', item_variant: '500 g', price: 450, quantity: 2 },
      ],
    });
    expect(purchaseSentKey('ORD-000123')).toBe('shop:purchased:ORD-000123');
  });
});

describe('Meta Pixel events', () => {
  const items = [
    analyticsItem({ sku: 'HNY-500', name: 'Honey', price: '450.00', quantity: 2 }),
    analyticsItem({ sku: 'TEA-1', name: 'Tea', price: '120.50' }),
  ];

  it('maps GA4 names to standard events with ids, contents, value and BDT', () => {
    expect(metaPixelEvent('add_to_cart', { items })).toEqual({
      name: 'AddToCart',
      params: {
        content_ids: ['HNY-500', 'TEA-1'],
        contents: [
          { id: 'HNY-500', quantity: 2 },
          { id: 'TEA-1', quantity: 1 },
        ],
        content_type: 'product',
        currency: 'BDT',
        value: 1020.5,
      },
    });
    expect(metaPixelEvent('begin_checkout', { items })?.params).toMatchObject({ num_items: 3 });
    expect(metaPixelEvent('begin_checkout', { items })?.params).not.toHaveProperty('content_type');
  });

  it('sends Purchase with the server value and the order number as eventID', () => {
    expect(
      metaPixelEvent('purchase', { items, value: 1080.5, transaction_id: 'ORD-000042' }),
    ).toMatchObject({
      name: 'Purchase',
      params: { value: 1080.5, currency: 'BDT', num_items: 3 },
      options: { eventID: 'ORD-000042' },
    });
  });

  it('search and sign-up; events without a Meta equivalent are dropped', () => {
    expect(metaPixelEvent('search', { search_term: 'ghee' })).toEqual({
      name: 'Search',
      params: { search_string: 'ghee' },
    });
    expect(metaPixelEvent('sign_up', { method: 'phone' })).toEqual({
      name: 'CompleteRegistration',
      params: {},
    });
    expect(metaPixelEvent('view_item_list', { items })).toBeNull();
    expect(metaPixelEvent('login', { method: 'email' })).toBeNull();
  });
});

describe('tracking setup', () => {
  it('keeps only well-formed IDs', () => {
    expect(
      trackingIds({
        'gtm.containerId': 'GTM-AB12CD',
        'ga4.measurementId': 'G-XYZ123ABC',
        'meta.pixelId': '1234567890123',
      }),
    ).toEqual({ gtm: 'GTM-AB12CD', ga4: 'G-XYZ123ABC', pixel: '1234567890123' });
    expect(
      trackingIds({
        'gtm.containerId': '',
        'ga4.measurementId': "G-1');alert(1)//",
        'meta.pixelId': null,
      }),
    ).toEqual({ gtm: null, ga4: null, pixel: null });
  });

  it('sets the consent default before GA4 config, and GA4 config only when set', () => {
    const withGa4 = trackingBootScript(
      { gtm: null, ga4: 'G-XYZ123ABC', pixel: '1234567890' },
      'shop:consent',
    );
    expect(withGa4.indexOf("gtag('consent','default'")).toBeLessThan(
      withGa4.indexOf("gtag('config'"),
    );
    expect(withGa4).toContain("analytics_storage:'denied'");
    expect(withGa4).toContain('window.__shopTracking={"ga4":"G-XYZ123ABC","pixel":"1234567890"}');
    const gtmOnly = trackingBootScript(
      { gtm: 'GTM-AB12CD', ga4: null, pixel: null },
      'shop:consent',
    );
    expect(gtmOnly).not.toContain("gtag('config'");
    expect(gtmOnly).toContain('localStorage.getItem("shop:consent")');
  });
});
