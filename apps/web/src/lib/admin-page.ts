import 'server-only';
import type { PermissionKey } from '@shop/shared';
import { redirect } from 'next/navigation';
import { can } from './admin-nav';
import { getAdminMe, type AdminMe } from './api-server';

/**
 * For admin pages: the signed-in admin, or a redirect to the login page. With a permission, returns
 * null when the admin lacks it, so the page can show "no access" (the API would refuse anyway).
 */
export async function adminForPage(permission?: PermissionKey): Promise<AdminMe | null> {
  const admin = await getAdminMe();
  if (!admin) redirect('/admin/login');
  return can(admin, permission) ? admin : null;
}
