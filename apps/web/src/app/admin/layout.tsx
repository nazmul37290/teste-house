import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Admin is never indexed and never gets the GTM snippet.
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-screen bg-neutral-50">{children}</div>;
}
