import {
  createProductSchema,
  createVariantSchema,
  updateProductSchema,
  updateVariantSchema,
  variantLabel,
  type MeasureUnit,
} from '@shop/shared';
import Papa from 'papaparse';
import type { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { recordAudit, type Actor } from './audit.service';

/**
 * CSV import and export of products (CAT-7). One row per variant; product columns repeat on each of
 * its rows. Products match by product_slug, variants by sku. Stock is used only for NEW variants
 * (a PURCHASE movement); existing stock changes only through inventory adjustments. Every import is
 * validated in full first; applying writes everything in one transaction or nothing.
 */

export const CSV_COLUMNS = [
  'product_slug',
  'product_name',
  'category_slug',
  'brand_slug',
  'status',
  'short_description',
  'description',
  'is_featured',
  'is_new_arrival',
  'is_best_seller',
  'ingredients',
  'nutrition_facts',
  'shelf_life',
  'origin',
  'seo_title',
  'seo_description',
  'tags',
  'sku',
  'variant_label',
  'unit',
  'unit_value',
  'price',
  'sale_price',
  'weight_grams',
  'barcode',
  'low_stock_threshold',
  'variant_active',
  'attributes',
  'stock',
] as const;
type Column = (typeof CSV_COLUMNS)[number];
type Row = Partial<Record<Column, string>>;

const PRODUCT_COLUMNS: Column[] = CSV_COLUMNS.slice(0, CSV_COLUMNS.indexOf('sku'));
/** Variant columns other than sku: a row without a sku must leave all of them empty. */
const VARIANT_DATA_COLUMNS: Column[] = CSV_COLUMNS.slice(CSV_COLUMNS.indexOf('sku') + 1);

/** UTF-8 byte order mark: Excel needs it to read the file as UTF-8. */
export const BOM = String.fromCharCode(0xfeff);
export const stripBom = (text: string) => (text.startsWith(BOM) ? text.slice(1) : text);

export const MAX_CSV_ROWS = 2000;
export const MAX_CSV_BYTES = 2 * 1024 * 1024;

// Export ---------------------------------------------------------------------------------------

/** Spreadsheet formula injection: a leading = + - @ (or tab/CR) is neutralised with an apostrophe. */
const RISKY = /^[=+\-@\t\r]/;
const safeCell = (v: string) => (RISKY.test(v) ? `'${v}` : v);
const unsafeCell = (v: string) => (v.startsWith("'") && RISKY.test(v.slice(1)) ? v.slice(1) : v);

const pairs = (list: { name: string; value: string }[]) =>
  list.map((p) => `${p.name}=${p.value}`).join(';');

export async function exportProductsCsv(prisma: Db): Promise<string> {
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    orderBy: { name: 'asc' },
    select: {
      slug: true,
      name: true,
      status: true,
      shortDescription: true,
      description: true,
      isFeatured: true,
      isNewArrival: true,
      isBestSeller: true,
      ingredients: true,
      nutritionFacts: true,
      shelfLife: true,
      origin: true,
      seoTitle: true,
      seoDescription: true,
      category: { select: { slug: true } },
      brand: { select: { slug: true } },
      tags: { select: { tag: { select: { slug: true } } } },
      variants: {
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
        select: {
          sku: true,
          name: true,
          unit: true,
          unitValue: true,
          price: true,
          salePrice: true,
          weightGrams: true,
          barcode: true,
          lowStockThreshold: true,
          isActive: true,
          stockQty: true,
          attributeValues: {
            select: {
              attributeValue: { select: { value: true, attribute: { select: { name: true } } } },
            },
          },
        },
      },
    },
  });

  const rows: Record<Column, string>[] = [];
  for (const p of products) {
    const facts = Array.isArray(p.nutritionFacts)
      ? (p.nutritionFacts as { name: string; amount: string }[])
      : [];
    const productCells = {
      product_slug: p.slug,
      product_name: p.name,
      category_slug: p.category.slug,
      brand_slug: p.brand?.slug ?? '',
      status: p.status,
      short_description: p.shortDescription ?? '',
      description: p.description ?? '',
      is_featured: String(p.isFeatured),
      is_new_arrival: String(p.isNewArrival),
      is_best_seller: String(p.isBestSeller),
      ingredients: p.ingredients ?? '',
      nutrition_facts: pairs(facts.map((f) => ({ name: f.name, value: f.amount }))),
      shelf_life: p.shelfLife ?? '',
      origin: p.origin ?? '',
      seo_title: p.seoTitle ?? '',
      seo_description: p.seoDescription ?? '',
      tags: p.tags.map((t) => t.tag.slug).join(';'),
    };
    const variants = p.variants.length ? p.variants : [null];
    for (const v of variants) {
      const generated =
        v?.unit && v.unitValue ? variantLabel(v.unit, String(Number(v.unitValue.toFixed(3)))) : '';
      rows.push({
        ...productCells,
        sku: v?.sku ?? '',
        // Empty when the label is the generated one, so a later unit change keeps it in sync.
        variant_label: v && v.name !== generated ? v.name : '',
        unit: v?.unit ?? '',
        unit_value: v?.unitValue ? String(Number(v.unitValue.toFixed(3))) : '',
        price: v ? v.price.toFixed(2) : '',
        sale_price: v?.salePrice ? v.salePrice.toFixed(2) : '',
        weight_grams: v?.weightGrams ? String(v.weightGrams) : '',
        barcode: v?.barcode ?? '',
        low_stock_threshold: v ? String(v.lowStockThreshold) : '',
        variant_active: v ? String(v.isActive) : '',
        attributes: v
          ? pairs(
              v.attributeValues.map((a) => ({
                name: a.attributeValue.attribute.name,
                value: a.attributeValue.value,
              })),
            )
          : '',
        stock: v ? String(v.stockQty) : '',
      });
    }
  }
  const safe = rows.map((r) =>
    Object.fromEntries(Object.entries(r).map(([k, val]) => [k, safeCell(val)])),
  );
  // BOM: Excel then reads the file as UTF-8 (Bengali product names stay readable).
  return `${BOM}${Papa.unparse({ fields: [...CSV_COLUMNS], data: safe.map((r) => CSV_COLUMNS.map((c) => r[c] ?? '')) })}`;
}

