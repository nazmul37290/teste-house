import { LEGAL_PAGES, type LegalPageSlug } from '@shop/shared';
import type { Metadata } from 'next';
import { PageText } from '@/components/page-text';
import { getLegalPage, storeName } from '@/lib/api-server';

const updated = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Dhaka',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/** Indexed once the owner has written the page; a placeholder stays out of search engines. */
export async function policyMetadata(slug: LegalPageSlug): Promise<Metadata> {
  const page = await getLegalPage(slug);
  return {
    title: LEGAL_PAGES[slug].title,
    alternates: { canonical: LEGAL_PAGES[slug].path },
    robots: page?.body ? undefined : { index: false, follow: true },
  };
}

/** Privacy, terms and returns: text written in /admin/pages, or a plain note until then. */
export async function PolicyPage({ slug }: { slug: LegalPageSlug }) {
  const [page, name] = await Promise.all([getLegalPage(slug), storeName()]);
  const { title } = LEGAL_PAGES[slug];
  return (
    <article className="mx-auto max-w-2xl py-8">
      <h1 className="font-display text-[28px] leading-tight text-petrol sm:text-[34px]">{title}</h1>
      {page?.body ? (
        <>
          {page.updatedAt ? (
            <p className="mt-2 text-sm text-ink-muted">
              Last updated {updated.format(new Date(page.updatedAt))}
            </p>
          ) : null}
          <div className="mt-6">
            <PageText text={page.body} />
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-4">
          <p className="rounded-control border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-warning">
            This page is being prepared. {name} will publish the full {title.toLowerCase()} here.
          </p>
          <p className="text-neutral-700">
            For questions in the meantime, please use the contact details below.
          </p>
        </div>
      )}
    </article>
  );
}
