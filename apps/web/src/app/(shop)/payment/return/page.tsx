import type { Metadata } from 'next';
import { PaymentResult } from './payment-result';

export const metadata: Metadata = { title: 'Payment', robots: { index: false, follow: false } };

/** The gateway sends the customer here (?invoice_id=… or ?cancelled=1). Display only. */
export default async function PaymentReturnPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice_id?: string; cancelled?: string }>;
}) {
  const sp = await searchParams;
  const invoiceId =
    typeof sp.invoice_id === 'string' && /^[A-Za-z0-9_-]{6,100}$/.test(sp.invoice_id)
      ? sp.invoice_id
      : null;
  return (
    <div className="mx-auto max-w-xl px-4 py-10">
      <PaymentResult invoiceId={invoiceId} cancelled={sp.cancelled === '1'} />
    </div>
  );
}
