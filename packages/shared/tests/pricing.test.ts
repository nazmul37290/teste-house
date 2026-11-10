import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { calculateOrderTotals, PricingError, type PricingInput } from '../src/pricing';
import { formatPaisa, parsePaisa } from '../src/money';

const P = parsePaisa;
const zone = { charge: P('130'), freeDeliveryThreshold: P('2000') };
const totals = (input: PricingInput) => calculateOrderTotals(input);

describe('worked example (docs/pricing.md section 4)', () => {
  it('matches the documented numbers', () => {
    const r = totals({
      items: [
        { variantId: 'honey', quantity: 2, price: P('500'), salePrice: P('450') },
        { variantId: 'horlicks', quantity: 1, price: P('780'), salePrice: null },
      ],
      coupon: { type: 'PERCENT', value: 1000, minOrderAmount: P('1500'), maxDiscount: P('150') },
      zone,
    });
    expect(formatPaisa(r.subtotal)).toBe('1680.00');
    expect(formatPaisa(r.discountTotal)).toBe('150.00');
    expect(formatPaisa(r.netMerchandise)).toBe('1530.00');
    expect(formatPaisa(r.deliveryCharge)).toBe('130.00');
    expect(formatPaisa(r.grandTotal)).toBe('1660.00');
    expect(r.lines.map((l) => formatPaisa(l.discountAmount))).toEqual(['80.36', '69.64']);
    expect(r.lines[0]?.listPrice).toBe(P('500'));
    expect(r.lines[0]?.unitPrice).toBe(P('450'));
  });
});

describe('coupons', () => {
  const items = [{ variantId: 'a', quantity: 1, price: P('1000'), salePrice: null }];

  it('no coupon means no discount', () => {
    const r = totals({ items, zone });
    expect(r.discountTotal).toBe(0);
    expect(r.grandTotal).toBe(P('1000') + P('130'));
  });

  it('fixed coupon', () => {
    const r = totals({ items, coupon: { type: 'FIXED', value: P('100') }, zone });
    expect(r.discountTotal).toBe(P('100'));
  });

  it('fixed coupon larger than subtotal is capped', () => {
    const r = totals({ items, coupon: { type: 'FIXED', value: P('5000') }, zone });
    expect(r.discountTotal).toBe(P('1000'));
    expect(r.netMerchandise).toBe(0);
    expect(r.grandTotal).toBe(P('130'));
  });

  it('percent rounds half up', () => {
    const a = totals({
      items: [{ variantId: 'a', quantity: 1, price: P('333.33'), salePrice: null }],
      coupon: { type: 'PERCENT', value: 700 },
      zone,
    });
    expect(a.discountTotal).toBe(2333); // 7% of 333.33 = 23.3331
    const b = totals({
      items: [{ variantId: 'a', quantity: 1, price: 4, salePrice: null }],
      coupon: { type: 'PERCENT', value: 1250 },
      zone,
    });
    expect(b.discountTotal).toBe(1); // 12.5% of 4 paisa = 0.5 -> 1
  });

  it('percent capped by maxDiscount', () => {
    const r = totals({
      items,
      coupon: { type: 'PERCENT', value: 5000, maxDiscount: P('200') },
      zone,
    });
    expect(r.discountTotal).toBe(P('200'));
  });

  it('rejects when below the minimum order', () => {
    expect(() =>
      totals({
        items,
        coupon: { type: 'FIXED', value: P('50'), minOrderAmount: P('1500') },
        zone,
      }),
    ).toThrowError(expect.objectContaining({ code: 'COUPON_MIN_ORDER' }));
  });

  it('rejects invalid coupon values', () => {
    expect(() => totals({ items, coupon: { type: 'PERCENT', value: 10001 }, zone })).toThrow(PricingError);
    expect(() => totals({ items, coupon: { type: 'PERCENT', value: 0 }, zone })).toThrow(PricingError);
    expect(() => totals({ items, coupon: { type: 'FIXED', value: 0 }, zone })).toThrow(PricingError);
  });
});

describe('sale price and validation', () => {
  it('uses sale price when set', () => {
    const r = totals({
      items: [{ variantId: 'a', quantity: 3, price: P('100'), salePrice: P('80') }],
      zone,
    });
    expect(r.subtotal).toBe(P('240'));
  });

  it('rejects sale price not below price', () => {
    expect(() =>
      totals({ items: [{ variantId: 'a', quantity: 1, price: P('100'), salePrice: P('100') }], zone }),
    ).toThrow(PricingError);
  });

  it('rejects bad quantities and empty carts', () => {
    const base = { variantId: 'a', price: P('100'), salePrice: null };
    for (const quantity of [0, -1, 1.5, 1001, Number.NaN]) {
      expect(() => totals({ items: [{ ...base, quantity }], zone })).toThrow(PricingError);
    }
    expect(() => totals({ items: [], zone })).toThrow(PricingError);
  });

  it('rejects float prices', () => {
    expect(() =>
      totals({ items: [{ variantId: 'a', quantity: 1, price: 100.5, salePrice: null }], zone }),
    ).toThrow(PricingError);
  });
});

