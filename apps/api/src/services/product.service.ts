import {
  formatPaisa,
  MEDIA_WIDTHS,
  mediaUrl,
  parsePaisa,
  productPath,
  variantLabel,
  type CreateProductInput,
  type CreateVariantInput,
  type MeasureUnit,
  type ProductListQuery,
  type UpdateProductInput,
  type UpdateVariantInput,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isUniqueViolation } from '../lib/prisma-errors';
import * as repo from '../repositories/product.repository';
import { recordAudit, type Actor } from './audit.service';
import { recordSlugRedirect } from './redirect.service';
import { businessRule } from './role.service';
import { mapWriteError, notFound, resolveSlug } from './taxonomy-common';

export type ProductDeps = { prisma: Db; publicMediaUrl: string };
type Tx = Prisma.TransactionClient;
type Decimalish = { toFixed(n: number): string; toString(): string };

const money = (d: Decimalish | null) => (d === null ? null : d.toFixed(2));
/** Net content without trailing zeros ("1.5", "500"). */
const amount = (d: Decimalish | null) => (d === null ? null : String(Number(d.toFixed(3))));

// DTOs ---------------------------------------------------------------------------------------

type VariantRow = Awaited<ReturnType<typeof repo.findVariant>> & {};
function toVariantDto(v: Omit<NonNullable<VariantRow>, 'product'>) {
  const { attributeValues, _count, unitValue, price, salePrice, ...rest } = v;
  return {
    ...rest,
    unitValue: amount(unitValue),
    price: money(price)!,
    salePrice: money(salePrice),
    attributeValueIds: attributeValues.map((a) => a.attributeValueId),
    /** Stock movements or sales exist: the variant can only be deactivated, not deleted. */
    hasHistory: _count.stockMovements + _count.orderItems > 0,
  };
}

function toProductDto(p: NonNullable<Awaited<ReturnType<typeof repo.findProduct>>>, base: string) {
  const { tags, images, variants, ogImage, ...rest } = p;
  return {
    ...rest,
    tags: tags.map((t) => t.tag),
    ogImage: ogImage ? { url: mediaUrl(base, ogImage.path, 500), altText: ogImage.altText } : null,
    images: images.map((i) => ({
      mediaId: i.mediaId,
      isPrimary: i.isPrimary,
      altText: i.media.altText,
      urls: Object.fromEntries(MEDIA_WIDTHS.map((w) => [w, mediaUrl(base, i.media.path, w)])),
    })),
    variants: variants.map(toVariantDto),
  };
}

export async function getProduct(deps: ProductDeps, id: string) {
  const product = await repo.findProduct(deps.prisma, id);
  if (!product) throw notFound('Product');
  return toProductDto(product, deps.publicMediaUrl);
}

export async function listProducts(deps: ProductDeps, query: ProductListQuery) {
  const { items, total } = await repo.listProducts(deps.prisma, query);
  return {
    total,
    items: items.map(({ variants, images, category, brand, ...p }) => {
      // Effective price (sale price if set) in integer paisa; display only.
      const prices = variants.map((v) => parsePaisa(money(v.salePrice ?? v.price)!));
      return {
        ...p,
        category: category.name,
        brand: brand?.name ?? null,
        image: images[0]
          ? {
              url: mediaUrl(deps.publicMediaUrl, images[0].media.path, 200),
              altText: images[0].media.altText,
            }
          : null,
        variantCount: variants.length,
        priceFrom: prices.length ? formatPaisa(Math.min(...prices)) : null,
        priceTo: prices.length ? formatPaisa(Math.max(...prices)) : null,
        totalStock: variants.reduce((sum, v) => sum + v.stockQty, 0),
      };
    }),
  };
}

// Validation helpers ---------------------------------------------------------------------------

async function assertExists(count: Promise<number>, expected: number, path: string, what: string) {
  if ((await count) !== expected) {
    throw new AppError('VALIDATION_ERROR', `${what} does not exist`, [
      { path, message: 'Not found' },
    ]);
  }
}

/** Every value must exist, and a variant has at most one value per attribute (database.md 3a). */
async function assertAttributeValues(prisma: Db | Tx, ids: string[] | undefined) {
  if (!ids?.length) return;
  const unique = [...new Set(ids)];
  const rows = await repo.attributeValuesById(prisma, unique);
  if (rows.length !== unique.length) {
    throw new AppError('VALIDATION_ERROR', 'An attribute value does not exist', [
      { path: 'attributeValueIds', message: 'Not found' },
    ]);
  }
  if (new Set(rows.map((r) => r.attributeId)).size !== rows.length) {
    throw businessRule(
      'ONE_VALUE_PER_ATTRIBUTE',
      'A variant can have only one value per attribute (e.g. one Flavor)',
    );
  }
}

