import { describe, expect, it } from 'vitest';
import { BD_DIVISIONS, checkBdAddress, districtsOf, upazilasOf } from '../src/bd-geo';
import {
  BD_DISTRICTS,
  createCouponSchema,
  createDeliveryZoneSchema,
  readPaymentMethodConfig,
  updateCouponSchema,
  updatePaymentMethodSchema,
} from '../src/checkout-schemas';
import { addressInput } from '../src/schemas';

describe('bd geo data', () => {
  it('has 8 divisions and 64 districts, including Dhaka', () => {
    expect(BD_DIVISIONS).toHaveLength(8);
    expect(BD_DISTRICTS).toHaveLength(64);
    expect(districtsOf('Dhaka')).toContain('Dhaka');
    expect(upazilasOf('Dhaka', 'Dhaka')).toContain('Savar');
  });

  it('checks that the district belongs to the division and the upazila to the district', () => {
    expect(checkBdAddress('Rajshahi', 'Bogura')).toEqual({ ok: true });
    expect(checkBdAddress('Dhaka', 'Bogura')).toEqual({ ok: false, path: 'district' });
    expect(checkBdAddress('Nowhere', 'Dhaka')).toEqual({ ok: false, path: 'division' });
    expect(checkBdAddress('Dhaka', 'Dhaka', 'Savar')).toEqual({ ok: true });
    expect(checkBdAddress('Dhaka', 'Dhaka', 'Sylhet Sadar')).toEqual({
      ok: false,
      path: 'upazila',
    });
  });
});

describe('addressInput', () => {
  const base = {
    recipientName: 'Rahim Uddin',
    phone: '01712345678',
    division: 'Dhaka',
    district: 'Dhaka',
    addressLine: 'House 1, Road 2, Mirpur',
  };

  it('accepts an address without an upazila (city areas are not upazilas)', () => {
    expect(addressInput.parse({ ...base, upazila: '' }).upazila).toBeUndefined();
  });

  it('rejects a district outside its division', () => {
    const r = addressInput.safeParse({ ...base, district: 'Bogura' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.path).toEqual(['district']);
  });
});

describe('delivery zone schema', () => {
  it('normalizes money and sorts districts', () => {
    const z = createDeliveryZoneSchema.parse({
      name: 'Inside Dhaka',
      code: 'Inside-Dhaka',
      districts: ['Narayanganj', 'Dhaka'],
      charge: '60',
    });
    expect(z).toMatchObject({
      code: 'inside-dhaka',
      districts: ['Dhaka', 'Narayanganj'],
      charge: '60.00',
    });
  });

  it('rejects unknown and repeated districts', () => {
    const z = { name: 'X zone', code: 'x', charge: '60' };
    expect(createDeliveryZoneSchema.safeParse({ ...z, districts: ['Atlantis'] }).success).toBe(
      false,
    );
    expect(
      createDeliveryZoneSchema.safeParse({ ...z, districts: ['Dhaka', 'Dhaka'] }).success,
    ).toBe(false);
  });
});

describe('coupon schema', () => {
  const base = { code: ' save10 ', type: 'PERCENT' as const, value: '10' };

  it('uppercases the code and accepts decimals for percent', () => {
    expect(createCouponSchema.parse({ ...base, value: '12.5' })).toMatchObject({
      code: 'SAVE10',
      value: '12.50',
    });
  });

  it('rejects a percent above 100, a zero value and an end before the start', () => {
    expect(createCouponSchema.safeParse({ ...base, value: '100.01' }).success).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, type: 'FIXED', value: '0' }).success).toBe(
      false,
    );
    expect(
      createCouponSchema.safeParse({
        ...base,
        startsAt: '2026-12-01T00:00:00Z',
        expiresAt: '2026-11-01T00:00:00Z',
      }).success,
    ).toBe(false);
    expect(createCouponSchema.safeParse({ ...base, type: 'FIXED', value: '5000' }).success).toBe(
      true,
    );
  });

  it('needs type and value together on update', () => {
    expect(updateCouponSchema.safeParse({ value: '20' }).success).toBe(false);
    expect(updateCouponSchema.safeParse({ type: 'PERCENT', value: '20' }).success).toBe(true);
    expect(updateCouponSchema.safeParse({ isActive: false }).success).toBe(true);
  });
});

describe('payment method config', () => {
  it('rejects a minimum above the maximum', () => {
    const bad = { config: { scope: 'NATIONWIDE', minAmount: '500', maxAmount: '100' } };
    expect(updatePaymentMethodSchema.safeParse(bad).success).toBe(false);
  });

  it('reads stored config leniently', () => {
    expect(readPaymentMethodConfig({ scope: 'DHAKA_ONLY', minAmount: 0, maxAmount: null })).toEqual(
      {
        scope: 'DHAKA_ONLY',
        minAmount: '0.00',
      },
    );
    expect(readPaymentMethodConfig(null)).toEqual({});
    expect(readPaymentMethodConfig({ scope: 'MARS' })).toEqual({});
  });
});
