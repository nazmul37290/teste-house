'use client';

import type { StoreMode } from '@shop/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { cx } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';

const LABEL: Record<StoreMode, string> = { live: 'Live', maintenance: 'Maintenance' };
const HINT: Record<StoreMode, string> = {
  live: 'Shoppers can browse and order.',
  maintenance: 'Shoppers see a “back soon” page and cannot order. Admins still see the shop.',
};

function Dot({ mode }: { mode: StoreMode }) {
  return (
    <span
      aria-hidden
      className={cx(
        'size-2.5 shrink-0 rounded-full',
        mode === 'live' ? 'bg-success' : 'bg-warning ring-2 ring-warning/30',
      )}
    />
  );
}

/**
 * Shop status in the admin sidebar: a drop-down to switch between live and maintenance
 * (settings.manage; PUT /admin/settings, audited). Without that permission it only shows the status.
 */
export function StoreModeSwitch({ mode, canChange }: { mode: StoreMode; canChange: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = useState(mode);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => setCurrent(mode), [mode]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !box.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  async function choose(next: StoreMode) {
    setOpen(false);
    if (next === current) return;
    if (
      next === 'maintenance' &&
      !window.confirm(
        'Close the shop for maintenance? Shoppers will not be able to order until you switch it back to live.',
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await api('/admin/settings', { method: 'PUT', body: { 'store.mode': next } });
      setCurrent(next);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not change the shop status');
    } finally {
      setBusy(false);
    }
  }

  const pill = (
    <>
      <Dot mode={current} />
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-[11px] leading-tight text-ink-muted">Shop status</span>
        <span className="block font-semibold leading-tight text-ink">
          {busy ? 'Saving…' : LABEL[current]}
        </span>
      </span>
    </>
  );

  if (!canChange)
    return (
      <div className="flex items-center gap-2.5 rounded-control border border-line px-3 py-2 text-sm">
        {pill}
      </div>
    );

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={busy}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex w-full items-center gap-2.5 rounded-control border px-3 py-2 text-sm transition-colors',
          current === 'maintenance'
            ? 'border-warning/40 bg-warning-soft hover:border-warning'
            : 'border-line hover:bg-neutral-50',
        )}
      >
        {pill}
        <svg
          viewBox="0 0 12 12"
          aria-hidden
          className="size-3 text-ink-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M2.5 4.5L6 8l3.5-3.5" />
        </svg>
      </button>
      {open ? (
        <ul
          role="listbox"
          aria-label="Shop status"
          className="absolute inset-x-0 top-full z-40 mt-1 overflow-hidden rounded-control border border-line bg-surface shadow-raised"
        >
          {(['live', 'maintenance'] as const).map((m) => (
            <li key={m} role="option" aria-selected={m === current}>
              <button
                type="button"
                onClick={() => choose(m)}
                className={cx(
                  'flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm hover:bg-neutral-50',
                  m === current && 'bg-petrol-tint',
                )}
              >
                <span className="mt-1.5">
                  <Dot mode={m} />
                </span>
                <span>
                  <span className="block font-semibold text-ink">{LABEL[m]}</span>
                  <span className="block text-[12px] leading-snug text-ink-muted">{HINT[m]}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {error ? <p className="mt-1 text-[12px] text-danger">{error}</p> : null}
    </div>
  );
}