// Import ---------------------------------------------------------------------------------------

export type RowReport = {
  row: number;
  productSlug: string;
  sku: string;
  action: 'create' | 'update' | 'error';
  errors: string[];
};
export type ImportReport = {
  ok: boolean;
  applied: boolean;
  products: { create: number; update: number };
  variants: { create: number; update: number };
  rows: RowReport[];
};

const text = (v: string | undefined) => {
  const t = unsafeCell((v ?? '').trim());
  return t === '' ? undefined : t;
};
function bool(v: string | undefined, path: string, errors: string[]): boolean | undefined {
  const t = text(v)?.toLowerCase();
  if (t === undefined) return undefined;
  if (['true', 'yes', '1', 'y'].includes(t)) return true;
  if (['false', 'no', '0', 'n'].includes(t)) return false;
  errors.push(`${path}: use true or false`);
  return undefined;
}
function int(v: string | undefined, path: string, errors: string[]): number | undefined {
  const t = text(v);
  if (t === undefined) return undefined;
  if (!/^\d+$/.test(t)) {
    errors.push(`${path}: must be a whole number`);
    return undefined;
  }
  return Number(t);
}
function parsePairs(v: string | undefined, path: string, errors: string[]) {
  const t = text(v);
  if (!t) return [];
  return t.split(';').flatMap((part) => {
    const idx = part.indexOf('=');
    if (idx <= 0) {
      errors.push(`${path}: write Name=Value, separated by ;`);
      return [];
    }
    return [{ name: part.slice(0, idx).trim(), value: part.slice(idx + 1).trim() }];
  });
}
const zodErrors = (issues: { path: PropertyKey[]; message: string }[], prefix = '') =>
  issues.map((i) => `${prefix}${i.path.join('.') || 'row'}: ${i.message}`);

type Lookups = {
  categories: Map<string, string>;
  brands: Map<string, string>;
  tags: Map<string, string>;
  /** "flavor=classic malt" (lowercase) -> attribute value id */
  attributeValues: Map<string, { id: string; attributeId: string }>;
};

async function loadLookups(prisma: Db): Promise<Lookups> {
  const [categories, brands, tags, values] = await Promise.all([
    prisma.category.findMany({ select: { id: true, slug: true } }),
    prisma.brand.findMany({ select: { id: true, slug: true } }),
    prisma.tag.findMany({ select: { id: true, slug: true } }),
    prisma.attributeValue.findMany({
      select: { id: true, value: true, attributeId: true, attribute: { select: { name: true } } },
    }),
  ]);
  return {
    categories: new Map(categories.map((c) => [c.slug, c.id])),
    brands: new Map(brands.map((b) => [b.slug, b.id])),
    tags: new Map(tags.map((t) => [t.slug, t.id])),
    attributeValues: new Map(
      values.map((v) => [
        `${v.attribute.name}=${v.value}`.toLowerCase(),
        { id: v.id, attributeId: v.attributeId },
      ]),
    ),
  };
}

