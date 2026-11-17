import { hasPermission, type PermissionKey } from '@shop/shared';
import type { AdminMe } from './api-server';

export type NavItem = { href: string; label: string; permission?: PermissionKey };

/** Admin menu. Later phases add their modules here (products, orders, ...). */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/orders', label: 'Orders', permission: 'orders.view' },
  { href: '/admin/products', label: 'Products', permission: 'products.view' },
  { href: '/admin/inventory', label: 'Inventory', permission: 'inventory.view' },
  { href: '/admin/categories', label: 'Categories', permission: 'categories.manage' },
  { href: '/admin/brands', label: 'Brands and tags', permission: 'brands.manage' },
  { href: '/admin/attributes', label: 'Attributes', permission: 'categories.manage' },
  { href: '/admin/media', label: 'Media', permission: 'media.upload' },
  { href: '/admin/banners', label: 'Banners', permission: 'marketing.manage' },
  { href: '/admin/homepage', label: 'Homepage', permission: 'marketing.manage' },
  { href: '/admin/coupons', label: 'Coupons', permission: 'coupons.manage' },
  { href: '/admin/shipping', label: 'Delivery zones', permission: 'shipping.manage' },
  { href: '/admin/payments', label: 'Payments', permission: 'orders.view' },
  { href: '/admin/payment-methods', label: 'Payment methods', permission: 'payments.toggle' },
  { href: '/admin/staff', label: 'Staff', permission: 'users.manage' },
  { href: '/admin/roles', label: 'Roles', permission: 'roles.manage' },
  { href: '/admin/settings', label: 'Settings', permission: 'settings.manage' },
  { href: '/admin/security', label: 'My security' },
];

/** Hides what the admin cannot open. Only cosmetic: the API checks every request. */
export function can(admin: AdminMe, permission?: PermissionKey): boolean {
  return !permission || hasPermission(admin.permissions, permission, admin.role.isSystem);
}

export const visibleNav = (admin: AdminMe) =>
  ADMIN_NAV.filter((item) => can(admin, item.permission));
