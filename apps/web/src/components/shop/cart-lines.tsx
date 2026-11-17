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
    <ul className="divide-y divide-neutral-100">
      {cart.items.map((line) => (
        <li key={line.id} className="flex gap-3 py-3">
          <Link
            href={`/product/${line.productSlug}`}
            onClick={onNavigate}
            className="h-16 w-16 shrink-0 overflow-hidden rounded-md bg-neutral-100"
          >
            {line.image ? (
              <ShopImage image={line.image} sizes="64px" className="h-16 w-16 object-cover" />
            ) : null}
          </Link>
          <div className="min-w-0 flex-1">
            <Link
              href={`/product/${line.productSlug}`}
              onClick={onNavigate}
              className="line-clamp-2 text-sm font-medium text-neutral-900 hover:underline"
            >
              {line.productName}
            </Link>
            <p className="text-xs text-neutral-500">{line.variantName}</p>
            {line.problem ? (
              <p className="mt-1 text-xs font-medium text-red-700">{PROBLEM_TEXT[line.problem]}</p>
            ) : null}
            <div className="mt-2 flex items-center gap-3">
              <div className="flex items-center rounded-md border border-neutral-300">
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
                  className="px-2.5 py-1 text-sm disabled:opacity-40"
                >
                  −
                </button>
                <span className="min-w-8 text-center text-sm" aria-live="polite">
                  {line.quantity}
                </span>
                <button
                  type="button"
                  aria-label={`One more ${line.productName}`}
                  disabled={busy || line.quantity >= line.maxQuantity}
                  onClick={() => void change(() => cartApi.setQuantity(line.id, line.quantity + 1))}
                  className="px-2.5 py-1 text-sm disabled:opacity-40"
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
                className="text-xs text-neutral-500 underline hover:text-neutral-900"
              >
                Remove
              </button>
            </div>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium">{formatTaka(line.lineTotal)}</p>
            {line.quantity > 1 ? (
              <p className="text-xs text-neutral-500">{formatTaka(line.unitPrice)} each</p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
