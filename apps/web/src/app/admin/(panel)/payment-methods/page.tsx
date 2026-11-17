import type { Metadata } from 'next';
import { NoAccess } from '@/components/admin/no-access';
import { PageHeader } from '@/components/ui';
import { adminForPage } from '@/lib/admin-page';
import type { PaymentMethodAdmin } from '@/lib/admin-types';
import { apiServer } from '@/lib/api-server';
import { PaymentMethodCard } from './payment-method-card';

export const metadata: Metadata = { title: 'Payment methods' };

export default async function PaymentsPage() {
  if (!(await adminForPage('payments.toggle'))) return <NoAccess />;
  const methods = await apiServer<PaymentMethodAdmin[]>('/admin/payment-methods');
  return (
    <>
      <PageHeader
        title="Payment methods"
        description="Checkout shows only the methods that are on. Online payment (UddoktaPay) is connected in a later phase; until then checkout offers Cash on Delivery only."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        {methods.map((m) => (
          <PaymentMethodCard key={m.id} method={m} />
        ))}
      </div>
    </>
  );
}
