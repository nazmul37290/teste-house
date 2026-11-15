'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PermissionPicker } from '@/components/admin/permission-picker';
import { Alert, Button, Card, Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Permission, Role } from '@/lib/admin-types';
import { ApiError, type Status } from '@/lib/api-types';

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : 'Something went wrong';

export function RoleEditor({ role, permissions }: { role: Role; permissions: Permission[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState(new Set(role.permissions));
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus({ tone: 'success', text: success });
      router.refresh();
    } catch (err) {
      setStatus({ tone: 'error', text: errorText(err) });
    } finally {
      setBusy(false);
    }
  }

  function onDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void run(
      () =>
        api(`/admin/roles/${role.id}`, {
          method: 'PATCH',
          body: {
            name: form.get('name'),
            description: String(form.get('description') || '') || null,
          },
        }),
      'Role saved.',
    );
  }

  async function onDelete() {
    if (!window.confirm(`Delete the role "${role.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/admin/roles/${role.id}`, { method: 'DELETE' });
      router.push('/admin/roles');
      router.refresh();
    } catch (err) {
      setStatus({ tone: 'error', text: errorText(err) });
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Card title="Details">
        <form onSubmit={onDetails} className="space-y-4">
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={role.name}
              required
              minLength={2}
              maxLength={50}
            />
          </Field>
          <Field label="Description" htmlFor="description" hint="Optional">
            <Input
              id="description"
              name="description"
              defaultValue={role.description ?? ''}
              maxLength={200}
            />
          </Field>
          <Button type="submit" disabled={busy}>
            Save details
          </Button>
        </form>
      </Card>
      <Card
        title="Permissions"
        description="Staff with this role get exactly these permissions. Changes apply at once."
      >
        <div className="space-y-4">
          <PermissionPicker
            permissions={permissions}
            selected={selected}
            onChange={setSelected}
            disabled={busy}
          />
          <Button
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  api(`/admin/roles/${role.id}/permissions`, {
                    method: 'PUT',
                    body: { permissions: [...selected] },
                  }),
                'Permissions saved.',
              )
            }
          >
            Save permissions
          </Button>
        </div>
      </Card>
      <Card
        title="Delete role"
        description={
          role.userCount > 0
            ? 'Move its staff to another role first.'
            : 'Removes this role permanently.'
        }
      >
        <Button variant="danger" disabled={busy || role.userCount > 0} onClick={onDelete}>
          Delete role
        </Button>
      </Card>
    </div>
  );
}
