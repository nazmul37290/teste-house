'use client';

import { analyticsItem, MAX_CART_LINE_QUANTITY } from '@shop/shared';
import { useEffect, useRef, useState } from 'react';
import { BagIcon } from '@/components/shop/icons';
import { Price } from '@/components/shop/bits';
import { buttonClass, cx } from '@/components/ui';
import { trackEcommerce } from '@/lib/analytics';
import { cartApi, cartErrorText, openCartDrawer } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import type { ProductVariant } from '@/lib/storefront-types';

/**
 * Variant choice, price, stock state and add to cart (disabled for sold-out variants, BRW-4).
 * Prices shown here are for display; the server calculates every order total itself.
 * On phones a bar with the price and the add button stays at the bottom once the main button
 * has scrolled away.
 */
export function BuyBox({
  variants,
  product,
}: {
  variants: ProductVariant[];
  /** For the add_to_cart event. */
  product: { name: string; brand: string | null; category: string | null };
}) {
  const firstInStock = variants.findIndex((v) => v.inStock);
  const [index, setIndex] = useState(firstInStock >= 0 ? firstInStock : 0);
  const v = variants[index]!;
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showBar, setShowBar] = useState(false);
  const mainButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const el = mainButton.current;
    if (!el) return;
    // Past the main button, and not over the footer at the end of the page.
    const onScroll = () =>
      setShowBar(
        el.getBoundingClientRect().bottom < 0 &&
          window.innerHeight + window.scrollY < document.documentElement.scrollHeight - 320,
      );
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      await cartApi.add(v.id, quantity);
      trackEcommerce('add_to_cart', {
        items: [
          analyticsItem({
            sku: v.sku,
            name: product.name,
            brand: product.brand,
            category: product.category,
            variant: v.name,
            price: v.price,
            quantity,
          }),
        ],
      });
      setQuantity(1);
      openCartDrawer();
    } catch (err) {
      setMessage(cartErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  const label = v.inStock ? (busy ? 'Adding…' : 'Add to cart') : 'Out of stock';

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <Price price={v.price} regularPrice={v.regularPrice} size="lg" />
        {v.pricePerUnit ? (
          <p className="text-sm text-ink-muted">
            {formatTaka(v.pricePerUnit.price)} per {v.pricePerUnit.per}
          </p>
        ) : null}
      </div>

      {variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-ink">Size or option</legend>
          <div className="flex flex-wrap gap-2">
            {variants.map((option, i) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setIndex(i);
                  setMessage(null);
                }}
                aria-pressed={i === index}
                className={cx(
                  'min-h-10 rounded-control border px-4 py-2 text-sm font-semibold transition-colors',
                  i === index
                    ? 'border-petrol bg-petrol-tint text-petrol ring-1 ring-petrol'
                    : 'border-line bg-surface text-ink hover:border-neutral-400',
                  !option.inStock && 'text-ink-muted line-through decoration-1',
                )}
              >
                {option.name}
                {option.attributes.length
                  ? `, ${option.attributes.map((a) => a.value).join(', ')}`
                  : ''}
                {!option.inStock ? <span className="sr-only"> (sold out)</span> : null}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-ink-muted">{v.name}</p>
      )}

      <p
        className={cx(
          'inline-flex items-center gap-2 text-sm font-semibold',
          v.inStock ? (v.lowStock ? 'text-warning' : 'text-success') : 'text-danger',
        )}
      >
        <span
          aria-hidden
          className={cx(
            'size-2 rounded-full',
            v.inStock ? (v.lowStock ? 'bg-warning' : 'bg-success') : 'bg-danger',
          )}
        />
        {v.inStock ? (v.lowStock ? 'Only a few left' : 'In stock') : 'Out of stock'}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {v.inStock ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-ink">Qty</span>
            <select
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="h-12 rounded-control border border-line bg-surface px-3 text-base font-semibold focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15"
            >
              {Array.from({ length: Math.min(10, MAX_CART_LINE_QUANTITY) }, (_, i) => i + 1).map(
                (n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ),
              )}
            </select>
          </label>
        ) : null}
        <button
          ref={mainButton}
          type="button"
          disabled={!v.inStock || busy}
          onClick={() => void add()}
          className={buttonClass('primary', 'lg', 'flex-1 sm:min-w-56 sm:flex-none')}
        >
          {v.inStock ? <BagIcon className="size-5" /> : null}
          {label}
        </button>
      </div>
      {message ? (
        <p className="text-sm font-semibold text-danger" role="alert">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-ink-muted">SKU {v.sku}</p>

      {/* Phones: the add bar once the main button has scrolled out of view. */}
      <div
        aria-hidden={!showBar}
        className={cx(
          'fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 px-4 py-3 shadow-raised backdrop-blur transition-transform duration-200 lg:hidden',
          showBar ? 'translate-y-0' : 'pointer-events-none translate-y-full',
        )}
      >
        <div className="mx-auto flex max-w-6xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-ink-muted">
              {product.name}, {v.name}
            </p>
            <p className="font-bold text-petrol">{formatTaka(v.price)}</p>
          </div>
          <button
            type="button"
            tabIndex={showBar ? 0 : -1}
            disabled={!v.inStock || busy}
            onClick={() => void add()}
            className={buttonClass('primary', 'lg')}
          >
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}
