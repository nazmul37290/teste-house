import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto max-w-3xl p-8">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-neutral-600">
        <Link href="/" className="underline">Back to the store</Link>
      </p>
    </main>
  );
}
