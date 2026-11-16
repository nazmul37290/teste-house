import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { SITE_URL } from '@/lib/site';
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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
