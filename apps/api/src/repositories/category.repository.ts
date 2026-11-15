import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

const categorySelect = {
  id: true,
  parentId: true,
  name: true,
  slug: true,
  description: true,
  imageId: true,
  sortOrder: true,
  isActive: true,
  seoTitle: true,
  seoDescription: true,
} as const;

export function listCategories(prisma: Client) {
  return prisma.category.findMany({
    select: {
      ...categorySelect,
      image: { select: { path: true, altText: true } },
      _count: { select: { products: true, children: true } },
    },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
  });
}

export function findCategory(prisma: Client, id: string) {
  return prisma.category.findUnique({ where: { id }, select: categorySelect });
}

type CategoryData = {
  name?: string;
  slug?: string;
  parentId?: string | null;
  description?: string | null;
  imageId?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  seoTitle?: string | null;
  seoDescription?: string | null;
};

export function createCategory(
  prisma: Client,
  data: CategoryData & { name: string; slug: string },
) {
  return prisma.category.create({ data, select: categorySelect });
}

export function updateCategory(prisma: Client, id: string, data: CategoryData) {
  return prisma.category.update({ where: { id }, data, select: categorySelect });
}

export function deleteCategory(prisma: Client, id: string) {
  return prisma.category.delete({ where: { id } });
}
