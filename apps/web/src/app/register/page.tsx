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
  searchParams: Promise<{ next?: string; name?: string; phone?: string; email?: string }>;
}) {
  const { next, name, phone, email } = await searchParams;
  // Prefill from the order confirmation ("create an account to track this order"); display only.
  const clip = (v: string | undefined, max: number) =>
    typeof v === 'string' ? v.slice(0, max) : '';
  const defaults = { name: clip(name, 100), phone: clip(phone, 20), email: clip(email, 120) };
  const target = safeNextPath(next, '/account');
  return (
    <AuthCard title="Create an account" subtitle={await storeName()}>
      <RegisterForm next={target} defaults={defaults} />
      <p className="mt-6 text-center text-sm text-neutral-600">
        Already have an account?{' '}
        <Link href={`/login?next=${encodeURIComponent(target)}`} className="font-medium underline">
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
