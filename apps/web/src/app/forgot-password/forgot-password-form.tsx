'use client';

import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { customerAuthClient } from '@/lib/auth-client';

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await customerAuthClient.requestPasswordReset({
      email: String(new FormData(e.currentTarget).get('email')).trim(),
      redirectTo: '/reset-password',
    });
    setBusy(false);
    if (error?.status === 429) return setError('Too many requests. Please wait a few minutes.');
    // Same answer whether or not the email has an account.
    setSent(true);
  }

  if (sent) {
    return (
      <Alert tone="success">
        If an account uses that email, a reset link is on its way. It is valid for 1 hour.
      </Alert>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label="Email"
        htmlFor="email"
        hint="Signed up with a mobile number only? Sign in, add an email to your account, then reset."
      >
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
