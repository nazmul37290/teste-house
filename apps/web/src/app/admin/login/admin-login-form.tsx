'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { adminAuthClient } from '@/lib/auth-client';

type BetterAuthError = { status?: number; message?: string } | null | undefined;

function messageFor(error: BetterAuthError): string {
  if (error?.status === 403) return 'This account is disabled. Ask a Super Admin.';
  if (error?.status === 429) return 'Too many attempts. Please wait a minute and try again.';
  if (error?.status === 401) return 'Wrong email or password.';
  return error?.message || 'Could not sign in. Please try again.';
}

export function AdminLoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [step, setStep] = useState<'password' | 'code'>('password');
  const [useBackup, setUseBackup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const done = () => {
    router.replace(next);
    router.refresh();
  };

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const { data, error } = await adminAuthClient.signIn.email({
      email: String(form.get('email')),
      password: String(form.get('password')),
    });
    setBusy(false);
    if (error) return setError(messageFor(error));
    if (data && 'twoFactorRedirect' in data && data.twoFactorRedirect) return setStep('code');
    done();
  }

  async function onCode(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s+/g, '');
    setBusy(true);
    setError(null);
    const { error } = useBackup
      ? await adminAuthClient.twoFactor.verifyBackupCode({ code })
      : await adminAuthClient.twoFactor.verifyTotp({ code });
    setBusy(false);
    if (error)
      return setError(
        error.status === 429 ? messageFor(error) : 'That code is not valid. Try again.',
      );
    done();
  }

  if (step === 'code') {
    return (
      <form onSubmit={onCode} className="space-y-4">
        {error ? <Alert>{error}</Alert> : null}
        <Field
          label={useBackup ? 'Backup code' : 'Authenticator code'}
          htmlFor="code"
          hint={
            useBackup
              ? 'One of the codes you saved when you turned on two-factor.'
              : 'The 6-digit code from your authenticator app.'
          }
        >
          <Input
            id="code"
            name="code"
            required
            autoFocus
            autoComplete="one-time-code"
            inputMode={useBackup ? 'text' : 'numeric'}
          />
        </Field>
        <Button type="submit" disabled={busy} className="w-full">
          {busy ? 'Checking…' : 'Verify'}
        </Button>
        <button
          type="button"
          onClick={() => setUseBackup((b) => !b)}
          className="w-full text-center text-sm text-neutral-600 underline"
        >
          {useBackup ? 'Use the authenticator app instead' : 'Use a backup code instead'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={onPassword} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Email" htmlFor="email">
        <Input id="email" name="email" type="email" required autoComplete="username" autoFocus />
      </Field>
      <Field label="Password" htmlFor="password">
        <Input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
