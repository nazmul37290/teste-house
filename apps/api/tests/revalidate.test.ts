import type { Job } from 'bullmq';
import { describe, expect, it, vi } from 'vitest';
import type { RevalidateJob } from '../src/jobs/queues';
import { processRevalidateJob } from '../src/jobs/revalidate.processor';
import { tagsForWrite } from '../src/middleware/revalidate-after-write';

describe('tagsForWrite', () => {
  it('maps admin writes to storefront cache tags', () => {
    expect(tagsForWrite('PATCH', '/products/abc')).toEqual(['catalog']);
    expect(tagsForWrite('POST', '/inventory/adjust')).toEqual(['catalog']);
    expect(tagsForWrite('PUT', '/settings')).toEqual(['settings']);
    expect(tagsForWrite('DELETE', '/banners/x')).toEqual(['homepage']);
    expect(tagsForWrite('PUT', '/homepage-sections/x')).toEqual(['homepage']);
    expect(tagsForWrite('PATCH', '/delivery-zones/x')).toEqual(['store-facts']);
    expect(tagsForWrite('PATCH', '/payment-methods/x')).toEqual(['store-facts']);
  });

  it('ignores reads, plain uploads and unrelated areas', () => {
    expect(tagsForWrite('GET', '/products')).toEqual([]);
    expect(tagsForWrite('POST', '/media')).toEqual([]); // nothing visible until used
    expect(tagsForWrite('PATCH', '/media/abc')).toEqual(['catalog']); // alt text shows on pages
    expect(tagsForWrite('POST', '/users')).toEqual([]);
    expect(tagsForWrite('POST', '/productsx')).toEqual([]);
  });
});

describe('processRevalidateJob', () => {
  const job = { data: { tags: ['catalog'] } } as Job<RevalidateJob>;
  const env = { WEB_INTERNAL_URL: 'http://web:3000/', REVALIDATE_SECRET: 's'.repeat(32) };

  it('posts the tags with the shared secret', async () => {
    const fetchImpl = vi.fn(async () => Response.json({ data: {} }));
    await processRevalidateJob(env, job, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://web:3000/api/revalidate');
    expect((init.headers as Record<string, string>)['x-revalidate-secret']).toBe(
      env.REVALIDATE_SECRET,
    );
    expect(JSON.parse(String(init.body))).toEqual({ tags: ['catalog'] });
  });

  it('throws on failure so the job retries, and does nothing without a secret', async () => {
    await expect(
      processRevalidateJob(
        env,
        job,
        vi.fn(async () => new Response('', { status: 401 })),
      ),
    ).rejects.toThrow('HTTP 401');
    const fetchImpl = vi.fn();
    await processRevalidateJob({ ...env, REVALIDATE_SECRET: undefined }, job, fetchImpl);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
