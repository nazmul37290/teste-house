'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { cardItem, trackEcommerce } from '@/lib/analytics';
import type { ProductCard } from '@/lib/storefront-types';

/**
 * Wraps a product grid: `view_item_list` once per list content, `select_item` when a product link
 * inside is clicked (one listener on the wrapper, so the cards stay server components).
 */
export function ItemListTracker({
  listName,
  products,
  className,
  children,
}: {
  listName: string;
  products: ProductCard[];
  className?: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const key = products.map((p) => p.id).join(',');
  const fired = useRef<string | null>(null);

  useEffect(() => {
    if (!products.length || fired.current === `${listName}|${key}`) return;
    fired.current = `${listName}|${key}`;
    trackEcommerce('view_item_list', {
      item_list_name: listName,
      items: products.map((p, i) => cardItem(p, listName, i)),
    });
    // Keyed on the list content, not on the array identity.
  }, [listName, key]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest('a[href^="/product/"]');
      if (!a) return;
      const slug = a.getAttribute('href')!.slice('/product/'.length);
      const index = products.findIndex((p) => p.slug === slug);
      if (index < 0) return;
      trackEcommerce('select_item', {
        item_list_name: listName,
        items: [cardItem(products[index]!, listName, index)],
      });
    };
    el.addEventListener('click', onClick);
    return () => el.removeEventListener('click', onClick);
  }, [listName, products]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
