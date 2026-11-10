import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

// Store name, SEO defaults and GTM come from settings in Phase 3/5; placeholders for now.
export const metadata: Metadata = {
  title: { default: 'My Food Store', template: '%s | My Food Store' },
  description: 'Packaged food items delivered across Bangladesh.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">{children}</body>
    </html>
  );
}
