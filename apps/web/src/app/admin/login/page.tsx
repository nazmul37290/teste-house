import type { Metadata } from 'next';
import { AuthShell } from '@/components/auth-shell';
import { safeNextPath } from '@/lib/format';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = { title: 'Admin sign in' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthShell title="Admin sign in" subtitle="For shop staff only.">
      <AdminLoginForm next={safeNextPath(next, '/admin')} />
    </AuthShell>
  );
}
