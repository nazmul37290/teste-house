'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';

export function RegisterForm({
  next,
  defaults = { name: '', phone: '', email: '' },
}: {
  next: string;
  defaults?: { name: string; phone: string; email: string };
}) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    setBusy(true);
    setError(null);
    try {
      // Phone is required; email is optional (docs/auth.md). The server normalizes the phone.
      await api('/auth/register', {
        method: 'POST',
        body: {
          name: form.get('name'),
          phone: form.get('phone'),
          password: form.get('password'),
          ...(email ? { email } : {}),
        },
      });
      router.replace(next);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'),
      );
      setBusy(false);
    }
  }

  const fieldError = (f: string) => error?.fieldError(f);
  const general =
    error && !['name', 'phone', 'email', 'password'].some((f) => fieldError(f))
      ? error.message
      : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {general ? <Alert>{general}</Alert> : null}
      <Field label="Full name" htmlFor="name" error={fieldError('name')}>
        <Input
          id="name"
          name="name"
          required
          minLength={2}
          maxLength={100}
          autoComplete="name"
          defaultValue={defaults.name}
        />
      </Field>
      <Field
        label="Mobile number"
        htmlFor="phone"
        hint="You can sign in with this number."
        error={fieldError('phone')}
      >
        <Input
          id="phone"
          name="phone"
          required
          inputMode="tel"
          autoComplete="tel"
          placeholder="01XXXXXXXXX"
          defaultValue={defaults.phone}
        />
      </Field>
      <Field
        label="Email (optional)"
        htmlFor="email"
        hint="For order updates and password reset."
        error={fieldError('email')}
      >
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={defaults.email}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        hint="At least 8 characters."
        error={fieldError('password')}
      >
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
      <Button type="submit" disabled={busy} className="w-full">
        {busy ? 'Creating account…' : 'Create account'}
      </Button>
    </form>
  );
}
