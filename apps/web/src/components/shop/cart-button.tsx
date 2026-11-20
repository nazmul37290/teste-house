'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { moneyToNumber } from '@shop/shared';
import { buttonClass } from '@/components/ui';
import { cartLineItem, trackEcommerce } from '@/lib/analytics';
import { onCartOpen, useCart } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import { CartLines } from './cart-lines';
import { BagIcon, CloseIcon } from './icons';

/** Header cart button with item count; opens a drawer (CHK-1). */
export function CartButton() {
  const { cart, error, change } = useCart();
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();

  useEffect(() => onCartOpen(() => setOpen(true)), []);
  // view_cart each time the drawer opens with something in it.
  useEffect(() => {
    if (open && cart?.items.length) {
      trackEcommerce('view_cart', {
        items: cart.items.map((l) => cartLineItem(l)),
        value: moneyToNumber(cart.subtotal),
      });
    }
    // Only on opening, not on every cart change while open.
  }, [open]);
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
        className="relative flex shrink-0 flex-col items-center gap-0.5 rounded-control px-2 py-1 text-[11px] font-semibold text-ink-muted transition-colors hover:text-petrol sm:flex-row sm:gap-1.5 sm:text-sm"
        aria-label={`Cart, ${count} ${count === 1 ? 'item' : 'items'}`}
      >
        <span className="relative sm:mr-1">
          <BagIcon />
          {count > 0 ? (
            <span className="absolute -right-2 -top-1.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-haldi px-1 text-[11px] font-bold leading-none text-petrol ring-2 ring-surface">
              {count}
            </span>
          ) : null}
        </span>
        Cart
      </button>
      <dialog
        ref={dialog}
        onClose={() => setOpen(false)}
        onClick={(e) => {
          if (e.target === dialog.current) setOpen(false); // click on the backdrop
        }}
        className="drawer-in m-0 ml-auto h-dvh max-h-dvh w-full max-w-md bg-surface p-0 text-ink shadow-raised backdrop:bg-petrol/45"
        aria-label="Shopping cart"
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-line px-5 py-4">
            <h2 className="font-display text-xl text-petrol">
              Your cart
              {count > 0 ? (
                <span className="ml-2 font-sans text-base text-ink-muted">({count})</span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close cart"
              className="rounded-full p-2 text-ink-muted transition-colors hover:bg-neutral-100 hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-5">
            {error ? <p className="mt-3 text-sm text-danger">{error}</p> : null}
            {cart && cart.items.length > 0 ? (
              <CartLines cart={cart} change={change} onNavigate={() => setOpen(false)} />
            ) : (
              <div className="flex flex-col items-center py-16 text-center">
                {cart ? (
                  <>
                    <span className="flex size-14 items-center justify-center rounded-full bg-petrol-tint text-petrol">
                      <BagIcon className="size-6" />
                    </span>
                    <p className="mt-4 font-semibold">Your cart is empty</p>
                    <p className="mt-1 text-sm text-ink-muted">
                      Add something from the shop and it will wait here.
                    </p>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className={buttonClass('secondary', 'md', 'mt-5')}
                    >
                      Keep shopping
                    </button>
                  </>
                ) : (
                  <p className="text-sm text-ink-muted">Loading your cart…</p>
                )}
              </div>
            )}
          </div>
          {cart && cart.items.length > 0 ? (
            <div className="space-y-3 border-t border-line bg-rice px-5 py-4">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">Subtotal</span>
                <span className="text-lg font-bold text-petrol">{formatTaka(cart.subtotal)}</span>
              </div>
              <p className="text-[13px] text-ink-muted">
                Delivery and any coupon are added at checkout.
              </p>
              <div className="flex gap-2">
                <Link href="/cart" className={buttonClass('secondary', 'lg', 'flex-1')}>
                  View cart
                </Link>
                {cart.hasProblems ? (
                  <span aria-disabled className={buttonClass('primary', 'lg', 'flex-1')}>
                    Checkout
                  </span>
                ) : (
                  <Link href="/checkout" className={buttonClass('primary', 'lg', 'flex-1')}>
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
