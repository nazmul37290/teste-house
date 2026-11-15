import type { Db } from '../lib/prisma';

/** UPDATE orders SET "customerId" = $1 WHERE "customerId" IS NULL AND "contactEmail" = $2 */
export async function linkGuestOrdersByEmail(
  prisma: Db,
  customerId: string,
  email: string,
): Promise<number> {
  const { count } = await prisma.order.updateMany({
    where: { customerId: null, contactEmail: email },
    data: { customerId },
  });
  return count;
}
