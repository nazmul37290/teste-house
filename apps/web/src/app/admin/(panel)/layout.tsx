import Link from 'next/link';
import type { ReactNode } from 'react';
import { NavLinks } from '@/components/admin/nav-links';
import { StoreModeSwitch } from '@/components/admin/store-mode-switch';
import { AdminSignOutButton } from '@/components/admin/sign-out-button';
import { DASHBOARD_ITEM, SECURITY_ITEM, can, visibleNavGroups } from '@/lib/admin-nav';
import { adminForPage } from '@/lib/admin-page';
import { getPublicSettings, getStoreModeFresh, storeName } from '@/lib/api-server';

/** Admin shell: checks the session server-side (the proxy only saw a cookie) and filters the menu. */
export default async function AdminPanelLayout({ children }: { children: ReactNode }) {
  const admin = (await adminForPage())!;
  const [settings, name, mode] = await Promise.all([
    getPublicSettings().catch(() => ({}) as Record<string, string | null>),
    storeName(),
    getStoreModeFresh(),
  ]);
  const logo = settings['store.logo'];
  const groups = visibleNavGroups(admin);
  const status = <StoreModeSwitch mode={mode} canChange={can(admin, 'settings.manage')} />;
  const nav = <NavLinks top={[DASHBOARD_ITEM]} groups={groups} />;
  const brand = (
    <Link href="/admin" className="block" aria-label={`${name} admin home`}>
      {logo ? (
        <img src={logo} alt={name} width={150} height={45} className="h-10 w-auto" />
      ) : (
        <span className="font-display text-lg text-petrol">{name}</span>
      )}
    </Link>
  );
  const who = (
    <div className="px-3">
      <p className="truncate text-sm font-semibold text-ink">{admin.name}</p>
      <p className="truncate text-xs text-ink-muted">{admin.role.name}</p>
    </div>
  );
  return (
    <div className="min-h-screen lg:flex">
      {/* Phones and tablets: a top bar with the menu folded away. */}
      <header className="sticky top-0 z-30 border-b border-line bg-surface lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
            {brand}
            <span className="rounded-control border border-line px-3 py-1.5 text-sm font-semibold text-petrol group-open:bg-petrol-tint">
              Menu
            </span>
          </summary>
          <div className="max-h-[75dvh] space-y-3 overflow-y-auto border-t border-line px-3 py-3">
            {status}
            {nav}
            <div className="space-y-3 border-t border-line pt-3">
              <NavLinks top={[SECURITY_ITEM]} groups={[]} />
              {who}
              <AdminSignOutButton />
            </div>
          </div>
        </details>
      </header>
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col overflow-y-auto border-r border-line bg-surface p-4 lg:flex">
        <div className="mb-4 px-3">
          {brand}
          <p className="mt-1 text-xs font-semibold text-ink-muted">Admin</p>
        </div>
        <div className="mb-4">{status}</div>
        {nav}
        <div className="mt-auto space-y-3 border-t border-line pt-4">
          <NavLinks top={[SECURITY_ITEM]} groups={[]} />
          {who}
          <AdminSignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
    </div>
  );
}
