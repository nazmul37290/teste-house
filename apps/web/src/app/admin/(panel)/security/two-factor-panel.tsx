'use client';

import { useRouter } from 'next/navigation';
import QRCode from 'qrcode';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';
import { adminAuthClient } from '@/lib/auth-client';
import type { Status } from '@/lib/api-types';

type Setup = { qr: string; secret: string; backupCodes: string[] };

/**
 * TOTP two-factor (docs/auth.md, Admin 2FA). Turning it on: password, then scan the QR code, then a
 * code from the app proves it works (until then it stays off). The store name is the issuer shown
 * in the authenticator app.
 */
export function TwoFactorPanel({ enabled, issuer }: { enabled: boolean; issuer: string }) {
  const router = useRouter();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);

  const fail = (text: string) => {
    setStatus({ tone: 'error', text });
    setBusy(false);
  };

  async function onStart(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    setBusy(true);
    setStatus(null);
    const { data, error } = await adminAuthClient.twoFactor.enable({
      password,
      issuer,
      method: 'totp',
    });
    if (error || !data)
      return fail(
        error?.status === 400 ? 'Wrong password.' : error?.message || 'Could not start setup.',
      );
    if (data.method !== 'totp') return fail('Could not start authenticator setup.');
    const secret = new URL(data.totpURI).searchParams.get('secret') ?? '';
    setSetup({
      qr: await QRCode.toDataURL(data.totpURI, { margin: 1, width: 200 }),
      secret,
      backupCodes: data.backupCodes,
    });
    setBusy(false);
  }

  async function onConfirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const code = String(new FormData(e.currentTarget).get('code')).replace(/\s+/g, '');
    setBusy(true);
    setStatus(null);
    const { error } = await adminAuthClient.twoFactor.verifyTotp({ code });
    if (error) return fail('That code is not valid. Check the time on your phone and try again.');
    setSetup(null);
    setBusy(false);
    setStatus({
      tone: 'success',
      text: 'Two-factor authentication is on. You will need a code each time you sign in.',
    });
    router.refresh();
  }

  async function onDisable(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const password = String(new FormData(e.currentTarget).get('password'));
    setBusy(true);
    setStatus(null);
    const { error } = await adminAuthClient.twoFactor.disable({ password });
    if (error)
      return fail(
        error.status === 400 ? 'Wrong password.' : error.message || 'Could not turn it off.',
      );
    setBusy(false);
    setStatus({ tone: 'success', text: 'Two-factor authentication is off.' });
    router.refresh();
  }

  return (
    <Card
      title="Two-factor authentication"
      description="A code from an authenticator app (Google Authenticator, Microsoft Authenticator, ...) on top of your password."
    >
      <div className="space-y-4">
        <p className="text-sm">
          Status: {enabled ? <Badge tone="green">On</Badge> : <Badge tone="amber">Off</Badge>}
        </p>
        {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}

        {setup ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-start gap-6">
              {/* A data: URL made in the browser; nothing leaves the page. */}
              <img
                src={setup.qr}
                alt="QR code for your authenticator app"
                width={200}
                height={200}
                className="rounded border"
              />
              <div className="space-y-2 text-sm">
                <p>1. Scan this code with your authenticator app.</p>
                <p className="text-neutral-600">
                  Can&apos;t scan? Enter this key:{' '}
                  <code className="break-all font-mono text-xs">{setup.secret}</code>
                </p>
              </div>
            </div>
            <Alert tone="warning">
              <p className="font-medium">2. Save these backup codes somewhere safe.</p>
              <p className="mt-1">
                Each one works once if you lose your phone. They are shown only now.
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs">
                {setup.backupCodes.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            </Alert>
            <form onSubmit={onConfirm} className="space-y-3">
              <Field label="3. Enter the 6-digit code from the app" htmlFor="code">
                <Input
                  id="code"
                  name="code"
                  required
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                />
              </Field>
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  Turn on
                </Button>
                <Button type="button" variant="secondary" onClick={() => setSetup(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          </div>
        ) : enabled ? (
          <form onSubmit={onDisable} className="space-y-3">
            <Field
              label="Password"
              htmlFor="disable-password"
              hint="Needed to turn two-factor off."
            >
              <Input
                id="disable-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" variant="danger" disabled={busy}>
              Turn off
            </Button>
          </form>
        ) : (
          <form onSubmit={onStart} className="space-y-3">
            <Field label="Password" htmlFor="enable-password" hint="Confirm it is you.">
              <Input
                id="enable-password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
              />
            </Field>
            <Button type="submit" disabled={busy}>
              {busy ? 'Starting…' : 'Set up two-factor'}
            </Button>
          </form>
        )}
      </div>
    </Card>
  );
}
