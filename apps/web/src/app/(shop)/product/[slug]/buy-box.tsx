'use client';

import { useState } from 'react';
import { Price } from '@/components/shop/bits';
import { formatTaka } from '@/lib/money';
import type { ProductVariant } from '@/lib/storefront-types';

/**
 * Variant choice, price and stock state. The cart arrives in Phase 6; until then the button stays
 * disabled (and says "Out of stock" for sold-out variants, BRW-4). Prices shown here are for display;
 * the server calculates every order total itself.
 */
export function BuyBox({ variants }: { variants: ProductVariant[] }) {
  const firstInStock = variants.findIndex((v) => v.inStock);
  const [index, setIndex] = useState(firstInStock >= 0 ? firstInStock : 0);
  const v = variants[index]!;

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
                onClick={() => setIndex(i)}
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

      <button
        type="button"
        disabled
        className="w-full rounded-md bg-neutral-900 px-6 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
      >
        {v.inStock ? 'Add to cart' : 'Out of stock'}
      </button>
      {v.inStock ? <p className="text-xs text-neutral-500">Ordering opens soon.</p> : null}
      <p className="text-xs text-neutral-400">SKU {v.sku}</p>
    </div>
  );
}
