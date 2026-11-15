import { describe, expect, it } from 'vitest';
import {
  createAdminUserSchema,
  createRoleSchema,
  setRolePermissionsSchema,
  updateAdminUserSchema,
  updateRoleSchema,
} from '../src/admin-schemas';

const uuid = '3f0c8a52-6d2e-4b1e-9a51-0e3f6b7c2d10';

describe('admin schemas', () => {
  it('accepts known permission keys and removes duplicates', () => {
    const r = setRolePermissionsSchema.parse({
      permissions: ['orders.view', 'orders.view', 'products.view'],
    });
    expect(r.permissions).toEqual(['orders.view', 'products.view']);
  });

  it('rejects unknown permission keys', () => {
    expect(
      setRolePermissionsSchema.safeParse({ permissions: ['orders.view', 'everything.do'] }).success,
    ).toBe(false);
  });

  it('is strict: unknown fields fail (isSystem cannot be set through the API)', () => {
    expect(createRoleSchema.safeParse({ name: 'Packer', isSystem: true }).success).toBe(false);
    expect(
      updateAdminUserSchema.safeParse({ name: 'X Y', password: 'Long-Enough-123' }).success,
    ).toBe(false);
  });

  it('requires something to update', () => {
    expect(updateRoleSchema.safeParse({}).success).toBe(false);
    expect(updateAdminUserSchema.safeParse({}).success).toBe(false);
  });

  it('needs a 12-character admin password and lowercases the email', () => {
    const base = { name: 'Staff One', roleId: uuid };
    expect(
      createAdminUserSchema.safeParse({ ...base, email: 'a@b.co', password: 'short-pass' }).success,
    ).toBe(false);
    const ok = createAdminUserSchema.parse({
      ...base,
      email: ' Staff@Shop.COM ',
      password: 'Long-Enough-123',
    });
    expect(ok.email).toBe('staff@shop.com');
  });
});
