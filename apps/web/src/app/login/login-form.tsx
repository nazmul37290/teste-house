'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';
import { track } from '@/lib/analytics';
import { resetWishlist } from '@/lib/wishlist-client';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api('/auth/login', {
        method: 'POST',
        body: { identifier: form.get('identifier'), password: form.get('password') },
      });
      resetWishlist(); // the next page merges this browser's saved products into the account
      track('login', {
        method: String(form.get('identifier') ?? '').includes('@') ? 'email' : 'phone',
      });
      router.replace(next);
      router.refresh();
    } catch (err) {
      // The API gives one message for every failure, so it never reveals whether an account exists.
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field label="Mobile number or email" htmlFor="identifier">
        <Input id="identifier" name="identifier" required autoComplete="username" autoFocus />
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
