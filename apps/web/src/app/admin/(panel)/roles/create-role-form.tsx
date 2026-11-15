'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PermissionPicker } from '@/components/admin/permission-picker';
import { Alert, Button, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Permission, Role } from '@/lib/admin-types';
import { ApiError } from '@/lib/api-types';

export function CreateRoleForm({ permissions }: { permissions: Permission[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const role = await api<Role>('/admin/roles', {
        method: 'POST',
        body: {
          name: form.get('name'),
          description: String(form.get('description') || '') || null,
          permissions: [...selected],
        },
      });
      router.push(`/admin/roles/${role.id}`);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong'),
      );
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && !error.fieldError('name') ? <Alert>{error.message}</Alert> : null}
      <Field label="Name" htmlFor="role-name" error={error?.fieldError('name')}>
        <Input
          id="role-name"
          name="name"
          required
          minLength={2}
          maxLength={50}
          placeholder="Packer"
        />
      </Field>
      <Field label="Description" htmlFor="role-description" hint="Optional">
        <Input id="role-description" name="description" maxLength={200} />
      </Field>
      <PermissionPicker permissions={permissions} selected={selected} onChange={setSelected} />
      <Button type="submit" disabled={busy}>
        {busy ? 'Creating…' : 'Create role'}
      </Button>
    </form>
  );
}
