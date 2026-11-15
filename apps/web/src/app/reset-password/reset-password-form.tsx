'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { customerAuthClient } from '@/lib/auth-client';

export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const newPassword = String(form.get('password'));
    if (newPassword !== String(form.get('confirm'))) return setError('The passwords do not match.');
    setBusy(true);
    setError(null);
    const { error } = await customerAuthClient.resetPassword({ newPassword, token });
    setBusy(false);
    if (error) return setError('This link is invalid or has expired. Ask for a new one.');
    setDone(true);
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert tone="success">
          Your password has been changed and you were signed out everywhere.
        </Alert>
        <Link href="/login" className="text-sm font-medium underline">
          Sign in with your new password
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="New password" htmlFor="password" hint="At least 8 characters.">
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Repeat new password" htmlFor="confirm">
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Saving…' : 'Save new password'}
      </Button>
    </form>
  );
}
