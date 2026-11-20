'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from './api-client';
import { ApiError } from './api-types';
import { customerAuthClient } from './auth-client';

/**
 * Wishlist in the browser (ACC-7). Signed in: the server list. Guest: product ids in localStorage,
 * merged into the account the first time the visitor is seen signed in, then cleared.
 */
const KEY = 'shop:wishlist';
const CHANGED = 'shop:wishlist-changed';
const MAX_LOCAL = 100;

type State = { ids: string[]; signedIn: boolean };

function readLocal(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]') as unknown;
    return Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_LOCAL)
      : [];
  } catch {
    return [];
  }
}
function writeLocal(ids: string[]) {
  try {
    if (ids.length) localStorage.setItem(KEY, JSON.stringify(ids.slice(0, MAX_LOCAL)));
    else localStorage.removeItem(KEY);
  } catch {
    // Private mode: the guest list just does not persist.
  }
}

let shared: Promise<State> | null = null;

/** Loads once per page: server list when signed in (merging any guest list), else the local list. */
function load(): Promise<State> {
  shared ??= (async () => {
    try {
      // Ask for the session first: guests get 200 + null here instead of a 401 on the list.
      const { data: session } = await customerAuthClient.getSession();
      if (!session) return { ids: readLocal(), signedIn: false };
      let ids = await api<string[]>('/me/wishlist/ids');
      const local = readLocal();
      if (local.length) {
        ids = await api<string[]>('/me/wishlist/merge', {
          method: 'POST',
          body: { productIds: local },
        });
        writeLocal([]);
      }
      return { ids, signedIn: true };
    } catch (err) {
      // 401: a guest. Any other error: show the local list rather than nothing.
      if (!(err instanceof ApiError) || err.status !== 401) console.warn('Wishlist unavailable');
      return { ids: readLocal(), signedIn: false };
    }
  })();
  return shared;
}

/** Call after sign-in or sign-out: the next page load asks the server again (and merges). */
export function resetWishlist() {
  shared = null;
}

function broadcast(state: State) {
  shared = Promise.resolve(state);
  window.dispatchEvent(new CustomEvent<State>(CHANGED, { detail: state }));
}

export function useWishlist() {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    let alive = true;
    void load().then((s) => alive && setState(s));
    const onChange = (e: Event) => setState((e as CustomEvent<State>).detail);
    window.addEventListener(CHANGED, onChange);
    return () => {
      alive = false;
      window.removeEventListener(CHANGED, onChange);
    };
  }, []);

  const toggle = useCallback(async (productId: string) => {
    const current = await load();
    const has = current.ids.includes(productId);
    if (!current.signedIn) {
      const ids = has ? current.ids.filter((i) => i !== productId) : [productId, ...current.ids];
      writeLocal(ids);
      broadcast({ ids, signedIn: false });
      return;
    }
    const ids = has
      ? await api<string[]>(`/me/wishlist/${productId}`, { method: 'DELETE' })
      : await api<string[]>('/me/wishlist', { method: 'POST', body: { productId } });
    broadcast({ ids, signedIn: true });
  }, []);

  return {
    ids: state?.ids ?? [],
    signedIn: state?.signedIn ?? false,
    ready: state !== null,
    toggle,
  };
}
