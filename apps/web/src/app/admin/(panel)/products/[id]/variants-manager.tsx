'use client';

import {
  formatPaisa,
  MEASURE_UNITS,
  parsePaisa,
  pricePerUnit,
  variantLabel,
  type MeasureUnit,
} from '@shop/shared';
import { useState, type FormEvent } from 'react';
import { Alert, Badge, Button, Card, Field, Input, Select } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { Attribute, ProductDetail, Variant } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

const UNIT_NAMES: Record<MeasureUnit, string> = {
  G: 'grams (g)',
  KG: 'kilograms (kg)',
  ML: 'millilitres (ml)',
  L: 'litres (L)',
  PCS: 'pieces',
  DOZEN: 'dozen',
  PACK: 'pack',
};

/** Live preview only; the server stores and calculates every price itself. */
function previewPerUnit(price: string, unit: string, unitValue: string): string | null {
  try {
    const result = pricePerUnit(
      parsePaisa(price),
      (unit || null) as MeasureUnit | null,
      unitValue || null,
    );
    return result ? `Tk ${formatPaisa(result.paisa)} per ${result.per}` : null;
  } catch {
    return null;
  }
}

function autoLabel(unit: string, unitValue: string): string {
  try {
    return unit && unitValue ? variantLabel(unit as MeasureUnit, unitValue) : '';
  } catch {
    return '';
  }
}

const opt = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
};
const int = (form: FormData, key: string) => {
  const v = opt(form, key);
  return v === null ? null : Number(v);
};

