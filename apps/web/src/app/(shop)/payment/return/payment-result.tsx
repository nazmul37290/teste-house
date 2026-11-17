'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { PayNowButton } from '@/components/shop/pay-now-button';
import { api } from '@/lib/api-client';
import { LAST_ORDER_KEY, type OrderView } from '@/lib/order-types';

type Confirmed = {
  outcome: 'PAID' | 'ALREADY_PAID' | 'PENDING' | 'FAILED' | 'MISMATCH' | 'LATE_PAYMENT' | 'UNKNOWN';
  orderNumber: string;
  status: string;
  paymentStatus: string;
};

function lastOrder(): OrderView | null {
  try {
    const raw = sessionStorage.getItem(LAST_ORDER_KEY);
    return raw ? (JSON.parse(raw) as OrderView) : null;
  } catch {
    return null;
  }
}

/**
 * Asks our API to verify the payment with the gateway, then shows the result. What the gateway put
 * in the URL is never taken as proof; only the server's verify call is.
 */
export function PaymentResult({
  invoiceId,
  cancelled,
}: {
  invoiceId: string | null;
  cancelled: boolean;
}) {
  const [result, setResult] = useState<Confirmed | null>(null);
  const [failed, setFailed] = useState(false);
  const [checking, setChecking] = useState(Boolean(invoiceId));
  const [order, setOrder] = useState<OrderView | null>(null);

  const check = useCallback(async () => {
    if (!invoiceId) return;
    setChecking(true);
    try {
      setResult(
        await api<Confirmed>('/payments/uddoktapay/confirm', {
          method: 'POST',
          body: { invoiceId },
        }),
      );
      setFailed(false);
    } catch {
      setFailed(true);
    } finally {
      setChecking(false);
    }
  }, [invoiceId]);

  useEffect(() => {
    setOrder(lastOrder());
    void check();
  }, [check]);

  const number = result?.orderNumber ?? order?.orderNumber;
  const payAgain =
    number && order?.contactPhone && order.orderNumber === number ? (
      <PayNowButton orderNumber={number} phone={order.contactPhone} label="Try paying again" />
    ) : number ? (
      <Link href={`/track?order=${encodeURIComponent(number)}`} className="text-sm underline">
        Track order {number}
      </Link>
    ) : null;

  if (checking) return <Box title="Checking your payment…" text="This takes a few seconds." />;

  if (!invoiceId || cancelled) {
    return (
      <Box
        tone="warn"
        title="Payment not completed"
        text="Your order is saved. You can pay within 30 minutes, or it will be cancelled."
      >
        {payAgain}
      </Box>
    );
  }
  if (failed || !result || result.outcome === 'UNKNOWN') {
    return (
      <Box
        tone="warn"
        title="We could not check the payment yet"
        text="If money was taken, we will see it shortly. Please check again in a minute."
      >
        <button type="button" onClick={() => void check()} className="text-sm underline">
          Check again
        </button>
      </Box>
    );
  }
  switch (result.outcome) {
    case 'PAID':
    case 'ALREADY_PAID':
      return (
        <Box
          tone="ok"
          title="Payment received"
          text={`Thank you! Order ${result.orderNumber} is paid and confirmed.`}
        >
          <div className="flex flex-wrap gap-3 text-sm">
            <Link href={`/order/${result.orderNumber}`} className="underline">
              View order
            </Link>
            <Link href="/" className="underline">
              Continue shopping
            </Link>
          </div>
        </Box>
      );
    case 'PENDING':
      return (
        <Box
          title="Payment is being processed"
          text="The payment is not finished yet. If you completed it, check again in a minute."
        >
          <div className="flex flex-wrap items-center gap-4">
            <button type="button" onClick={() => void check()} className="text-sm underline">
              Check again
            </button>
            {payAgain}
          </div>
        </Box>
      );
    case 'LATE_PAYMENT':
      return (
        <Box
          tone="warn"
          title="Payment received after the order was cancelled"
          text={`Order ${result.orderNumber} had already been cancelled because the payment took too long. We have your payment and will contact you to refund it or reinstate the order.`}
        />
      );
    default:
      return (
        <Box
          tone="warn"
          title="Payment failed"
          text="No money was taken for this attempt. You can try again."
        >
          {payAgain}
        </Box>
      );
  }
}

function Box({
  title,
  text,
  tone = 'neutral',
  children,
}: {
  title: string;
  text: string;
  tone?: 'ok' | 'warn' | 'neutral';
  children?: React.ReactNode;
}) {
  const bg = tone === 'ok' ? 'bg-emerald-50' : tone === 'warn' ? 'bg-amber-50' : 'bg-neutral-50';
  return (
    <div className={`space-y-4 rounded-lg p-6 text-center ${bg}`}>
      <h1 className="text-xl font-semibold text-neutral-900">{title}</h1>
      <p className="text-sm text-neutral-700">{text}</p>
      {children ? <div className="flex justify-center">{children}</div> : null}
    </div>
  );
}
