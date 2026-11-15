import type { Db } from '../lib/prisma';

/** Raw JSON value of one setting, or undefined when the key is missing. */
export async function findSettingValue(prisma: Db, key: string): Promise<unknown> {
  const row = await prisma.setting.findUnique({ where: { key }, select: { value: true } });
  return row?.value;
}