/** Explicit checks first, so the message names the right field; the DB constraint backs them up. */
async function assertSlugFree(prisma: Db, slug: string, exceptId?: string) {
  if (await repo.slugTaken(prisma, slug, exceptId)) {
    throw new AppError('CONFLICT', 'Another product already uses this slug', [
      { reason: 'SLUG_TAKEN', path: 'slug' },
    ]);
  }
}

async function assertSkusFree(prisma: Db, skus: string[], exceptVariantId?: string) {
  const taken = await repo.takenSkus(prisma, skus, exceptVariantId);
  if (taken.length) {
    throw new AppError('CONFLICT', `Another variant already uses the SKU ${taken.join(', ')}`, [
      { reason: 'SKU_TAKEN', path: 'sku' },
    ]);
  }
}

/** A unique violation here means a concurrent save won the race after the checks above. */
function mapVariantError(err: unknown): never {
  if (isUniqueViolation(err)) {
    throw new AppError(
      'CONFLICT',
      'The slug or a SKU was just taken by another save. Please try again.',
      [{ reason: 'CONFLICT' }],
    );
  }
  mapWriteError(err, 'product');
}

/** Label: the explicit one, else generated from the net content ("500 g"). */
function labelFor(
  name: string | null | undefined,
  unit: MeasureUnit | null | undefined,
  unitValue: string | null | undefined,
) {
  if (name) return name;
  if (unit && unitValue) return variantLabel(unit, unitValue);
  throw new AppError('VALIDATION_ERROR', 'Enter a label (or set the net content)', [
    { path: 'name', message: 'Required' },
  ]);
}

/** Creates a variant; initial stock becomes a PURCHASE movement in the same transaction (CLAUDE.md). */
async function insertVariant(tx: Tx, actor: Actor, productId: string, v: CreateVariantInput) {
  const { attributeValueIds = [], initialStock = 0, name, ...fields } = v;
  const variant = await tx.productVariant.create({
    data: {
      ...fields,
      productId,
      name: labelFor(name, v.unit, v.unitValue),
      stockQty: initialStock,
      attributeValues: {
        create: [...new Set(attributeValueIds)].map((attributeValueId) => ({ attributeValueId })),
      },
    },
    select: { id: true, sku: true },
  });
  if (initialStock > 0) {
    await tx.stockMovement.create({
      data: {
        variantId: variant.id,
        type: 'PURCHASE',
        quantity: initialStock,
        balanceAfter: initialStock,
        reason: 'Initial stock',
        adminUserId: actor.adminUserId,
      },
    });
  }
  return variant;
}

// Products -----------------------------------------------------------------------------------

export async function createProduct(deps: ProductDeps, actor: Actor, input: CreateProductInput) {
  const { prisma } = deps;
  const { variants = [], tagIds = [], slug: slugInput, ...fields } = input;
  const slug = resolveSlug(slugInput, input.name);
  await assertExists(
    repo.countExisting.categories(prisma, [input.categoryId]),
    1,
    'categoryId',
    'The category',
  );
  if (tagIds.length)
    await assertExists(
      repo.countExisting.tags(prisma, [...new Set(tagIds)]),
      new Set(tagIds).size,
      'tagIds',
      'A tag',
    );
  for (const v of variants) await assertAttributeValues(prisma, v.attributeValueIds);
  if (new Set(variants.map((v) => v.sku)).size !== variants.length)
    throw businessRule('DUPLICATE_SKU', 'Each variant needs its own SKU');
  await assertSlugFree(prisma, slug);
  if (variants.length)
    await assertSkusFree(
      prisma,
      variants.map((v) => v.sku),
    );
  if (input.status === 'ACTIVE' && !variants.some((v) => v.isActive !== false)) {
    throw businessRule(
      'PRODUCT_NEEDS_VARIANT',
      'An active product needs at least one active variant',
    );
  }

  try {
    const id = await prisma.$transaction(async (tx) => {
      const product = await tx.product.create({
        data: {
          ...fields,
          slug,
          nutritionFacts: fields.nutritionFacts ?? undefined,
          tags: { create: [...new Set(tagIds)].map((tagId) => ({ tagId })) },
        },
        select: { id: true },
      });
      const created = [];
      for (const v of variants) created.push(await insertVariant(tx, actor, product.id, v));
      await recordAudit(tx, actor, {
        action: 'product.create',
        entityType: 'product',
        entityId: product.id,
        after: { ...fields, slug, tagIds, variants: created.map((c) => c.sku) },
      });
      return product.id;
    });
    return getProduct(deps, id);
  } catch (err) {
    mapVariantError(err);
  }
}

