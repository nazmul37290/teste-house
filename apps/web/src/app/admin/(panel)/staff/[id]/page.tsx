import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Role, StaffMember } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { StaffEditor } from './staff-editor';

export const metadata: Metadata = { title: 'Staff member' };

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await adminForPage('users.manage');
  if (!me) return <NoAccess />;
  const { id } = await params;
  const [member, roles] = await Promise.all([
    apiServer<StaffMember>(`/admin/users/${id}`),
    apiServer<Role[]>('/admin/roles'),
  ]);

  return (
    <>
      <p className="mb-2 text-sm">
        <Link href="/admin/staff" className="text-neutral-600 underline">
          ← Staff
        </Link>
      </p>
      <PageHeader
        title={member.name}
        description={`${member.email} · added ${formatDhaka(member.createdAt)} · last sign-in ${formatDhaka(member.lastLoginAt)}`}
        actions={
          member.isActive ? (
            <Badge tone="green">Active</Badge>
          ) : (
            <Badge tone="red">Deactivated</Badge>
          )
        }
      />
      <StaffEditor
        member={member}
        roles={roles}
        isSelf={member.id === me.id}
        canManageSuperAdmins={me.role.isSystem}
      />
    </>
  );
}
