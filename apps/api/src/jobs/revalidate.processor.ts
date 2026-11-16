import type { Job } from 'bullmq';
import type { Env } from '../config/env';
import type { RevalidateJob } from './queues';

/**
 * cache.revalidate: asks the web app to refresh cached storefront data for these tags
 * (POST /api/revalidate with the shared secret). Throws on failure so BullMQ retries.
 */
export async function processRevalidateJob(
  env: Pick<Env, 'WEB_INTERNAL_URL' | 'REVALIDATE_SECRET'>,
  job: Job<RevalidateJob>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!env.REVALIDATE_SECRET) return;
  const res = await fetchImpl(`${env.WEB_INTERNAL_URL.replace(/\/+$/, '')}/api/revalidate`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-revalidate-secret': env.REVALIDATE_SECRET },
    body: JSON.stringify({ tags: job.data.tags }),
  });
  if (!res.ok) throw new Error(`Revalidate failed with HTTP ${res.status}`);
}
