import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthCard } from '@/components/ui';
import { storeName } from '@/lib/api-server';
import { safeNextPath } from '@/lib/format';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const target = safeNextPath(next, '/account');
  return (
    <AuthCard title="Sign in" subtitle={await storeName()}>
      <LoginForm next={target} />
      <div className="mt-6 space-y-2 text-center text-sm text-neutral-600">
        <p>
          <Link href="/forgot-password" className="underline">
            Forgot your password?
          </Link>
        </p>
        <p>
          New here?{' '}
          <Link
            href={`/register?next=${encodeURIComponent(target)}`}
            className="font-medium underline"
          >
            Create an account
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
