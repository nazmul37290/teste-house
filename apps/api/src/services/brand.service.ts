import { mediaUrl, type CreateBrandInput, type UpdateBrandInput } from '@shop/shared';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/taxonomy.repository';
import { recordAudit, type Actor } from './audit.service';
import { inUse, mapWriteError, notFound, resolveSlug } from './taxonomy-common';

/** Brands and tags [brands.manage]. Renaming keeps the slug; only an explicit slug changes it. */

export async function listBrands(deps: { prisma: Db; publicMediaUrl: string }) {
  return (await repo.listBrands(deps.prisma)).map(({ _count, logo, ...b }) => ({
    ...b,
    productCount: _count.products,
    logo: logo
      ? { url: mediaUrl(deps.publicMediaUrl, logo.path, 200), altText: logo.altText }
      : null,
  }));
}

export async function createBrand(prisma: Db, actor: Actor, input: CreateBrandInput) {
  const slug = resolveSlug(input.slug, input.name);
  try {
    return await prisma.$transaction(async (tx) => {
      const brand = await repo.createBrand(tx, { ...input, slug });
      await recordAudit(tx, actor, {
        action: 'brand.create',
        entityType: 'brand',
        entityId: brand.id,
        after: brand,
      });
      return brand;
    });
  } catch (err) {
    mapWriteError(err, 'brand');
  }
}

export async function updateBrand(prisma: Db, actor: Actor, id: string, input: UpdateBrandInput) {
  const before = await repo.findBrand(prisma, id);
  if (!before) throw notFound('Brand');
  try {
    return await prisma.$transaction(async (tx) => {
      const brand = await repo.updateBrand(tx, id, input);
      await recordAudit(tx, actor, {
        action: 'brand.update',
        entityType: 'brand',
        entityId: id,
        before,
        after: brand,
      });
      return brand;
    });
  } catch (err) {
    mapWriteError(err, 'brand');
  }
}

/** Refused while live products use it (soft-deleted ones just lose the brand). */
export async function deleteBrand(prisma: Db, actor: Actor, id: string) {
  const before = await repo.findBrand(prisma, id);
  if (!before) throw notFound('Brand');
  if ((await repo.countLiveBrandProducts(prisma, id)) > 0) {
    throw inUse('BRAND_HAS_PRODUCTS', 'Products still use this brand. Change their brand first.');
  }
  await prisma.$transaction(async (tx) => {
    await repo.deleteBrand(tx, id);
    await recordAudit(tx, actor, {
      action: 'brand.delete',
      entityType: 'brand',
      entityId: id,
      before,
    });
  });
}

export async function listTags(prisma: Db) {
  return (await repo.listTags(prisma)).map(({ _count, ...t }) => ({
    ...t,
    productCount: _count.products,
  }));
}

export async function createTag(prisma: Db, actor: Actor, input: { name: string; slug?: string }) {
  const slug = resolveSlug(input.slug, input.name);
  try {
    return await prisma.$transaction(async (tx) => {
      const tag = await repo.createTag(tx, { name: input.name, slug });
      await recordAudit(tx, actor, {
        action: 'tag.create',
        entityType: 'tag',
        entityId: tag.id,
        after: tag,
      });
      return tag;
    });
  } catch (err) {
    mapWriteError(err, 'tag');
  }
}

export async function updateTag(
  prisma: Db,
  actor: Actor,
  id: string,
  input: { name?: string; slug?: string },
) {
  const before = await repo.findTag(prisma, id);
  if (!before) throw notFound('Tag');
  try {
    return await prisma.$transaction(async (tx) => {
      const tag = await repo.updateTag(tx, id, input);
      await recordAudit(tx, actor, {
        action: 'tag.update',
        entityType: 'tag',
        entityId: id,
        before,
        after: tag,
      });
      return tag;
    });
  } catch (err) {
    mapWriteError(err, 'tag');
  }
}

/** Tags are labels: deleting one simply removes it from its products. */
export async function deleteTag(prisma: Db, actor: Actor, id: string) {
  const before = await repo.findTag(prisma, id);
  if (!before) throw notFound('Tag');
  await prisma.$transaction(async (tx) => {
    await repo.deleteTag(tx, id);
    await recordAudit(tx, actor, { action: 'tag.delete', entityType: 'tag', entityId: id, before });
  });
}