describe('free delivery threshold (checked after discount)', () => {
  const at = (paisa: number) =>
    totals({ items: [{ variantId: 'a', quantity: 1, price: paisa, salePrice: null }], zone })
      .deliveryCharge;

  it('free at the threshold, charged one paisa below, free above', () => {
    expect(at(P('2000'))).toBe(0);
    expect(at(P('2000') - 1)).toBe(P('130'));
    expect(at(P('2000') + 1)).toBe(0);
  });

  it('a coupon can drop the order below the threshold', () => {
    const r = totals({
      items: [{ variantId: 'a', quantity: 1, price: P('2100'), salePrice: null }],
      coupon: { type: 'FIXED', value: P('200') },
      zone,
    });
    expect(r.netMerchandise).toBe(P('1900'));
    expect(r.deliveryCharge).toBe(P('130'));
  });

  it('zone without a threshold always charges', () => {
    const r = totals({
      items: [{ variantId: 'a', quantity: 1, price: P('99999'), salePrice: null }],
      zone: { charge: P('60') },
    });
    expect(r.deliveryCharge).toBe(P('60'));
  });
});

describe('discount allocation', () => {
  it.each([1, 2, 3, 7])('sums exactly for %i lines', (n) => {
    const items = Array.from({ length: n }, (_, i) => ({
      variantId: `v${i}`,
      quantity: i + 1,
      price: 3333 + i * 777,
      salePrice: null,
    }));
    const r = totals({ items, coupon: { type: 'PERCENT', value: 1333 }, zone });
    expect(r.lines.reduce((s, l) => s + l.discountAmount, 0)).toBe(r.discountTotal);
  });

  it('is zero without a discount', () => {
    const r = totals({
      items: [{ variantId: 'a', quantity: 2, price: 500, salePrice: null }],
      zone,
    });
    expect(r.lines[0]?.discountAmount).toBe(0);
  });
});

describe('invariants (property test)', () => {
  it('hold for random carts, coupons and zones', () => {
    const item = fc.record({
      variantId: fc.uuid(),
      quantity: fc.integer({ min: 1, max: 50 }),
      price: fc.integer({ min: 1, max: 5_000_000 }),
      salePct: fc.option(fc.integer({ min: 0, max: 99 }), { nil: null }),
    });
    const coupon = fc.option(
      fc.oneof(
        fc.record({
          type: fc.constant('FIXED' as const),
          value: fc.integer({ min: 1, max: 10_000_000 }),
        }),
        fc.record({
          type: fc.constant('PERCENT' as const),
          value: fc.integer({ min: 1, max: 10000 }),
          maxDiscount: fc.option(fc.integer({ min: 0, max: 5_000_000 }), { nil: null }),
        }),
      ),
      { nil: null },
    );
    const zoneArb = fc.record({
      charge: fc.integer({ min: 0, max: 100_000 }),
      freeDeliveryThreshold: fc.option(fc.integer({ min: 0, max: 20_000_000 }), { nil: null }),
    });

    fc.assert(
      fc.property(fc.array(item, { minLength: 1, maxLength: 12 }), coupon, zoneArb, (raw, c, z) => {
        const items = raw.map((r) => ({
          variantId: r.variantId,
          quantity: r.quantity,
          price: r.price,
          salePrice: r.salePct === null ? null : Math.floor((r.price * r.salePct) / 100),
        }));
        const out = totals({ items, coupon: c, zone: z });
        const sumLines = out.lines.reduce((s, l) => s + l.lineTotal, 0);
        const sumDisc = out.lines.reduce((s, l) => s + l.discountAmount, 0);
        expect(out.lines.every((l) => l.lineTotal === l.unitPrice * l.quantity)).toBe(true);
        expect(out.subtotal).toBe(sumLines);
        expect(out.discountTotal).toBe(sumDisc);
        expect(out.discountTotal).toBeLessThanOrEqual(out.subtotal);
        expect(out.grandTotal).toBe(out.subtotal - out.discountTotal + out.deliveryCharge);
        expect(out.grandTotal).toBeGreaterThanOrEqual(0);
        expect(out.lines.every((l) => l.discountAmount <= l.lineTotal)).toBe(true);
      }),
      { numRuns: 500 },
    );
  });
});

describe('money helpers', () => {
  it('parses and formats', () => {
    expect(parsePaisa('450')).toBe(45000);
    expect(parsePaisa('450.5')).toBe(45050);
    expect(parsePaisa('0.07')).toBe(7);
    expect(formatPaisa(168000)).toBe('1680.00');
    expect(formatPaisa(7)).toBe('0.07');
  });
  it('rejects bad input', () => {
    for (const bad of ['', '-1', '1.234', 'abc', '1,000', '1e3']) {
      expect(() => parsePaisa(bad)).toThrow();
    }
  });
});
