import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

// Brands --------------------------------------------------------------------------------------

const brandSelect = {
  id: true,
  name: true,
  slug: true,
  logoId: true,
  isActive: true,
  seoTitle: true,
  seoDescription: true,
} as const;

export const listBrands = (prisma: Client) =>
  prisma.brand.findMany({
    select: {
      ...brandSelect,
      logo: { select: { path: true, altText: true } },
      _count: { select: { products: { where: { deletedAt: null } } } },
    },
    orderBy: { name: 'asc' },
  });
export const findBrand = (prisma: Client, id: string) =>
  prisma.brand.findUnique({ where: { id }, select: brandSelect });
export const createBrand = (prisma: Client, data: Prisma.BrandUncheckedCreateInput) =>
  prisma.brand.create({ data, select: brandSelect });
export const updateBrand = (prisma: Client, id: string, data: Prisma.BrandUncheckedUpdateInput) =>
  prisma.brand.update({ where: { id }, data, select: brandSelect });
export const deleteBrand = (prisma: Client, id: string) => prisma.brand.delete({ where: { id } });
export const countLiveBrandProducts = (prisma: Client, brandId: string) =>
  prisma.product.count({ where: { brandId, deletedAt: null } });

// Tags ----------------------------------------------------------------------------------------

export const listTags = (prisma: Client) =>
  prisma.tag.findMany({
    select: { id: true, name: true, slug: true, _count: { select: { products: true } } },
    orderBy: { name: 'asc' },
  });
export const findTag = (prisma: Client, id: string) => prisma.tag.findUnique({ where: { id } });
export const createTag = (prisma: Client, data: { name: string; slug: string }) =>
  prisma.tag.create({ data });
export const updateTag = (prisma: Client, id: string, data: { name?: string; slug?: string }) =>
  prisma.tag.update({ where: { id }, data });
export const deleteTag = (prisma: Client, id: string) => prisma.tag.delete({ where: { id } });

// Attributes ----------------------------------------------------------------------------------

const valueSelect = {
  id: true,
  value: true,
  slug: true,
  sortOrder: true,
  _count: { select: { variants: true } },
} as const;
const attributeSelect = {
  id: true,
  name: true,
  slug: true,
  isFilterable: true,
  sortOrder: true,
  values: { select: valueSelect, orderBy: [{ sortOrder: 'asc' }, { value: 'asc' }] },
} as const satisfies Prisma.AttributeSelect;

export const listAttributes = (prisma: Client) =>
  prisma.attribute.findMany({
    select: attributeSelect,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
export const findAttribute = (prisma: Client, id: string) =>
  prisma.attribute.findUnique({ where: { id }, select: attributeSelect });
export const createAttribute = (prisma: Client, data: Prisma.AttributeCreateInput) =>
  prisma.attribute.create({ data, select: { id: true } });
export const updateAttribute = (prisma: Client, id: string, data: Prisma.AttributeUpdateInput) =>
  prisma.attribute.update({ where: { id }, data, select: { id: true } });
export const deleteAttribute = (prisma: Client, id: string) =>
  prisma.attribute.delete({ where: { id } });

export const findAttributeValue = (prisma: Client, id: string) =>
  prisma.attributeValue.findUnique({
    where: { id },
    select: { ...valueSelect, attributeId: true },
  });
export const createAttributeValue = (
  prisma: Client,
  data: Prisma.AttributeValueUncheckedCreateInput,
) => prisma.attributeValue.create({ data, select: { id: true } });
export const updateAttributeValue = (
  prisma: Client,
  id: string,
  data: Prisma.AttributeValueUncheckedUpdateInput,
) => prisma.attributeValue.update({ where: { id }, data, select: { id: true } });
export const deleteAttributeValue = (prisma: Client, id: string) =>
  prisma.attributeValue.delete({ where: { id } });
