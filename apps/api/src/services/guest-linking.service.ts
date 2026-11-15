import { isPlaceholderEmail } from '@shop/shared';
import type { Db } from '../lib/prisma';
import { linkGuestOrdersByEmail } from '../repositories/order.repository';

export type VerifiedCustomer = { id: string; email: string; emailVerified: boolean };

/**
 * Links guest orders to a customer by their **verified** email (docs/auth.md section 4). Called only
 * from Better Auth's afterEmailVerification hook, which also runs after a verified email change.
 * Never links by phone. Placeholder addresses never link. Idempotent. Returns the number linked.
 */
export async function linkGuestOrders(prisma: Db, customer: VerifiedCustomer): Promise<number> {
  if (!customer.emailVerified || isPlaceholderEmail(customer.email)) return 0;
  return linkGuestOrdersByEmail(prisma, customer.id, customer.email.trim().toLowerCase());
}
