'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input } from '@/components/ui';
import { apiUpload } from '@/lib/api-client';
import { ApiError } from '@/lib/api-types';

type RowReport = {
  row: number;
  productSlug: string;
  sku: string;
  action: 'create' | 'update' | 'error';
  errors: string[];
};
type Report = {
  ok: boolean;
  applied: boolean;
  products: { create: number; update: number };
  variants: { create: number; update: number };
  rows: RowReport[];
};

const TONE = { create: 'green', update: 'neutral', error: 'red' } as const;

export function CsvImport() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(dryRun: boolean) {
    const file = fileRef.current?.files?.[0];
    if (!file) return setError('Choose a CSV file first.');
    const form = new FormData();
    form.set('file', file);
    setBusy(true);
    setError(null);
    try {
      setReport(await apiUpload<Report>(`/admin/products/import?dryRun=${dryRun}`, form));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The import failed.');
      if (!dryRun) setReport(null);
    } finally {
      setBusy(false);
    }
  }

  const errors = report?.rows.filter((r) => r.errors.length) ?? [];
  // Errors first, then the rest, so problems are visible without scrolling.
  const rows = report ? [...errors, ...report.rows.filter((r) => !r.errors.length)] : [];

  return (
    <div className="space-y-6">
      <Card title="1. Choose the file">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="CSV file" htmlFor="csv-file" hint="Up to 2 MB and 2000 rows.">
            <Input
              ref={fileRef}
              id="csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={() => {
                setReport(null);
                setError(null);
              }}
            />
          </Field>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => send(true)}>
            {busy && !report ? 'Checking…' : 'Check file'}
          </Button>
        </div>
        {error ? (
          <div className="mt-4">
            <Alert>{error}</Alert>
          </div>
        ) : null}
      </Card>

      {report ? (
        <Card title={report.applied ? 'Imported' : '2. Check the result'}>
          <div className="space-y-4">
            {report.applied ? (
              <Alert tone="success">
                Done: {report.products.create} products created, {report.products.update} updated;{' '}
                {report.variants.create} variants created, {report.variants.update} updated.{' '}
                <Link href="/admin/products" className="underline">
                  See products
                </Link>
              </Alert>
            ) : report.ok ? (
              <Alert tone="info">
                Ready: {report.products.create} new and {report.products.update} existing products;{' '}
                {report.variants.create} new and {report.variants.update} existing variants. Nothing
                is saved yet.
              </Alert>
            ) : (
              <Alert>
                {errors.length} row(s) need fixing. Correct the file and check it again; nothing is
                saved while any row has an error.
              </Alert>
            )}
            {!report.applied ? (
              <Button disabled={busy || !report.ok} onClick={() => send(false)}>
                {busy ? 'Importing…' : 'Apply import'}
              </Button>
            ) : null}
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-neutral-500">
                <tr>
                  <th className="pb-2">Line</th>
                  <th className="pb-2">Product</th>
                  <th className="pb-2">SKU</th>
                  <th className="pb-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {rows.map((r) => (
                  <tr key={r.row} className="align-top">
                    <td className="py-2 text-neutral-500">{r.row}</td>
                    <td className="py-2">{r.productSlug || '—'}</td>
                    <td className="py-2">{r.sku || '—'}</td>
                    <td className="py-2">
                      <Badge tone={TONE[r.action]}>{r.action}</Badge>
                      {r.errors.length ? (
                        <ul className="mt-1 list-disc pl-4 text-xs text-red-700">
                          {r.errors.map((e) => (
                            <li key={e}>{e}</li>
                          ))}
                        </ul>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
