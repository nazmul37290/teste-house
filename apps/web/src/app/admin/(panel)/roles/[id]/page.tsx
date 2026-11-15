import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Alert, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Permission, Role } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { RoleEditor } from './role-editor';

export const metadata: Metadata = { title: 'Edit role' };

export default async function RolePage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await adminForPage('roles.manage'))) return <NoAccess />;
  const { id } = await params;
  const [role, permissions] = await Promise.all([
    apiServer<Role>(`/admin/roles/${id}`),
    apiServer<Permission[]>('/admin/permissions'),
  ]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/roles" className="text-neutral-600 underline">
          ← Roles
        </Link>
      </p>
      <PageHeader
        title={role.name}
        description={`${role.userCount} staff member(s) have this role.`}
      />
      {role.isSystem ? (
        <Alert tone="info">
          The Super Admin role always has every permission and cannot be changed or deleted.
        </Alert>
      ) : (
        <RoleEditor role={role} permissions={permissions} />
      )}
    </>
  );
}
