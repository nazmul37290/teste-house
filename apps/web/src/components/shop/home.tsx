import Link from 'next/link';
import type { ReactNode } from 'react';
import { buttonClass } from '@/components/ui';
import { formatTaka } from '@/lib/money';
import type { RecentReview, StoreFacts } from '@/lib/storefront-types';
import { CardIcon, CashIcon, RouteIcon, TruckIcon } from './icons';
import { Stars } from './stars';

/**
 * Home page pieces. Every statement here comes from data (store facts, real reviews); nothing is
 * claimed that checkout would not honour.
 */

/** Rising steam curls, drawn from the logo's cup. Decorative, low contrast. */
function SteamPattern({ className }: { className?: string }) {
  const curl = (x: number, h: number) =>
    `M${x} ${h} c-14 -22 14 -34 0 -56 s14 -34 0 -56 s14 -34 0 -56`;
  return (
    <svg
      viewBox="0 0 420 260"
      fill="none"
      aria-hidden
      className={className}
      preserveAspectRatio="xMaxYMid slice"
    >
      <g stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        {[40, 92, 144, 196, 248, 300, 352, 404].map((x, i) => (
          <path key={x} d={curl(x, 250 - (i % 3) * 18)} opacity={0.35 + (i % 3) * 0.2} />
        ))}
      </g>
    </svg>
  );
}

export function HomeHero({ name }: { name: string }) {
  return (
    <section className="relative isolate overflow-hidden rounded-feature bg-petrol px-6 py-10 text-white sm:px-10 sm:py-14 lg:px-14 lg:py-16">
      <SteamPattern className="absolute inset-y-0 right-0 -z-10 h-full w-[70%] text-white/[0.09] sm:w-1/2" />
      <div className="max-w-xl">
        <p className="text-[15px] font-medium text-white/75">{name}</p>
        <h1 className="mt-2 font-display text-[34px] leading-[1.08] sm:text-5xl lg:text-[56px]">
          Pantry favourites, delivered to your door
        </h1>
        {/* A turmeric brush stroke under the headline: the page's one decorative moment. */}
        <svg viewBox="0 0 300 14" aria-hidden className="mt-3 h-3 w-48 text-haldi sm:w-64">
          <path
            d="M3 9c48-6 96-7 146-5 52 2 98 2 148-3"
            stroke="currentColor"
            strokeWidth={5}
            strokeLinecap="round"
            fill="none"
          />
        </svg>
        <p className="mt-5 max-w-md text-[17px] leading-relaxed text-white/85">
          Honey, ghee, tea, dates and the packaged food your kitchen runs on, ordered in a few taps.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <a href="#shop" className={buttonClass('accent', 'lg')}>
            Start shopping
          </a>
          <Link
            href="/track"
            className={buttonClass(
              'ghost',
              'lg',
              'border border-white/30 text-white hover:bg-white/10',
            )}
          >
            Track an order
          </Link>
        </div>
      </div>
    </section>
  );
}

type Fact = { icon: ReactNode; title: string; text: string };

export function factsFrom(f: StoreFacts | null): Fact[] {
  if (!f) return [];
  const facts: Fact[] = [];
  if (f.cashOnDelivery) {
    facts.push({
      icon: <CashIcon />,
      title: 'Cash on delivery',
      text:
        f.cashOnDelivery === 'NATIONWIDE'
          ? 'Pay when your order arrives.'
          : 'Pay when your order arrives, inside Dhaka.',
    });
  }
  if (f.deliveryFrom) {
    facts.push({
      icon: <TruckIcon />,
      title: f.nationwideDelivery ? 'Delivery across Bangladesh' : 'Home delivery',
      text: `From ${formatTaka(f.deliveryFrom)}. Checkout shows the charge for your district.`,
    });
  }
  if (f.onlinePayment) {
    facts.push({
      icon: <CardIcon />,
      title: 'Pay online',
      text: 'Pay at checkout through UddoktaPay.',
    });
  }
  facts.push({
    icon: <RouteIcon />,
    title: 'Track your order',
    text: 'With your order number and phone number.',
  });
  return facts;
}

