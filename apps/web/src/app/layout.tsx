import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { SITE_URL } from '@/lib/site';
import { ConsentAndGtm } from '@/components/analytics/consent-and-gtm';
import { CONSENT_DEFAULT_SCRIPT } from '@/lib/consent';
import './globals.css';

// Store name and SEO defaults come from settings (never hardcoded); pages override title/description.
export async function generateMetadata(): Promise<Metadata> {
  const [settings, name] = await Promise.all([getPublicSettings(), storeName()]);
  return {
    metadataBase: new URL(SITE_URL),
    title: { default: settings['seo.defaultTitle']?.trim() || name, template: `%s | ${name}` },
    description: settings['seo.defaultDescription']?.trim() || undefined,
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  // GTM container from settings; ConsentAndGtm itself stays off under /admin.
  const gtm = (await getPublicSettings().catch(() => null))?.['gtm.containerId']?.trim() || null;
  return (
    <html lang="en">
      {gtm ? (
        <head>
          {/* Consent Mode default (all denied) before anything else touches the dataLayer. */}
          <script
            id="consent-default"
            dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }}
          />
        </head>
      ) : null}
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        {children}
        <ConsentAndGtm containerId={gtm} />
      </body>
    </html>
  );
}
