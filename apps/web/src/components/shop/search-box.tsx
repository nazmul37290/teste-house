'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';

type Suggestion = { slug: string; name: string };

/** Search with suggestions (from 2 characters, debounced). Works as a plain GET form without JS. */
export function SearchBox({ initial = '' }: { initial?: string }) {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState(initial);
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setItems([]);
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/v1/search/suggest?${new URLSearchParams({ q: term })}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : { data: [] }))
        .then((body: { data: Suggestion[] }) => {
          setItems(body.data ?? []);
          setActive(-1);
        })
        .catch(() => undefined);
    }, 200);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setOpen(false);
    if (active >= 0 && items[active]) return router.push(`/product/${items[active].slug}`);
    if (q.trim()) router.push(`/search?${new URLSearchParams({ q: q.trim() })}`);
  }

  function onKey(e: KeyboardEvent<HTMLInputElement>) {
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(-1, a - 1));
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const showList = open && items.length > 0;
  return (
    <form ref={box} role="search" action="/search" onSubmit={onSubmit} className="relative w-full">
      <label htmlFor={`${listId}-q`} className="sr-only">
        Search products
      </label>
      <input
        id={`${listId}-q`}
        name="q"
        type="search"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKey}
        placeholder="Search honey, tea, dates…"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${listId}-list`}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        className="w-full rounded-full border border-neutral-300 bg-neutral-50 px-4 py-2 text-sm focus:border-neutral-900 focus:bg-white focus:outline-none"
      />
      {showList ? (
        <ul
          id={`${listId}-list`}
          role="listbox"
          className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-neutral-200 bg-white shadow-lg"
        >
          {items.map((s, i) => (
            <li key={s.slug} id={`${listId}-${i}`} role="option" aria-selected={i === active}>
              <a
                href={`/product/${s.slug}`}
                className={`block px-4 py-2 text-sm ${i === active ? 'bg-neutral-100' : 'hover:bg-neutral-50'}`}
                onClick={() => setOpen(false)}
              >
                {s.name}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}
