'use client';

import { useState } from 'react';
import { ImageListPicker, type ImageItem } from '@/components/admin/image-list-picker';
import { Alert, Badge, Button, Card } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ProductDetail } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

/** Ordered images; the first one is the primary (shown in lists and shared links). */
export function ImagesManager({
  product,
  editable,
}: {
  product: ProductDetail;
  editable: boolean;
}) {
  const initial: ImageItem[] = product.images.map((i) => ({
    mediaId: i.mediaId,
    url: i.urls['500'],
    altText: i.altText,
  }));
  const [items, setItems] = useState<ImageItem[]>(initial);
  const { busy, status, run } = useAction();
  const dirty =
    JSON.stringify(items.map((i) => i.mediaId)) !== JSON.stringify(initial.map((i) => i.mediaId));

  return (
    <Card
      title="Images"
      description="Change the order with the arrows. The first image is the main one."
    >
      <div className="space-y-4">
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
        {editable ? (
          <>
            <ImageListPicker items={items} onChange={setItems} />
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
        ) : (
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {items.map((img, i) => (
              <li key={img.mediaId} className="space-y-2 rounded-control border border-line p-2">
                <img
                  src={img.url}
                  alt={img.altText}
                  className="aspect-square w-full rounded object-cover"
                />
                {i === 0 ? <Badge tone="green">Main</Badge> : null}
              </li>
            ))}
            {items.length === 0 ? (
              <li className="text-sm text-neutral-500">No images yet.</li>
            ) : null}
          </ul>
        )}
      </div>
    </Card>
  );
}
