/** Single source of truth for admin permission keys. Seeded into the `permissions` table. */
export const PERMISSIONS = [
  { key: 'products.view', module: 'products', description: 'View products' },
  { key: 'products.create', module: 'products', description: 'Create products' },
  { key: 'products.update', module: 'products', description: 'Edit products and prices' },
  { key: 'products.delete', module: 'products', description: 'Delete or archive products' },
  { key: 'categories.manage', module: 'catalog', description: 'Manage categories and attributes' },
  { key: 'brands.manage', module: 'catalog', description: 'Manage brands and tags' },
  { key: 'media.upload', module: 'media', description: 'Upload and delete media' },
  { key: 'inventory.view', module: 'inventory', description: 'View stock and movements' },
  { key: 'inventory.adjust', module: 'inventory', description: 'Adjust stock and batches' },
  { key: 'orders.view', module: 'orders', description: 'View orders' },
  { key: 'orders.update_status', module: 'orders', description: 'Change order status' },
  { key: 'orders.edit', module: 'orders', description: 'Edit order items and address' },
  { key: 'orders.cancel', module: 'orders', description: 'Cancel orders' },
  { key: 'orders.book_courier', module: 'orders', description: 'Send orders to the courier' },
  { key: 'orders.add_note', module: 'orders', description: 'Add internal order notes' },
  { key: 'customers.view', module: 'customers', description: 'View customers' },
  { key: 'customers.block', module: 'customers', description: 'Block or unblock customers' },
  { key: 'reviews.moderate', module: 'reviews', description: 'Approve, reject and reply to reviews' },
  { key: 'coupons.manage', module: 'marketing', description: 'Manage coupons' },
  { key: 'marketing.manage', module: 'marketing', description: 'Manage banners, sections, redirects' },
  { key: 'payments.toggle', module: 'settings', description: 'Enable or disable payment methods' },
  { key: 'shipping.manage', module: 'settings', description: 'Manage delivery zones and charges' },
  { key: 'settings.manage', module: 'settings', description: 'Manage store settings' },
  { key: 'roles.manage', module: 'staff', description: 'Manage roles and permissions' },
  { key: 'users.manage', module: 'staff', description: 'Manage admin users' },
  { key: 'reports.view', module: 'reports', description: 'View dashboard and reports' },
  { key: 'audit.view', module: 'reports', description: 'View the audit log' },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]['key'];

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSIONS.map((p) => p.key);

export const SUPER_ADMIN_ROLE = 'Super Admin';

/** Default role templates created by the seed. Super Admin always has everything (checked in code). */
export const DEFAULT_ROLES: Record<
  string,
  { description: string; permissions: readonly PermissionKey[] | 'ALL' }
> = {
  [SUPER_ADMIN_ROLE]: { description: 'Full access. System role.', permissions: 'ALL' },
  Manager: {
    description: 'Runs the store day to day',
    permissions: PERMISSION_KEYS.filter(
      (k) => k !== 'roles.manage' && k !== 'users.manage' && k !== 'settings.manage',
    ),
  },
  Salesman: {
    description: 'Handles orders',
    permissions: [
      'products.view',
      'orders.view',
      'orders.update_status',
      'orders.add_note',
      'customers.view',
    ],
  },
};

export function hasPermission(
  granted: readonly string[],
  required: PermissionKey,
  isSuperAdmin = false,
): boolean {
  return isSuperAdmin || granted.includes(required);
}
