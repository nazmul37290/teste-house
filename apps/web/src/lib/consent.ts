/** Consent Mode v2 and tracking constants, shared by the server layout, the banner and analytics. */

export const CONSENT_STORAGE_KEY = 'shop:consent';

export type ConsentChoice = { analytics: boolean; marketing: boolean };

/** The visitor's saved choice, or null (not asked yet, or no storage). Browser only. */
export function readConsent(): ConsentChoice | null {
  try {
    const v = JSON.parse(
      localStorage.getItem(CONSENT_STORAGE_KEY) ?? 'null',
    ) as ConsentChoice | null;
    return v && typeof v.analytics === 'boolean' && typeof v.marketing === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

/** Which tools the head script found in settings (packages/shared trackingBootScript). */
export type TrackingConfig = { ga4: string | null; pixel: string | null };

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  push: Fbq;
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[];
    gtag?: (...args: unknown[]) => void;
    fbq?: Fbq;
    _fbq?: Fbq;
    __shopTracking?: TrackingConfig;
  }
}

/**
 * Meta Pixel base code (developers.facebook.com/docs/meta-pixel/get-started, checked 2026-11-22),
 * written out instead of pasted: a queueing fbq stub, init, PageView, then fbevents.js. Called only
 * once the visitor allowed marketing cookies, so nothing reaches Meta before that.
 */
export function loadMetaPixel(pixelId: string) {
  if (window.fbq) return;
  const fbq = function () {
    // The Pixel's own stub queues the `arguments` object; fbevents.js expects that shape.
    // eslint-disable-next-line prefer-rest-params
    const args = arguments as unknown as unknown[];
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  } as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = '2.0';
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq ??= fbq;
  fbq('init', pixelId);
  fbq('track', 'PageView');
  const s = document.createElement('script');
  s.async = true;
  s.src = 'https://connect.facebook.net/en_US/fbevents.js';
  document.head.appendChild(s);
}
