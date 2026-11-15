import type { Metadata } from 'next';
import { AuthCard } from '@/components/ui';
import { safeNextPath } from '@/lib/format';
import { storeName } from '@/lib/api-server';
import { AdminLoginForm } from './admin-login-form';

export const metadata: Metadata = { title: 'Admin sign in' };

export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <AuthCard title="Admin sign in" subtitle={await storeName()}>
      <AdminLoginForm next={safeNextPath(next, '/admin')} />
    </AuthCard>
  );
}
