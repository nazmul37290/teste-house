import Link from 'next/link';
import { Alert, Card, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { formatDhaka } from '@/lib/format';

export default async function AdminHome() {
  const admin = (await adminForPage())!;
  return (
    <>
      <PageHeader
        title={`Welcome, ${admin.name}`}
        description={`Signed in as ${admin.role.name}.`}
      />
      <div className="max-w-2xl space-y-4">
        {!admin.twoFactorEnabled ? (
          <Alert tone={admin.role.isSystem ? 'warning' : 'info'}>
            Two-factor authentication is off for your account.{' '}
            <Link href="/admin/security" className="font-medium underline">
              Turn it on
            </Link>
            {admin.role.isSystem ? ' (strongly recommended for Super Admins).' : '.'}
          </Alert>
        ) : null}
        <Card title="Your account">
          <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
            <dt className="text-neutral-500">Email</dt>
            <dd>{admin.email}</dd>
            <dt className="text-neutral-500">Role</dt>
            <dd>{admin.role.name}</dd>
            <dt className="text-neutral-500">Last sign-in</dt>
            <dd>{formatDhaka(admin.lastLoginAt)}</dd>
          </dl>
        </Card>
        <p className="text-sm text-neutral-500">
          Products, orders and reports arrive in later phases.
        </p>
      </div>
    </>
  );
}
