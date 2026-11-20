'use client';

import { useRef, useState } from 'react';
import { ShopImage } from '@/components/shop/shop-image';
import type { ShopImage as ImageData } from '@/lib/storefront-types';

/** Swipe between images (scroll snap); thumbnails jump to one and follow the swipe. */
export function Gallery({ images, name }: { images: ImageData[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const row = useRef<HTMLDivElement>(null);
  if (!images.length)
    return (
      <div
        className="aspect-square w-full rounded-feature border border-line bg-surface"
        role="img"
        aria-label={name}
      />
    );

  const go = (i: number) => {
    const el = row.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduce ? 'auto' : 'smooth' });
    setCurrent(i);
  };

  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-feature border border-line bg-surface">
        <div
          ref={row}
          className="snap-row auto-cols-[100%]"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(el.scrollLeft / el.clientWidth);
            if (i !== current) setCurrent(i);
          }}
          aria-label={`${name} images`}
        >
          {images.map((img, i) => (
            <div key={img.urls['200']} className="min-w-0">
              {/* The first image is the page's main (LCP) image. */}
              <ShopImage
                image={img}
                sizes="(min-width: 1024px) 560px, 100vw"
                priority={i === 0}
                className="aspect-square w-full object-contain"
              />
            </div>
          ))}
        </div>
        {images.length > 1 ? (
          <span className="absolute bottom-3 right-3 rounded-full bg-petrol/80 px-2.5 py-0.5 text-xs font-semibold text-white sm:hidden">
            {current + 1} / {images.length}
          </span>
        ) : null}
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, i) => (
            <li key={img.urls['200']} className="shrink-0">
              <button
                type="button"
                onClick={() => go(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === current}
                className={`block overflow-hidden rounded-control border-2 bg-surface transition-colors ${i === current ? 'border-petrol' : 'border-line hover:border-neutral-300'}`}
              >
                <ShopImage image={img} sizes="72px" className="size-16 object-cover sm:size-18" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
