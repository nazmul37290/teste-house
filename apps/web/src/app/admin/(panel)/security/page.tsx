import type { Metadata } from 'next';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { storeName } from '@/lib/api-server';
import { ChangePasswordForm } from './change-password-form';
import { TwoFactorPanel } from './two-factor-panel';

export const metadata: Metadata = { title: 'My security' };

export default async function SecurityPage() {
  const admin = (await adminForPage())!;
  return (
    <>
      <PageHeader title="My security" description={admin.email} />
      <div className="max-w-2xl space-y-6">
        <TwoFactorPanel enabled={admin.twoFactorEnabled} issuer={await storeName()} />
        <ChangePasswordForm />
      </div>
    </>
  );
}
