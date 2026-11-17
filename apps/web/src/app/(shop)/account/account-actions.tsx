'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { customerAuthClient } from '@/lib/auth-client';
import { resetWishlist } from '@/lib/wishlist-client';
import type { Status } from '@/lib/api-types';

/**
 * Resend verification, add or change email (verification goes to the new address; guest orders
 * link once it is verified), and sign out.
 */
export function AccountActions({
  email,
  emailVerified,
}: {
  email: string | null;
  emailVerified: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function resend() {
    if (!email) return;
    setBusy(true);
    const { error } = await customerAuthClient.sendVerificationEmail({
      email,
      callbackURL: '/email-verified',
    });
    setBusy(false);
    setStatus(
      error
        ? {
            tone: 'error',
            text:
              error.status === 429
                ? 'Please wait a few minutes before asking again.'
                : 'Could not send the email.',
          }
        : { tone: 'success', text: `Verification email sent to ${email}.` },
    );
  }

  async function changeEmail(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const newEmail = String(new FormData(formEl).get('newEmail')).trim();
    setBusy(true);
    const { error } = await customerAuthClient.changeEmail({
      newEmail,
      callbackURL: '/email-verified',
    });
    setBusy(false);
    if (error)
      return setStatus({ tone: 'error', text: error.message || 'Could not change the email.' });
    formEl.reset();
    setStatus({
      tone: 'success',
      text: `We sent a verification link to ${newEmail}. Click it to finish.`,
    });
    router.refresh();
  }

  async function signOut() {
    await customerAuthClient.signOut();
    resetWishlist();
    router.replace('/');
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      {email && !emailVerified ? (
        <Button variant="secondary" disabled={busy} onClick={resend}>
          Resend verification email
        </Button>
      ) : null}
      <form onSubmit={changeEmail} className="space-y-3">
        <Field
          label={email ? 'Change email' : 'Add an email'}
          htmlFor="newEmail"
          hint="Needed for password reset and order emails."
        >
          <Input id="newEmail" name="newEmail" type="email" required autoComplete="email" />
        </Field>
        <Button type="submit" variant="secondary" disabled={busy}>
          {email ? 'Change email' : 'Add email'}
        </Button>
      </form>
      <Button variant="secondary" onClick={signOut}>
        Sign out
      </Button>
    </div>
  );
}