export function FactsStrip({ facts }: { facts: Fact[] }) {
  if (!facts.length) return null;
  return (
    <ul
      className={`grid grid-cols-1 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-2 ${facts.length >= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}
    >
      {facts.map((f) => (
        <li
          key={f.title}
          className="flex gap-3 bg-surface p-4 sm:p-5 sm:last:odd:col-span-2 lg:last:odd:col-span-1"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-petrol-tint text-petrol">
            {f.icon}
          </span>
          <span>
            <span className="block font-semibold text-ink">{f.title}</span>
            <span className="block text-sm text-ink-muted">{f.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export function RecentReviews({ reviews }: { reviews: RecentReview[] }) {
  if (!reviews.length) return null;
  return (
    <section aria-labelledby="reviews-title">
      <h2 id="reviews-title" className="font-display text-2xl text-petrol sm:text-[28px]">
        What customers say
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        The latest reviews, from customers who received their order.
      </p>
      <ul className="snap-row -mx-4 mt-5 auto-cols-[85%] gap-3 px-4 sm:mx-0 sm:auto-cols-auto sm:grid-flow-row sm:grid-cols-2 sm:gap-4 sm:px-0 lg:grid-cols-3">
        {reviews.map((r) => (
          <li key={r.id}>
            <figure className="flex h-full flex-col rounded-card border border-line bg-surface p-5">
              <Stars value={r.rating} size="sm" />
              {r.title ? <p className="mt-3 font-semibold text-ink">{r.title}</p> : null}
              <blockquote className="mt-2 line-clamp-5 text-[15px] text-ink">{r.body}</blockquote>
              <figcaption className="mt-auto pt-4 text-sm text-ink-muted">
                <span className="font-semibold text-ink">{r.author}</span>
                {r.isVerifiedPurchase ? ', verified purchase' : null}
                <span className="block">
                  on{' '}
                  <Link
                    href={`/product/${r.product.slug}`}
                    className="text-petrol underline-offset-2 hover:underline"
                  >
                    {r.product.name}
                  </Link>
                </span>
              </figcaption>
            </figure>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type Faq = { q: string; a: string };

/** Answers built from the shop's real settings. No returns answer until that policy exists. */
export function faqsFrom(f: StoreFacts | null): Faq[] {
  const list: Faq[] = [];
  if (f && (f.cashOnDelivery || f.onlinePayment)) {
    const ways = [
      f.cashOnDelivery === 'NATIONWIDE' && 'cash on delivery',
      f.cashOnDelivery === 'DHAKA_ONLY' && 'cash on delivery (inside Dhaka)',
      f.onlinePayment && 'online payment through UddoktaPay',
    ].filter(Boolean);
    list.push({
      q: 'How can I pay?',
      a: `You can choose ${ways.join(' or ')} at checkout. Checkout only offers the options that work for your address.`,
    });
  }
  if (f?.zones.length) {
    const lines = f.zones.map((z) => {
      const parts = [`${z.name}: ${formatTaka(z.charge)}`];
      if (z.estimatedDays) parts.push(`usually ${z.estimatedDays}`);
      if (z.freeDeliveryFrom)
        parts.push(`free on orders of ${formatTaka(z.freeDeliveryFrom)} or more`);
      return parts.join(', ');
    });
    list.push({
      q: 'How much is delivery, and how long does it take?',
      a: `${lines.join('. ')}. The exact charge for your address is shown at checkout before you place the order.`,
    });
  }
  list.push(
    {
      q: 'How do I track my order?',
      a: 'Open Track an order and enter your order number (it looks like ORD-000123) and the phone number you ordered with. If you have an account, your orders are listed there too.',
    },
    {
      q: 'Do I need an account to order?',
      a: 'No, you can check out as a guest. An account keeps your order history and saved addresses, and lets you keep a wishlist and review products you have received.',
    },
    {
      q: 'Can I cancel an order?',
      a: 'Yes, while its status is Pending or Confirmed. If you have an account, cancel it from the order page; otherwise contact us with your order number.',
    },
  );
  return list;
}

export function FaqSection({
  faqs,
  phone,
  email,
}: {
  faqs: Faq[];
  phone?: string | null;
  email?: string | null;
}) {
  return (
    <section
      aria-labelledby="faq-title"
      className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16"
    >
      <div>
        <h2 id="faq-title" className="font-display text-2xl text-petrol sm:text-[28px]">
          Questions before you order
        </h2>
        {phone || email ? (
          <p className="mt-3 max-w-sm text-[15px] text-ink-muted">
            Something else? Contact us
            {phone ? (
              <>
                {' '}
                on{' '}
                <a href={`tel:${phone}`} className="font-semibold text-petrol hover:underline">
                  {phone}
                </a>
              </>
            ) : null}
            {phone && email ? ' or' : null}
            {email ? (
              <>
                {' '}
                at{' '}
                <a href={`mailto:${email}`} className="font-semibold text-petrol hover:underline">
                  {email}
                </a>
              </>
            ) : null}
            .
          </p>
        ) : null}
      </div>
      <div className="divide-y divide-line rounded-card border border-line bg-surface">
        {faqs.map((f) => (
          <details key={f.q} name="faq" className="group px-5">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-ink marker:hidden [&::-webkit-details-marker]:hidden">
              {f.q}
              <svg
                viewBox="0 0 24 24"
                aria-hidden
                className="size-5 shrink-0 text-petrol transition-transform duration-200 group-open:rotate-45"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
            </summary>
            <p className="max-w-[65ch] pb-5 text-[15px] text-ink-muted">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
