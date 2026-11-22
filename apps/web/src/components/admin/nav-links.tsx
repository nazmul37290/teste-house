'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { NavGroup, NavItem } from '@/lib/admin-nav';
import { cx } from '@/components/ui';

const OPEN_KEY = 'shop:admin-nav-open';

const isActive = (pathname: string, href: string) =>
  href === '/admin' ? pathname === '/admin' : pathname === href || pathname.startsWith(`${href}/`);

function ItemLink({
  item,
  pathname,
  indent,
}: {
  item: NavItem;
  pathname: string;
  indent?: boolean;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={cx(
        'block rounded-control py-1.5 pr-3 text-sm',
        indent ? 'pl-6' : 'pl-3',
        active ? 'bg-petrol font-semibold text-white' : 'text-neutral-700 hover:bg-neutral-100',
      )}
    >
      {item.label}
    </Link>
  );
}

/**
 * The admin menu: Dashboard, then folding groups (Sales, Catalog, ...). The group holding the
 * current page is always open; which other groups are open is remembered in this browser.
 */
export function NavLinks({ top, groups }: { top: NavItem[]; groups: NavGroup[] }) {
  const pathname = usePathname();
  const current = groups.find((g) => g.items.some((i) => isActive(pathname, i.href)))?.id;
  const [open, setOpen] = useState<string[]>([]);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(OPEN_KEY) ?? '[]') as unknown;
      if (Array.isArray(saved)) setOpen(saved.filter((v): v is string => typeof v === 'string'));
    } catch {
      // No storage: groups start folded.
    }
  }, []);

  const toggle = (id: string) =>
    setOpen((list) => {
      const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        // Not remembered; still works for this page.
      }
      return next;
    });

  return (
    <nav aria-label="Admin" className="flex flex-col gap-1">
      {top.map((item) => (
        <ItemLink key={item.href} item={item} pathname={pathname} />
      ))}
      {groups.map((g) => {
        const expanded = g.id === current || open.includes(g.id);
        const listId = `nav-${g.id}`;
        return (
          <div key={g.id} className="mt-1">
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              onClick={() => toggle(g.id)}
              disabled={g.id === current}
              className="flex w-full items-center justify-between rounded-control px-3 py-1.5 text-left text-[13px] font-semibold text-ink-muted hover:bg-neutral-100 hover:text-ink disabled:cursor-default disabled:text-petrol disabled:hover:bg-transparent"
            >
              {g.label}
              <svg
                viewBox="0 0 12 12"
                aria-hidden
                className={cx('size-3 transition-transform', expanded && 'rotate-90')}
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 2.5L8 6l-3.5 3.5" />
              </svg>
            </button>
            <ul id={listId} hidden={!expanded} className="mt-0.5 space-y-0.5">
              {g.items.map((item) => (
                <li key={item.href}>
                  <ItemLink item={item} pathname={pathname} indent />
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}
