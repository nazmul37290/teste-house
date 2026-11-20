'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { CloseIcon, FilterIcon } from './icons';

/** Phones: the filter form in a bottom-up sheet behind a "Filters" button. */
export function FilterDrawer({ active, children }: { active: number; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink hover:bg-neutral-50"
      >
        <FilterIcon className="size-4" />
        Filters
        {active > 0 ? (
          <span className="inline-flex size-5 items-center justify-center rounded-full bg-petrol text-xs text-white">
            {active}
          </span>
        ) : null}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false);
        }}
        aria-label="Filters"
        className="sheet-in mx-0 mb-0 mt-auto max-h-[85dvh] w-full max-w-none rounded-t-feature bg-surface p-0 text-ink backdrop:bg-petrol/45"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <h2 className="font-display text-xl text-petrol">Filters</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close filters"
            className="rounded-full p-2 text-ink-muted hover:bg-neutral-100"
          >
            <CloseIcon />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </dialog>
    </>
  );
}
