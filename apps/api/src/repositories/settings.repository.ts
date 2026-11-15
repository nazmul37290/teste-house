import type { Prisma } from '../generated/prisma/client';
import type { Db } from '../lib/prisma';

type Client = Db | Prisma.TransactionClient;

/** Raw JSON value of one setting, or undefined when the key is missing. */
export async function findSettingValue(prisma: Db, key: string): Promise<unknown> {
  const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value;
}

export function listSettings(
  prisma: Client,
  where: { keys: readonly string[]; publicOnly?: boolean },
) {
  return prisma.setting.findMany({
    where: { key: { in: [...where.keys] }, ...(where.publicOnly ? { isPublic: true } : {}) },
    select: { key: true, value: true, group: true, isPublic: true, updatedAt: true },
    orderBy: { key: 'asc' },
  });
}

export function upsertSetting(
  prisma: Client,
  row: {
    key: string;
    value: Prisma.InputJsonValue | typeof Prisma.JsonNull;
    group: string;
    isPublic: boolean;
  },
) {
  return prisma.setting.upsert({
    where: { key: row.key },
    update: { value: row.value, group: row.group, isPublic: row.isPublic },
    create: row,
  });
}
