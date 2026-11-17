import { describe, expect, it } from 'vitest';
import {
  analyticsItem,
  itemsValue,
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
