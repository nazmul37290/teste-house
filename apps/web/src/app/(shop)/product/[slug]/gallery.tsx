'use client';

import { useState } from 'react';
import { ShopImage } from '@/components/shop/shop-image';
import type { ShopImage as ImageData } from '@/lib/storefront-types';

export function Gallery({ images, name }: { images: ImageData[]; name: string }) {
  const [current, setCurrent] = useState(0);
  const main = images[current];
  if (!main)
    return <div className="aspect-square w-full rounded-lg bg-neutral-100" aria-label={name} />;
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border border-neutral-200 bg-white">
        {/* The first image is the page's main (LCP) image. */}
        <ShopImage
          image={main}
          sizes="(min-width: 1024px) 560px, 100vw"
          priority={current === 0}
          className="aspect-square w-full object-contain"
        />
      </div>
      {images.length > 1 ? (
        <ul className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <li key={img.urls['200']} className="shrink-0">
              <button
                type="button"
                onClick={() => setCurrent(i)}
                aria-label={`Show image ${i + 1}`}
                aria-current={i === current}
                className={`block overflow-hidden rounded border-2 ${i === current ? 'border-neutral-900' : 'border-transparent'}`}
              >
                <ShopImage image={img} sizes="64px" className="h-16 w-16 object-cover" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
