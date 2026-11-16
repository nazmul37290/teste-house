import { storeName } from '@/lib/api-server';

/**
 * Legal pages are an open item (CLAUDE.md): their text comes from the owner. Until then each page
 * says so plainly and is kept out of search engines (noindex in the page metadata).
 */
export async function PlaceholderPage({ title }: { title: string }) {
  const name = await storeName();
  return (
    <article className="mx-auto max-w-2xl space-y-4 py-8">
      <h1 className="text-2xl font-bold text-neutral-900">{title}</h1>
      <p className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This page is being prepared. {name} will publish the full {title.toLowerCase()} here before
        taking orders.
      </p>
      <p className="text-neutral-700">
        For questions in the meantime, please use the contact details below.
      </p>
    </article>
  );
}
