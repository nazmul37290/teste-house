'use client';

import { MAX_REVIEW_PHOTOS } from '@shop/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, apiUpload } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';
import { customerAuthClient } from '@/lib/auth-client';
import { toast } from '@/components/toast';
import { buttonClass } from '@/components/ui';

type Eligibility = {
  canReview: boolean;
  hasPurchased: boolean;
  review: {
    id: string;
    status: string;
    rating: number;
    title: string | null;
    body: string | null;
  } | null;
};
type Photo = { id: string; urls: Record<string, string> };

/**
 * "Write a review" for signed-in customers who received this product. Guests see a sign-in link;
 * customers without a delivered order see nothing to click (the API refuses them anyway).
 */
export function WriteReview({ productId }: { productId: string }) {
  const pathname = usePathname();
  const [state, setState] = useState<Eligibility | 'guest' | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    // Guests get 200 + null from get-session, instead of a 401 from the eligibility check.
    customerAuthClient
      .getSession()
      .then(({ data }) => {
        if (!data) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in');
        return api<Eligibility>(`/me/reviews/eligibility?productId=${productId}`);
      })
      .then((e) => alive && setState(e))
      .catch((err: unknown) => {
        if (alive) setState(err instanceof ApiError && err.status === 401 ? 'guest' : null);
      });
    return () => {
      alive = false;
    };
  }, [productId]);

  if (!state) return null;
  if (state === 'guest') {
    return (
      <p className="text-sm text-neutral-600">
        Bought this?{' '}
        <Link
          href={`/login?next=${encodeURIComponent(`${pathname}#reviews`)}`}
          className="font-semibold text-petrol underline"
        >
          Sign in
        </Link>{' '}
        to review it.
      </p>
    );
  }
  if (state.review) {
    return (
      <p className="text-sm text-neutral-600">
        You reviewed this product
        {state.review.status === 'PENDING' ? ' (waiting for approval)' : ''}
        {state.review.status === 'REJECTED' ? ' (not published)' : ''}.{' '}
        <Link href="/account/reviews" className="font-semibold text-petrol underline">
          Your reviews
        </Link>
      </p>
    );
  }
  if (!state.canReview) return null;
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={buttonClass('primary', 'md')}>
        Write a review
      </button>
    );
  }
  return (
    <ReviewForm
      productId={productId}
      onDone={(status) =>
        setState({
          canReview: false,
          hasPurchased: true,
          review: { id: '', status, rating: 0, title: null, body: null },
        })
      }
    />
  );
}

/** Stars, title, text and up to 3 photos; used for new reviews and edits. */
export function ReviewForm({
  productId,
  reviewId,
  initial,
  onDone,
}: {
  productId?: string;
  reviewId?: string;
  initial?: { rating: number; title: string | null; body: string | null };
  onDone: (status: string) => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function addPhoto(file: File) {
    setError(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const photo = await apiUpload<Photo>('/me/review-photos', form);
      setPhotos((p) => [...p, photo]);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The photo could not be uploaded');
    }
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!rating) {
      setError('Choose a star rating.');
      return;
    }
    const form = new FormData(e.currentTarget);
    const body = {
      rating,
      title: String(form.get('title') ?? ''),
      body: String(form.get('body') ?? ''),
      mediaIds: photos.map((p) => p.id),
    };
    setBusy(true);
    setError(null);
    try {
      const res = reviewId
        ? await api<{ status: string }>(`/me/reviews/${reviewId}`, { method: 'PATCH', body })
        : await api<{ status: string }>('/me/reviews', {
            method: 'POST',
            body: { ...body, productId },
          });
      toast(
        res.status === 'APPROVED'
          ? 'Review published. Thank you.'
          : 'Review sent. It appears once we have checked it.',
      );
      onDone(res.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-card border border-line bg-surface p-5">
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Your rating</legend>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`text-2xl leading-none ${n <= rating ? 'text-haldi' : 'text-neutral-300'}`}
            >
              ★
            </button>
          ))}
        </div>
      </fieldset>
      <input
        name="title"
        maxLength={100}
        placeholder="Title (optional)"
        defaultValue={initial?.title ?? ''}
        aria-label="Review title"
        className="w-full rounded-control border border-line bg-surface px-3 py-2 text-[15px] focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15"
      />
      <textarea
        name="body"
        maxLength={2000}
        rows={4}
        placeholder="What did you think? (optional)"
        defaultValue={initial?.body ?? ''}
        aria-label="Review text"
        className="w-full rounded-control border border-line bg-surface px-3 py-2 text-[15px] focus:border-petrol focus:outline-none focus:ring-2 focus:ring-petrol/15"
      />
      <div className="space-y-2">
        <div className="flex gap-2">
          {photos.map((p) => (
            <img key={p.id} src={p.urls['200']} alt="" className="h-16 w-16 rounded object-cover" />
          ))}
        </div>
        {photos.length < MAX_REVIEW_PHOTOS ? (
          <label className="inline-block cursor-pointer text-sm underline">
            Add a photo ({photos.length}/{MAX_REVIEW_PHOTOS})
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void addPhoto(f);
                e.target.value = '';
              }}
            />
          </label>
        ) : null}
        {reviewId ? (
          <p className="text-xs text-neutral-500">
            Saving replaces the photos with the ones above.
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-danger">
          {error}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className={buttonClass('primary', 'md')}>
        {busy ? 'Sending…' : reviewId ? 'Save review' : 'Send review'}
      </button>
    </form>
  );
}