function VariantForm({
  productId,
  variant,
  attributes,
  onDone,
}: {
  productId: string;
  variant: Variant | null;
  attributes: Attribute[];
  onDone: () => void;
}) {
  const { busy, status, run, fieldError } = useAction();
  const [unit, setUnit] = useState(variant?.unit ?? '');
  const [unitValue, setUnitValue] = useState(variant?.unitValue ?? '');
  const [price, setPrice] = useState(variant?.price ?? '');
  const generated = autoLabel(unit, unitValue);
  const preview = previewPerUnit(price, unit, unitValue);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const attributeValueIds = attributes
      .map((a) => opt(form, `attr-${a.id}`))
      .filter((v): v is string => v !== null);
    const label = opt(form, 'name');
    const body = {
      sku: String(form.get('sku')).trim(),
      // An empty label means "generate it from the net content".
      name: variant ? label : (label ?? undefined),
      unit: unit || null,
      unitValue: unitValue.trim() || null,
      price: price.trim(),
      salePrice: opt(form, 'salePrice'),
      weightGrams: int(form, 'weightGrams'),
      barcode: opt(form, 'barcode'),
      lowStockThreshold: int(form, 'lowStockThreshold') ?? 5,
      isActive: form.get('isActive') === 'on',
      sortOrder: int(form, 'sortOrder') ?? 0,
      attributeValueIds,
      ...(variant ? {} : { initialStock: int(form, 'initialStock') ?? 0 }),
    };
    const saved = await run(
      () =>
        variant
          ? api(`/admin/variants/${variant.id}`, { method: 'PATCH', body })
          : api(`/admin/products/${productId}/variants`, { method: 'POST', body }),
      variant ? 'Variant saved.' : 'Variant added.',
    );
    if (saved) {
      if (!variant) {
        formEl.reset();
        setUnit('');
        setUnitValue('');
        setPrice('');
      }
      onDone();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-control border border-line bg-neutral-50 p-4"
    >
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field
          label="SKU"
          htmlFor="v-sku"
          hint="Your stock code, unique."
          error={fieldError('sku')}
        >
          <Input
            id="v-sku"
            name="sku"
            required
            maxLength={64}
            defaultValue={variant?.sku}
            placeholder="HONEY-500G"
          />
        </Field>
        <Field label="Net content unit" htmlFor="v-unit">
          <Select id="v-unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
            <option value="">None</option>
            {MEASURE_UNITS.map((u) => (
              <option key={u} value={u}>
                {UNIT_NAMES[u]}
              </option>
            ))}
          </Select>
        </Field>
        <Field
          label="Amount"
          htmlFor="v-amount"
          hint="e.g. 500 or 1.5"
          error={fieldError('unitValue')}
        >
          <Input
            id="v-amount"
            value={unitValue}
            onChange={(e) => setUnitValue(e.target.value)}
            inputMode="decimal"
            disabled={!unit}
          />
        </Field>
        <Field
          label="Label"
          htmlFor="v-name"
          hint={generated ? `Empty: "${generated}"` : 'Needed when there is no net content.'}
          error={fieldError('name')}
        >
          <Input
            id="v-name"
            name="name"
            maxLength={60}
            defaultValue={variant && variant.name !== generated ? variant.name : ''}
            placeholder={generated}
          />
        </Field>
        <Field
          label="Price (Tk)"
          htmlFor="v-price"
          hint={preview ?? undefined}
          error={fieldError('price')}
        >
          <Input
            id="v-price"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            inputMode="decimal"
            placeholder="450"
          />
        </Field>
        <Field
          label="Sale price (Tk)"
          htmlFor="v-sale"
          hint="Optional, lower than the price."
          error={fieldError('salePrice')}
        >
          <Input
            id="v-sale"
            name="salePrice"
            inputMode="decimal"
            defaultValue={variant?.salePrice ?? ''}
          />
        </Field>
        <Field
          label="Shipping weight (g)"
          htmlFor="v-weight"
          hint="With packaging, for the courier."
        >
          <Input
            id="v-weight"
            name="weightGrams"
            type="number"
            min={1}
            defaultValue={variant?.weightGrams ?? ''}
          />
        </Field>
        <Field label="Barcode" htmlFor="v-barcode">
          <Input
            id="v-barcode"
            name="barcode"
            maxLength={64}
            defaultValue={variant?.barcode ?? ''}
          />
        </Field>
        <Field label="Low-stock alert at" htmlFor="v-low">
          <Input
            id="v-low"
            name="lowStockThreshold"
            type="number"
            min={0}
            defaultValue={variant?.lowStockThreshold ?? 5}
          />
        </Field>
        {attributes.map((a) => {
          const current = a.values.find((v) => variant?.attributeValueIds.includes(v.id));
          return (
            <Field key={a.id} label={a.name} htmlFor={`v-attr-${a.id}`}>
              <Select id={`v-attr-${a.id}`} name={`attr-${a.id}`} defaultValue={current?.id ?? ''}>
                <option value="">—</option>
                {a.values.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.value}
                  </option>
                ))}
              </Select>
            </Field>
          );
        })}
        {variant ? (
          <p className="self-end pb-2 text-sm text-neutral-600">
            Stock: <strong>{variant.stockQty}</strong> (change it under Inventory)
          </p>
        ) : (
          <Field label="Opening stock" htmlFor="v-stock" hint="Recorded as a purchase.">
            <Input id="v-stock" name="initialStock" type="number" min={0} defaultValue={0} />
          </Field>
        )}
        <Field label="Sort order" htmlFor="v-sort">
          <Input
            id="v-sort"
            name="sortOrder"
            type="number"
            min={0}
            defaultValue={variant?.sortOrder ?? 0}
          />
        </Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked={variant?.isActive ?? true} />{' '}
        Available for sale
      </label>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {variant ? 'Save variant' : 'Add variant'}
        </Button>
        {variant ? (
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}

export function VariantsManager({
  product,
  attributes,
  editable,
}: {
  product: ProductDetail;
  attributes: Attribute[];
  editable: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(product.variants.length === 0);
  const remove = useAction();
  const editing = product.variants.find((v) => v.id === editingId) ?? null;
  const valueName = new Map(
    attributes.flatMap((a) => a.values.map((v) => [v.id, v.value] as const)),
  );

  return (
    <Card
      title="Variants"
      description="Each size or flavour you sell, with its own SKU, price and stock."
    >
      <div className="space-y-4">
        {remove.status ? <Alert tone={remove.status.tone}>{remove.status.text}</Alert> : null}
        {product.variants.length ? (
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-neutral-500">
              <tr>
                <th className="pb-2">Variant</th>
                <th className="pb-2">Price</th>
                <th className="pb-2">Stock</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {product.variants.map((v) => (
                <tr key={v.id}>
                  <td className="py-2">
                    <span className="font-medium">{v.name}</span>{' '}
                    {!v.isActive ? <Badge tone="amber">Off</Badge> : null}
                    <p className="text-xs text-neutral-500">
                      {v.sku}
                      {v.attributeValueIds.map((id) => ` · ${valueName.get(id) ?? ''}`).join('')}
                    </p>
                  </td>
                  <td className="py-2">
                    {v.salePrice ? (
                      <>
                        Tk {v.salePrice}{' '}
                        <span className="text-xs text-neutral-400 line-through">Tk {v.price}</span>
                      </>
                    ) : (
                      `Tk ${v.price}`
                    )}
                  </td>
                  <td className="py-2">
                    {v.stockQty}
                    {v.stockQty <= v.lowStockThreshold ? (
                      <span className="ml-1">
                        <Badge tone="red">Low</Badge>
                      </span>
                    ) : null}
                  </td>
                  <td className="space-x-3 py-2 text-right">
                    {editable ? (
                      <>
                        <button
                          type="button"
                          className="underline"
                          onClick={() => setEditingId(v.id)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-danger underline disabled:text-neutral-300 disabled:no-underline"
                          disabled={remove.busy || v.hasHistory}
                          title={
                            v.hasHistory
                              ? 'Has stock history or sales: deactivate it instead'
                              : undefined
                          }
                          onClick={() => {
                            if (window.confirm(`Delete the variant ${v.name} (${v.sku})?`)) {
                              void remove.run(
                                () => api(`/admin/variants/${v.id}`, { method: 'DELETE' }),
                                'Variant deleted.',
                              );
                            }
                          }}
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-neutral-500">
            No variants yet. Add at least one before activating the product.
          </p>
        )}
        {editable && editing ? (
          <VariantForm
            key={editing.id}
            productId={product.id}
            variant={editing}
            attributes={attributes}
            onDone={() => setEditingId(null)}
          />
        ) : null}
        {editable && !editing ? (
          adding ? (
            <VariantForm
              key="new"
              productId={product.id}
              variant={null}
              attributes={attributes}
              onDone={() => setAdding(false)}
            />
          ) : (
            <Button variant="secondary" onClick={() => setAdding(true)}>
              Add a variant
            </Button>
          )
        ) : null}
      </div>
    </Card>
  );
}
