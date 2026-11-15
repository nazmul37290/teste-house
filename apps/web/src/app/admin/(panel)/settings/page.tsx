import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import { apiServer } from '@/lib/api-server';
import { SettingsForm, type SettingsValues } from './settings-form';

export const metadata: Metadata = { title: 'Settings' };

export default async function SettingsPage() {
  if (!(await adminForPage('settings.manage'))) return <NoAccess />;
  const { values } = await apiServer<{ values: SettingsValues }>('/admin/settings');
  return (
    <>
      <PageHeader title="Settings" description="Store details shown on the site and in emails." />
      <SettingsForm initial={values} />
    </>
  );
}
