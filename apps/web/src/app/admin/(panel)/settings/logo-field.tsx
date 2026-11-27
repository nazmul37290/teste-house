'use client';

import { useState } from 'react';
import { MediaPicker, type PickedImage } from '@/components/admin/media-picker';
import { Input } from '@/components/ui';

/**
 * The store logo: pick it from the media library or upload a new one. The setting stores the image's
 * address (also used in emails), so a picked image is saved as its 500 px version; a link to any
 * other https image still works under "Or use an image link". Sent with the form as `store.logo`.
 */
export function LogoField({ initial, error }: { initial: string | null; error?: string }) {
  const [url, setUrl] = useState(initial ?? '');
  const picked: PickedImage = url ? { id: '', url, altText: 'Store logo' } : null;

  return (
    <div className="space-y-2 sm:col-span-2">
      <input type="hidden" name="store.logo" value={url} />
      <MediaPicker
        label="Logo"
        value={picked}
        previewClassName="h-16 w-48 object-contain p-1"
        onChange={(v) => setUrl(v ? (v.urls?.['500'] ?? v.url) : '')}
      />
      <p className="text-[13px] text-ink-muted">
        Shown in the shop header and footer, the admin and emails. Best: a PNG with a transparent
        background, at least 500 px wide. With no logo, the store name is shown instead.
      </p>
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-petrol">Or use an image link</summary>
        <div className="mt-2">
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value.trim())}
            placeholder="https://…"
            aria-label="Logo image link"
          />
        </div>
      </details>
    </div>
  );
}
