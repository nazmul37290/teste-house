'use client';

import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { MediaItem } from '@/lib/admin-types';
import { MediaUploader } from './media-uploader';

export type PickedImage = { id: string; url: string; altText: string } | null;

/**
 * Pick one image from the media library or upload a new one. Controlled: `value` is the current
 * image (or null) and `onChange` receives the new one.
 */
export function MediaPicker({
  value,
  onChange,
  label = 'Image',
}: {
  value: PickedImage;
  onChange: (v: PickedImage) => void;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ pageSize: '24', ...(q ? { q } : {}) });
    api<MediaItem[]>(`/admin/media?${params}`)
      .then((data) => !cancelled && setItems(data))
      .catch(() => !cancelled && setItems([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [open, q]);

  const choose = (m: MediaItem) => {
    onChange({ id: m.id, url: m.urls['200'], altText: m.altText });
    setOpen(false);
  };

  return (
    <div className="space-y-2">
      <p className="text-sm font-medium text-neutral-800">{label}</p>
      <div className="flex items-center gap-3">
        {value ? (
          <img
            src={value.url}
            alt={value.altText}
            className="h-16 w-16 rounded border object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded border border-dashed text-xs text-neutral-400">
            None
          </div>
        )}
        <Button type="button" variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : value ? 'Change' : 'Choose'}
        </Button>
        {value ? (
          <button
            type="button"
            className="text-sm text-red-700 underline"
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-4 rounded-md border border-neutral-200 bg-neutral-50 p-4">
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search the library by alt text"
            aria-label="Search images"
          />
          {loading ? <p className="text-sm text-neutral-500">Loading…</p> : null}
          <ul className="grid max-h-64 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
            {items.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => choose(m)}
                  className="block w-full rounded border hover:ring-2 hover:ring-neutral-900"
                  title={m.altText}
                >
                  <img
                    src={m.urls['200']}
                    alt={m.altText}
                    className="aspect-square w-full rounded object-cover"
                    loading="lazy"
                  />
                </button>
              </li>
            ))}
          </ul>
          {!loading && items.length === 0 ? (
            <p className="text-sm text-neutral-500">No images found.</p>
          ) : null}
          <details>
            <summary className="cursor-pointer text-sm font-medium">Upload a new image</summary>
            <div className="mt-3">
              <MediaUploader onUploaded={choose} />
            </div>
          </details>
        </div>
      ) : null}
    </div>
  );
}
