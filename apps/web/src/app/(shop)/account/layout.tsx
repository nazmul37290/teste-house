import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getCustomer } from '@/lib/api-server';
import { AccountTabs } from './account-tabs';

/** Customer area: every page needs a signed-in customer (the API checks again on each call). */
export default async function AccountLayout({ children }: { children: ReactNode }) {
  const customer = await getCustomer();
  if (!customer) redirect('/login?next=/account');
  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol">Hello, {customer.name}</h1>
      <AccountTabs />
      <div className="mt-6">{children}</div>
    </div>
  );
}
