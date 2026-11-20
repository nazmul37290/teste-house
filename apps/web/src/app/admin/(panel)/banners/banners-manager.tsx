'use client';

import { BANNER_POSITIONS } from '@shop/shared';
import { useState, type FormEvent } from 'react';
import { MediaPicker, type PickedImage } from '@/components/admin/media-picker';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Banner } from '@/lib/admin-types';
import { formatDhaka, fromDhakaInput, toDhakaInput } from '@/lib/format';
import { useAction } from '@/lib/use-action';

const POSITION_LABEL: Record<string, string> = {
  home_hero: 'Home hero (top slider)',
  home_strip: 'Home strip',
};

function liveState(b: Banner): { tone: 'green' | 'amber' | 'neutral'; text: string } {
  const now = Date.now();
  if (!b.isActive) return { tone: 'neutral', text: 'Off' };
  if (b.startsAt && new Date(b.startsAt).getTime() > now)
    return { tone: 'amber', text: 'Scheduled' };
  if (b.endsAt && new Date(b.endsAt).getTime() <= now) return { tone: 'neutral', text: 'Ended' };
  return { tone: 'green', text: 'Live' };
}

function BannerForm({ editing, onDone }: { editing: Banner | null; onDone: () => void }) {
  const { busy, status, run, fieldError } = useAction();
  const [image, setImage] = useState<PickedImage>(
    editing ? { id: editing.imageId, ...editing.image } : null,
  );
  const [mobile, setMobile] = useState<PickedImage>(
    editing?.mobileImage && editing.mobileImageId
      ? { id: editing.mobileImageId, ...editing.mobileImage }
      : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    if (!image) return;
    const link = String(form.get('linkUrl') ?? '').trim();
    const body = {
      title: String(form.get('title')).trim(),
      imageId: image.id,
      mobileImageId: mobile?.id ?? null,
      linkUrl: link || null,
      position: String(form.get('position')),
      sortOrder: Number(form.get('sortOrder') || 0),
      isActive: form.get('isActive') === 'on',
      startsAt: fromDhakaInput(String(form.get('startsAt') ?? '')),
      endsAt: fromDhakaInput(String(form.get('endsAt') ?? '')),
    };
    const saved = await run(
      () =>
        editing
          ? api(`/admin/banners/${editing.id}`, { method: 'PATCH', body })
          : api('/admin/banners', { method: 'POST', body }),
      editing ? 'Banner saved.' : 'Banner created.',
    );
    if (saved && !editing) {
      formEl.reset();
      setImage(null);
      setMobile(null);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <Field
        label="Title"
        htmlFor="b-title"
        hint="For your own reference in this list."
        error={fieldError('title')}
      >
        <Input id="b-title" name="title" required maxLength={100} defaultValue={editing?.title} />
      </Field>
      <MediaPicker label="Image (wide, e.g. 1600 × 600)" value={image} onChange={setImage} />
      {!image ? <p className="text-xs text-danger">An image is required.</p> : null}
      <MediaPicker
        label="Mobile image (optional, e.g. 1000 × 1000)"
        value={mobile}
        onChange={setMobile}
      />
      <Field
        label="Link"
        htmlFor="b-link"
        hint="A page of this shop (/category/honey) or an https:// address. Optional."
        error={fieldError('linkUrl')}
      >
        <Input
          id="b-link"
          name="linkUrl"
          maxLength={500}
          defaultValue={editing?.linkUrl ?? ''}
          placeholder="/category/honey"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Where" htmlFor="b-position">
          <Select id="b-position" name="position" defaultValue={editing?.position ?? 'home_hero'}>
            {BANNER_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {POSITION_LABEL[p] ?? p}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Order" htmlFor="b-sort" hint="Lower comes first.">
          <Input
            id="b-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={editing?.sortOrder ?? 0}
          />
        </Field>
        <Field label="Show from (Dhaka time)" htmlFor="b-start" hint="Optional.">
          <Input
            id="b-start"
            name="startsAt"
            type="datetime-local"
            defaultValue={toDhakaInput(editing?.startsAt)}
          />
        </Field>
        <Field
          label="Show until (Dhaka time)"
          htmlFor="b-end"
          hint="Optional."
          error={fieldError('endsAt')}
        >
          <Input
            id="b-end"
            name="endsAt"
            type="datetime-local"
            defaultValue={toDhakaInput(editing?.endsAt)}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={editing?.isActive ?? true} /> Show
        this banner
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !image}>
          {editing ? 'Save banner' : 'Create banner'}
        </Button>
        {editing ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function BannersManager({ banners }: { banners: Banner[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = banners.find((b) => b.id === editingId) ?? null;
  const remove = useAction();

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_28rem]">
      <Card>
        {remove.status ? (
          <div className="mb-4">
            <Alert tone={remove.status.tone}>{remove.status.text}</Alert>
          </div>
        ) : null}
        {banners.length === 0 ? (
          <p className="py-6 text-center text-sm text-neutral-500">No banners yet.</p>
        ) : null}
        <ul className="divide-y divide-line">
          {banners.map((b) => {
            const state = liveState(b);
            return (
              <li key={b.id} className="flex items-center gap-4 py-3">
                <img
                  src={b.image.url}
                  alt={b.image.altText}
                  className="h-14 w-28 rounded object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {b.title} <Badge tone={state.tone}>{state.text}</Badge>
                  </p>
                  <p className="text-xs text-neutral-500">
                    {POSITION_LABEL[b.position] ?? b.position} · order {b.sortOrder}
                    {b.startsAt ? ` · from ${formatDhaka(b.startsAt)}` : ''}
                    {b.endsAt ? ` · until ${formatDhaka(b.endsAt)}` : ''}
                  </p>
                </div>
                <button
                  type="button"
                  className="text-sm underline"
                  onClick={() => setEditingId(b.id)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-sm text-danger underline"
                  disabled={remove.busy}
                  onClick={() => {
                    if (window.confirm(`Delete the banner "${b.title}"?`)) {
                      void remove.run(
                        () => api(`/admin/banners/${b.id}`, { method: 'DELETE' }),
                        'Banner deleted.',
                      );
                    }
                  }}
                >
                  Delete
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
      <Card title={editing ? `Edit ${editing.title}` : 'New banner'}>
        <BannerForm
          key={editing?.id ?? 'new'}
          editing={editing}
          onDone={() => setEditingId(null)}
        />
      </Card>
    </div>
  );
}
