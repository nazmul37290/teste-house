import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';

export const metadata: Metadata = { title: 'Email verification', robots: { index: false } };

/** Better Auth redirects here after the verification link (?error=... when it failed). */
export default async function EmailVerifiedPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthShell title={error ? 'Could not verify your email' : 'Email verified'}>
      <div className="space-y-4">
        {error ? (
          <Alert>
            This link is invalid or has expired (links work for 24 hours). Sign in to send a new
            one.
          </Alert>
        ) : (
          <Alert tone="success">
            Thank you. Your email address is confirmed, and past orders placed with it are now in
            your account.
          </Alert>
        )}
        <Link href="/account" className="text-sm font-medium underline">
          Go to my account
        </Link>
      </div>
    </AuthShell>
  );
}
