import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri, Young_Serif } from 'next/font/google';
import type { ReactNode } from 'react';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { SITE_URL } from '@/lib/site';
import { ConsentAndGtm } from '@/components/analytics/consent-and-gtm';
import { CONSENT_DEFAULT_SCRIPT } from '@/lib/consent';
import { Toaster } from '@/components/toast';
import './globals.css';

// Self-hosted at build time by next/font (no requests to Google from visitors' browsers).
// Hind Siliguri also covers Bengali, ready for a Bangla version later.
const body = Hind_Siliguri({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});
const heading = Young_Serif({
  subsets: ['latin'],
  weight: '400',
  variable: '--font-heading',
  display: 'swap',
});

export const viewport: Viewport = { themeColor: '#003442' };

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
    <html lang="en" className={`${body.variable} ${heading.variable}`}>
      {gtm ? (
        <head>
          {/* Consent Mode default (all denied) before anything else touches the dataLayer. */}
          <script
            id="consent-default"
            dangerouslySetInnerHTML={{ __html: CONSENT_DEFAULT_SCRIPT }}
          />
        </head>
      ) : null}
      <body className="min-h-screen bg-rice font-sans text-ink antialiased">
        {children}
        <Toaster />
        <ConsentAndGtm containerId={gtm} />
      </body>
    </html>
  );
}
