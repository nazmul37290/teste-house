'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

/**
 * Google Tag Manager with Consent Mode v2 (requirements section 15, docs/design.md section 10).
 * Order matters: dataLayer and the consent defaults (everything denied) are set before GTM loads; a
 * saved choice is applied straight after. Nothing loads under /admin, and nothing at all when no
 * container id is set (then there is nothing to ask consent for, so no banner either).
 */

import { CONSENT_STORAGE_KEY as STORAGE_KEY } from '@/lib/consent';
export const OPEN_CONSENT_EVENT = 'shop:open-consent';

type Choice = { analytics: boolean; marketing: boolean };

function readChoice(): Choice | null {
  try {
    const v = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Choice | null;
    return v && typeof v.analytics === 'boolean' && typeof v.marketing === 'boolean' ? v : null;
  } catch {
    return null;
  }
}

function gtag(...args: unknown[]) {
  window.dataLayer = window.dataLayer ?? [];
  // GTM's consent API reads the `arguments` object shape, exactly like Google's gtag snippet.
  // eslint-disable-next-line prefer-rest-params
  window.dataLayer.push(arguments as unknown as Record<string, unknown>);
  void args;
}

const consentState = (c: Choice) => ({
  analytics_storage: c.analytics ? 'granted' : 'denied',
  ad_storage: c.marketing ? 'granted' : 'denied',
  ad_user_data: c.marketing ? 'granted' : 'denied',
  ad_personalization: c.marketing ? 'granted' : 'denied',
});

let loaded = false;

function loadGtm(containerId: string) {
  if (loaded) return;
  loaded = true;
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
  const s = document.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(containerId)}`;
  document.head.appendChild(s);
}

export function ConsentAndGtm({ containerId }: { containerId: string | null }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const [showBanner, setShowBanner] = useState(false);
  const [details, setDetails] = useState(false);
  const [choice, setChoice] = useState<Choice>({ analytics: false, marketing: false });

  useEffect(() => {
    if (!containerId || isAdmin) return;
    loadGtm(containerId);
    const saved = readChoice();
    if (saved) setChoice(saved);
    else setShowBanner(true);
    const reopen = () => {
      setChoice(readChoice() ?? { analytics: false, marketing: false });
      setDetails(true);
      setShowBanner(true);
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, [containerId, isAdmin]);

  if (!containerId || isAdmin || !showBanner) return null;

  function save(c: Choice) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } catch {
      // Private mode: the choice applies to this visit only.
    }
    gtag('consent', 'update', consentState(c));
    setShowBanner(false);
    setDetails(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie choices"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-4 shadow-lg"
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
            className="rounded-md bg-neutral-900 px-4 py-2 font-medium text-white"
          >
            Accept all
          </button>
          <button
            type="button"
            onClick={() => save({ analytics: false, marketing: false })}
            className="rounded-md border border-neutral-300 px-4 py-2 font-medium"
          >
            Only necessary
          </button>
          {details ? (
            <button
              type="button"
              onClick={() => save(choice)}
              className="rounded-md border border-neutral-300 px-4 py-2 font-medium"
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
