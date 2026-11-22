import type { Metadata } from 'next';
import { getPublicSettings, storeName } from '@/lib/api-server';

/**
 * Shown by proxy.ts (with HTTP 503 and Retry-After) while the shop is in maintenance. Outside the
 * shop layout on purpose: no cart, search or links into pages that are closed right now.
 */
export const metadata: Metadata = {
  title: 'Back soon',
  robots: { index: false, follow: false },
};

export default async function MaintenancePage() {
  const [settings, name] = await Promise.all([getPublicSettings(), storeName()]);
  const logo = settings['store.logo'];
  const message = settings['store.maintenanceMessage']?.trim();
  const phone = settings['store.phone'];
  const email = settings['store.email'];

  return (
    <main className="flex min-h-screen flex-col bg-petrol text-white">
      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 py-16">
        {logo ? (
          // White version of the logo on petrol, like the footer.
          <img
            src={logo}
            alt={name}
            width={180}
            height={54}
            className="h-12 w-auto self-start brightness-0 invert"
          />
        ) : (
          <p className="font-display text-2xl">{name}</p>
        )}
        <h1 className="mt-10 font-display text-[36px] leading-tight sm:text-5xl">
          We are restocking the shelves
        </h1>
        <span aria-hidden className="mt-4 block h-1 w-24 rounded-full bg-haldi" />
        <p className="mt-6 text-lg leading-relaxed text-white/85">
          {message ||
            'The shop is closed for a short while for maintenance. Please come back a little later; your cart will still be here.'}
        </p>
        {phone || email ? (
          <div className="mt-10 border-t border-white/15 pt-6 text-white/85">
            <p className="font-semibold text-white">Need help with an order?</p>
            <ul className="mt-2 space-y-1">
              {phone ? (
                <li>
                  Call{' '}
                  <a href={`tel:${phone}`} className="font-semibold text-white underline">
                    {phone}
                  </a>
                </li>
              ) : null}
              {email ? (
                <li>
                  Email{' '}
                  <a href={`mailto:${email}`} className="font-semibold text-white underline">
                    {email}
                  </a>
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>
    </main>
  );
}
