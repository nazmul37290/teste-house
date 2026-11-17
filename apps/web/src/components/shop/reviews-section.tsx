import type { ReviewPage } from '@/lib/storefront-types';
import { MoreReviews, ReviewCard } from './review-list';
import { Stars } from './stars';
import { WriteReview } from './write-review';

/** Product page reviews: summary with per-star bars, first page (server), more on demand. */
export function ReviewsSection({
  productId,
  slug,
  page,
}: {
  productId: string;
  slug: string;
  page: ReviewPage | null;
}) {
  const summary = page?.summary ?? { average: 0, count: 0, stars: {} };
  return (
    <section id="reviews" className="space-y-6">
      <h2 className="text-xl font-semibold text-neutral-900">Reviews</h2>
      <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
        <div className="space-y-3">
          {summary.count ? (
            <>
              <p className="text-3xl font-bold">{summary.average.toFixed(1)}</p>
              <Stars value={summary.average} count={summary.count} />
              <ul className="space-y-1 text-xs text-neutral-600">
                {[5, 4, 3, 2, 1].map((s) => {
                  const n = summary.stars[String(s)] ?? 0;
                  return (
                    <li key={s} className="flex items-center gap-2">
                      <span className="w-8">{s} ★</span>
                      <span className="h-2 flex-1 overflow-hidden rounded bg-neutral-200">
                        <span
                          className="block h-full bg-amber-500"
                          style={{ width: `${summary.count ? (n / summary.count) * 100 : 0}%` }}
                        />
                      </span>
                      <span className="w-6 text-right">{n}</span>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : (
            <p className="text-sm text-neutral-600">No reviews yet.</p>
          )}
          <WriteReview productId={productId} />
        </div>
        <div className="min-w-0 space-y-4">
          {page?.items.map((r) => (
            <ReviewCard key={r.id} review={r} />
          ))}
          {page && page.meta.total > page.items.length ? (
            <MoreReviews slug={slug} total={page.meta.total} pageSize={page.meta.pageSize} />
          ) : null}
        </div>
      </div>
    </section>
  );
}
