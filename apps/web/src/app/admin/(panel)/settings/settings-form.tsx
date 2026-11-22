'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, Input, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import { ApiError, type Status } from '@/lib/api-types';

/** Keys and rules come from packages/shared/src/settings.ts; the API validates every value. */
export type SettingsValues = {
  'store.name'?: string;
  'store.logo'?: string | null;
  'store.phone'?: string;
  'store.email'?: string;
  'store.address'?: string;
  'seo.defaultTitle'?: string;
  'seo.defaultDescription'?: string;
  'gtm.containerId'?: string;
  'ga4.measurementId'?: string;
  'meta.pixelId'?: string;
  'review.autoApprove'?: boolean;
  'notifications.adminEmail'?: string;
  'shipping.steadfastEnabled'?: boolean;
};

const TEXT_KEYS = [
  'store.name',
  'store.phone',
  'store.email',
  'store.address',
  'seo.defaultTitle',
  'seo.defaultDescription',
  'gtm.containerId',
  'ga4.measurementId',
  'meta.pixelId',
  'notifications.adminEmail',
] as const;

export function SettingsForm({ initial }: { initial: SettingsValues }) {
  const router = useRouter();
  const [status, setStatus] = useState<Status>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body: SettingsValues = {};
    for (const key of TEXT_KEYS) body[key] = String(form.get(key) ?? '');
    const logo = String(form.get('store.logo') ?? '').trim();
    body['store.logo'] = logo || null;
    body['review.autoApprove'] = form.get('review.autoApprove') === 'on';
    body['shipping.steadfastEnabled'] = form.get('shipping.steadfastEnabled') === 'on';

    setBusy(true);
    setStatus(null);
    setError(null);
    try {
      await api('/admin/settings', { method: 'PUT', body });
      setStatus({
        tone: 'success',
        text: 'Settings saved. The storefront shows them within a minute.',
      });
      router.refresh();
    } catch (err) {
      const apiErr =
        err instanceof ApiError ? err : new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
      setError(apiErr);
      setStatus({
        tone: 'error',
        text:
          apiErr.code === 'VALIDATION_ERROR'
            ? 'Please fix the highlighted fields.'
            : apiErr.message,
      });
    } finally {
      setBusy(false);
    }
  }

  const err = (key: string) => error?.fieldError(key);

  return (
    <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}

      <Card title="Store">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Store name" htmlFor="store.name" error={err('store.name')}>
            <Input
              id="store.name"
              name="store.name"
              defaultValue={initial['store.name'] ?? ''}
              required
              maxLength={100}
            />
          </Field>
          <Field
            label="Logo URL"
            htmlFor="store.logo"
            hint="Full https:// address. Upload arrives with the media library."
            error={err('store.logo')}
          >
            <Input
              id="store.logo"
              name="store.logo"
              type="url"
              defaultValue={initial['store.logo'] ?? ''}
              placeholder="https://…"
            />
          </Field>
          <Field
            label="Phone"
            htmlFor="store.phone"
            hint="Bangladeshi mobile number"
            error={err('store.phone')}
          >
            <Input
              id="store.phone"
              name="store.phone"
              defaultValue={initial['store.phone'] ?? ''}
              inputMode="tel"
              placeholder="01XXXXXXXXX"
            />
          </Field>
          <Field label="Email" htmlFor="store.email" error={err('store.email')}>
            <Input
              id="store.email"
              name="store.email"
              type="email"
              defaultValue={initial['store.email'] ?? ''}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Address" htmlFor="store.address" error={err('store.address')}>
              <Textarea
                id="store.address"
                name="store.address"
                rows={2}
                defaultValue={initial['store.address'] ?? ''}
                maxLength={300}
              />
            </Field>
          </div>
        </div>
      </Card>

      <Card
        title="Search engines"
        description="Used when a page has no title or description of its own."
      >
        <div className="space-y-4">
          <Field
            label="Default title"
            htmlFor="seo.defaultTitle"
            hint="Up to 70 characters"
            error={err('seo.defaultTitle')}
          >
            <Input
              id="seo.defaultTitle"
              name="seo.defaultTitle"
              defaultValue={initial['seo.defaultTitle'] ?? ''}
              maxLength={70}
            />
          </Field>
          <Field
            label="Default description"
            htmlFor="seo.defaultDescription"
            hint="Up to 160 characters"
            error={err('seo.defaultDescription')}
          >
            <Textarea
              id="seo.defaultDescription"
              name="seo.defaultDescription"
              rows={2}
              defaultValue={initial['seo.defaultDescription'] ?? ''}
              maxLength={160}
            />
          </Field>
        </div>
      </Card>

      <Card
        title="Tracking"
        description="Fill in only the tools you use; an empty box turns that tool off. Visitors see a cookie banner as soon as one is set, and nothing is tracked in the admin."
      >
        <div className="space-y-4">
          <Field
            label="Google Analytics 4 measurement ID"
            htmlFor="ga4.measurementId"
            hint="In Google Analytics: Admin, Data streams, your web stream. For example G-ABC123XYZ9. If your GTM container already has a GA4 tag, leave this empty, or every visit is counted twice."
            error={err('ga4.measurementId')}
          >
            <Input
              id="ga4.measurementId"
              name="ga4.measurementId"
              defaultValue={initial['ga4.measurementId'] ?? ''}
              placeholder="G-XXXXXXXXXX"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Meta (Facebook) Pixel ID"
            htmlFor="meta.pixelId"
            hint="In Meta Events Manager: Data sources, your Pixel. The number only. It loads after a visitor allows marketing cookies."
            error={err('meta.pixelId')}
          >
            <Input
              id="meta.pixelId"
              name="meta.pixelId"
              defaultValue={initial['meta.pixelId'] ?? ''}
              placeholder="123456789012345"
              inputMode="numeric"
              autoComplete="off"
            />
          </Field>
          <Field
            label="Google Tag Manager ID"
            htmlFor="gtm.containerId"
            hint="Optional, for tags you manage in GTM. For example GTM-ABC1234."
            error={err('gtm.containerId')}
          >
            <Input
              id="gtm.containerId"
              name="gtm.containerId"
              defaultValue={initial['gtm.containerId'] ?? ''}
              placeholder="GTM-XXXXXXX"
              autoComplete="off"
            />
          </Field>
        </div>
      </Card>

      <Card title="Notifications and other options">
        <div className="space-y-4">
          <Field
            label="Admin alert email"
            htmlFor="notifications.adminEmail"
            hint="New orders and low-stock alerts go here."
            error={err('notifications.adminEmail')}
          >
            <Input
              id="notifications.adminEmail"
              name="notifications.adminEmail"
              type="email"
              defaultValue={initial['notifications.adminEmail'] ?? ''}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="review.autoApprove"
              defaultChecked={initial['review.autoApprove'] ?? false}
            />
            Publish product reviews without moderation
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="shipping.steadfastEnabled"
              defaultChecked={initial['shipping.steadfastEnabled'] ?? false}
            />
            Book deliveries with Steadfast (available from the courier phase)
          </label>
        </div>
      </Card>

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}
