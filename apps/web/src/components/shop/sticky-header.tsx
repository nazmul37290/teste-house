'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/** Sticky header that gains its shadow only once the page has scrolled under it. */
export function StickyHeader({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => el.toggleAttribute('data-scrolled', window.scrollY > 8);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <header
      ref={ref}
      className="sticky top-0 z-30 border-b border-line bg-surface transition-shadow duration-200 data-[scrolled]:shadow-raised"
    >
      {children}
    </header>
  );
}
