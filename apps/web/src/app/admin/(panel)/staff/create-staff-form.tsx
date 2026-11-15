'use client';

import { ADMIN_PASSWORD_MIN_LENGTH } from '@shop/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Role, StaffMember } from '@/lib/admin-types';
import { ApiError } from '@/lib/api-types';

export function CreateStaffForm({ roles }: { roles: Role[] }) {
  const router = useRouter();
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const created = await api<StaffMember>('/admin/users', {
        method: 'POST',
        body: {
          name: form.get('name'),
          email: form.get('email'),
          password: form.get('password'),
          roleId: form.get('roleId'),
        },
      });
      router.push(`/admin/staff/${created.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'),
      );
      setBusy(false);
    }
  }

  const fieldErrors = ['name', 'email', 'password', 'roleId'];
  const general = error && !fieldErrors.some((f) => error.fieldError(f)) ? error.message : null;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {general ? <Alert>{general}</Alert> : null}
      <Field label="Name" htmlFor="staff-name" error={error?.fieldError('name')}>
        <Input id="staff-name" name="name" required minLength={2} maxLength={100} />
      </Field>
      <Field label="Email" htmlFor="staff-email" error={error?.fieldError('email')}>
        <Input id="staff-email" name="email" type="email" required autoComplete="off" />
      </Field>
      <Field
        label="Password"
        htmlFor="staff-password"
        hint={`At least ${ADMIN_PASSWORD_MIN_LENGTH} characters. Share it with them privately.`}
        error={error?.fieldError('password')}
      >
        <Input
          id="staff-password"
          name="password"
          type="password"
          required
          minLength={ADMIN_PASSWORD_MIN_LENGTH}
          autoComplete="new-password"
        />
      </Field>
      <Field label="Role" htmlFor="staff-role" error={error?.fieldError('roleId')}>
        <Select id="staff-role" name="roleId" required defaultValue="">
          <option value="" disabled>
            Choose a role
          </option>
          {roles.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create staff member'}
      </Button>
    </form>
  );
}
