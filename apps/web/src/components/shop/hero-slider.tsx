'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Chevron } from '@/components/carousel';
import { cx } from '@/components/ui';
import type { HeroBanner } from '@/lib/storefront-types';
import { ShopImage } from './shop-image';

const INTERVAL_MS = 6000;

/**
 * The home hero: admin banners at "Home hero" in a slider. Swipe on phones, arrows and dots on
 * wider screens. It moves on its own every few seconds, but stops while the pointer or keyboard
 * focus is on it, when the tab is hidden, after the shopper pauses it, and never moves on its own
 * for people who ask for reduced motion. Frames have a fixed shape (8:3 wide, 1:1 with a mobile
 * image on phones) so banners of different sizes still line up.
 */
export function HeroSlider({ banners }: { banners: HeroBanner[] }) {
  const row = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false); // by the shopper (button)
  const [held, setHeld] = useState(false); // hover or focus inside
  const [reduced, setReduced] = useState(false);
  const count = banners.length;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const go = useCallback(
    (i: number) => {
      const el = row.current;
      if (!el || !count) return;
      const next = (i + count) % count;
      el.scrollTo({ left: next * el.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
      setIndex(next);
    },
    [count, reduced],
  );

  useEffect(() => {
    if (count < 2 || paused || held || reduced) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') go(index + 1);
    }, INTERVAL_MS);
    return () => window.clearInterval(t);
  }, [count, paused, held, reduced, index, go]);

  if (!count) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Offers"
      className="group relative overflow-hidden rounded-feature border border-line bg-surface"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocusCapture={() => setHeld(true)}
      onBlurCapture={() => setHeld(false)}
    >
      <div
        ref={row}
        className="snap-row auto-cols-[100%]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const i = Math.round(el.scrollLeft / el.clientWidth);
          if (i !== index) setIndex(i);
        }}
      >
        {banners.map((b, i) => (
          <div
            key={b.id}
            role="group"
            aria-roledescription="slide"
            aria-label={`${i + 1} of ${count}: ${b.title}`}
            aria-hidden={i !== index}
            className="min-w-0"
          >
            <Slide banner={b} priority={i === 0} focusable={i === index} />
          </div>
        ))}
      </div>

      {count > 1 ? (
        <>
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous offer"
            className="absolute left-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-petrol shadow-raised transition-opacity hover:bg-surface sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <Chevron dir="left" className="size-5" />
          </button>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next offer"
            className="absolute right-3 top-1/2 hidden size-10 -translate-y-1/2 items-center justify-center rounded-full bg-surface/90 text-petrol shadow-raised transition-opacity hover:bg-surface sm:flex sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
          >
            <Chevron dir="right" className="size-5" />
          </button>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-2">
            <div className="flex items-center gap-1.5 rounded-full bg-petrol/70 px-2.5 py-1.5 backdrop-blur">
              {banners.map((b, i) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Show offer ${i + 1}`}
                  aria-current={i === index}
                  className={cx(
                    'h-2 rounded-full transition-all duration-300',
                    i === index ? 'w-6 bg-haldi' : 'w-2 bg-white/60 hover:bg-white',
                  )}
                />
              ))}
              {!reduced ? (
                <button
                  type="button"
                  onClick={() => setPaused((p) => !p)}
                  aria-label={paused ? 'Play the offers' : 'Pause the offers'}
                  className="ml-1 flex size-5 items-center justify-center text-white/85 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" aria-hidden className="size-3.5" fill="currentColor">
                    {paused ? <path d="M8 5v14l11-7z" /> : <path d="M7 5h4v14H7zM13 5h4v14h-4z" />}
                  </svg>
                </button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Slide({
  banner,
  priority,
  focusable,
}: {
  banner: HeroBanner;
  priority: boolean;
  focusable: boolean;
}) {
  const img = (
    <>
      {banner.mobileImage ? (
        <span className="block sm:hidden">
          <ShopImage
            image={banner.mobileImage}
            aspect="natural"
            sizes="100vw"
            priority={priority}
            className="aspect-square w-full object-cover"
          />
        </span>
      ) : null}
      <span className={banner.mobileImage ? 'hidden sm:block' : 'block'}>
        <ShopImage
          image={banner.image}
          aspect="natural"
          sizes="(min-width: 1152px) 1152px, 100vw"
          priority={priority}
          className="aspect-[8/3] w-full object-cover"
        />
      </span>
    </>
  );
  if (!banner.linkUrl)
    return (
      <span role="img" aria-label={banner.title} className="block">
        {img}
      </span>
    );
  const common = { 'aria-label': banner.title, tabIndex: focusable ? 0 : -1, className: 'block' };
  return banner.linkUrl.startsWith('/') ? (
    <Link href={banner.linkUrl} {...common}>
      {img}
    </Link>
  ) : (
    <a href={banner.linkUrl} rel="noopener" {...common}>
      {img}
    </a>
  );
}
