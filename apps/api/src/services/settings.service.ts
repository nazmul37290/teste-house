import {
  PUBLIC_SETTING_KEYS,
  SETTING_DEFINITIONS,
  SETTING_KEYS,
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

export async function getAllSettings(prisma: Db) {
  const rows = await listSettings(prisma, { keys: SETTING_KEYS });
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
