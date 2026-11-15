'use client';

import { MEDIA_MAX_BYTES } from '@shop/shared';
import { useRef, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { apiUpload } from '@/lib/api-client';
import type { MediaItem } from '@/lib/admin-types';
import { ApiError } from '@/lib/api-types';

/** File + required alt text. The server checks the real file type and re-encodes it. */
export function MediaUploader({ onUploaded }: { onUploaded: (media: MediaItem) => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function onFile(file: File | undefined) {
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    if (!file) return setPreview(null);
    if (file.size > MEDIA_MAX_BYTES) setError('The file is larger than 5 MB.');
    setPreview(URL.createObjectURL(file));
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const media = await apiUpload<MediaItem>('/admin/media', new FormData(e.currentTarget));
      formRef.current?.reset();
      onFile(undefined);
      onUploaded(media);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label="Image"
        htmlFor="media-file"
        hint="JPEG, PNG or WebP, up to 5 MB, at least 100 px. Stored as WebP."
      >
        <Input
          id="media-file"
          name="file"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          required
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </Field>
      {/* A local blob: preview of the chosen file. */}
      {preview ? (
        <img src={preview} alt="" className="h-32 w-32 rounded border object-cover" />
      ) : null}
      <Field
        label="Alt text"
        htmlFor="media-alt"
        hint="What the image shows, for screen readers and search engines."
      >
        <Input
          id="media-alt"
          name="altText"
          required
          minLength={3}
          maxLength={200}
          placeholder="Jar of Sundarbans honey, 500 g"
        />
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  );
}
