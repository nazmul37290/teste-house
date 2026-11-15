'use client';

import { ADMIN_PASSWORD_MIN_LENGTH } from '@shop/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { adminAuthClient } from '@/lib/auth-client';
import type { Status } from '@/lib/api-types';

export function ChangePasswordForm() {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const newPassword = String(form.get('newPassword'));
    if (newPassword !== String(form.get('confirm'))) {
      return setStatus({ tone: 'error', text: 'The new passwords do not match.' });
    }
    setBusy(true);
    setStatus(null);
    const { error } = await adminAuthClient.changePassword({
      currentPassword: String(form.get('currentPassword')),
      newPassword,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (error) {
      return setStatus({
        tone: 'error',
        text:
          error.status === 400
            ? 'Your current password is wrong, or the new one is too short.'
            : error.message || 'Could not change the password.',
      });
    }
    formEl.reset();
    setStatus({ tone: 'success', text: 'Password changed. Other devices have been signed out.' });
  }

  return (
    <Card title="Change password" description="Signs you out on your other devices.">
      <form onSubmit={onSubmit} className="space-y-4">
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        <Field label="Current password" htmlFor="currentPassword">
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
          />
        </Field>
        <Field
          label="New password"
          htmlFor="newPassword"
          hint={`At least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`}
        >
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={ADMIN_PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
        </Field>
        <Field label="Repeat new password" htmlFor="confirm">
          <Input
            id="confirm"
            name="confirm"
            type="password"
            required
            minLength={ADMIN_PASSWORD_MIN_LENGTH}
            autoComplete="new-password"
          />
        </Field>
        <Button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </Card>
  );
}
