import { config } from 'dotenv';
import { fileURLToPath } from 'node:url';

config({ path: fileURLToPath(new URL('../../../../.env', import.meta.url)), quiet: true });

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgresql://shop:shop@localhost:5432/shop_test';
export const TEST_REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6379/1';

/** Never let a test reset a database that is not obviously a test database. */
export function assertTestDatabase(url: string): void {
  const name = new URL(url).pathname.slice(1);
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run integration tests against "${name}": the database name must end with _test`,
    );
  }
}
