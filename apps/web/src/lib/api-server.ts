import 'server-only';
import type { HomeHighlight } from '@shop/shared';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { Attribute, Brand, Category, Tag } from './admin-types';
import { ApiError, parseEnvelope, parseFullEnvelope, type ListMeta } from './api-types';

const API = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

/**
 * Server-side call to the API over the internal network, forwarding the visitor's cookies, so the
 * API sees the same session the browser has. Never cached: these responses are per user.
 */
async function fetchWithCookies(path: string): Promise<Response> {
  const cookieHeader = (await cookies()).toString();
  return fetch(`${API}/api/v1${path}`, { headers: { cookie: cookieHeader }, cache: 'no-store' });
}

export async function apiServer<T>(path: string): Promise<T> {
  return parseEnvelope<T>(await fetchWithCookies(path));
}

/** A paged list: items plus { page, pageSize, total }. */
export async function apiServerList<T>(path: string): Promise<{ items: T[]; meta: ListMeta }> {
  const { data, meta } = await parseFullEnvelope<T[]>(await fetchWithCookies(path));
  return { items: data, meta: meta ?? { page: 1, pageSize: data.length, total: data.length } };
}

export type AdminMe = {
  id: string;
  name: string;
  email: string;
  twoFactorEnabled: boolean;
  lastLoginAt: string | null;
  role: { id: string; name: string; isSystem: boolean };
  permissions: string[];
};

/** The signed-in admin, or null. Cached for one request (layout and page share it). */
export const getAdminMe = cache(async (): Promise<AdminMe | null> => {
  try {
    return (await apiServer<{ admin: AdminMe }>('/admin/auth/me')).admin;
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) return null;
    throw err;
  }
});

export type PublicSettings = {
  /** Home page strip under the hero; empty means automatic (store facts). */
  'home.highlights'?: HomeHighlight[];
  'store.name'?: string;
  'store.logo'?: string | null;
  'store.phone'?: string;
  'store.email'?: string;
  'store.address'?: string;
  'seo.defaultTitle'?: string;
  'seo.defaultDescription'?: string;
  'gtm.containerId'?: string;
};

/** Public settings (store name, logo, SEO defaults). Shared by everyone, revalidated every minute. */
export const getPublicSettings = cache(async (): Promise<PublicSettings> => {
  try {
    const res = await fetch(`${API}/api/v1/settings/public`, {
      next: { revalidate: 60, tags: ['settings'] },
    });
    return await parseEnvelope<PublicSettings>(res);
  } catch {
    return {}; // API down: render with fallbacks rather than failing every page
  }
});

/** Store name from settings, with a neutral fallback (never a hardcoded brand). */
export async function storeName(): Promise<string> {
  return (await getPublicSettings())['store.name']?.trim() || 'Store';
}

export type CustomerSessionUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  phone: string;
};

/** The signed-in customer (Better Auth get-session returns raw JSON, not our envelope), or null. */
export const getCustomer = cache(async (): Promise<CustomerSessionUser | null> => {
  const cookieHeader = (await cookies()).toString();
  const res = await fetch(`${API}/api/v1/auth/get-session`, {
    headers: { cookie: cookieHeader },
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as { user?: CustomerSessionUser } | null;
  return body?.user ?? null;
});

/** Everything the product editor's dropdowns need, in one go. */
export async function getCatalogLookups() {
  const [categories, brands, tags, attributes] = await Promise.all([
    apiServer<Category[]>('/admin/categories'),
    apiServer<Brand[]>('/admin/brands'),
    apiServer<Tag[]>('/admin/tags'),
    apiServer<Attribute[]>('/admin/attributes'),
  ]);
  return { categories, brands, tags, attributes };
}
