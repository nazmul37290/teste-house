'use client';

import { usePathname } from 'next/navigation';
import { hasTracking, type TrackingIds } from '@shop/shared';
import { useEffect, useState } from 'react';
import {
  CONSENT_STORAGE_KEY as STORAGE_KEY,
  loadMetaPixel,
  readConsent as readChoice,
  type ConsentChoice,
} from '@/lib/consent';

/**
 * Tracking with Consent Mode v2 (requirements section 15, docs/design.md section 10): a GTM
 * container, GA4 directly, and the Meta Pixel, each only when its ID is set in the admin. Order
 * matters: the head script (packages/shared trackingBootScript) has already set dataLayer, the
 * consent defaults (everything denied), a saved choice and GA4's config; this loads the scripts
 * once the page is interactive. The Pixel loads only after the visitor allows marketing cookies.
 * Nothing loads under /admin, and with no ID set there is nothing to ask consent for, so no banner.
 */

export const OPEN_CONSENT_EVENT = 'shop:open-consent';

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer ?? [];
  // GTM's consent API reads the `arguments` object shape, exactly like Google's gtag snippet.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments as unknown as Record<string, unknown>);
  void args;
}

const consentState = (c: ConsentChoice) => ({
  analytics_storage: c.analytics ? 'granted' : 'denied',
  ad_storage: c.marketing ? 'granted' : 'denied',
  ad_user_data: c.marketing ? 'granted' : 'denied',
  ad_personalization: c.marketing ? 'granted' : 'denied',
});

const loaded = new Set<string>();
function loadScript(src: string) {
  if (loaded.has(src)) return;
  loaded.add(src);
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGtm(containerId: string) {
  if (loaded.has(containerId)) return;
  loaded.add(containerId);
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  loadScript(`https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`);
}

/** The Pixel follows the marketing choice: loaded on the first yes, paused and resumed after. */
function applyPixel(pixelId: string | null, marketing: boolean) {
  if (!pixelId) return;
  if (marketing) {
    if (window.fbq) window.fbq('consent', 'grant');
    else loadMetaPixel(pixelId);
  } else window.fbq?.('consent', 'revoke');
}

export function ConsentAndTracking({ ids }: { ids: TrackingIds }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const [showBanner, setShowBanner] = useState(false);
  const [details, setDetails] = useState(false);
  const [choice, setChoice] = useState<ConsentChoice>({ analytics: false, marketing: false });
  const enabled = hasTracking(ids);
  const { gtm, ga4, pixel } = ids;

  useEffect(() => {
    if (!enabled || isAdmin) return;
    if (gtm) loadGtm(gtm);
    if (ga4) loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga4)}`);
    const saved = readChoice();
    if (saved) {
      setChoice(saved);
      applyPixel(pixel, saved.marketing);
    } else setShowBanner(true);
    const reopen = () => {
      setChoice(readChoice() ?? { analytics: false, marketing: false });
      setDetails(true);
      setShowBanner(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, [enabled, isAdmin, gtm, ga4, pixel]);

  if (!enabled || isAdmin || !showBanner) return null;

  function save(c: ConsentChoice) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // Private mode: the choice applies to this visit only.
    }
    gtag('consent', 'update', consentState(c));
    applyPixel(pixel, c.marketing);
    setShowBanner(false);
    setDetails(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white p-4 shadow-lg"
    >
      <div className="mx-auto max-w-4xl space-y-3 text-sm">
        <p className="text-neutral-700">
          We use cookies to understand how the shop is used and to measure our ads. Necessary
          cookies (cart, sign-in) are always on. You can change your choice any time with
          &ldquo;Cookie settings&rdquo; at the bottom of the page.
        </p>
        {details ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={choice.analytics}
                onChange={(e) => setChoice({ ...choice, analytics: e.target.checked })}
              />
              Analytics (how visitors use the shop)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={choice.marketing}
                onChange={(e) => setChoice({ ...choice, marketing: e.target.checked })}
              />
              Marketing (ad measurement and personalised ads)
            </label>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => save({ analytics: true, marketing: true })}
            className="rounded-control bg-petrol px-4 py-2 font-medium text-white"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => save({ analytics: false, marketing: false })}
            className="rounded-control border border-neutral-300 px-4 py-2 font-medium"
          >
            Only necessary
          </button>
          {details ? (
            <button
              type="button"
              onClick={() => save(choice)}
              className="rounded-control border border-neutral-300 px-4 py-2 font-medium"
            >
              Save my choice
            </button>
          ) : (
            <button type="button" onClick={() => setDetails(true)} className="px-2 py-2 underline">
              Choose
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner. */
export function CookieSettingsLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}
      className="hover:underline"
    >
      Cookie settings
    </button>
  );
}
