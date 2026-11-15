import type { ReactNode } from 'react';
import { NavLinks } from '@/components/admin/nav-links';
import { AdminSignOutButton } from '@/components/admin/sign-out-button';
import { visibleNav } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import { storeName } from '@/lib/api-server';

/** Admin shell: checks the session server-side (the proxy only saw a cookie) and filters the menu. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = (await adminForPage())!;
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-neutral-200 bg-white p-4">
        <div className="mb-6 px-3">
          <p className="text-sm font-semibold text-neutral-900">{await storeName()}</p>
          <p className="text-xs text-neutral-500">Admin</p>
        </div>
        <NavLinks items={visibleNav(admin)} />
        <div className="mt-auto space-y-3 border-t border-neutral-200 pt-4">
          <div className="px-3">
            <p className="truncate text-sm font-medium text-neutral-900">{admin.name}</p>
            <p className="truncate text-xs text-neutral-500">{admin.role.name}</p>
          </div>
          <AdminSignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-8">{children}</main>
    </div>
  );
}
