import { describe, expect, it } from 'vitest';
import { createOrderSchema, loginSchema } from '../src/schemas';
import { DEFAULT_ROLES, hasPermission, PERMISSION_KEYS } from '../src/permissions';

const VARIANT = '3f6c1c9e-6f0e-4f43-8a3a-2f2f9c4f2a11';
const valid = {
  items: [{ variantId: VARIANT, quantity: 2 }],
  contact: { name: 'Rahim Uddin', phone: '+8801712345678' },
  address: {
    recipientName: 'Rahim Uddin',
    phone: '01712345678',
    division: 'Rajshahi',
    district: 'Bogura',
    addressLine: 'House 1, Road 2',
  },
  paymentMethodCode: 'COD',
};

describe('createOrderSchema', () => {
  it('accepts a valid order and normalizes phone and coupon', () => {
    const r = createOrderSchema.parse({ ...valid, couponCode: ' save10 ' });
    expect(r.contact.phone).toBe('01712345678');
    expect(r.couponCode).toBe('SAVE10');
  });

  it.each([
    'price',
    'unitPrice',
    'total',
    'grandTotal',
    'subtotal',
    'discount',
    'discountTotal',
    'deliveryCharge',
  ])('rejects a client-supplied %s at the top level', (field) => {
    expect(createOrderSchema.safeParse({ ...valid, [field]: 1 }).success).toBe(false);
  });

  it('rejects a price on an item', () => {
    const bad = { ...valid, items: [{ variantId: VARIANT, quantity: 1, price: 1 }] };
    expect(createOrderSchema.safeParse(bad).success).toBe(false);
  });

  it('rejects bad quantities and empty carts', () => {
    expect(createOrderSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    for (const quantity of [0, 1.5, -2]) {
      const bad = { ...valid, items: [{ variantId: VARIANT, quantity }] };
      expect(createOrderSchema.safeParse(bad).success).toBe(false);
    }
  });

  it('requires exactly one of address or addressId', () => {
    const { address: _address, ...noAddress } = valid;
    expect(createOrderSchema.safeParse(noAddress).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...valid, addressId: VARIANT }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...noAddress, addressId: VARIANT }).success).toBe(true);
  });

  it('requires a valid phone and keeps email optional', () => {
    const badPhone = { ...valid, contact: { name: 'Rahim', phone: '123' } };
    const noEmail = { ...valid, contact: { name: 'Rahim', phone: '01712345678' } };
    expect(createOrderSchema.safeParse(badPhone).success).toBe(false);
    expect(createOrderSchema.safeParse(noEmail).success).toBe(true);
  });

  it('accepts expectedGrandTotal only as a money string', () => {
    expect(createOrderSchema.safeParse({ ...valid, expectedGrandTotal: '1660.00' }).success).toBe(true);
    expect(createOrderSchema.safeParse({ ...valid, expectedGrandTotal: 1660 }).success).toBe(false);
    expect(createOrderSchema.safeParse({ ...valid, expectedGrandTotal: '16.601' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('is strict', () => {
    const bad = { identifier: 'a@b.co', password: 'x', role: 'admin' };
    expect(loginSchema.safeParse(bad).success).toBe(false);
  });
});

describe('permissions', () => {
  it('keys are unique', () => {
    expect(new Set(PERMISSION_KEYS).size).toBe(PERMISSION_KEYS.length);
  });
  it('super admin bypasses, others need the key', () => {
    expect(hasPermission([], 'orders.view', true)).toBe(true);
    expect(hasPermission(['orders.view'], 'orders.view')).toBe(true);
    expect(hasPermission(['orders.view'], 'orders.cancel')).toBe(false);
  });
  it('default roles only reference known keys', () => {
    for (const role of Object.values(DEFAULT_ROLES)) {
      if (role.permissions !== 'ALL') {
        for (const k of role.permissions) expect(PERMISSION_KEYS).toContain(k);
      }
    }
  });
});
