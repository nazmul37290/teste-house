'use client';

import Link from 'next/link';
import { cartLineItem, trackEcommerce } from '@/lib/analytics';
import { cartApi, PROBLEM_TEXT, type Cart } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import { ShopImage } from './shop-image';

/** Cart lines with quantity buttons and remove; shared by the drawer and the cart page. */
export function CartLines({
  cart,
  change,
  busy = false,
  onNavigate,
}: {
  cart: Cart;
  change: (action: () => Promise<Cart>) => Promise<void>;
  busy?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <ul className="divide-y divide-line">
      {cart.items.map((line) => (
        <li key={line.id} className="flex gap-3 py-4">
          <Link
            href={`/product/${line.productSlug}`}
            onClick={onNavigate}
            className="size-18 shrink-0 overflow-hidden rounded-control border border-line bg-surface"
          >
            {line.image ? (
              <ShopImage image={line.image} sizes="72px" className="size-18 object-cover" />
            ) : null}
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/product/${line.productSlug}`}
              onClick={onNavigate}
              className="line-clamp-2 text-[15px] font-semibold leading-snug text-ink hover:text-petrol"
            >
              {line.productName}
            </Link>
            <p className="text-[13px] text-ink-muted">{line.variantName}</p>
            {line.problem ? (
              <p className="mt-1 text-[13px] font-semibold text-danger">
                {PROBLEM_TEXT[line.problem]}
              </p>
            ) : null}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex h-8 items-center rounded-control border border-line bg-surface">
                <button
                  type="button"
                  aria-label={`One less ${line.productName}`}
                  disabled={busy || line.quantity <= 1}
                  onClick={() =>
                    void change(async () => {
                      const next = await cartApi.setQuantity(line.id, line.quantity - 1);
                      trackEcommerce('remove_from_cart', { items: [cartLineItem(line, 1)] });
                      return next;
                    })
                  }
                  className="h-full px-2.5 text-base text-petrol hover:bg-neutral-50 disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-sm font-semibold" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`One more ${line.productName}`}
                  disabled={busy || line.quantity >= line.maxQuantity}
                  onClick={() => void change(() => cartApi.setQuantity(line.id, line.quantity + 1))}
                  className="h-full px-2.5 text-base text-petrol hover:bg-neutral-50 disabled:opacity-40"
                >
                  +
                </button>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  void change(async () => {
                    const next = await cartApi.remove(line.id);
                    trackEcommerce('remove_from_cart', { items: [cartLineItem(line)] });
                    return next;
                  })
                }
                className="text-[13px] text-ink-muted underline-offset-2 hover:text-danger hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold text-ink">{formatTaka(line.lineTotal)}</p>
            {line.quantity > 1 ? (
              <p className="text-xs text-ink-muted">{formatTaka(line.unitPrice)} each</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
