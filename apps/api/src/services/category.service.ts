import {
  categoryPath,
  mediaUrl,
  type CreateCategoryInput,
  type UpdateCategoryInput,
} from '@shop/shared';
import type { Db } from '../lib/prisma';
import * as repo from '../repositories/category.repository';
import { recordAudit, type Actor } from './audit.service';
import { recordSlugRedirect } from './redirect.service';
import { businessRule } from './role.service';
import { inUse, mapWriteError, notFound, resolveSlug } from './taxonomy-common';

/** Root = level 1. "Food > Breakfast > Honey > Organic" is the deepest allowed. */
export const MAX_CATEGORY_DEPTH = 4;

type Row = Awaited<ReturnType<typeof repo.listCategories>>[number];
export type CategoryDto = Omit<Row, '_count' | 'image'> & {
  depth: number;
  productCount: number;
  childCount: number;
  image: { url: string; altText: string } | null;
};

/** Database plus where media files are served (PUBLIC_MEDIA_URL), for image previews. */
export type CatalogDeps = { prisma: Db; publicMediaUrl: string };

/** Depth-first order with depth, so the UI can indent a tree from a flat list. */
function asTree(rows: Row[], publicMediaUrl: string): CategoryDto[] {
  const byParent = new Map<string | null, Row[]>();
  for (const r of rows) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
  const out: CategoryDto[] = [];
  const walk = (parentId: string | null, depth: number) => {
    for (const r of byParent.get(parentId) ?? []) {
      const { _count, image, ...rest } = r;
      out.push({
        ...rest,
        depth,
        productCount: _count.products,
        childCount: _count.children,
        image: image
          ? { url: mediaUrl(publicMediaUrl, image.path, 200), altText: image.altText }
          : null,
      });
      walk(r.id, depth + 1);
    }
  };
  walk(null, 1);
  return out;
}

export async function listCategories(deps: CatalogDeps): Promise<CategoryDto[]> {
  return asTree(await repo.listCategories(deps.prisma), deps.publicMediaUrl);
}

export async function getCategory(deps: CatalogDeps, id: string): Promise<CategoryDto> {
  const found = (await listCategories(deps)).find((c) => c.id === id);
  if (!found) throw notFound('Category');
  return found;
}

/**
 * The parent must exist, must not be the category itself or one of its descendants (a cycle), and
 * the moved subtree must stay within MAX_CATEGORY_DEPTH.
 */
async function assertValidParent(
  prisma: Db,
  categoryId: string | null,
  parentId: string | null,
): Promise<void> {
  if (!parentId) return;
  const all = await repo.listCategories(prisma);
  const parentOf = new Map(all.map((c) => [c.id, c.parentId]));
  if (!parentOf.has(parentId))
    throw businessRule('UNKNOWN_PARENT', 'The parent category does not exist');

  let parentDepth = 0;
  for (let cur: string | null = parentId; cur; cur = parentOf.get(cur) ?? null) {
    if (cur === categoryId)
      throw businessRule(
        'CATEGORY_CYCLE',
        'A category cannot be placed inside itself or its subcategories',
      );
    parentDepth += 1;
  }

  let subtreeHeight = 1;
  if (categoryId) {
    const height = (id: string): number => {
      const kids = all.filter((c) => c.parentId === id);
      return 1 + (kids.length ? Math.max(...kids.map((k) => height(k.id))) : 0);
    };
    subtreeHeight = height(categoryId);
  }
  if (parentDepth + subtreeHeight > MAX_CATEGORY_DEPTH) {
    throw businessRule(
      'CATEGORY_TOO_DEEP',
      `Categories can be at most ${MAX_CATEGORY_DEPTH} levels deep`,
    );
  }
}

export async function createCategory(
  deps: CatalogDeps,
  actor: Actor,
  input: CreateCategoryInput,
): Promise<CategoryDto> {
  const { prisma } = deps;
  const slug = resolveSlug(input.slug, input.name);
  await assertValidParent(prisma, null, input.parentId ?? null);
  try {
    const id = await prisma.$transaction(async (tx) => {
      const created = await repo.createCategory(tx, { ...input, slug });
      await recordAudit(tx, actor, {
        action: 'category.create',
        entityType: 'category',
        entityId: created.id,
        after: { ...input, slug },
      });
      return created.id;
    });
    return getCategory(deps, id);
  } catch (err) {
    mapWriteError(err, 'category');
  }
}

export async function updateCategory(
  deps: CatalogDeps,
  actor: Actor,
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDto> {
  const { prisma } = deps;
  const before = await repo.findCategory(prisma, id);
  if (!before) throw notFound('Category');
  if (input.parentId !== undefined && input.parentId !== before.parentId)
    await assertValidParent(prisma, id, input.parentId);

  // Renaming never changes the slug (URLs are permanent); only an explicit new slug does.
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await repo.updateCategory(tx, id, input);
      if (updated.slug !== before.slug)
        await recordSlugRedirect(tx, categoryPath(before.slug), categoryPath(updated.slug));
      await recordAudit(tx, actor, {
        action: 'category.update',
        entityType: 'category',
        entityId: id,
        before,
        after: updated,
      });
    });
  } catch (err) {
    mapWriteError(err, 'category');
  }
  return getCategory(deps, id);
}

export async function deleteCategory(deps: CatalogDeps, actor: Actor, id: string): Promise<void> {
  const { prisma } = deps;
  const category = await getCategory(deps, id);
  if (category.childCount > 0)
    throw inUse('CATEGORY_HAS_CHILDREN', 'Move or delete its subcategories first');
  if (category.productCount > 0)
    throw inUse('CATEGORY_HAS_PRODUCTS', 'Move its products to another category first');
  await prisma.$transaction(async (tx) => {
    await repo.deleteCategory(tx, id);
    await recordAudit(tx, actor, {
      action: 'category.delete',
      entityType: 'category',
      entityId: id,
      before: category,
    });
  });
}
