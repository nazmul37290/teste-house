'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ImageListPicker, type ImageItem } from '@/components/admin/image-list-picker';
import { MediaPicker, type PickedImage } from '@/components/admin/media-picker';
import { Alert, Button, Card, Field, Input, Select, Textarea } from '@/components/ui';
import { api } from '@/lib/api-client';
import type { CatalogLookups, ProductDetail } from '@/lib/admin-types';
import { useAction } from '@/lib/use-action';

const text = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? '').trim();
  return v === '' ? null : v;
};

type Fact = { name: string; amount: string };

/**
 * Product fields. Creates a draft (with its images, if chosen), or saves an existing product. On the
 * edit page images and variants have their own sections.
 */
export function ProductDetailsForm({
  product,
  lookups,
}: {
  product?: ProductDetail;
  lookups: CatalogLookups;
}) {
  const router = useRouter();
  const { busy, status, run, fieldError } = useAction();
  const [facts, setFacts] = useState<Fact[]>(product?.nutritionFacts ?? []);
  // New products only: images chosen before the first save (the edit page has its own section).
  const [images, setImages] = useState<ImageItem[]>([]);
  const [tagIds, setTagIds] = useState(new Set(product?.tags.map((t) => t.id) ?? []));
  const [ogImage, setOgImage] = useState<PickedImage>(
    product?.ogImage && product.ogImageId
      ? { id: product.ogImageId, url: product.ogImage.url, altText: product.ogImage.altText }
      : null,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const cleanFacts = facts
      .map((f) => ({ name: f.name.trim(), amount: f.amount.trim() }))
      .filter((f) => f.name && f.amount);
    const body = {
      name: String(form.get('name')).trim(),
      ...(text(form, 'slug') ? { slug: text(form, 'slug') } : {}),
      categoryId: String(form.get('categoryId')),
      brandId: text(form, 'brandId'),
      shortDescription: text(form, 'shortDescription'),
      description: text(form, 'description'),
      tagIds: [...tagIds],
      ...(product ? { status: String(form.get('status')) } : {}),
      isFeatured: form.get('isFeatured') === 'on',
      isNewArrival: form.get('isNewArrival') === 'on',
      isBestSeller: form.get('isBestSeller') === 'on',
      ingredients: text(form, 'ingredients'),
      nutritionFacts: cleanFacts.length ? cleanFacts : null,
      shelfLife: text(form, 'shelfLife'),
      origin: text(form, 'origin'),
      seoTitle: text(form, 'seoTitle'),
      seoDescription: text(form, 'seoDescription'),
      canonicalUrl: text(form, 'canonicalUrl'),
      ogImageId: ogImage?.id ?? null,
    };
    if (product) {
      await run(
        () => api(`/admin/products/${product.id}`, { method: 'PATCH', body }),
        'Product saved.',
      );
    } else {
      const created = await run(async () => {
        const p = await api<ProductDetail>('/admin/products', { method: 'POST', body });
        if (images.length) {
          // Attached right after creation. If this fails (for example without products.update),
          // the product still exists and images can be added on its page.
          await api(`/admin/products/${p.id}/images`, {
            method: 'PUT',
            body: { mediaIds: images.map((i) => i.mediaId) },
          }).catch(() => undefined);
        }
        return p;
      });
      if (created) router.push(`/admin/products/${created.id}`);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {status ? <Alert tone={status.tone}>{status.text}</Alert> : null}

      <Card title="Basics">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Name" htmlFor="p-name" error={fieldError('name')}>
              <Input
                id="p-name"
                name="name"
                required
                maxLength={150}
                defaultValue={product?.name}
              />
            </Field>
          </div>
          <Field
            label="Slug"
            htmlFor="p-slug"
            hint={
              product
                ? `/product/${product.slug}. Changing it redirects the old URL.`
                : 'Leave empty to make one from the name.'
            }
            error={fieldError('slug')}
          >
            <Input id="p-slug" name="slug" maxLength={120} defaultValue={product?.slug} />
          </Field>
          {product ? (
            <Field
              label="Status"
              htmlFor="p-status"
              hint="Active needs at least one active variant."
            >
              <Select id="p-status" name="status" defaultValue={product.status}>
                <option value="DRAFT">Draft (hidden)</option>
                <option value="ACTIVE">Active (in the shop)</option>
                <option value="ARCHIVED">Archived</option>
              </Select>
            </Field>
          ) : (
            <p className="self-end pb-2 text-sm text-neutral-500">
              New products start as drafts. Add variants, then activate.
            </p>
          )}
          <Field label="Category" htmlFor="p-category" error={fieldError('categoryId')}>
            <Select
              id="p-category"
              name="categoryId"
              required
              defaultValue={product?.categoryId ?? ''}
            >
              <option value="" disabled>
                Choose a category
              </option>
              {lookups.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {'— '.repeat(c.depth - 1)}
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Brand" htmlFor="p-brand">
            <Select id="p-brand" name="brandId" defaultValue={product?.brandId ?? ''}>
              <option value="">No brand</option>
              {lookups.brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <fieldset className="mt-4 flex flex-wrap gap-4 text-sm">
          <legend className="mb-1 text-sm font-medium">Flags</legend>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isFeatured" defaultChecked={product?.isFeatured} />{' '}
            Featured
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isNewArrival" defaultChecked={product?.isNewArrival} /> New
            arrival
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isBestSeller" defaultChecked={product?.isBestSeller} />{' '}
            Best seller
          </label>
        </fieldset>
        {lookups.tags.length ? (
          <fieldset className="mt-4 flex flex-wrap gap-3 text-sm">
            <legend className="mb-1 text-sm font-medium">Tags</legend>
            {lookups.tags.map((t) => (
              <label key={t.id} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={tagIds.has(t.id)}
                  onChange={(e) =>
                    setTagIds((s) => {
                      const next = new Set(s);
                      if (e.target.checked) next.add(t.id);
                      else next.delete(t.id);
                      return next;
                    })
                  }
                />
                {t.name}
              </label>
            ))}
          </fieldset>
        ) : null}
      </Card>

      <Card
        title="Description"
        description="Plain text. Separate paragraphs with an empty line; start a line with “- ” for a bullet."
      >
        <div className="space-y-4">
          <Field
            label="Short description"
            htmlFor="p-short"
            hint="Up to 300 characters, shown near the price."
          >
            <Textarea
              id="p-short"
              name="shortDescription"
              rows={2}
              maxLength={300}
              defaultValue={product?.shortDescription ?? ''}
            />
          </Field>
          <Field label="Full description" htmlFor="p-desc">
            <Textarea
              id="p-desc"
              name="description"
              rows={8}
              maxLength={10_000}
              defaultValue={product?.description ?? ''}
            />
          </Field>
        </div>
      </Card>

      {!product ? (
        <Card
          title="Images"
          description="Upload or choose from the media library. The first image is the main one; change the order with the arrows."
        >
          <ImageListPicker items={images} onChange={setImages} />
        </Card>
      ) : null}

      <Card title="Food information">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Ingredients" htmlFor="p-ingredients">
              <Textarea
                id="p-ingredients"
                name="ingredients"
                rows={2}
                maxLength={2000}
                defaultValue={product?.ingredients ?? ''}
              />
            </Field>
          </div>
          <Field
            label="Shelf life"
            htmlFor="p-shelf"
            hint="For example: 24 months from manufacture"
          >
            <Input
              id="p-shelf"
              name="shelfLife"
              maxLength={100}
              defaultValue={product?.shelfLife ?? ''}
            />
          </Field>
          <Field label="Origin" htmlFor="p-origin" hint="For example: Bangladesh">
            <Input
              id="p-origin"
              name="origin"
              maxLength={100}
              defaultValue={product?.origin ?? ''}
            />
          </Field>
        </div>
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Nutrition facts</p>
          {facts.map((f, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={f.name}
                onChange={(e) =>
                  setFacts((fs) => fs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                }
                placeholder="Energy"
                maxLength={50}
                aria-label="Nutrient"
              />
              <Input
                value={f.amount}
                onChange={(e) =>
                  setFacts((fs) =>
                    fs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)),
                  )
                }
                placeholder="304 kcal per 100 g"
                maxLength={30}
                aria-label="Amount"
              />
              <Button
                type="button"
                variant="secondary"
                onClick={() => setFacts((fs) => fs.filter((_, j) => j !== i))}
              >
                Remove
              </Button>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={facts.length >= 30}
            onClick={() => setFacts((fs) => [...fs, { name: '', amount: '' }])}
          >
            Add a row
          </Button>
        </div>
      </Card>

      <Card
        title="Search engines and sharing"
        description="Optional. Empty fields use the product name and the store defaults."
      >
        <div className="space-y-4">
          <Field label="SEO title" htmlFor="p-seo-title" hint="Up to 70 characters.">
            <Input
              id="p-seo-title"
              name="seoTitle"
              maxLength={70}
              defaultValue={product?.seoTitle ?? ''}
            />
          </Field>
          <Field label="SEO description" htmlFor="p-seo-desc" hint="Up to 160 characters.">
            <Textarea
              id="p-seo-desc"
              name="seoDescription"
              rows={2}
              maxLength={160}
              defaultValue={product?.seoDescription ?? ''}
            />
          </Field>
          <Field
            label="Canonical URL"
            htmlFor="p-canonical"
            hint="Only if this product's main page is somewhere else."
            error={fieldError('canonicalUrl')}
          >
            <Input
              id="p-canonical"
              name="canonicalUrl"
              type="url"
              maxLength={500}
              defaultValue={product?.canonicalUrl ?? ''}
            />
          </Field>
          <MediaPicker
            label="Sharing image (Facebook, WhatsApp)"
            value={ogImage}
            onChange={setOgImage}
          />
        </div>
      </Card>

      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : product ? 'Save product' : 'Create draft'}
      </Button>
    </form>
  );
}
