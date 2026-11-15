'use client';

import { useState } from 'react';
import { MediaPicker } from '@/components/admin/media-picker';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ProductDetail } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

type Item = { mediaId: string; url: string; altText: string };

/** Ordered images; the first one is the primary (shown in lists and shared links). */
export function ImagesManager({
  product,
  editable,
}: {
  product: ProductDetail;
  editable: boolean;
}) {
  const initial = product.images.map((i) => ({
    mediaId: i.mediaId,
    url: i.urls['500'],
    altText: i.altText,
  }));
  const [items, setItems] = useState<Item[]>(initial);
  const { busy, status, run } = useAction();
  const dirty =
    JSON.stringify(items.map((i) => i.mediaId)) !== JSON.stringify(initial.map((i) => i.mediaId));

  const move = (from: number, to: number) =>
    setItems((list) => {
      const next = [...list];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item!);
      return next;
    });

  return (
    <Card
      title="Images"
      description="Change the order with the arrows. The first image is the main one."
    >
      <div className="space-y-4">
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
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
                {editable ? (
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
                      onClick={() => setItems((l) => l.filter((x) => x.mediaId !== img.mediaId))}
                    >
                      Remove
                    </button>
                  </span>
                ) : null}
              </div>
            </li>
          ))}
          {items.length === 0 ? <li className="text-sm text-neutral-500">No images yet.</li> : null}
        </ul>
        {editable ? (
          <>
            <MediaPicker
              label="Add an image"
              value={null}
              onChange={(picked) => {
                if (picked && !items.some((i) => i.mediaId === picked.id) && items.length < 20) {
                  setItems((l) => [
                    ...l,
                    { mediaId: picked.id, url: picked.url, altText: picked.altText },
                  ]);
                }
              }}
            />
            <Button
              disabled={busy || !dirty}
              onClick={() =>
                run(
                  () =>
                    api(`/admin/products/${product.id}/images`, {
                      method: 'PUT',
                      body: { mediaIds: items.map((i) => i.mediaId) },
                    }),
                  'Images saved.',
                )
              }
            >
              Save images
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  );
}
