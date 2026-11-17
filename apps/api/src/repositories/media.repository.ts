import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

export const mediaSelect = {
  id: true,
  path: true,
  mime: true,
  sizeBytes: true,
  width: true,
  height: true,
  altText: true,
  createdAt: true,
} as const;

export function createMedia(
  prisma: Client,
  data: {
    path: string;
    mime: string;
    sizeBytes: number;
    width: number;
    height: number;
    altText: string;
    uploadedById: string | null;
  },
) {
  return prisma.media.create({ data, select: mediaSelect });
}

export function findMedia(prisma: Client, id: string) {
  return prisma.media.findUnique({ where: { id }, select: mediaSelect });
}

export function updateMediaAlt(prisma: Client, id: string, altText: string) {
  return prisma.media.update({ where: { id }, data: { altText }, select: mediaSelect });
}

export async function listMedia(
  prisma: Client,
  query: { page: number; pageSize: number; q?: string },
) {
  // Customers' review photos are not part of the shop's media library.
  const where: Prisma.MediaWhereInput = {
    NOT: { path: { startsWith: 'reviews/' } },
    ...(query.q ? { altText: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.media.findMany({
      where,
      select: mediaSelect,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.media.count({ where }),
  ]);
  return { items, total };
}

/** How many records still point at this file (delete is refused while any do). */
export async function countMediaReferences(prisma: Client, id: string): Promise<number> {
  const row = await prisma.media.findUnique({
    where: { id },
    select: {
      _count: {
        select: {
          productImages: true,
          productsOg: true,
          categories: true,
          brands: true,
          bannersDesktop: true,
          bannersMobile: true,
          reviewImages: true,
        },
      },
    },
  });
  return row ? Object.values(row._count).reduce((a, b) => a + b, 0) : 0;
}

export function deleteMedia(prisma: Client, id: string) {
  return prisma.media.delete({ where: { id } });
}
