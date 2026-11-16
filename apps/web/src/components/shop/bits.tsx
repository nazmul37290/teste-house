import Link from 'next/link';
import type { ReactNode } from 'react';
import { formatTaka } from '@/lib/money';

/** Current price, with the regular price struck through when on sale. */
export function Price({
  price,
  regularPrice,
  from = false,
  size = 'base',
}: {
  price: string;
  regularPrice?: string | null;
  from?: boolean;
  size?: 'base' | 'lg';
}) {
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2">
      <span
        className={
          size === 'lg' ? 'text-2xl font-bold text-neutral-900' : 'font-semibold text-neutral-900'
        }
      >
        {from ? <span className="text-xs font-normal text-neutral-500">from </span> : null}
        {formatTaka(price)}
      </span>
      {regularPrice ? (
        <span className="text-sm text-neutral-500 line-through">
          <span className="sr-only">Regular price </span>
          {formatTaka(regularPrice)}
        </span>
      ) : null}
    </span>
  );
}

export function Breadcrumbs({ items }: { items: { name: string; href: string }[] }) {
  return (
    <nav aria-label="Breadcrumb" className="text-sm text-neutral-500">
      <ol className="flex flex-wrap items-center gap-1">
        <li>
          <Link href="/" className="hover:underline">
            Home
          </Link>
        </li>
        {items.map((item, i) => (
          <li key={item.href} className="flex items-center gap-1">
            <span aria-hidden>/</span>
            {i === items.length - 1 ? (
              <span aria-current="page" className="text-neutral-800">
                {item.name}
              </span>
            ) : (
              <Link href={item.href} className="hover:underline">
                {item.name}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Product descriptions are plain text: blank-line paragraphs and "- " bullet lines. Never HTML. */
export function PlainText({ text }: { text: string }) {
  const blocks = text
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return (
    <div className="space-y-3 text-neutral-700">
      {blocks.map((block, i) => {
        const lines = block.split('\n').map((l) => l.trim());
        if (lines.every((l) => l.startsWith('- '))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i} className="whitespace-pre-line">
            {block}
          </p>
        );
      })}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  href,
}: {
  page: number;
  pageSize: number;
  total: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <nav aria-label="Pages" className="flex items-center justify-center gap-4 text-sm">
      {page > 1 ? (
        <Link
          rel="prev"
          href={href(page - 1)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
        >
          ← Previous
        </Link>
      ) : null}
      <span className="text-neutral-600">
        Page {page} of {pages}
      </span>
      {page < pages ? (
        <Link
          rel="next"
          href={href(page + 1)}
          className="rounded-md border border-neutral-300 px-3 py-1.5 hover:bg-neutral-100"
        >
          Next →
        </Link>
      ) : null}
    </nav>
  );
}

export function SectionHeading({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <h2 className="text-xl font-semibold text-neutral-900">{title}</h2>
      {action}
    </div>
  );
}
