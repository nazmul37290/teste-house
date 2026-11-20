import Link from 'next/link';
import type { ReactNode } from 'react';
import { getPublicSettings, storeName } from '@/lib/api-server';
import { AuthCard } from '@/components/ui';

/** Sign-in style pages: the store logo (settings) linking home, above the card. */
export async function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const [settings, name] = await Promise.all([
    getPublicSettings().catch(() => ({}) as Record<string, string | null>),
    storeName(),
  ]);
  const logo = settings['store.logo'];
  return (
    <AuthCard
      title={title}
      subtitle={subtitle}
      brand={
        <Link href="/" aria-label={`${name} home`} className="inline-block">
          {logo ? (
            <img src={logo} alt={name} width={200} height={60} className="h-14 w-auto" />
          ) : (
            <span className="font-display text-2xl text-petrol">{name}</span>
          )}
        </Link>
      }
    >
      {children}
    </AuthCard>
  );
}
