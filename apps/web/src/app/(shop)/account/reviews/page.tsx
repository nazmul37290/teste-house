import type { Metadata } from 'next';
import { apiServer } from '@/lib/api-server';
import { MyReviews, type MyReview, type ToReview } from './my-reviews';

export const metadata: Metadata = { title: 'My reviews', robots: { index: false } };

export default async function AccountReviewsPage() {
  const [mine, pending] = await Promise.all([
    apiServer<MyReview[]>('/me/reviews'),
    apiServer<ToReview[]>('/me/reviews/to-review'),
  ]);
  return <MyReviews mine={mine} toReview={pending} />;
}
