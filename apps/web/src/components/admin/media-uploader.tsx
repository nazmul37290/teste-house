'use client';

import { MEDIA_MAX_BYTES } from '@shop/shared';
import { useId, useRef, useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { apiUpload } from '@/lib/api-client';
import type { MediaItem } from '@/lib/admin-types';
import { ApiError } from '@/lib/api-types';

/**
 * File + required alt text. The server checks the real file type and re-encodes it.
 * Not a <form>: it is also used inside other forms (the media picker), and forms cannot nest.
 */
export function MediaUploader({ onUploaded }: { onUploaded: (media: MediaItem) => void }) {
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const altRef = useRef<HTMLInputElement>(null);
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

  async function upload() {
    const file = fileRef.current?.files?.[0];
    const altText = altRef.current?.value.trim() ?? '';
    if (!file) return setError('Choose an image first.');
    if (altText.length < 3) return setError('Describe the image in a few words (alt text).');
    const form = new FormData();
    form.set('file', file);
    form.set('altText', altText);
    setBusy(true);
    setError(null);
    try {
      const media = await apiUpload<MediaItem>('/admin/media', form);
      if (fileRef.current) fileRef.current.value = '';
      if (altRef.current) altRef.current.value = '';
      onFile(undefined);
      onUploaded(media);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Alert>{error}</Alert> : null}
      <Field
        label="Image"
        htmlFor={`${ids}-file`}
        hint="JPEG, PNG or WebP, up to 5 MB, at least 100 px. Stored as WebP."
      >
        <Input
          ref={fileRef}
          id={`${ids}-file`}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </Field>
      {/* A local blob: preview of the chosen file. */}
      {preview ? (
        <img src={preview} alt="" className="h-32 w-32 rounded border object-cover" />
      ) : null}
      <Field
        label="Alt text"
        htmlFor={`${ids}-alt`}
        hint="What the image shows, for screen readers and search engines."
      >
        <Input
          ref={altRef}
          id={`${ids}-alt`}
          maxLength={200}
          placeholder="Jar of Sundarbans honey, 500 g"
        />
      </Field>
      <Button type="button" disabled={busy} onClick={upload}>
        {busy ? 'Uploading…' : 'Upload'}
      </Button>
    </div>
  );
}
