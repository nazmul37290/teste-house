'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, Badge, Button, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { ProductListItem, ProductStatus } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

const STATUS_TONE: Record<ProductStatus, 'green' | 'amber' | 'neutral'> = {
  ACTIVE: 'green',
  DRAFT: 'amber',
  ARCHIVED: 'neutral',
};
const price = (p: ProductListItem) =>
  p.priceFrom === null
    ? '—'
    : p.priceFrom === p.priceTo
      ? `Tk ${p.priceFrom}`
      : `Tk ${p.priceFrom}–${p.priceTo}`;

export function ProductTable({
  items,
  canUpdate,
}: {
  items: ProductListItem[];
  canUpdate: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkStatus, setBulkStatus] = useState<ProductStatus>('ACTIVE');
  const { busy, status, run } = useAction();

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id));

  return (
    <div className="space-y-3">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      {canUpdate && selected.size > 0 ? (
        <div className="flex items-center gap-2 rounded-control bg-neutral-100 px-3 py-2 text-sm">
          <span>{selected.size} selected:</span>
          <Select
            value={bulkStatus}
            onChange={(e) => setBulkStatus(e.target.value as ProductStatus)}
            className="w-36 py-1"
            aria-label="New status"
          >
            <option value="ACTIVE">Set active</option>
            <option value="DRAFT">Set draft</option>
            <option value="ARCHIVED">Archive</option>
          </Select>
          <Button
            className="px-3 py-1"
            disabled={busy}
            onClick={async () => {
              const done = await run(
                () =>
                  api('/admin/products/bulk-status', {
                    method: 'POST',
                    body: { ids: [...selected], status: bulkStatus },
                  }),
                'Status updated.',
              );
              if (done) setSelected(new Set());
            }}
          >
            Apply
          </Button>
        </div>
      ) : null}
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase text-neutral-500">
          <tr>
            {canUpdate ? (
              <th className="w-8 pb-2">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={allSelected}
                  onChange={() =>
                    setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)))
                  }
                />
              </th>
            ) : null}
            <th className="pb-2">Product</th>
            <th className="pb-2">Status</th>
            <th className="pb-2">Price</th>
            <th className="pb-2">Stock</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((p) => (
            <tr key={p.id}>
              {canUpdate ? (
                <td className="py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                </td>
              ) : null}
              <td className="py-2">
                <div className="flex items-center gap-3">
                  {p.image ? (
                    <img
                      src={p.image.url}
                      alt={p.image.altText}
                      className="h-10 w-10 rounded object-cover"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded bg-neutral-100" />
                  )}
                  <div>
                    <Link href={`/admin/products/${p.id}`} className="font-medium hover:underline">
                      {p.name}
                    </Link>
                    <p className="text-xs text-neutral-500">
                      {p.category}
                      {p.brand ? ` · ${p.brand}` : ''} · {p.variantCount} variant(s)
                    </p>
                  </div>
                </div>
              </td>
              <td className="py-2">
                <Badge tone={STATUS_TONE[p.status]}>{p.status.toLowerCase()}</Badge>
              </td>
              <td className="py-2">{price(p)}</td>
              <td className="py-2">{p.totalStock}</td>
            </tr>
          ))}
          {items.length === 0 ? (
            <tr>
              <td colSpan={5} className="py-6 text-center text-neutral-500">
                No products found.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
