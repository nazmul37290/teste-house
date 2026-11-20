'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Stars } from '@/components/shop/stars';
import { ReviewForm } from '@/components/shop/write-review';
import { api } from '@/lib/api-client';
import { formatDhaka } from '@/lib/format';

export type MyReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  product: { id: string; name: string; slug: string };
};
export type ToReview = { id: string; name: string; slug: string };

const STATUS_TEXT = {
  PENDING: 'Waiting for approval',
  APPROVED: 'Published',
  REJECTED: 'Not published',
};

/** Products from delivered orders still to review, and the customer's own reviews. */
export function MyReviews({ mine, toReview }: { mine: MyReview[]; toReview: ToReview[] }) {
  const router = useRouter();
  const [writing, setWriting] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const done = () => {
    setWriting(null);
    setEditing(null);
    router.refresh();
  };

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Review your purchases</h2>
        {toReview.length === 0 ? (
          <p className="text-sm text-neutral-500">Nothing to review right now.</p>
        ) : (
          <ul className="space-y-3">
            {toReview.map((p) => (
              <li
                key={p.id}
                className="rounded-card border border-line bg-surface p-3 sm:p-5 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <Link href={`/product/${p.slug}`} className="font-medium underline">
                    {p.name}
                  </Link>
                  {writing !== p.id ? (
                    <button type="button" className="underline" onClick={() => setWriting(p.id)}>
                      Write a review
                    </button>
                  ) : null}
                </div>
                {writing === p.id ? (
                  <div className="mt-3">
                    <ReviewForm productId={p.id} onDone={done} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-ink">Your reviews</h2>
        {mine.length === 0 ? (
          <p className="text-sm text-neutral-500">You have not written any reviews yet.</p>
        ) : (
          <ul className="space-y-3">
            {mine.map((r) => (
              <li
                key={r.id}
                className="space-y-2 rounded-card border border-line bg-surface p-3 sm:p-5 text-sm"
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Link href={`/product/${r.product.slug}`} className="font-medium underline">
                    {r.product.name}
                  </Link>
                  <Stars value={r.rating} size="sm" />
                  <span className="text-xs text-neutral-500">
                    {STATUS_TEXT[r.status]} · {formatDhaka(r.createdAt).slice(0, 11)}
                  </span>
                </div>
                {r.title ? <p>{r.title}</p> : null}
                <div className="flex gap-4 text-xs">
                  <button type="button" className="underline" onClick={() => setEditing(r.id)}>
                    Edit
                  </button>
                  <button
                    type="button"
                    className="text-danger underline"
                    onClick={() => {
                      if (window.confirm('Delete this review?')) {
                        void api(`/me/reviews/${r.id}`, { method: 'DELETE' }).then(done);
                      }
                    }}
                  >
                    Delete
                  </button>
                </div>
                {editing === r.id ? (
                  <ReviewForm
                    reviewId={r.id}
                    initial={{ rating: r.rating, title: r.title, body: r.body }}
                    onDone={done}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
