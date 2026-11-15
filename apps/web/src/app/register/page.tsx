import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ui';
import { storeName } from '@/lib/api-server';
import { safeNextPath } from '@/lib/format';
import { RegisterForm } from './register-form';

export const metadata: Metadata = { title: 'Create an account', robots: { index: false } };

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next, '/account');
  return (
    <AuthCard title="Create an account" subtitle={await storeName()}>
      <RegisterForm next={target} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(target)}`} className="font-medium underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
