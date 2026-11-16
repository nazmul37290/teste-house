'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api-client';
import { ApiError } from './api-types';
import type { ShopImage } from './storefront-types';

/** The cart as the API returns it (apps/api cart.service). Prices are for display only. */
export type CartLine = {
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  productSlug: string;
  variantName: string;
  image: ShopImage | null;
  unitPrice: string;
  regularPrice: string | null;
  quantity: number;
  lineTotal: string;
  maxQuantity: number;
  problem: 'UNAVAILABLE' | 'OUT_OF_STOCK' | 'NOT_ENOUGH_STOCK' | null;
};

export type Cart = { items: CartLine[]; itemCount: number; subtotal: string; hasProblems: boolean };

export const EMPTY_CART: Cart = { items: [], itemCount: 0, subtotal: '0.00', hasProblems: false };

export const PROBLEM_TEXT: Record<NonNullable<CartLine['problem']>, string> = {
  UNAVAILABLE: 'No longer available. Please remove it.',
  OUT_OF_STOCK: 'Out of stock. Please remove it.',
  NOT_ENOUGH_STOCK: 'Not enough in stock. Lower the quantity.',
};

/** Every cart change is broadcast, so the header badge, drawer and cart page stay in step. */
const CHANGED = 'shop:cart-changed';
const OPEN = 'shop:cart-open';

function broadcast(cart: Cart) {
  window.dispatchEvent(new CustomEvent<Cart>(CHANGED, { detail: cart }));
  return cart;
}

export const openCartDrawer = () => window.dispatchEvent(new Event(OPEN));
export const onCartOpen = (fn: () => void) => {
  window.addEventListener(OPEN, fn);
  return () => window.removeEventListener(OPEN, fn);
};

export const cartApi = {
  get: () => api<Cart>('/cart'),
  /** Reloads the cart and tells every cart view (after an order removed lines on the server). */
  refresh: () => api<Cart>('/cart').then(broadcast),
  add: (variantId: string, quantity: number) =>
    api<Cart>('/cart/items', { method: 'POST', body: { variantId, quantity } }).then(broadcast),
  setQuantity: (id: string, quantity: number) =>
    api<Cart>(`/cart/items/${id}`, { method: 'PATCH', body: { quantity } }).then(broadcast),
  remove: (id: string) => api<Cart>(`/cart/items/${id}`, { method: 'DELETE' }).then(broadcast),
};

/** Friendly text for a failed cart call. */
export function cartErrorText(err: unknown): string {
  return err instanceof ApiError ? err.message : 'Something went wrong. Please try again.';
}

/** The current cart, loaded once and kept up to date by broadcasts. */
export function useCart() {
  const [cart, setCart] = useState<Cart | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setCart(await cartApi.get());
      setError(null);
    } catch (err) {
      setError(cartErrorText(err));
    }
  }, []);

  useEffect(() => {
    void reload();
    const onChange = (e: Event) => setCart((e as CustomEvent<Cart>).detail);
    window.addEventListener(CHANGED, onChange);
    return () => window.removeEventListener(CHANGED, onChange);
  }, [reload]);

  /** Runs a cart change; on failure shows the message and reloads the real cart. */
  const change = useCallback(
    async (action: () => Promise<Cart>) => {
      setError(null);
      try {
        await action();
      } catch (err) {
        setError(cartErrorText(err));
        await reload();
      }
    },
    [reload],
  );

  return { cart, error, change, reload };
}
