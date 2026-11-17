'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ItemRows, Totals } from '@/components/shop/order-summary';
import { PayNowButton } from '@/components/shop/pay-now-button';
import { trackPurchaseOnce } from '@/lib/analytics';
import { LAST_ORDER_KEY, type OrderView } from '@/lib/order-types';

/**
 * Shown right after checkout, from the order kept in this tab (sessionStorage); nothing about the
 * order is in the URL except its number. On another device or after the tab closes, the customer
 * tracks the order with its number and phone instead.
 */
export function OrderConfirmation({ orderNumber }: { orderNumber: string }) {
  const [order, setOrder] = useState<OrderView | null | undefined>(undefined);

  useEffect(() => {
    let found: OrderView | null = null;
    try {
      const raw = sessionStorage.getItem(LAST_ORDER_KEY);
      const parsed = raw ? (JSON.parse(raw) as OrderView) : null;
      if (parsed?.orderNumber === orderNumber) found = parsed;
    } catch {
      found = null;
    }
    setOrder(found);
    // COD orders are complete here. Online orders count when the payment is verified (return page).
    if (found && found.paymentMethod.code === 'COD') trackPurchaseOnce(found);
  }, [orderNumber]);

  if (order === undefined) return null;
  if (!order) {
    return (
      <div className="rounded-lg border border-neutral-200 p-6 text-center">
        <h1 className="text-xl font-semibold">Order {orderNumber}</h1>
        <p className="mt-2 text-sm text-neutral-600">
          Track this order with its number and your mobile number.
        </p>
        <Link
          href={`/track?order=${encodeURIComponent(orderNumber)}`}
          className="mt-4 inline-block rounded-md bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white"
        >
          Track order
        </Link>
      </div>
    );
  }

  const registerHref = `/register?${new URLSearchParams({
    name: order.contactName,
    phone: order.contactPhone ?? '',
    email: order.contactEmail ?? '',
    next: '/account',
  })}`;

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-emerald-50 p-6 text-center">
        <p className="text-sm font-medium text-emerald-800">Thank you!</p>
        <h1 className="mt-1 text-2xl font-semibold text-neutral-900">
          Order {order.orderNumber} received
        </h1>
        <p className="mt-2 text-sm text-neutral-700">
          We will call or message {order.contactPhone ?? 'you'} to confirm it.
          {order.contactEmail
            ? ` A confirmation email is on its way to ${order.contactEmail}.`
            : ''}
        </p>
      </div>

      {order.paymentMethod.code !== 'COD' &&
      order.paymentStatus !== 'PAID' &&
      order.contactPhone ? (
        <section className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm">
          <p className="font-medium">Payment not completed yet</p>
          <p>
            {order.payment && 'error' in order.payment
              ? order.payment.error
              : 'Pay within 30 minutes, or the order is cancelled.'}
          </p>
          <PayNowButton orderNumber={order.orderNumber} phone={order.contactPhone} />
        </section>
      ) : null}

      <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
        <ItemRows items={order.items} />
        <Totals {...order} />
        <p className="text-sm">
          Payment: <strong>{order.paymentMethod.name}</strong>
          {order.paymentMethod.code === 'COD' ? ' (pay the courier when it arrives)' : ''}
        </p>
        {order.address ? (
          <p className="text-sm text-neutral-700">
            Delivering to {order.address.recipientName}, {order.address.addressLine},{' '}
            {order.address.upazila ? `${order.address.upazila}, ` : ''}
            {order.address.district}
            {order.deliveryZone?.estimatedDays
              ? ` · usually ${order.deliveryZone.estimatedDays}`
              : ''}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-3">
        <Link
          href={`/track?order=${encodeURIComponent(order.orderNumber)}`}
          className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium"
        >
          Track this order
        </Link>
        <Link
          href="/"
          className="rounded-md border border-neutral-300 px-4 py-2.5 text-sm font-medium"
        >
          Continue shopping
        </Link>
      </div>
      <div className="rounded-lg border border-neutral-200 p-4 text-sm">
        <p className="font-medium">Create an account to follow your orders</p>
        <p className="mt-1 text-neutral-600">
          Your details are filled in. Orders placed with a verified email appear in your account.
        </p>
        <Link href={registerHref} className="mt-3 inline-block font-medium underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
