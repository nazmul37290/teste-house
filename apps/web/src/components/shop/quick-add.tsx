'use client';

import type { AnalyticsItem } from '@shop/shared';
import { useState } from 'react';
import { toast } from '@/components/toast';
import { trackEcommerce } from '@/lib/analytics';
import { cartApi, cartErrorText } from '@/lib/cart-client';
import { BagIcon, CheckIcon } from './icons';

/** One-tap add for single-variant products on cards. Confirms with a toast, not the drawer. */
export function QuickAdd({
  variantId,
  name,
  item,
}: {
  variantId: string;
  name: string;
  item: AnalyticsItem;
}) {
  const [state, setState] = useState<'idle' | 'busy' | 'done'>('idle');

  async function add() {
    setState('busy');
    try {
      await cartApi.add(variantId, 1);
      trackEcommerce('add_to_cart', { items: [{ ...item, quantity: 1 }] });
      setState('done');
      toast(`${name} added to your cart`);
      window.setTimeout(() => setState('idle'), 1600);
    } catch (err) {
      setState('idle');
      toast(cartErrorText(err), 'error');
    }
  }

  return (
    <button
      type="button"
      onClick={() => void add()}
      disabled={state === 'busy'}
      aria-label={`Add ${name} to cart`}
      className="inline-flex h-9 items-center justify-center gap-1.5 rounded-control bg-petrol px-3 text-sm font-semibold text-white transition-colors hover:bg-petrol-soft disabled:opacity-60"
    >
      {state === 'done' ? <CheckIcon className="size-4" /> : <BagIcon className="size-4" />}
      {state === 'done' ? 'Added' : 'Add'}
    </button>
  );
}
