'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { AddressFields, EMPTY_ADDRESS, type AddressValue } from '@/components/shop/address-fields';
import { ItemRows, Totals } from '@/components/shop/order-summary';
import { Field, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';
import { cartApi, useCart } from '@/lib/cart-client';
import { formatTaka } from '@/lib/money';
import { LAST_ORDER_KEY, type OrderView, type Quote, type SavedAddress } from '@/lib/order-types';

type Contact = { name: string; phone: string; email: string };
type Profile = { name: string; phone: string; email: string | null };

const NEW_ADDRESS = 'new';

/**
 * Single-page checkout (CHK-2). The totals shown come from POST /checkout/quote; the order sends
 * the quoted total only as `expectedGrandTotal`, so a price change is caught (PRICE_CHANGED)
 * instead of charging a different amount silently. Signed-in customers get their details filled in
 * and can deliver to a saved address.
 */
export function CheckoutForm() {
  const router = useRouter();
  const { cart } = useCart();
  const [contact, setContact] = useState<Contact>({ name: '', phone: '', email: '' });
  const [address, setAddress] = useState<AddressValue>(EMPTY_ADDRESS);
  const [deliveryNote, setDeliveryNote] = useState('');
  const [saved, setSaved] = useState<SavedAddress[]>([]);
  const [addressChoice, setAddressChoice] = useState(NEW_ADDRESS);
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<string | undefined>();
  const [method, setMethod] = useState('');
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: 'error' | 'warn'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [placing, setPlacing] = useState(false);
  // One key per checkout: a double click or a retry after a network error never makes two orders.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  // Signed in? Fill in the contact details and offer saved addresses (guests get 401 and skip this).
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [profile, addresses] = await Promise.all([
          api<Profile>('/me'),
          api<SavedAddress[]>('/me/addresses'),
        ]);
        if (cancelled) return;
        setContact((c) => ({
          name: c.name || profile.name,
          phone: c.phone || profile.phone,
          email: c.email || (profile.email ?? ''),
        }));
        setSaved(addresses);
        if (addresses.length) setAddressChoice(addresses[0]!.id); // the default comes first
      } catch {
        // Guest checkout.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const savedAddress = saved.find((a) => a.id === addressChoice) ?? null;
  const district = savedAddress ? savedAddress.district : address.district;

  const items = useMemo(
    () => (cart?.items ?? []).map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
    [cart],
  );
  const itemsKey = JSON.stringify(items);

  // Re-quote whenever the cart, district or coupon changes (debounced). Keyed on the serialized
  // items: every cart broadcast makes a new array with the same content.
  useEffect(() => {
    const lines = JSON.parse(itemsKey) as typeof items;
    if (!lines.length || !district || cart?.hasProblems) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const q = await api<Quote>('/checkout/quote', {
          method: 'POST',
          body: {
            items: lines,
            district,
            ...(coupon ? { couponCode: coupon } : {}),
            ...(contact.phone.trim().length >= 11 ? { phone: contact.phone.trim() } : {}),
          },
        });
        if (cancelled) return;
        setQuote(q);
        setQuoteError(null);
        setMethod((m) =>
          q.paymentMethods.some((p) => p.code === m) ? m : (q.paymentMethods[0]?.code ?? ''),
        );
      } catch (err) {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(
          err instanceof ApiError && err.code !== 'VALIDATION_ERROR'
            ? err.message
            : 'Could not calculate the total',
        );
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [itemsKey, district, coupon, cart?.hasProblems, contact.phone]);

  async function placeOrder(e: FormEvent) {
    e.preventDefault();
    if (!quote || !method) return;
    setPlacing(true);
    setMessage(null);
    setFieldErrors({});
    const note = deliveryNote.trim();
    try {
      const order = await api<OrderView>('/orders', {
        method: 'POST',
        headers: { 'Idempotency-Key': idempotencyKey },
        body: {
          items,
          contact: {
            name: contact.name,
            phone: contact.phone,
            ...(contact.email.trim() ? { email: contact.email.trim() } : {}),
          },
          ...(savedAddress
            ? { addressId: savedAddress.id }
            : {
                address: {
                  recipientName: contact.name,
                  phone: contact.phone,
                  division: address.division,
                  district: address.district,
                  ...(address.upazila ? { upazila: address.upazila } : {}),
                  addressLine: address.addressLine,
                  ...(note ? { deliveryNote: note } : {}),
                },
              }),
          paymentMethodCode: method,
          ...(coupon && quote.coupon?.applied ? { couponCode: coupon } : {}),
          ...(note && savedAddress ? { customerNote: note } : {}),
          expectedGrandTotal: quote.grandTotal,
        },
      });
      try {
        sessionStorage.setItem(LAST_ORDER_KEY, JSON.stringify(order));
      } catch {
        // Private mode: the confirmation page falls back to tracking.
      }
      void cartApi.refresh().catch(() => undefined);
      router.push(`/order/${order.orderNumber}`);
    } catch (err) {
      setPlacing(false);
      if (!(err instanceof ApiError)) {
        setMessage({ tone: 'error', text: 'Something went wrong. Please try again.' });
        return;
      }
      const detail = err.details?.[0] as { reason?: string; quote?: Quote } | undefined;
      if (err.code === 'PRICE_CHANGED' && detail?.quote) {
        setQuote(detail.quote);
        setMessage({
          tone: 'warn',
          text: `Prices have changed. The new total is ${formatTaka(detail.quote.grandTotal)}. Check your order and press “Place order” again to confirm.`,
        });
        return;
      }
      if (err.code === 'VALIDATION_ERROR') {
        setFieldErrors(
          Object.fromEntries(
            (err.details ?? []).filter((d) => d.path).map((d) => [d.path!, d.message ?? 'Invalid']),
          ),
        );
        setMessage({ tone: 'error', text: 'Please check the highlighted fields.' });
        return;
      }
      if (detail?.reason === 'OUT_OF_STOCK' || detail?.reason === 'UNAVAILABLE') {
        void cartApi.refresh().catch(() => undefined);
      }
      setMessage({ tone: 'error', text: err.message });
    }
  }

  if (!cart) return <p className="mt-6 text-sm text-neutral-500">Loading…</p>;
  if (!cart.items.length) {
    return (
      <div className="mt-6 rounded-lg border border-neutral-200 p-8 text-center">
        <p className="text-neutral-600">Your cart is empty.</p>
        <Link href="/" className="mt-4 inline-block text-sm font-medium underline">
          Continue shopping
        </Link>
      </div>
    );
  }

  const err = (path: string) => fieldErrors[path];
  return (
    <form onSubmit={placeOrder} className="mt-6 grid gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="min-w-0 space-y-6">
        <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
          <h2 className="font-semibold">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="co-name" error={err('contact.name')}>
              <Input
                id="co-name"
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={contact.name}
                onChange={(e) => setContact({ ...contact, name: e.target.value })}
              />
            </Field>
            <Field
              label="Mobile number"
              htmlFor="co-phone"
              hint="The courier calls this number."
              error={err('contact.phone') ?? err('address.phone')}
            >
              <Input
                id="co-phone"
                required
                inputMode="tel"
                autoComplete="tel"
                placeholder="01XXXXXXXXX"
                value={contact.phone}
                onChange={(e) => setContact({ ...contact, phone: e.target.value })}
              />
            </Field>
            <Field
              label="Email (optional)"
              htmlFor="co-email"
              hint="We send your order confirmation here."
              error={err('contact.email')}
            >
              <Input
                id="co-email"
                type="email"
                autoComplete="email"
                value={contact.email}
                onChange={(e) => setContact({ ...contact, email: e.target.value })}
              />
            </Field>
          </div>
        </section>

        <section className="space-y-4 rounded-lg border border-neutral-200 p-4">
          <h2 className="font-semibold">Delivery address</h2>
          {saved.length ? (
            <div className="space-y-2">
              {saved.map((a) => (
                <label
                  key={a.id}
                  className="flex items-start gap-2 rounded-md border border-neutral-200 p-3 text-sm"
                >
                  <input
                    type="radio"
                    name="addressChoice"
                    className="mt-1"
                    checked={addressChoice === a.id}
                    onChange={() => setAddressChoice(a.id)}
                  />
                  <span>
                    <span className="font-medium">{a.label ?? a.recipientName}</span>
                    <span className="block text-neutral-600">
                      {a.recipientName}, {a.phone} · {a.addressLine},{' '}
                      {a.upazila ? `${a.upazila}, ` : ''}
                      {a.district}
                    </span>
                  </span>
                </label>
              ))}
              <label className="flex items-center gap-2 rounded-md border border-neutral-200 p-3 text-sm">
                <input
                  type="radio"
                  name="addressChoice"
                  checked={addressChoice === NEW_ADDRESS}
                  onChange={() => setAddressChoice(NEW_ADDRESS)}
                />
                A new address
              </label>
            </div>
          ) : null}
          {!savedAddress ? (
            <AddressFields
              idPrefix="co"
              value={address}
              onChange={setAddress}
              error={(f) => err(`address.${f}`)}
            />
          ) : null}
          <Field label="Note for the delivery (optional)" htmlFor="co-note">
            <Input
              id="co-note"
              maxLength={300}
              value={deliveryNote}
              onChange={(e) => setDeliveryNote(e.target.value)}
            />
          </Field>
        </section>

        <section className="space-y-3 rounded-lg border border-neutral-200 p-4">
          <h2 className="font-semibold">Payment</h2>
          {!district ? (
            <p className="text-sm text-neutral-500">Choose your district to see payment options.</p>
          ) : quote && quote.paymentMethods.length === 0 ? (
            <p className="text-sm text-red-700">
              No payment method is available for {district}. Cash on Delivery may be limited to some
              areas.
            </p>
          ) : (
            (quote?.paymentMethods ?? []).map((m) => (
              <label key={m.code} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="paymentMethod"
                  value={m.code}
                  checked={method === m.code}
                  onChange={() => setMethod(m.code)}
                />
                {m.name}
              </label>
            ))
          )}
        </section>
      </div>

      <aside className="h-fit space-y-4 rounded-lg border border-neutral-200 p-4 lg:sticky lg:top-24">
        <h2 className="font-semibold">Your order</h2>
        <ItemRows
          items={
            quote?.lines ??
            cart.items.map((i) => ({
              productName: i.productName,
              variantName: i.variantName,
              quantity: i.quantity,
              lineTotal: i.lineTotal,
            }))
          }
        />
        {cart.hasProblems ? (
          <p className="text-sm text-red-700">
            Some items need attention.{' '}
            <Link href="/cart" className="underline">
              Open your cart
            </Link>
            .
          </p>
        ) : null}

        <div className="flex gap-2">
          <Input
            aria-label="Coupon code"
            placeholder="Coupon code"
            value={couponInput}
            onChange={(e) => setCouponInput(e.target.value)}
            className="uppercase"
          />
          <button
            type="button"
            onClick={() => setCoupon(couponInput.trim().toUpperCase() || undefined)}
            className="shrink-0 rounded-md border border-neutral-300 px-3 text-sm font-medium"
          >
            Apply
          </button>
        </div>
        {quote?.coupon ? (
          <p className={`text-xs ${quote.coupon.applied ? 'text-emerald-700' : 'text-red-700'}`}>
            {quote.coupon.applied ? `Coupon ${quote.coupon.code} applied.` : quote.coupon.message}
            {quote.coupon.applied ? (
              <button
                type="button"
                className="ml-2 underline"
                onClick={() => {
                  setCoupon(undefined);
                  setCouponInput('');
                }}
              >
                Remove
              </button>
            ) : null}
          </p>
        ) : null}

        {quote ? (
          <>
            <Totals {...quote} couponCode={quote.coupon?.applied ? quote.coupon.code : null} />
            <p className="text-xs text-neutral-500">
              Delivery zone: {quote.zone.name}
              {quote.zone.estimatedDays ? ` (${quote.zone.estimatedDays})` : ''}
              {quote.zone.freeDeliveryThreshold && quote.deliveryCharge !== '0.00'
                ? `. Free delivery from ${formatTaka(quote.zone.freeDeliveryThreshold)}.`
                : ''}
            </p>
          </>
        ) : (
          <p className="text-sm text-neutral-500">
            {quoteError ??
              (district ? 'Calculating…' : 'Choose your district to see the delivery charge.')}
          </p>
        )}

        {message ? (
          <p
            role="alert"
            className={`rounded-md p-3 text-sm ${message.tone === 'warn' ? 'bg-amber-50 text-amber-900' : 'bg-red-50 text-red-800'}`}
          >
            {message.text}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={!quote || !method || placing || cart.hasProblems}
          className="w-full rounded-md bg-neutral-900 px-4 py-3 font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {placing
            ? 'Placing order…'
            : quote
              ? `Place order · ${formatTaka(quote.grandTotal)}`
              : 'Place order'}
        </button>
        <p className="text-xs text-neutral-500">
          By placing the order you agree to our{' '}
          <Link href="/terms" className="underline">
            terms
          </Link>
          .
        </p>
      </aside>
    </form>
  );
}