type PlannedVariant = {
  rowIndex: number;
  sku: string;
  existingId: string | null;
  data: Record<string, unknown>;
  attributeValueIds: string[];
  stock: number;
};
type PlannedProduct = {
  slug: string;
  existingId: string | null;
  data: Record<string, unknown>;
  tagIds: string[] | undefined;
  variants: PlannedVariant[];
};

/** Validates the whole file against the database and builds the write plan. No writes. */
async function plan(
  prisma: Db,
  csv: string,
): Promise<{ report: ImportReport; products: PlannedProduct[] }> {
  const parsed = Papa.parse<Row>(stripBom(csv), {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fileErrors = parsed.errors.slice(0, 5).map((e) => `Line ${(e.row ?? 0) + 2}: ${e.message}`);
  const headers = parsed.meta.fields ?? [];
  const unknown = headers.filter((h) => !(CSV_COLUMNS as readonly string[]).includes(h));
  const missing = (['product_slug', 'product_name', 'category_slug', 'sku'] as const).filter(
    (c) => !headers.includes(c),
  );
  if (unknown.length) fileErrors.push(`Unknown columns: ${unknown.join(', ')}`);
  if (missing.length) fileErrors.push(`Missing columns: ${missing.join(', ')}`);
  if (parsed.data.length > MAX_CSV_ROWS) fileErrors.push(`At most ${MAX_CSV_ROWS} rows per file`);
  if (parsed.data.length === 0) fileErrors.push('The file has no rows');
  if (fileErrors.length)
    throw new AppError(
      'VALIDATION_ERROR',
      fileErrors.join('. '),
      fileErrors.map((message) => ({ path: 'file', message })),
    );

  const lookups = await loadLookups(prisma);
  const slugs = [
    ...new Set(parsed.data.map((r) => text(r.product_slug)).filter((s): s is string => !!s)),
  ];
  const skus = [
    ...new Set(parsed.data.map((r) => text(r.sku)?.toUpperCase()).filter((s): s is string => !!s)),
  ];
  const [existingProducts, existingVariants] = await Promise.all([
    prisma.product.findMany({
      where: { slug: { in: slugs } },
      select: {
        id: true,
        slug: true,
        deletedAt: true,
        variants: { select: { id: true, sku: true, isActive: true } },
      },
    }),
    prisma.productVariant.findMany({
      where: { sku: { in: skus } },
      select: { id: true, sku: true, productId: true },
    }),
  ]);
  const productBySlug = new Map(existingProducts.map((p) => [p.slug, p]));
  const variantBySku = new Map(existingVariants.map((v) => [v.sku, v]));

  const rows: RowReport[] = [];
  const groups = new Map<string, { firstRow: Row; firstIndex: number; product: PlannedProduct }>();
  const seenSkus = new Map<string, number>();

  parsed.data.forEach((raw, i) => {
    const rowNumber = i + 2; // header is line 1
    const errors: string[] = [];
    const slug = text(raw.product_slug)?.toLowerCase() ?? '';
    const sku = text(raw.sku)?.toUpperCase() ?? '';
    const report: RowReport = { row: rowNumber, productSlug: slug, sku, action: 'create', errors };
    rows.push(report);
    if (!slug) errors.push('product_slug: required');
    // No sku: a product-only row (e.g. a draft without variants yet), unless variant data is given.
    const variantData = VARIANT_DATA_COLUMNS.filter((c) => text(raw[c]) !== undefined);
    if (!sku && variantData.length)
      errors.push(
        `sku: required when ${variantData.join(', ')} ${variantData.length > 1 ? 'are' : 'is'} filled`,
      );
    if (sku && seenSkus.has(sku)) errors.push(`sku: also used on line ${seenSkus.get(sku)}`);
    if (sku) seenSkus.set(sku, rowNumber);
    if (!slug) return;

    // Product: built once per slug; later rows must not disagree.
    let group = groups.get(slug);
    const existing = productBySlug.get(slug);
    if (!group) {
      if (existing?.deletedAt)
        errors.push('product_slug: belongs to a deleted product; choose another slug');
      const categoryId = lookups.categories.get(text(raw.category_slug)?.toLowerCase() ?? '');
      if (!categoryId)
        errors.push(`category_slug: "${text(raw.category_slug) ?? ''}" does not exist`);
      const brandSlug = text(raw.brand_slug)?.toLowerCase();
      const brandId = brandSlug ? lookups.brands.get(brandSlug) : null;
      if (brandSlug && !brandId) errors.push(`brand_slug: "${brandSlug}" does not exist`);
      const tagSlugs = text(raw.tags)
        ?.split(';')
        .map((t) => t.trim().toLowerCase())
        .filter(Boolean);
      const tagIds = tagSlugs?.map((t) => {
        const id = lookups.tags.get(t);
        if (!id) errors.push(`tags: "${t}" does not exist`);
        return id ?? '';
      });
      const facts = parsePairs(raw.nutrition_facts, 'nutrition_facts', errors).map((f) => ({
        name: f.name,
        amount: f.value,
      }));
      const data = {
        name: text(raw.product_name),
        slug,
        categoryId,
        brandId: brandSlug ? brandId : null,
        status: text(raw.status)?.toUpperCase(),
        shortDescription: text(raw.short_description) ?? null,
        description: text(raw.description) ?? null,
        isFeatured: bool(raw.is_featured, 'is_featured', errors),
        isNewArrival: bool(raw.is_new_arrival, 'is_new_arrival', errors),
        isBestSeller: bool(raw.is_best_seller, 'is_best_seller', errors),
        ingredients: text(raw.ingredients) ?? null,
        nutritionFacts: facts.length ? facts : null,
        shelfLife: text(raw.shelf_life) ?? null,
        origin: text(raw.origin) ?? null,
        seoTitle: text(raw.seo_title) ?? null,
        seoDescription: text(raw.seo_description) ?? null,
      };
      const schema = existing ? updateProductSchema : createProductSchema;
      const check = schema.safeParse({
        ...data,
        ...(tagIds ? { tagIds: tagIds.filter(Boolean) } : {}),
        categoryId: categoryId ?? '00000000-0000-0000-0000-000000000000',
      });
      if (!check.success) errors.push(...zodErrors(check.error.issues));
      group = {
        firstRow: raw,
        firstIndex: rowNumber,
        product: {
          slug,
          existingId: existing && !existing.deletedAt ? existing.id : null,
          data: Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)),
          tagIds: tagIds?.filter(Boolean),
          variants: [],
        },
      };
      groups.set(slug, group);
    } else {
      const differs = PRODUCT_COLUMNS.filter(
        (c) => text(raw[c]) !== undefined && text(raw[c]) !== text(group!.firstRow[c]),
      );
      if (differs.length)
        errors.push(
          `${differs.join(', ')}: differs from line ${group.firstIndex} for the same product`,
        );
    }

    // Variant (none on a product-only row).
    if (!sku) {
      report.action = group.product.existingId ? 'update' : 'create';
      return;
    }
    const existingVariant = variantBySku.get(sku);
    if (existingVariant && existingVariant.productId !== group.product.existingId) {
      errors.push(`sku: ${sku} already belongs to another product`);
    }
    const attrs = parsePairs(raw.attributes, 'attributes', errors);
    const attributeValueIds = attrs.flatMap((a) => {
      const found = lookups.attributeValues.get(`${a.name}=${a.value}`.toLowerCase());
      if (!found) errors.push(`attributes: "${a.name}=${a.value}" does not exist`);
      return found ? [found] : [];
    });
    if (new Set(attributeValueIds.map((a) => a.attributeId)).size !== attributeValueIds.length) {
      errors.push('attributes: only one value per attribute');
    }
    const variant = {
      sku,
      name: text(raw.variant_label) ?? null,
      unit: (text(raw.unit)?.toUpperCase() as MeasureUnit | undefined) ?? null,
      unitValue: text(raw.unit_value) ?? null,
      price: text(raw.price),
      salePrice: text(raw.sale_price) ?? null,
      weightGrams: int(raw.weight_grams, 'weight_grams', errors) ?? null,
      barcode: text(raw.barcode) ?? null,
      lowStockThreshold: int(raw.low_stock_threshold, 'low_stock_threshold', errors),
      isActive: bool(raw.variant_active, 'variant_active', errors),
    };
    const stock = int(raw.stock, 'stock', errors) ?? 0;
    const check = existingVariant
      ? updateVariantSchema.safeParse(variant)
      : createVariantSchema.safeParse({ ...variant, initialStock: stock });
    if (!check.success) errors.push(...zodErrors(check.error.issues));
    report.action = existingVariant ? 'update' : 'create';
    group.product.variants.push({
      rowIndex: rowNumber,
      sku,
      existingId: existingVariant?.id ?? null,
      data: check.success ? (check.data as Record<string, unknown>) : {},
      attributeValueIds: attributeValueIds.map((a) => a.id),
      stock: existingVariant ? 0 : stock,
    });
  });

  // An ACTIVE product needs an active variant after the import (existing ones count too).
  for (const { product, firstIndex } of groups.values()) {
    if (product.data.status !== 'ACTIVE') continue;
    const touched = new Set(product.variants.map((v) => v.sku));
    const keptActive = (productBySlug.get(product.slug)?.variants ?? []).some(
      (v) => v.isActive && !touched.has(v.sku),
    );
    const importedActive = product.variants.some((v) => v.data.isActive !== false);
    if (!keptActive && !importedActive)
      rows
        .find((r) => r.row === firstIndex)
        ?.errors.push('status: ACTIVE needs at least one active variant');
  }

  for (const r of rows) if (r.errors.length) r.action = 'error';
  const products = [...groups.values()].map((g) => g.product);
  const variants = products.flatMap((p) => p.variants);
  return {
    products,
    report: {
      ok: rows.every((r) => r.errors.length === 0),
      applied: false,
      products: {
        create: products.filter((p) => !p.existingId).length,
        update: products.filter((p) => p.existingId).length,
      },
      variants: {
        create: variants.filter((v) => !v.existingId).length,
        update: variants.filter((v) => v.existingId).length,
      },
      rows,
    },
  };
}

