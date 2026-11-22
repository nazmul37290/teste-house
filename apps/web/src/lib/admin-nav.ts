import { hasPermission, type PermissionKey } from '@shop/shared';
import type { AdminMe } from './api-server';

export type NavItem = { href: string; label: string; permission?: PermissionKey };
export type NavGroup = { id: string; label: string; items: NavItem[] };

/**
 * Admin menu in groups, by the job being done. Dashboard stands alone at the top and "My security"
 * sits with the account at the bottom of the sidebar.
 */
export const DASHBOARD_ITEM: NavItem = { href: '/admin', label: 'Dashboard' };
export const SECURITY_ITEM: NavItem = { href: '/admin/security', label: 'My security' };

export const ADMIN_NAV_GROUPS: NavGroup[] = [
  {
    id: 'sales',
    label: 'Sales',
    items: [
      { href: '/admin/orders', label: 'Orders', permission: 'orders.view' },
      { href: '/admin/payments', label: 'Payments', permission: 'orders.view' },
      { href: '/admin/coupons', label: 'Coupons', permission: 'coupons.manage' },
      { href: '/admin/reviews', label: 'Reviews', permission: 'reviews.moderate' },
    ],
  },
  {
    id: 'catalog',
    label: 'Catalog',
    items: [
      { href: '/admin/products', label: 'Products', permission: 'products.view' },
      { href: '/admin/inventory', label: 'Inventory', permission: 'inventory.view' },
      { href: '/admin/categories', label: 'Categories', permission: 'categories.manage' },
      { href: '/admin/brands', label: 'Brands and tags', permission: 'brands.manage' },
      { href: '/admin/attributes', label: 'Attributes', permission: 'categories.manage' },
      { href: '/admin/media', label: 'Media', permission: 'media.upload' },
    ],
  },
  {
    id: 'storefront',
    label: 'Storefront',
    items: [
      { href: '/admin/banners', label: 'Banners', permission: 'marketing.manage' },
      { href: '/admin/homepage', label: 'Homepage', permission: 'marketing.manage' },
      { href: '/admin/pages', label: 'Policy pages', permission: 'settings.manage' },
    ],
  },
  {
    id: 'setup',
    label: 'Store setup',
    items: [
      { href: '/admin/shipping', label: 'Delivery zones', permission: 'shipping.manage' },
      { href: '/admin/payment-methods', label: 'Payment methods', permission: 'payments.toggle' },
      { href: '/admin/settings', label: 'Settings', permission: 'settings.manage' },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    items: [
      { href: '/admin/staff', label: 'Staff', permission: 'users.manage' },
      { href: '/admin/roles', label: 'Roles', permission: 'roles.manage' },
    ],
  },
];

/** Hides what the admin cannot open. Only cosmetic: the API checks every request. */
export function can(admin: AdminMe, permission?: PermissionKey): boolean {
  return !permission || hasPermission(admin.permissions, permission, admin.role.isSystem);
}

/** The groups and links this admin may open; empty groups are left out. */
export const visibleNavGroups = (admin: AdminMe): NavGroup[] =>
  ADMIN_NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => can(admin, i.permission)),
  })).filter((g) => g.items.length > 0);
