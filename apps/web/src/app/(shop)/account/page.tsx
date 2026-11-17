import type { Metadata } from 'next';
import { Badge, Card } from '@/components/ui';
import { apiServer } from '@/lib/api-server';
import { AccountActions } from './account-actions';
import { ChangePasswordForm, ProfileForm } from './profile-forms';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

type Profile = { name: string; phone: string; email: string | null; emailVerified: boolean };

export default async function AccountPage() {
  const profile = await apiServer<Profile>('/me');
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <Card title="Your details">
        <dl className="mb-6 grid grid-cols-[6rem_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">Mobile</dt>
          <dd>{profile.phone}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="space-x-2">
            {profile.email ? (
              <>
                <span>{profile.email}</span>
                {profile.emailVerified ? (
                  <Badge tone="green">Verified</Badge>
                ) : (
                  <Badge tone="amber">Not verified</Badge>
                )}
              </>
            ) : (
              <span className="text-neutral-500">Not added</span>
            )}
          </dd>
        </dl>
        <ProfileForm name={profile.name} />
      </Card>
      <Card title="Email">
        <AccountActions email={profile.email} emailVerified={profile.emailVerified} />
      </Card>
      <Card title="Change password">
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
