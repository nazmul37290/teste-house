import type { Db } from '../lib/prisma';
import * as repo from '../repositories/taxonomy.repository';
import { recordAudit, type Actor } from './audit.service';
import { inUse, mapWriteError, notFound, resolveSlug } from './taxonomy-common';

/**
 * Variant attributes (docs/database.md section 3a), e.g. Flavor = Classic Malt. isFilterable shows
 * the attribute as a storefront filter. A value used by a variant cannot be deleted.
 */

type Attr = NonNullable<Awaited<ReturnType<typeof repo.findAttribute>>>;
const toDto = ({ values, ...a }: Attr) => ({
  ...a,
  values: values.map(({ _count, ...v }) => ({ ...v, variantCount: _count.variants })),
});

export async function listAttributes(prisma: Db) {
  return (await repo.listAttributes(prisma)).map(toDto);
}

async function getAttribute(prisma: Db, id: string) {
  const attr = await repo.findAttribute(prisma, id);
  if (!attr) throw notFound('Attribute');
  return toDto(attr);
}

export async function createAttribute(
  prisma: Db,
  actor: Actor,
  input: { name: string; slug?: string; isFilterable?: boolean; sortOrder?: number },
) {
  const slug = resolveSlug(input.slug, input.name);
  try {
    const id = await prisma.$transaction(async (tx) => {
      const { id } = await repo.createAttribute(tx, { ...input, slug });
      await recordAudit(tx, actor, {
        action: 'attribute.create',
        entityType: 'attribute',
        entityId: id,
        after: { ...input, slug },
      });
      return id;
    });
    return getAttribute(prisma, id);
  } catch (err) {
    mapWriteError(err, 'attribute');
  }
}

export async function updateAttribute(
  prisma: Db,
  actor: Actor,
  id: string,
  input: { name?: string; slug?: string; isFilterable?: boolean; sortOrder?: number },
) {
  const before = await getAttribute(prisma, id);
  try {
    await prisma.$transaction(async (tx) => {
      await repo.updateAttribute(tx, id, input);
      await recordAudit(tx, actor, {
        action: 'attribute.update',
        entityType: 'attribute',
        entityId: id,
        before,
        after: input,
      });
    });
  } catch (err) {
    mapWriteError(err, 'attribute');
  }
  return getAttribute(prisma, id);
}

export async function deleteAttribute(prisma: Db, actor: Actor, id: string) {
  const attr = await getAttribute(prisma, id);
  if (attr.values.some((v) => v.variantCount > 0)) {
    throw inUse(
      'ATTRIBUTE_IN_USE',
      'Some variants use values of this attribute. Remove them from those variants first.',
    );
  }
  await prisma.$transaction(async (tx) => {
    await repo.deleteAttribute(tx, id);
    await recordAudit(tx, actor, {
      action: 'attribute.delete',
      entityType: 'attribute',
      entityId: id,
      before: attr,
    });
  });
}

export async function addAttributeValue(
  prisma: Db,
  actor: Actor,
  attributeId: string,
  input: { value: string; slug?: string; sortOrder?: number },
) {
  await getAttribute(prisma, attributeId);
  const slug = resolveSlug(input.slug, input.value);
  try {
    await prisma.$transaction(async (tx) => {
      const { id } = await repo.createAttributeValue(tx, {
        attributeId,
        value: input.value,
        slug,
        sortOrder: input.sortOrder,
      });
      await recordAudit(tx, actor, {
        action: 'attribute_value.create',
        entityType: 'attribute_value',
        entityId: id,
        after: { attributeId, ...input, slug },
      });
    });
  } catch (err) {
    mapWriteError(err, 'value');
  }
  return getAttribute(prisma, attributeId);
}

export async function updateAttributeValue(
  prisma: Db,
  actor: Actor,
  valueId: string,
  input: { value?: string; slug?: string; sortOrder?: number },
) {
  const before = await repo.findAttributeValue(prisma, valueId);
  if (!before) throw notFound('Attribute value');
  try {
    await prisma.$transaction(async (tx) => {
      await repo.updateAttributeValue(tx, valueId, input);
      await recordAudit(tx, actor, {
        action: 'attribute_value.update',
        entityType: 'attribute_value',
        entityId: valueId,
        before,
        after: input,
      });
    });
  } catch (err) {
    mapWriteError(err, 'value');
  }
  return getAttribute(prisma, before.attributeId);
}

export async function deleteAttributeValue(prisma: Db, actor: Actor, valueId: string) {
  const value = await repo.findAttributeValue(prisma, valueId);
  if (!value) throw notFound('Attribute value');
  if (value._count.variants > 0)
    throw inUse('VALUE_IN_USE', 'Variants use this value. Remove it from them first.');
  await prisma.$transaction(async (tx) => {
    await repo.deleteAttributeValue(tx, valueId);
    await recordAudit(tx, actor, {
      action: 'attribute_value.delete',
      entityType: 'attribute_value',
      entityId: valueId,
      before: value,
    });
  });
  return getAttribute(prisma, value.attributeId);
}
