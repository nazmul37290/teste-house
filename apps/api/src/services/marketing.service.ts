import {
  mediaUrl,
  type CreateBannerInput,
  type HomepageSectionInput,
  type UpdateBannerInput,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import { AppError } from '../lib/errors';
import type { Db } from '../lib/prisma';
import { isForeignKeyViolation } from '../lib/prisma-errors';
import { recordAudit, type Actor } from './audit.service';
import { notFound } from './taxonomy-common';

/** Banners and homepage sections [marketing.manage]. Every write is audited. */
export type MarketingDeps = { prisma: Db; publicMediaUrl: string };

const toDate = (v: string | null | undefined) =>
  v === undefined ? undefined : v === null ? null : new Date(v);

function mapMediaError(err: unknown): never {
  if (isForeignKeyViolation(err)) {
    throw new AppError('VALIDATION_ERROR', 'The chosen image does not exist', [
      { path: 'imageId', message: 'Not found' },
    ]);
  }
  throw err;
}

const bannerSelect = {
  id: true,
  title: true,
  imageId: true,
  mobileImageId: true,
  linkUrl: true,
  position: true,
  sortOrder: true,
  isActive: true,
  startsAt: true,
  endsAt: true,
  createdAt: true,
  image: { select: { path: true, altText: true } },
  mobileImage: { select: { path: true, altText: true } },
} as const;

type BannerRow = Prisma.BannerGetPayload<{ select: typeof bannerSelect }>;
const toBanner = ({ image, mobileImage, ...b }: BannerRow, base: string) => ({
  ...b,
  image: { url: mediaUrl(base, image.path, 500), altText: image.altText },
  mobileImage: mobileImage
    ? { url: mediaUrl(base, mobileImage.path, 500), altText: mobileImage.altText }
    : null,
});

export async function listBanners(deps: MarketingDeps) {
  const rows = await deps.prisma.banner.findMany({
    select: bannerSelect,
    orderBy: [{ position: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map((b) => toBanner(b, deps.publicMediaUrl));
}

export async function createBanner(deps: MarketingDeps, actor: Actor, input: CreateBannerInput) {
  try {
    const row = await deps.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.create({
        data: { ...input, startsAt: toDate(input.startsAt), endsAt: toDate(input.endsAt) },
        select: bannerSelect,
      });
      await recordAudit(tx, actor, {
        action: 'banner.create',
        entityType: 'banner',
        entityId: banner.id,
        after: input,
      });
      return banner;
    });
    return toBanner(row, deps.publicMediaUrl);
  } catch (err) {
    mapMediaError(err);
  }
}

export async function updateBanner(
  deps: MarketingDeps,
  actor: Actor,
  id: string,
  input: UpdateBannerInput,
) {
  const before = await deps.prisma.banner.findUnique({ where: { id }, select: bannerSelect });
  if (!before) throw notFound('Banner');
  // The date order must also hold against the stored dates.
  const startsAt = input.startsAt !== undefined ? toDate(input.startsAt) : before.startsAt;
  const endsAt = input.endsAt !== undefined ? toDate(input.endsAt) : before.endsAt;
  if (startsAt && endsAt && startsAt >= endsAt) {
    throw new AppError('VALIDATION_ERROR', 'The end must be after the start', [
      { path: 'endsAt', message: 'Before the start' },
    ]);
  }
  try {
    const row = await deps.prisma.$transaction(async (tx) => {
      const banner = await tx.banner.update({
        where: { id },
        data: { ...input, startsAt: toDate(input.startsAt), endsAt: toDate(input.endsAt) },
        select: bannerSelect,
      });
      await recordAudit(tx, actor, {
        action: 'banner.update',
        entityType: 'banner',
        entityId: id,
        before,
        after: input,
      });
      return banner;
    });
    return toBanner(row, deps.publicMediaUrl);
  } catch (err) {
    mapMediaError(err);
  }
}

export async function deleteBanner(deps: MarketingDeps, actor: Actor, id: string) {
  const before = await deps.prisma.banner.findUnique({ where: { id }, select: bannerSelect });
  if (!before) throw notFound('Banner');
  await deps.prisma.$transaction(async (tx) => {
    await tx.banner.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: 'banner.delete',
      entityType: 'banner',
      entityId: id,
      before,
    });
  });
}

// Homepage sections ------------------------------------------------------------------------------

const sectionSelect = {
  id: true,
  type: true,
  title: true,
  config: true,
  sortOrder: true,
  isActive: true,
} as const;

export function listSections(prisma: Db) {
  return prisma.homepageSection.findMany({
    select: sectionSelect,
    orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
  });
}

export async function createSection(prisma: Db, actor: Actor, input: HomepageSectionInput) {
  return prisma.$transaction(async (tx) => {
    const section = await tx.homepageSection.create({
      data: { ...input, config: input.config as Prisma.InputJsonValue },
      select: sectionSelect,
    });
    await recordAudit(tx, actor, {
      action: 'homepage_section.create',
      entityType: 'homepage_section',
      entityId: section.id,
      after: input,
    });
    return section;
  });
}

/** Whole-section replace (PUT), so a type and its config always change together. */
export async function replaceSection(
  prisma: Db,
  actor: Actor,
  id: string,
  input: HomepageSectionInput,
) {
  const before = await prisma.homepageSection.findUnique({ where: { id }, select: sectionSelect });
  if (!before) throw notFound('Section');
  return prisma.$transaction(async (tx) => {
    const section = await tx.homepageSection.update({
      where: { id },
      data: {
        title: null,
        sortOrder: 0,
        isActive: true,
        ...input,
        config: input.config as Prisma.InputJsonValue,
      },
      select: sectionSelect,
    });
    await recordAudit(tx, actor, {
      action: 'homepage_section.update',
      entityType: 'homepage_section',
      entityId: id,
      before,
      after: input,
    });
    return section;
  });
}

export async function deleteSection(prisma: Db, actor: Actor, id: string) {
  const before = await prisma.homepageSection.findUnique({ where: { id }, select: sectionSelect });
  if (!before) throw notFound('Section');
  await prisma.$transaction(async (tx) => {
    await tx.homepageSection.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: 'homepage_section.delete',
      entityType: 'homepage_section',
      entityId: id,
      before,
    });
  });
}
