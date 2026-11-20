import type { Metadata } from 'next';
import Link from 'next/link';
import { Alert } from '@/components/ui';
import { AuthShell } from '@/components/auth-shell';
import { ResetPasswordForm } from './reset-password-form';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

/** Better Auth sends the customer here from the email link with ?token=..., or ?error=INVALID_TOKEN. */
export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; error?: string }>;
}) {
  const { token, error } = await searchParams;
  return (
    <AuthShell title="Choose a new password">
      {error || !token ? (
        <div className="space-y-4">
          <Alert>This link is invalid or has expired. Reset links work once and for 1 hour.</Alert>
          <Link href="/forgot-password" className="text-sm underline">
            Send a new link
          </Link>
        </div>
      ) : (
        <ResetPasswordForm token={token} />
      )}
    </AuthShell>
  );
}
