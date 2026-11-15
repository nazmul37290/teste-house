import type { Metadata } from 'next';
import Link from 'next/link';
import { NoAccess } from '@/components/admin/no-access';
import { Badge, Button, Card, Input, PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { Role, StaffMember } from '@/lib/admin-types';
import { apiServer, apiServerList } from '@/lib/api-server';
import { formatDhaka } from '@/lib/format';
import { CreateStaffForm } from './create-staff-form';

export const metadata: Metadata = { title: 'Staff' };

const PAGE_SIZE = 20;

export default async function StaffPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  if (!(await adminForPage('users.manage'))) return <NoAccess />;
  const { q = '', page = '1' } = await searchParams;
  const current = Math.max(1, Number(page) || 1);
  const query = new URLSearchParams({
    page: String(current),
    pageSize: String(PAGE_SIZE),
    ...(q ? { q } : {}),
  });

  const [{ items: staff, meta }, roles] = await Promise.all([
    apiServerList<StaffMember>(`/admin/users?${query}`),
    apiServer<Role[]>('/admin/roles'),
  ]);
  const hasNext = meta.page * meta.pageSize < meta.total;
  const link = (p: number) =>
    `/admin/staff?${new URLSearchParams({ page: String(p), ...(q ? { q } : {}) })}`;

  return (
    <>
      <PageHeader title="Staff" description="People who can sign in to this admin panel." />
      <div className="grid gap-6 xl:grid-cols-[1fr_24rem]">
        <Card>
          <form className="mb-4 flex gap-2" action="/admin/staff">
            <Input
              name="q"
              defaultValue={q}
              placeholder="Search name or email"
              aria-label="Search staff"
            />
            <Button type="submit" variant="secondary">
              Search
            </Button>
          </form>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Name</th>
                <th className="pb-2">Role</th>
                <th className="pb-2">Status</th>
                <th className="pb-2">Last sign-in</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {staff.map((s) => (
                <tr key={s.id}>
                  <td className="py-3">
                    <Link
                      href={`/admin/staff/${s.id}`}
                      className="font-medium text-neutral-900 hover:underline"
                    >
                      {s.name}
                    </Link>
                    <p className="text-xs text-neutral-500">{s.email}</p>
                  </td>
                  <td className="py-3">{s.role.name}</td>
                  <td className="space-x-1 py-3">
                    {s.isActive ? (
                      <Badge tone="green">Active</Badge>
                    ) : (
                      <Badge tone="red">Deactivated</Badge>
                    )}
                    {s.twoFactorEnabled ? <Badge>2FA</Badge> : null}
                  </td>
                  <td className="py-3 text-neutral-600">{formatDhaka(s.lastLoginAt)}</td>
                </tr>
              ))}
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-neutral-500">
                    No staff found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <div className="mt-4 flex items-center justify-between text-sm">
            {current > 1 ? (
              <Link href={link(current - 1)} className="underline">
                ← Previous
              </Link>
            ) : (
              <span />
            )}
            <span className="text-neutral-500">{meta.total} total</span>
            {hasNext ? (
              <Link href={link(current + 1)} className="underline">
                Next →
              </Link>
            ) : (
              <span />
            )}
          </div>
        </Card>
        <Card title="New staff member" description="They sign in with this email and password.">
          <CreateStaffForm roles={roles} />
        </Card>
      </div>
    </>
  );
}
