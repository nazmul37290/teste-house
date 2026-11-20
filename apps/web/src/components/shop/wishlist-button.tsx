'use client';

import { useState } from 'react';
import type { AnalyticsItem } from '@shop/shared';
import { trackEcommerce } from '@/lib/analytics';
import { useWishlist } from '@/lib/wishlist-client';
import { toast } from '@/components/toast';

/** Heart toggle for one product (cards and the product page). */
export function WishlistButton({
  productId,
  name,
  variant = 'icon',
  item,
}: {
  productId: string;
  name: string;
  variant?: 'icon' | 'text';
  /** For the add_to_wishlist event. */
  item?: AnalyticsItem;
}) {
  const { ids, toggle } = useWishlist();
  const [busy, setBusy] = useState(false);
  const saved = ids.includes(productId);
  const label = saved ? `Remove ${name} from wishlist` : `Save ${name} to wishlist`;

  async function onClick() {
    setBusy(true);
    try {
      const adding = !saved;
      await toggle(productId);
      if (adding && item) trackEcommerce('add_to_wishlist', { items: [item] });
      toast(adding ? 'Saved to your wishlist' : 'Removed from your wishlist', 'info');
    } catch {
      toast('Could not update your wishlist. Try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const heart = (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path
        d="M12 21s-7.5-4.6-9.5-9.2C1.2 8.6 3.3 5 6.8 5c2 0 3.4 1.1 4.2 2.4C11.8 6.1 13.2 5 15.2 5c3.5 0 5.6 3.6 4.3 6.8C19.5 16.4 12 21 12 21z"
        fill={saved ? 'var(--color-danger)' : 'none'}
        stroke={saved ? 'var(--color-danger)' : 'currentColor'}
        strokeWidth="1.8"
      />
    </svg>
  );

  if (variant === 'text') {
    return (
      <button
        type="button"
        onClick={() => void onClick()}
        disabled={busy}
        aria-pressed={saved}
        className="inline-flex h-10 items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:bg-neutral-50 disabled:opacity-50"
      >
        {heart}
        {saved ? 'Saved to wishlist' : 'Save to wishlist'}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      aria-pressed={saved}
      aria-label={label}
      title={label}
      className="rounded-full border border-line bg-surface/95 p-1.5 text-ink-muted transition-colors hover:text-danger disabled:opacity-50"
    >
      {heart}
    </button>
  );
}