function labelFor(v: Record<string, unknown>): string | undefined {
  if (typeof v.name === 'string' && v.name) return v.name;
  if (typeof v.unit === 'string' && typeof v.unitValue === 'string')
    return variantLabel(v.unit as MeasureUnit, v.unitValue);
  return undefined;
}

/** Dry run: the report only. Apply: the same checks, then all writes in one transaction. */
export async function importProductsCsv(
  prisma: Db,
  actor: Actor,
  csv: string,
  dryRun: boolean,
): Promise<ImportReport> {
  const { report, products } = await plan(prisma, csv);
  if (dryRun || !report.ok) return report;

  await prisma.$transaction(
    async (tx: Prisma.TransactionClient) => {
      for (const p of products) {
        const { slug: _slug, ...fields } = p.data;
        const tagLinks = (p.tagIds ?? []).map((tagId) => ({ tagId }));
        // Plain foreign keys (categoryId, brandId), hence the "unchecked" input types.
        const productId = p.existingId
          ? (
              await tx.product.update({
                where: { id: p.existingId },
                data: {
                  ...fields,
                  ...(p.tagIds ? { tags: { deleteMany: {}, create: tagLinks } } : {}),
                } as Prisma.ProductUncheckedUpdateInput,
                select: { id: true },
              })
            ).id
          : (
              await tx.product.create({
                data: {
                  ...fields,
                  slug: p.slug,
                  tags: { create: tagLinks },
                } as Prisma.ProductUncheckedCreateInput,
                select: { id: true },
              })
            ).id;

        for (const v of p.variants) {
          // name is resolved here: the typed label, else generated from the net content; on an update
          // with neither, the current label stays (the column is never null).
          const { initialStock: _s, attributeValueIds: _a, name: _n, ...vfields } = v.data;
          const name = labelFor(v.data);
          const attributeValues = {
            deleteMany: {},
            create: v.attributeValueIds.map((attributeValueId) => ({ attributeValueId })),
          };
          if (v.existingId) {
            await tx.productVariant.update({
              where: { id: v.existingId },
              data: {
                ...vfields,
                ...(name ? { name } : {}),
                attributeValues,
              } as Prisma.ProductVariantUncheckedUpdateInput,
            });
          } else {
            const created = await tx.productVariant.create({
              data: {
                ...(vfields as object),
                productId,
                name: name!,
                stockQty: v.stock,
                attributeValues: { create: attributeValues.create },
              } as Prisma.ProductVariantUncheckedCreateInput,
              select: { id: true },
            });
            if (v.stock > 0) {
              await tx.stockMovement.create({
                data: {
                  variantId: created.id,
                  type: 'PURCHASE',
                  quantity: v.stock,
                  balanceAfter: v.stock,
                  reason: 'CSV import',
                  adminUserId: actor.adminUserId,
                },
              });
            }
          }
        }
      }
      await recordAudit(tx, actor, {
        action: 'product.csv_import',
        entityType: 'product',
        after: { products: report.products, variants: report.variants, rows: report.rows.length },
      });
    },
    // Up to 2000 rows in one transaction: allow more than Prisma's 5 s default.
    { timeout: 120_000, maxWait: 10_000 },
  );
  return { ...report, applied: true };
}
