import type { Db } from '../lib/prisma';

const credentialsLookup = { id: true, email: true, status: true } as const;

export function findCustomerForLogin(prisma: Db, by: { email: string } | { phone: string }) {
  return prisma.customer.findUnique({ where: by, select: credentialsLookup });
}

export async function customerExists(prisma: Db, phone: string, email: string): Promise<boolean> {
  const count = await prisma.customer.count({ where: { OR: [{ phone }, { email }] } });
  return count > 0;
}

export function touchLastLogin(prisma: Db, id: string) {
  return prisma.customer.update({
    where: { id },
    data: { lastLoginAt: new Date() },
    select: { id: true },
  });
}

export function findCustomerProfile(prisma: Db, id: string) {
  return prisma.customer.findUniqueOrThrow({
    where: { id },
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      emailVerified: true,
      createdAt: true,
    },
  });
}
