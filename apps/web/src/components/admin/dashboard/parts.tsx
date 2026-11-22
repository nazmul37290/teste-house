import Link from 'next/link';
import type { ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Dashboard building blocks (server components). One data colour (petrol); text always in ink
 * tokens; states carry an icon and words, never colour alone.
 */

/** Signed change against the previous period. Up is good for every figure on this page. */
export function Delta({ value, days }: { value: number | null; days: number }) {
  if (value === null)
    return <span className="text-[13px] text-ink-muted">No earlier {days} days to compare</span>;
  const up = value > 0;
  const flat = value === 0;
  return (
    <span
      className={cx(
        'inline-flex items-center gap-1 text-[13px] font-semibold',
        flat ? 'text-ink-muted' : up ? 'text-success' : 'text-danger',
      )}
    >
      <svg viewBox="0 0 12 12" aria-hidden className="size-3" fill="currentColor">
        {flat ? (
          <rect x="1" y="5" width="10" height="2" rx="1" />
        ) : up ? (
          <path d="M6 2l4.5 6h-9z" />
        ) : (
          <path d="M6 10L1.5 4h9z" />
        )}
      </svg>
      {flat ? 'No change' : `${up ? '+' : ''}${value}%`}
      <span className="font-normal text-ink-muted">vs previous {days} days</span>
    </span>
  );
}

export function StatTile({
  label,
  value,
  children,
  hero = false,
}: {
  label: string;
  value: string;
  children?: ReactNode;
  hero?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-line bg-surface p-5">
      <p className="text-sm font-semibold text-ink-muted">{label}</p>
      {/* Proportional figures for standalone values; same sans as the rest of the page. */}
      <p
        className={cx(
          'font-sans font-bold leading-tight text-ink',
          hero ? 'text-[40px] sm:text-5xl' : 'text-[28px]',
        )}
      >
        {value}
      </p>
      <div className="mt-auto pt-1">{children}</div>
    </div>
  );
}

/**
 * Ranked bars, one per row, largest first: name, a thin bar on a shared scale and the figure. One
 * hue; every value is printed, so nothing hides behind a hover.
 */
export function BarList({
  rows,
  empty,
}: {
  rows: { key: string; label: ReactNode; value: number; figure: ReactNode; href?: string }[];
  empty: string;
}) {
  if (!rows.length) return <p className="py-6 text-center text-sm text-ink-muted">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="space-y-3">
      {rows.map((r) => {
        const body = (
          <>
            <span className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-ink">{r.label}</span>
              <span className="shrink-0 font-semibold text-ink tabular-nums">{r.figure}</span>
            </span>
            <span className="mt-1.5 block h-2 rounded-full bg-neutral-100">
              <span
                className="block h-2 rounded-full bg-petrol"
                style={{ width: `${Math.max((r.value / max) * 100, r.value ? 2 : 0)}%` }}
              />
            </span>
          </>
        );
        return (
          <li key={r.key}>
            {r.href ? (
              <Link href={r.href} className="block rounded-control hover:bg-neutral-50">
                {body}
              </Link>
            ) : (
              body
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** A "needs attention" item: count, words and where to go. Warning tone only when there is work. */
export function AttentionItem({
  count,
  label,
  href,
  icon,
  tone = 'warning',
}: {
  count: number;
  label: string;
  href: string;
  icon: ReactNode;
  tone?: 'warning' | 'danger';
}) {
  const busy = count > 0;
  return (
    <Link
      href={href}
      className={cx(
        'flex items-center gap-3 rounded-card border p-4 transition-colors',
        busy
          ? tone === 'danger'
            ? 'border-danger/30 bg-danger-soft hover:border-danger/60'
            : 'border-warning/30 bg-warning-soft hover:border-warning/60'
          : 'border-line bg-surface hover:bg-neutral-50',
      )}
    >
      <span
        className={cx(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          busy
            ? tone === 'danger'
              ? 'bg-danger text-white'
              : 'bg-warning text-white'
            : 'bg-success-soft text-success',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-2xl font-bold leading-none text-ink">{count}</span>
        <span className="mt-1 block text-sm text-ink-muted">{label}</span>
      </span>
    </Link>
  );
}

export function Panel({
  title,
  description,
  action,
  children,
  className,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cx(
        'flex min-w-0 flex-col rounded-card border border-line bg-surface p-5',
        className,
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-ink">{title}</h2>
          {description ? <p className="mt-0.5 text-[13px] text-ink-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
