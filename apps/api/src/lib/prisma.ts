import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

export type Db = PrismaClient;

/** One Prisma client per process, shared by our repositories and both Better Auth instances. */
export function createPrisma(databaseUrl: string): Db {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
}
