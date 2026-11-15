import type { Prisma } from '../generated/prisma/client';

/**
 * A slug changed (docs/requirements.md: slug changes create automatic 301 redirects). Records
 * old -> new, points existing redirects at the new path (no chains: a -> b -> c becomes a -> c,
 * b -> c), and drops any redirect from the new path, which is a live page again.
 */
export async function recordSlugRedirect(
  tx: Prisma.TransactionClient,
  fromPath: string,
  toPath: string,
): Promise<void> {
  if (fromPath === toPath) return;
  await tx.redirect.deleteMany({ where: { fromPath: toPath } });
  await tx.redirect.updateMany({ where: { toPath: fromPath }, data: { toPath } });
  await tx.redirect.upsert({
    where: { fromPath },
    update: { toPath, statusCode: 301 },
    create: { fromPath, toPath, statusCode: 301 },
  });
}
