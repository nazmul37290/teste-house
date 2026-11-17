'use client';

import { useState } from 'react';
import { api } from '@/lib/api-client';
import { formatDhaka } from '@/lib/format';
import type { ReviewItem, ReviewPage } from '@/lib/storefront-types';
import { ShopImage } from './shop-image';
import { Stars } from './stars';

/** One approved review. Text is shown as plain text (React escapes it); never HTML. */
export function ReviewCard({ review: r }: { review: ReviewItem }) {
  return (
    <article className="space-y-2 rounded-lg border border-neutral-200 p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Stars value={r.rating} size="sm" />
        {r.title ? <h3 className="text-sm font-semibold">{r.title}</h3> : null}
      </div>
      <p className="text-xs text-neutral-500">
        {r.author}
        {r.isVerifiedPurchase ? ' · Verified purchase' : ''} ·{' '}
        {formatDhaka(r.createdAt).slice(0, 11)}
      </p>
      {r.body ? <p className="whitespace-pre-line text-sm text-neutral-800">{r.body}</p> : null}
      {r.images.length ? (
        <div className="flex gap-2">
          {r.images.map((img, i) => (
            <a
              key={i}
              href={img.urls['1600']}
              target="_blank"
              rel="noopener noreferrer"
              className="block h-20 w-20 overflow-hidden rounded-md bg-neutral-100"
            >
              <ShopImage image={img} sizes="80px" className="h-20 w-20 object-cover" />
            </a>
          ))}
        </div>
      ) : null}
      {r.adminReply ? (
        <div className="rounded-md bg-neutral-50 p-3 text-sm">
          <p className="text-xs font-semibold text-neutral-600">Reply from the shop</p>
          <p className="whitespace-pre-line text-neutral-800">{r.adminReply}</p>
        </div>
      ) : null}
    </article>
  );
}

/** Loads further pages in the browser. */
export function MoreReviews({
  slug,
  total,
  pageSize,
}: {
  slug: string;
  total: number;
  pageSize: number;
}) {
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [page, setPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const shown = pageSize + items.length;

  async function more() {
    setBusy(true);
    try {
      const next = await api<ReviewPage>(`/products/${slug}/reviews?page=${page + 1}`);
      setItems((cur) => [...cur, ...next.items]);
      setPage(page + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {items.map((r) => (
        <ReviewCard key={r.id} review={r} />
      ))}
      {shown < total ? (
        <button
          type="button"
          onClick={() => void more()}
          disabled={busy}
          className="text-sm underline"
        >
          {busy ? 'Loading…' : `Show more reviews (${total - shown} more)`}
        </button>
      ) : null}
    </>
  );
}