export async function updateProduct(
  deps: ProductDeps,
  actor: Actor,
  id: string,
  input: UpdateProductInput,
) {
  const { prisma } = deps;
  const before = await getProduct(deps, id);
  const { tagIds, nutritionFacts, ...fields } = input;
  if (input.categoryId)
    await assertExists(
      repo.countExisting.categories(prisma, [input.categoryId]),
      1,
      'categoryId',
      'The category',
    );
  if (tagIds?.length)
    await assertExists(
      repo.countExisting.tags(prisma, [...new Set(tagIds)]),
      new Set(tagIds).size,
      'tagIds',
      'A tag',
    );
  if (input.status === 'ACTIVE' && !before.variants.some((v) => v.isActive)) {
    throw businessRule(
      'PRODUCT_NEEDS_VARIANT',
      'An active product needs at least one active variant',
    );
  }
  if (input.slug && input.slug !== before.slug) await assertSlugFree(prisma, input.slug, id);

  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id },
        data: {
          ...fields,
          ...(nutritionFacts !== undefined
            ? { nutritionFacts: nutritionFacts ?? Prisma.DbNull }
            : {}),
          ...(tagIds
            ? { tags: { deleteMany: {}, create: [...new Set(tagIds)].map((tagId) => ({ tagId })) } }
            : {}),
        },
        select: { slug: true },
      });
      // Renaming never changes the slug; only an explicit new slug does (with a 301 redirect).
      if (updated.slug !== before.slug)
        await recordSlugRedirect(tx, productPath(before.slug), productPath(updated.slug));
      await recordAudit(tx, actor, {
        action: 'product.update',
        entityType: 'product',
        entityId: id,
        before,
        after: input,
      });
    });
  } catch (err) {
    mapVariantError(err);
  }
  return getProduct(deps, id);
}

/** Soft delete (docs/database.md section 1): orders keep their snapshots; the slug stays taken. */
export async function deleteProduct(deps: ProductDeps, actor: Actor, id: string) {
  const before = await getProduct(deps, id);
  await deps.prisma.$transaction(async (tx) => {
    await tx.product.update({ where: { id }, data: { deletedAt: new Date(), status: 'ARCHIVED' } });
    await recordAudit(tx, actor, {
      action: 'product.delete',
      entityType: 'product',
      entityId: id,
      before: { name: before.name, slug: before.slug, status: before.status },
    });
  });
}

export async function bulkSetStatus(
  deps: ProductDeps,
  actor: Actor,
  ids: string[],
  status: 'DRAFT' | 'ACTIVE' | 'ARCHIVED',
) {
  const unique = [...new Set(ids)];
  const products = await deps.prisma.product.findMany({
    where: { id: { in: unique }, deletedAt: null },
    select: {
      id: true,
      status: true,
      _count: { select: { variants: { where: { isActive: true } } } },
    },
  });
  if (products.length !== unique.length) throw notFound('One of the products');
  if (status === 'ACTIVE') {
    const without = products.filter((p) => p._count.variants === 0).map((p) => p.id);
    if (without.length) {
      throw new AppError(
        'BUSINESS_RULE',
        'Some products have no active variant and cannot be activated',
        without.map((id) => ({ reason: 'PRODUCT_NEEDS_VARIANT', path: id })),
      );
    }
  }
  await deps.prisma.$transaction(async (tx) => {
    await tx.product.updateMany({ where: { id: { in: unique } }, data: { status } });
    await recordAudit(tx, actor, {
      action: 'product.bulk_status',
      entityType: 'product',
      before: Object.fromEntries(products.map((p) => [p.id, p.status])),
      after: { status, ids: unique },
    });
  });
  return { updated: unique.length };
}

/** Replaces the image list; the order is the display order and the first image is the primary one. */
export async function setProductImages(
  deps: ProductDeps,
  actor: Actor,
  id: string,
  mediaIds: string[],
) {
  const before = await getProduct(deps, id);
  if (mediaIds.length)
    await assertExists(
      repo.countExisting.media(deps.prisma, mediaIds),
      mediaIds.length,
      'mediaIds',
      'An image',
    );
  await deps.prisma.$transaction(async (tx) => {
    await tx.productImage.deleteMany({ where: { productId: id } });
    await tx.productImage.createMany({
      data: mediaIds.map((mediaId, i) => ({
        productId: id,
        mediaId,
        sortOrder: i,
        isPrimary: i === 0,
      })),
    });
    await recordAudit(tx, actor, {
      action: 'product.images_update',
      entityType: 'product',
      entityId: id,
      before: { mediaIds: before.images.map((i) => i.mediaId) },
      after: { mediaIds },
    });
  });
  return getProduct(deps, id);
}

// Variants -----------------------------------------------------------------------------------

