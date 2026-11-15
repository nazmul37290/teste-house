import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

export const variantSelect = {
  id: true,
  productId: true,
  sku: true,
  name: true,
  unit: true,
  unitValue: true,
  price: true,
  salePrice: true,
  stockQty: true,
  lowStockThreshold: true,
  weightGrams: true,
  barcode: true,
  isActive: true,
  sortOrder: true,
  attributeValues: { select: { attributeValueId: true } },
  _count: { select: { stockMovements: true, orderItems: true } },
} as const satisfies Prisma.ProductVariantSelect;

export const productDetailSelect = {
  id: true,
  name: true,
  slug: true,
  shortDescription: true,
  description: true,
  categoryId: true,
  brandId: true,
  status: true,
  isFeatured: true,
  isNewArrival: true,
  isBestSeller: true,
  ingredients: true,
  nutritionFacts: true,
  shelfLife: true,
  origin: true,
  seoTitle: true,
  seoDescription: true,
  canonicalUrl: true,
  ogImageId: true,
  createdAt: true,
  updatedAt: true,
  category: { select: { id: true, name: true } },
  brand: { select: { id: true, name: true } },
  ogImage: { select: { path: true, altText: true } },
  tags: { select: { tag: { select: { id: true, name: true } } } },
  images: {
    select: {
      mediaId: true,
      sortOrder: true,
      isPrimary: true,
      media: { select: { path: true, altText: true } },
    },
    orderBy: { sortOrder: 'asc' },
  },
  variants: { select: variantSelect, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
} as const satisfies Prisma.ProductSelect;

export function findProduct(prisma: Client, id: string) {
  return prisma.product.findFirst({ where: { id, deletedAt: null }, select: productDetailSelect });
}

export async function listProducts(
  prisma: Client,
  q: {
    page: number;
    pageSize: number;
    q?: string;
    status?: 'DRAFT' | 'ACTIVE' | 'ARCHIVED';
    categoryId?: string;
    brandId?: string;
  },
) {
  const where: Prisma.ProductWhereInput = {
    deletedAt: null,
    ...(q.status ? { status: q.status } : {}),
    ...(q.categoryId ? { categoryId: q.categoryId } : {}),
    ...(q.brandId ? { brandId: q.brandId } : {}),
    ...(q.q
      ? {
          OR: [
            { name: { contains: q.q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q.q, mode: 'insensitive' } } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        updatedAt: true,
        category: { select: { name: true } },
        brand: { select: { name: true } },
        images: {
          where: { isPrimary: true },
          select: { media: { select: { path: true, altText: true } } },
          take: 1,
        },
        variants: { select: { price: true, salePrice: true, stockQty: true, isActive: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
    prisma.product.count({ where }),
  ]);
  return { items, total };
}

export function findVariant(prisma: Client, id: string) {
  return prisma.productVariant.findFirst({
    where: { id, product: { deletedAt: null } },
    select: { ...variantSelect, product: { select: { id: true, status: true } } },
  });
}

/** Attribute id of each value (for "at most one value per attribute"). */
export function attributeValuesById(prisma: Client, ids: string[]) {
  return prisma.attributeValue.findMany({
    where: { id: { in: ids } },
    select: { id: true, attributeId: true },
  });
}

export const countActiveVariants = (prisma: Client, productId: string, exceptId?: string) =>
  prisma.productVariant.count({
    where: { productId, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
  });

/** SKUs among these that another variant already uses (optionally ignoring one variant). */
export async function takenSkus(
  prisma: Client,
  skus: string[],
  exceptVariantId?: string,
): Promise<string[]> {
  const rows = await prisma.productVariant.findMany({
    where: { sku: { in: skus }, ...(exceptVariantId ? { id: { not: exceptVariantId } } : {}) },
    select: { sku: true },
  });
  return rows.map((r) => r.sku);
}

export const slugTaken = (prisma: Client, slug: string, exceptId?: string) =>
  prisma.product
    .count({ where: { slug, ...(exceptId ? { id: { not: exceptId } } : {}) } })
    .then((n) => n > 0);

export const countExisting = {
  categories: (prisma: Client, ids: string[]) =>
    prisma.category.count({ where: { id: { in: ids } } }),
  tags: (prisma: Client, ids: string[]) => prisma.tag.count({ where: { id: { in: ids } } }),
  media: (prisma: Client, ids: string[]) => prisma.media.count({ where: { id: { in: ids } } }),
};
