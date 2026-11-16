'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { onCartOpen, useCart } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import { CartLines } from './cart-lines';

/** Header cart button with item count; opens a drawer (CHK-1). */
export function CartButton() {
  const { cart, error, change } = useCart();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => onCartOpen(() => setOpen(true)), []);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const count = cart?.itemCount ?? 0;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative shrink-0 rounded-md px-2 py-1 text-sm font-medium text-neutral-700 hover:text-neutral-900"
        aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        Cart
        {count > 0 ? (
          <span className="ml-1 inline-flex min-w-5 items-center justify-center rounded-full bg-neutral-900 px-1.5 text-xs text-white">
            {count}
          </span>
        ) : null}
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false); // click on the backdrop
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-white p-0 backdrop:bg-black/40"
        aria-label="Shopping cart"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <h2 className="text-base font-semibold">Your cart</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-sm text-neutral-600 hover:text-neutral-900"
            >
              Close
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-4">
            {error ? <p className="mt-3 text-sm text-red-700">{error}</p> : null}
            {cart && cart.items.length > 0 ? (
              <CartLines cart={cart} change={change} onNavigate={() => setOpen(false)} />
            ) : (
              <p className="py-10 text-center text-sm text-neutral-500">
                {cart ? 'Your cart is empty.' : 'Loading…'}
              </p>
            )}
          </div>
          {cart && cart.items.length > 0 ? (
            <div className="space-y-3 border-t border-neutral-200 px-4 py-4">
              <div className="flex justify-between text-sm">
                <span>Subtotal</span>
                <span className="font-semibold">{formatTaka(cart.subtotal)}</span>
              </div>
              <p className="text-xs text-neutral-500">
                Delivery and any coupon are added at checkout.
              </p>
              <div className="flex gap-2">
                <Link
                  href="/cart"
                  className="flex-1 rounded-md border border-neutral-300 px-4 py-2.5 text-center text-sm font-medium"
                >
                  View cart
                </Link>
                {cart.hasProblems ? (
                  <span className="flex-1 cursor-not-allowed rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white opacity-50">
                    Checkout
                  </span>
                ) : (
                  <Link
                    href="/checkout"
                    className="flex-1 rounded-md bg-neutral-900 px-4 py-2.5 text-center text-sm font-medium text-white"
                  >
                    Checkout
                  </Link>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