export async function addVariant(
  deps: ProductDeps,
  actor: Actor,
  productId: string,
  input: CreateVariantInput,
) {
  await getProduct(deps, productId);
  await assertAttributeValues(deps.prisma, input.attributeValueIds);
  await assertSkusFree(deps.prisma, [input.sku]);
  try {
    await deps.prisma.$transaction(async (tx) => {
      const variant = await insertVariant(tx, actor, productId, input);
      await recordAudit(tx, actor, {
        action: 'variant.create',
        entityType: 'variant',
        entityId: variant.id,
        after: { productId, ...input },
      });
    });
  } catch (err) {
    mapVariantError(err);
  }
  return getProduct(deps, productId);
}

/**
 * Partial update. Stock is never edited here (inventory adjustments only). The label follows the net
 * content when it was generated before and no new label is given.
 */
export async function updateVariant(
  deps: ProductDeps,
  actor: Actor,
  variantId: string,
  input: UpdateVariantInput,
) {
  const found = await repo.findVariant(deps.prisma, variantId);
  if (!found) throw notFound('Variant');
  const { product, ...beforeRow } = found;
  const before = toVariantDto(beforeRow);

  const unit = input.unit !== undefined ? input.unit : before.unit;
  const unitValue = input.unitValue !== undefined ? input.unitValue : before.unitValue;
  if ((unit == null) !== (unitValue == null)) {
    throw new AppError('VALIDATION_ERROR', 'Set both the unit and the amount, or neither', [
      { path: 'unitValue', message: 'Required' },
    ]);
  }
  const price = input.price ?? before.price;
  const salePrice = input.salePrice !== undefined ? input.salePrice : before.salePrice;
  if (salePrice !== null && parsePaisa(salePrice) >= parsePaisa(price)) {
    throw new AppError('VALIDATION_ERROR', 'The sale price must be lower than the price', [
      { path: 'salePrice', message: 'Too high' },
    ]);
  }
  await assertAttributeValues(deps.prisma, input.attributeValueIds);
  if (input.sku && input.sku !== before.sku)
    await assertSkusFree(deps.prisma, [input.sku], variantId);

  const wasGenerated =
    before.unit && before.unitValue && before.name === variantLabel(before.unit, before.unitValue);
  const name =
    input.name !== undefined
      ? labelFor(input.name, unit, unitValue)
      : wasGenerated && unit && unitValue
        ? variantLabel(unit, unitValue)
        : undefined;

  if (
    input.isActive === false &&
    before.isActive &&
    product.status === 'ACTIVE' &&
    (await repo.countActiveVariants(deps.prisma, product.id, variantId)) === 0
  ) {
    throw businessRule(
      'LAST_ACTIVE_VARIANT',
      'This is the only active variant of an active product. Set the product to draft first.',
    );
  }

  // name is resolved above (explicit, regenerated or unchanged); never spread the raw input value.
  const { attributeValueIds, name: _rawName, ...fields } = input;
  try {
    await deps.prisma.$transaction(async (tx) => {
      await tx.productVariant.update({
        where: { id: variantId },
        data: {
          ...fields,
          ...(name !== undefined ? { name } : {}),
          ...(attributeValueIds
            ? {
                attributeValues: {
                  deleteMany: {},
                  create: [...new Set(attributeValueIds)].map((attributeValueId) => ({
                    attributeValueId,
                  })),
                },
              }
            : {}),
        },
      });
      await recordAudit(tx, actor, {
        action: 'variant.update',
        entityType: 'variant',
        entityId: variantId,
        before,
        after: input,
      });
    });
  } catch (err) {
    mapVariantError(err);
  }
  return getProduct(deps, product.id);
}

/** Only variants without stock history or sales can be deleted; others are deactivated instead. */
export async function deleteVariant(deps: ProductDeps, actor: Actor, variantId: string) {
  const found = await repo.findVariant(deps.prisma, variantId);
  if (!found) throw notFound('Variant');
  const { product, ...row } = found;
  const variant = toVariantDto(row);
  if (variant.hasHistory) {
    throw new AppError(
      'CONFLICT',
      'This variant has stock history or sales. Deactivate it instead.',
      [{ reason: 'VARIANT_HAS_HISTORY' }],
    );
  }
  if (
    variant.isActive &&
    product.status === 'ACTIVE' &&
    (await repo.countActiveVariants(deps.prisma, product.id, variantId)) === 0
  ) {
    throw businessRule(
      'LAST_ACTIVE_VARIANT',
      'This is the only active variant of an active product. Set the product to draft first.',
    );
  }
  await deps.prisma.$transaction(async (tx) => {
    await tx.productVariant.delete({ where: { id: variantId } });
    await recordAudit(tx, actor, {
      action: 'variant.delete',
      entityType: 'variant',
      entityId: variantId,
      before: variant,
    });
  });
  return getProduct(deps, product.id);
}
