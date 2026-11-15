'use client';

import { ADMIN_PASSWORD_MIN_LENGTH } from '@shop/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Role, StaffMember } from '@/lib/admin-types';
import { ApiError, type Status } from '@/lib/api-types';

export function StaffEditor({
  member,
  roles,
  isSelf,
  canManageSuperAdmins,
}: {
  member: StaffMember;
  roles: Role[];
  isSelf: boolean;
  canManageSuperAdmins: boolean;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  // The API enforces all of these too; the UI only explains them up front.
  const locked = member.role.isSystem && !canManageSuperAdmins;

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true);
    setStatus(null);
    try {
      await action();
      setStatus({ tone: 'success', text: success });
      router.refresh();
    } catch (err) {
      setStatus({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Something went wrong',
      });
    } finally {
      setBusy(false);
    }
  }

  function onDetails(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const roleId = String(form.get('roleId'));
    void run(
      () =>
        api(`/admin/users/${member.id}`, {
          method: 'PATCH',
          body: {
            name: form.get('name'),
            ...(isSelf || roleId === member.role.id ? {} : { roleId }),
          },
        }),
      'Saved.',
    );
  }

  function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const password = String(new FormData(formEl).get('password'));
    void run(async () => {
      await api(`/admin/users/${member.id}/password`, { method: 'PUT', body: { password } });
      formEl.reset();
    }, 'Password changed. They have been signed out everywhere.');
  }

  const toggleActive = () => {
    const activating = !member.isActive;
    if (
      !activating &&
      !window.confirm(`Deactivate ${member.name}? They will be signed out at once.`)
    )
      return;
    void run(
      () => api(`/admin/users/${member.id}`, { method: 'PATCH', body: { isActive: activating } }),
      activating ? 'Account reactivated.' : 'Account deactivated and signed out.',
    );
  };

  return (
    <div className="max-w-2xl space-y-6">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      {locked ? (
        <Alert tone="info">Only a Super Admin can change a Super Admin account.</Alert>
      ) : null}

      <Card title="Details">
        <form onSubmit={onDetails} className="space-y-4">
          <Field label="Name" htmlFor="name">
            <Input
              id="name"
              name="name"
              defaultValue={member.name}
              required
              minLength={2}
              maxLength={100}
              disabled={locked}
            />
          </Field>
          <Field
            label="Role"
            htmlFor="roleId"
            hint={isSelf ? 'You cannot change your own role.' : undefined}
          >
            <Select
              id="roleId"
              name="roleId"
              defaultValue={member.role.id}
              disabled={locked || isSelf}
            >
              {roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </Field>
          <Button type="submit" disabled={busy || locked}>
            Save
          </Button>
        </form>
      </Card>

      <Card
        title="Set a new password"
        description={
          isSelf ? 'Change your own password from My security.' : 'Signs them out on every device.'
        }
      >
        <form onSubmit={onPassword} className="space-y-4">
          <Field
            label="New password"
            htmlFor="password"
            hint={`At least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`}
          >
            <Input
              id="password"
              name="password"
              type="password"
              required
              minLength={ADMIN_PASSWORD_MIN_LENGTH}
              autoComplete="new-password"
              disabled={locked || isSelf}
            />
          </Field>
          <Button type="submit" variant="secondary" disabled={busy || locked || isSelf}>
            Set password
          </Button>
        </form>
      </Card>

      <Card
        title={member.isActive ? 'Deactivate' : 'Reactivate'}
        description={
          isSelf
            ? 'You cannot deactivate your own account.'
            : member.isActive
              ? 'They can no longer sign in. Their history (orders, notes, audit log) is kept.'
              : 'They can sign in again with their password.'
        }
      >
        <Button
          variant={member.isActive ? 'danger' : 'primary'}
          disabled={busy || locked || isSelf}
          onClick={toggleActive}
        >
          {member.isActive ? 'Deactivate account' : 'Reactivate account'}
        </Button>
      </Card>
    </div>
  );
}
