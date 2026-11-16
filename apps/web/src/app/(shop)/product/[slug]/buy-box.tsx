'use client';

import { MAX_CART_LINE_QUANTITY } from '@shop/shared';
import { useState } from 'react';
import { Price } from '@/components/shop/bits';
import { cartApi, cartErrorText, openCartDrawer } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import type { ProductVariant } from '@/lib/storefront-types';

/**
 * Variant choice, price, stock state and add to cart (disabled for sold-out variants, BRW-4).
 * Prices shown here are for display; the server calculates every order total itself.
 */
export function BuyBox({ variants }: { variants: ProductVariant[] }) {
  const firstInStock = variants.findIndex((v) => v.inStock);
  const [index, setIndex] = useState(firstInStock >= 0 ? firstInStock : 0);
  const v = variants[index]!;
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function add() {
    setBusy(true);
    setMessage(null);
    try {
      await cartApi.add(v.id, quantity);
      setQuantity(1);
      openCartDrawer();
    } catch (err) {
      setMessage(cartErrorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <Price price={v.price} regularPrice={v.regularPrice} size="lg" />
        {v.pricePerUnit ? (
          <p className="text-sm text-neutral-500">
            {formatTaka(v.pricePerUnit.price)} per {v.pricePerUnit.per}
          </p>
        ) : null}
      </div>

      {variants.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-sm font-medium text-neutral-800">Size / option</legend>
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
                className={`rounded-md border px-3 py-2 text-sm ${
                  i === index
                    ? 'border-neutral-900 bg-neutral-900 text-white'
                    : 'border-neutral-300 bg-white hover:border-neutral-500'
                } ${option.inStock ? '' : 'opacity-60'}`}
              >
                {option.name}
                {option.attributes.length
                  ? ` · ${option.attributes.map((a) => a.value).join(', ')}`
                  : ''}
                {!option.inStock ? ' (sold out)' : ''}
              </button>
            ))}
          </div>
        </fieldset>
      ) : (
        <p className="text-sm text-neutral-600">{v.name}</p>
      )}

      <p
        className={`text-sm font-medium ${v.inStock ? (v.lowStock ? 'text-amber-700' : 'text-emerald-700') : 'text-red-700'}`}
      >
        {v.inStock ? (v.lowStock ? 'Only a few left' : 'In stock') : 'Out of stock'}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        {v.inStock ? (
          <label className="flex items-center gap-2 text-sm">
            <span className="text-neutral-700">Qty</span>
            <select
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
              className="rounded-md border border-neutral-300 bg-white px-2 py-2"
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
          type="button"
          disabled={!v.inStock || busy}
          onClick={() => void add()}
          className="flex-1 rounded-md bg-neutral-900 px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none"
        >
          {v.inStock ? (busy ? 'Adding…' : 'Add to cart') : 'Out of stock'}
        </button>
      </div>
      {message ? (
        <p className="text-sm text-red-700" role="alert">
          {message}
        </p>
      ) : null}
      <p className="text-xs text-neutral-400">SKU {v.sku}</p>
    </div>
  );
}
