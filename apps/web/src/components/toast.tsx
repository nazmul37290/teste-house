'use client';

import { useEffect, useState } from 'react';

/**
 * Tiny toast system (no dependency). Call `toast('Added to cart')` from any client code; the
 * <Toaster /> in the root layout shows it in a polite live region for a few seconds.
 */
type Tone = 'success' | 'error' | 'info';
type Toast = { id: number; text: string; tone: Tone };

const EVENT = 'th:toast';
let seq = 0;

export function toast(text: string, tone: Tone = 'success') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, text, tone } }));
}

export function Toaster() {
  const [items, setItems] = useState<Toast[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail;
      setItems((list) => [...list.slice(-2), t]);
      window.setTimeout(() => setItems((list) => list.filter((x) => x.id !== t.id)), 3500);
    };
    window.addEventListener(EVENT, onToast);
    return () => window.removeEventListener(EVENT, onToast);
  }, []);

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:items-end sm:px-6"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role={t.tone === 'error' ? 'alert' : 'status'}
          className="toast-in pointer-events-auto flex max-w-sm items-center gap-3 rounded-card bg-petrol px-4 py-3 text-sm font-medium text-white shadow-raised"
        >
          <span
            aria-hidden
            className={
              t.tone === 'error'
                ? 'size-2 shrink-0 rounded-full bg-[#ff8a80]'
                : t.tone === 'info'
                  ? 'size-2 shrink-0 rounded-full bg-white/70'
                  : 'size-2 shrink-0 rounded-full bg-haldi'
            }
          />
          {t.text}
          <button
            type="button"
            onClick={() => setItems((list) => list.filter((x) => x.id !== t.id))}
            className="-mr-1 ml-auto rounded px-1 text-white/70 hover:text-white"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
