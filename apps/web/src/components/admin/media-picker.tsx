'use client';

import { useEffect, useState } from 'react';
import { Button, Input } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { MediaItem } from '@/lib/admin-types';
import { MediaUploader } from './media-uploader';

/** `urls`: every stored width, when the image was just picked from the library. */
export type PickedImage = {
  id: string;
  url: string;
  altText: string;
  urls?: MediaItem['urls'];
} | null;

/**
 * Pick one image from the media library or upload a new one. Controlled: `value` is the current
 * image (or null) and `onChange` receives the new one.
 */
export function MediaPicker({
  value,
  onChange,
  label = 'Image',
  previewClassName = 'h-16 w-16 object-cover',
}: {
  value: PickedImage;
  onChange: (v: PickedImage) => void;
  label?: string;
  /** Size and fit of the preview; a wide logo wants e.g. 'h-16 w-48 object-contain'. */
  previewClassName?: string;
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
    onChange({ id: m.id, url: m.urls['200'], altText: m.altText, urls: m.urls });
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
            className={`rounded border bg-white ${previewClassName}`}
          />
        ) : (
          <div
            className={`flex items-center justify-center rounded border border-dashed text-xs text-neutral-400 ${previewClassName}`}
          >
            None
          </div>
        )}
        <Button type="button" variant="secondary" onClick={() => setOpen((o) => !o)}>
          {open ? 'Close' : value ? 'Change' : 'Choose'}
        </Button>
        {value ? (
          <button
            type="button"
            className="text-sm text-danger underline"
            onClick={() => onChange(null)}
          >
            Remove
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="space-y-4 rounded-control border border-line bg-neutral-50 p-4">
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
                  className="block w-full rounded border hover:ring-2 hover:ring-petrol"
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
