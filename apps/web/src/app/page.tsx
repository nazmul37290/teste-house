import Link from 'next/link';
import { getCustomer, storeName } from '@/lib/api-server';

/** Placeholder until the storefront (Phase 5); links to the account pages that work today. */
export default async function HomePage() {
  const [name, customer] = await Promise.all([storeName(), getCustomer()]);
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">{name}</h1>
      <p className="mt-2 text-neutral-600">
        The shop opens soon. Catalog and checkout arrive in later phases.
      </p>
      <p className="mt-6 flex gap-4 text-sm">
        {customer ? (
          <Link href="/account" className="font-medium underline">
            My account ({customer.name})
          </Link>
        ) : (
          <>
            <Link href="/login" className="font-medium underline">
              Sign in
            </Link>
            <Link href="/register" className="font-medium underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </main>
  );
}
