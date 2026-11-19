'use client';

import { MediaPicker } from '@/components/admin/media-picker';
import { Badge } from '@/components/ui';

export type ImageItem = { mediaId: string; url: string; altText: string };

/**
 * An ordered list of images from the media library (pick or upload). The first one is the main
 * image. Controlled: the parent keeps the list and saves it.
 */
export function ImageListPicker({
  items,
  onChange,
  max = 20,
}: {
  items: ImageItem[];
  onChange: (next: ImageItem[]) => void;
  max?: number;
}) {
  const move = (from: number, to: number) => {
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item!);
    onChange(next);
  };

  return (
    <div className="space-y-4">
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {items.map((img, i) => (
          <li key={img.mediaId} className="space-y-2 rounded-md border border-neutral-200 p-2">
            <img
              src={img.url}
              alt={img.altText}
              className="aspect-square w-full rounded object-cover"
            />
            <div className="flex items-center justify-between text-xs">
              {i === 0 ? <Badge tone="green">Main</Badge> : <span />}
              <span className="flex gap-2">
                <button
                  type="button"
                  disabled={i === 0}
                  onClick={() => move(i, i - 1)}
                  aria-label="Move earlier"
                  className="disabled:opacity-30"
                >
                  ←
                </button>
                <button
                  type="button"
                  disabled={i === items.length - 1}
                  onClick={() => move(i, i + 1)}
                  aria-label="Move later"
                  className="disabled:opacity-30"
                >
                  →
                </button>
                <button
                  type="button"
                  className="text-red-700"
                  onClick={() => onChange(items.filter((x) => x.mediaId !== img.mediaId))}
                >
                  Remove
                </button>
              </span>
            </div>
          </li>
        ))}
        {items.length === 0 ? <li className="text-sm text-neutral-500">No images yet.</li> : null}
      </ul>
      {items.length < max ? (
        <MediaPicker
          label="Add an image"
          value={null}
          onChange={(picked) => {
            if (picked && !items.some((i) => i.mediaId === picked.id)) {
              onChange([
                ...items,
                { mediaId: picked.id, url: picked.url, altText: picked.altText },
              ]);
            }
          }}
        />
      ) : null}
    </div>
  );
}
