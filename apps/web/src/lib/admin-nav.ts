import { hasPermission, type PermissionKey } from '@shop/shared';
import type { AdminMe } from './api-server';

export type NavItem = { href: string; label: string; permission?: PermissionKey };

/** Admin menu. Later phases add their modules here (products, orders, ...). */
export const ADMIN_NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/categories', label: 'Categories', permission: 'categories.manage' },
  { href: '/admin/brands', label: 'Brands and tags', permission: 'brands.manage' },
  { href: '/admin/attributes', label: 'Attributes', permission: 'categories.manage' },
  { href: '/admin/media', label: 'Media', permission: 'media.upload' },
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
