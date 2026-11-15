import { isPlaceholderEmail } from '@shop/shared';
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Badge, Card, PageHeader } from '@/components/ui';
import { getCustomer } from '@/lib/api-server';
import { AccountActions } from './account-actions';

export const metadata: Metadata = { title: 'My account', robots: { index: false } };

/** Minimal account page for now; Phase 6 adds profile editing, addresses and orders. */
export default async function AccountPage() {
  const customer = await getCustomer();
  if (!customer) redirect('/login?next=/account');
  const email = isPlaceholderEmail(customer.email) ? null : customer.email;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <PageHeader title={`Hello, ${customer.name}`} />
      <Card title="Your details">
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          <dt className="text-neutral-500">Mobile</dt>
          <dd>{customer.phone}</dd>
          <dt className="text-neutral-500">Email</dt>
          <dd className="space-x-2">
            {email ? (
              <>
                <span>{email}</span>
                {customer.emailVerified ? (
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
        <div className="mt-6">
          <AccountActions email={email} emailVerified={customer.emailVerified} />
        </div>
      </Card>
    </main>
  );
}
