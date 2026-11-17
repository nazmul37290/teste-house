'use client';

import { useState } from 'react';
import { Stars } from '@/components/shop/stars';
import { Alert, Badge, Button, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { formatDhaka } from '@/lib/format';
import type { ShopImage } from '@/lib/storefront-types';
import { useAction } from '@/lib/use-action';

export type AdminReview = {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  isVerifiedPurchase: boolean;
  adminReply: string | null;
  createdAt: string;
  product: { name: string; slug: string; path: string };
  customer: { name: string; phone: string };
  images: ShopImage[];
};

const TONE = { PENDING: 'amber', APPROVED: 'green', REJECTED: 'neutral' } as const;

/** One review with approve/reject, reply and delete (reviews.moderate). */
export function ReviewModeration({ review: r }: { review: AdminReview }) {
  const { busy, status, run } = useAction();
  const [replying, setReplying] = useState(false);
  const [reply, setReply] = useState(r.adminReply ?? '');
  const post = (path: string, body: object = {}) =>
    api(`/admin/reviews/${r.id}${path}`, { method: 'POST', body });

  return (
    <li className="space-y-2 rounded-lg border border-neutral-200 p-4 text-sm">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Stars value={r.rating} size="sm" />
        <Badge tone={TONE[r.status]}>{r.status.toLowerCase()}</Badge>
        <a
          href={r.product.path}
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline"
        >
          {r.product.name}
        </a>
        <span className="text-xs text-neutral-500">
          {r.customer.name} ({r.customer.phone}){r.isVerifiedPurchase ? ' · verified purchase' : ''}{' '}
          · {formatDhaka(r.createdAt)}
        </span>
      </div>
      {r.title ? <p className="font-semibold">{r.title}</p> : null}
      {r.body ? <p className="whitespace-pre-line text-neutral-800">{r.body}</p> : null}
      {r.images.length ? (
        <div className="flex gap-2">
          {r.images.map((img, i) => (
            <a key={i} href={img.urls['1600']} target="_blank" rel="noopener noreferrer">
              <img
                src={img.urls['200']}
                alt={img.altText}
                className="h-16 w-16 rounded object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      {r.adminReply && !replying ? (
        <p className="rounded bg-neutral-50 p-2 text-neutral-700">Reply: {r.adminReply}</p>
      ) : null}
      {replying ? (
        <div className="space-y-2">
          <Textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            maxLength={1000}
            rows={2}
            aria-label="Reply"
            placeholder="Shown under the review. Leave empty to remove the reply."
          />
          <div className="flex gap-2">
            <Button
              type="button"
              disabled={busy}
              onClick={() =>
                void run(() => post('/reply', { reply: reply.trim() }), 'Reply saved.').then(
                  (ok) => ok !== undefined && setReplying(false),
                )
              }
            >
              Save reply
            </Button>
            <Button type="button" variant="secondary" onClick={() => setReplying(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {r.status !== 'APPROVED' ? (
          <Button
            type="button"
            disabled={busy}
            onClick={() => void run(() => post('/approve'), 'Approved.')}
          >
            Approve
          </Button>
        ) : null}
        {r.status !== 'REJECTED' ? (
          <Button
            type="button"
            variant="secondary"
            disabled={busy}
            onClick={() => void run(() => post('/reject'), 'Rejected: no longer shown.')}
          >
            Reject
          </Button>
        ) : null}
        <Button type="button" variant="secondary" onClick={() => setReplying(true)}>
          {r.adminReply ? 'Edit reply' : 'Reply'}
        </Button>
        <button
          type="button"
          disabled={busy}
          className="text-sm text-red-700 underline"
          onClick={() => {
            if (window.confirm('Delete this review for good?')) {
              void run(() => api(`/admin/reviews/${r.id}`, { method: 'DELETE' }), 'Deleted.');
            }
          }}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
