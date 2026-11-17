'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError, type Status } from '@/lib/api-types';
import { customerAuthClient } from '@/lib/auth-client';

export function ProfileForm({ name }: { name: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      await api('/me', {
        method: 'PATCH',
        body: { name: String(new FormData(e.currentTarget).get('name')).trim() },
      });
      setStatus({ tone: 'success', text: 'Name saved.' });
      router.refresh();
    } catch (err) {
      setStatus({ tone: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Name" htmlFor="p-name">
        <Input id="p-name" name="name" required minLength={2} maxLength={100} defaultValue={name} />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy}>
        Save name
      </Button>
    </form>
  );
}

/** Better Auth's change-password; other devices are signed out. */
export function ChangePasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirm'))) {
      setStatus({ tone: 'error', text: 'The new passwords do not match.' });
      return;
    }
    setBusy(true);
    const { error } = await customerAuthClient.changePassword({
      currentPassword: String(form.get('currentPassword')),
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      setStatus({
        tone: 'error',
        text:
          error.status === 400 || error.status === 401
            ? 'Your current password is not right, or the new one is too short (at least 8 characters).'
            : 'Could not change the password.',
      });
      return;
    }
    formEl.reset();
    setStatus({ tone: 'success', text: 'Password changed. Other devices were signed out.' });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field label="Current password" htmlFor="pw-current">
        <Input
          id="pw-current"
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
        />
      </Field>
      <Field label="New password" htmlFor="pw-new" hint="At least 8 characters.">
        <Input
          id="pw-new"
          name="newPassword"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </Field>
      <Field label="New password again" htmlFor="pw-confirm">
        <Input
          id="pw-confirm"
          name="confirm"
          type="password"
          required
          minLength={8}
          maxLength={128}
          autoComplete="new-password"
        />
      </Field>
      <Button type="submit" variant="secondary" disabled={busy}>
        Change password
      </Button>
    </form>
  );
}
