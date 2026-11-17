'use client';

import { moneyToNumber } from '@shop/shared';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { cartLineItem, trackEcommerce } from '@/lib/analytics';
import { CartLines } from '@/components/shop/cart-lines';
import { useCart } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';

export function CartPageView() {
  const { cart, error, change } = useCart();
  const tracked = useRef(false);
  useEffect(() => {
    if (tracked.current || !cart?.items.length) return;
    tracked.current = true;
    trackEcommerce('view_cart', {
      items: cart.items.map((l) => cartLineItem(l)),
      value: moneyToNumber(cart.subtotal),
    });
  }, [cart]);

  if (!cart) {
    return <p className="mt-6 text-sm text-neutral-500">{error ?? 'Loading your cart…'}</p>;
  }
  if (cart.items.length === 0) {
    return (
      <div className="mt-6 rounded-lg border border-neutral-200 p-8 text-center">
        <p className="text-neutral-600">Your cart is empty.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium underline">
          Continue shopping
        </Link>
      </div>
    );
  }
  return (
    <div className="mt-6 grid gap-6 md:grid-cols-[1fr_16rem]">
      <div className="min-w-0 rounded-lg border border-neutral-200 px-4">
        {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
        <CartLines cart={cart} change={change} />
      </div>
      <aside className="h-fit space-y-3 rounded-lg border border-neutral-200 p-4">
        <div className="flex justify-between text-sm">
          <span>Subtotal ({cart.itemCount} items)</span>
          <span className="font-semibold">{formatTaka(cart.subtotal)}</span>
        </div>
        <p className="text-xs text-neutral-500">
          Delivery charge and any coupon are added at checkout.
        </p>
        {cart.hasProblems ? (
          <p className="text-xs font-medium text-red-700">
            Fix the items marked in red to continue.
          </p>
        ) : (
          <Link
            href="/checkout"
            className="block rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white"
          >
            Go to checkout
          </Link>
        )}
        <Link href="/" className="block text-center text-sm underline">
          Continue shopping
        </Link>
      </aside>
    </div>
  );
}
