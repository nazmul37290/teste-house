'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MediaUploader } from '@/components/admin/media-uploader';
import { Alert, Button, Card, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { MediaItem } from '@/lib/admin-types';
import { ApiError, type ListMeta, type Status } from '@/lib/api-types';

export function MediaLibrary({
  items,
  meta,
  q,
}: {
  items: MediaItem[];
  meta: ListMeta;
  q: string;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const hasNext = meta.page * meta.pageSize < meta.total;
  const link = (p: number) =>
    `/admin/media?${new URLSearchParams({ page: String(p), ...(q ? { q } : {}) })}`;

  async function run(action: () => Promise<unknown>, success: string) {
    setStatus(null);
    try {
      await action();
      setStatus({ tone: 'success', text: success });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setStatus({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'Something went wrong',
      });
    }
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <Card>
        {status ? (
          <div className="mb-4">
            <Alert tone={status.tone}>{status.text}</Alert>
          </div>
        ) : null}
        <form className="mb-4 flex gap-2" action="/admin/media">
          <Input
            name="q"
            defaultValue={q}
            placeholder="Search by alt text"
            aria-label="Search images"
          />
          <Button type="submit" variant="secondary">
            Search
          </Button>
        </form>
        {items.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No images yet.</p>
        ) : null}
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {items.map((m) => (
            <li key={m.id} className="rounded-control border border-line p-2">
              <img
                src={m.urls['500']}
                alt={m.altText}
                loading="lazy"
                className="aspect-square w-full rounded object-cover"
              />
              {editing === m.id ? (
                <form
                  className="mt-2 space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const altText = String(new FormData(e.currentTarget).get('altText'));
                    void run(
                      () => api(`/admin/media/${m.id}`, { method: 'PATCH', body: { altText } }),
                      'Alt text saved.',
                    );
                  }}
                >
                  <Input
                    name="altText"
                    defaultValue={m.altText}
                    required
                    minLength={3}
                    maxLength={200}
                    aria-label="Alt text"
                  />
                  <div className="flex gap-2">
                    <Button type="submit" className="px-2 py-1 text-xs">
                      Save
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      className="px-2 py-1 text-xs"
                      onClick={() => setEditing(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </form>
              ) : (
                <>
                  <p className="mt-2 line-clamp-2 text-xs text-neutral-700">{m.altText}</p>
                  <p className="text-xs text-neutral-400">
                    {m.width}×{m.height}
                  </p>
                  <div className="mt-2 flex gap-3 text-xs">
                    <button type="button" className="underline" onClick={() => setEditing(m.id)}>
                      Edit alt
                    </button>
                    <button
                      type="button"
                      className="text-danger underline"
                      onClick={() => {
                        if (window.confirm('Delete this image? This cannot be undone.')) {
                          void run(
                            () => api(`/admin/media/${m.id}`, { method: 'DELETE' }),
                            'Image deleted.',
                          );
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center justify-between text-sm">
          {meta.page > 1 ? (
            <Link href={link(meta.page - 1)} className="underline">
              ← Previous
            </Link>
          ) : (
            <span />
          )}
          <span className="text-neutral-500">{meta.total} images</span>
          {hasNext ? (
            <Link href={link(meta.page + 1)} className="underline">
              Next →
            </Link>
          ) : (
            <span />
          )}
        </div>
      </Card>
      <Card title="Upload an image">
        <MediaUploader onUploaded={() => void run(async () => undefined, 'Image uploaded.')} />
      </Card>
    </div>
  );
}
