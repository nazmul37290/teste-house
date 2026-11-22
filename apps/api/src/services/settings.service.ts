import {
  LEGAL_PAGES,
  LEGAL_PAGE_SLUGS,
  PUBLIC_SETTING_KEYS,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
  type HomeHighlight,
  type LegalPageSlug,
  type SettingKey,
  type UpdateSettingsInput,
} from '@shop/shared';
import { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';
import { listSettings, upsertSetting } from '../repositories/settings.repository';
import { recordAudit, type Actor } from './audit.service';

export type SettingsMap = Partial<Record<SettingKey, unknown>>;

const toMap = (rows: { key: string; value: unknown }[]): SettingsMap =>
  Object.fromEntries(rows.map((r) => [r.key, r.value])) as SettingsMap;

/** Storefront-safe settings only (store info, SEO defaults, GTM ID). Never review/notification/shipping. */
export async function getPublicSettings(prisma: Db): Promise<SettingsMap> {
  return toMap(await listSettings(prisma, { keys: PUBLIC_SETTING_KEYS, publicOnly: true }));
}

/** The settings screen: everything except the policy pages, which have their own screen. */
const SETTINGS_SCREEN_KEYS = SETTING_KEYS.filter((k) => SETTING_DEFINITIONS[k].group !== 'pages');

export async function getAllSettings(prisma: Db) {
  const rows = await listSettings(prisma, { keys: SETTINGS_SCREEN_KEYS });
  return {
    values: toMap(rows),
    updatedAt: Object.fromEntries(rows.map((r) => [r.key, r.updatedAt])),
  };
}

/**
 * Saves the given keys (already validated by updateSettingsSchema) and records one audit row with
 * the before and after of the keys that actually changed.
 */
export async function updateSettings(
  prisma: Db,
  actor: Actor,
  input: UpdateSettingsInput,
): Promise<SettingsMap> {
  const entries = Object.entries(input).filter(([, v]) => v !== undefined) as [
    SettingKey,
    unknown,
  ][];
  await prisma.$transaction(async (tx) => {
    const before = toMap(await listSettings(tx, { keys: entries.map(([k]) => k) }));
    const changed = entries.filter(
      ([k, v]) => JSON.stringify(before[k] ?? null) !== JSON.stringify(v ?? null),
    );
    if (!changed.length) return;

    for (const [key, value] of changed) {
      const { group, isPublic } = SETTING_DEFINITIONS[key];
      await upsertSetting(tx, {
        key,
        value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue),
        group,
        isPublic,
      });
    }
    await recordAudit(tx, actor, {
      action: 'settings.update',
      entityType: 'setting',
      before: Object.fromEntries(changed.map(([k]) => [k, before[k] ?? null])),
      after: Object.fromEntries(changed),
    });
  });
  return (await getAllSettings(prisma)).values;
}

/** The home page highlights strip (empty: automatic). Edited by marketing, not via all settings. */
export async function getHomeHighlights(prisma: Db): Promise<HomeHighlight[]> {
  const rows = await listSettings(prisma, { keys: ['home.highlights'] });
  const parsed = SETTING_DEFINITIONS['home.highlights'].schema.safeParse(rows[0]?.value ?? []);
  return parsed.success ? parsed.data : [];
}

export async function updateHomeHighlights(
  prisma: Db,
  actor: Actor,
  items: HomeHighlight[],
): Promise<HomeHighlight[]> {
  await updateSettings(prisma, actor, { 'home.highlights': items } as UpdateSettingsInput);
  return getHomeHighlights(prisma);
}

// Policy pages (privacy, terms, returns) -----------------------------------------------------------

const pageKey = (slug: LegalPageSlug) => `page.${slug}` as const;

export type LegalPage = {
  slug: LegalPageSlug;
  title: string;
  path: string;
  body: string;
  /** Last save; null while the page has never been written. */
  updatedAt: Date | null;
};

export async function listLegalPages(prisma: Db): Promise<LegalPage[]> {
  const rows = await listSettings(prisma, { keys: LEGAL_PAGE_SLUGS.map(pageKey) });
  return LEGAL_PAGE_SLUGS.map((slug) => {
    const row = rows.find((r) => r.key === pageKey(slug));
    const body = typeof row?.value === 'string' ? row.value : '';
    return { slug, ...LEGAL_PAGES[slug], body, updatedAt: body ? (row?.updatedAt ?? null) : null };
  });
}

export async function getLegalPage(prisma: Db, slug: LegalPageSlug): Promise<LegalPage> {
  return (await listLegalPages(prisma)).find((p) => p.slug === slug)!;
}

/** Saves the text (validated by updateLegalPageSchema); audited like every other setting. */
export async function updateLegalPage(
  prisma: Db,
  actor: Actor,
  slug: LegalPageSlug,
  body: string,
): Promise<LegalPage> {
  await updateSettings(prisma, actor, { [pageKey(slug)]: body } as UpdateSettingsInput);
  return getLegalPage(prisma, slug);
}
