import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, Card, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Permission, Role } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { CreateRoleForm } from './create-role-form';

export const metadata: Metadata = { title: 'Roles' };

export default async function RolesPage() {
  if (!(await adminForPage('roles.manage'))) return <NoAccess />;
  const [roles, permissions] = await Promise.all([
    apiServer<Role[]>('/admin/roles'),
    apiServer<Permission[]>('/admin/permissions'),
  ]);

  return (
    <>
      <PageHeader
        title="Roles"
        description="A role is a set of permissions. Each staff member has one role."
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
        <Card>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Role</th>
                <th className="pb-2">Permissions</th>
                <th className="pb-2">Staff</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {roles.map((role) => (
                <tr key={role.id}>
                  <td className="py-3">
                    <Link
                      href={`/admin/roles/${role.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {role.name}
                    </Link>
                    {role.isSystem ? (
                      <span className="ml-2">
                        <Badge tone="amber">System</Badge>
                      </span>
                    ) : null}
                    {role.description ? (
                      <p className="text-xs text-neutral-500">{role.description}</p>
                    ) : null}
                  </td>
                  <td className="py-3">{role.isSystem ? 'All' : role.permissions.length}</td>
                  <td className="py-3">{role.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="New role" description="You can change its permissions later.">
          <CreateRoleForm permissions={permissions} />
        </Card>
      </div>
    </>
  );
}
