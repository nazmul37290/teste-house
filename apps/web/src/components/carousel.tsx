'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/components/ui';

/**
 * Horizontal row with native scroll snap (swipe on phones, trackpad on desktop) and previous /
 * next buttons on wider screens. No autoplay: it moves only when the shopper moves it.
 * `itemClass` sets each slide's width, e.g. 'w-[46%] sm:w-[31%] lg:w-[23%]'.
 */
export function Carousel({
  label,
  children,
  itemClass,
  gapClass = 'gap-3 sm:gap-4',
  className,
}: {
  label: string;
  children: ReactNode[];
  itemClass: string;
  gapClass?: string;
  className?: string;
}) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });

  const update = useCallback(() => {
    const el = row.current;
    if (!el) return;
    setEdge({
      start: el.scrollLeft <= 4,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    update();
    const el = row.current;
    if (!el) return;
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [update]);

  const page = (dir: 1 | -1) => {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: reduce ? 'auto' : 'smooth' });
  };

  const arrow =
    'hidden size-9 items-center justify-center rounded-full border border-line bg-surface text-petrol transition-colors hover:bg-petrol hover:text-white disabled:pointer-events-none disabled:opacity-35 sm:inline-flex';

  return (
    <div
      className={cx('relative', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label={label}
    >
      {edge.start && edge.end ? null : (
        <div className="absolute -top-12 right-0 flex gap-2">
          <button
            type="button"
            className={arrow}
            disabled={edge.start}
            onClick={() => page(-1)}
            aria-label="Show previous"
          >
            <Chevron dir="left" />
          </button>
          <button
            type="button"
            className={arrow}
            disabled={edge.end}
            onClick={() => page(1)}
            aria-label="Show next"
          >
            <Chevron dir="right" />
          </button>
        </div>
      )}
      <div
        ref={row}
        onScroll={update}
        className={cx(
          'snap-row -mx-4 scroll-px-4 px-4 pb-1 sm:mx-0 sm:scroll-px-0 sm:px-0',
          gapClass,
        )}
      >
        {children.map((child, i) => (
          <div key={i} className={itemClass}>
            {child}
          </div>
        ))}
      </div>
    </div>
  );
}

export function Chevron({
  dir,
  className,
}: {
  dir: 'left' | 'right' | 'down';
  className?: string;
}) {
  const d = dir === 'left' ? 'M15 6l-6 6 6 6' : dir === 'right' ? 'M9 6l6 6-6 6' : 'M6 9l6 6 6-6';
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={cx('size-4', className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={d} />
    </svg>
  );
}
