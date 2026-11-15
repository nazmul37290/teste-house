import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { assertTestDatabase, TEST_DATABASE_URL } from './test-env';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));
const apiRoot = fileURLToPath(new URL('../../', import.meta.url));

/**
 * Brings the test database up to date without destroying anything: create it if missing, apply
 * pending migrations, run the idempotent seed. Tests use unique emails and phones, so data from
 * earlier runs does not matter. CI starts from an empty database every time.
 */
export default async function setup(): Promise<void> {
  assertTestDatabase(TEST_DATABASE_URL);
  await createDatabaseIfMissing(TEST_DATABASE_URL);

  const env = { ...process.env, DATABASE_URL: TEST_DATABASE_URL };
  const node = (args: string[], cwd: string) =>
    execFileSync(process.execPath, args, { cwd, env, stdio: 'pipe' });
  node(['node_modules/prisma/build/index.js', 'migrate', 'deploy'], repoRoot);
  // The seed runs from the API bundle, exactly like `pnpm db:seed`.
  node(['build.mjs'], apiRoot);
  node(['dist/seed.js'], apiRoot);
}

async function createDatabaseIfMissing(url: string): Promise<void> {
  const target = new URL(url);
  const name = target.pathname.slice(1);
  const admin = new URL(url);
  admin.pathname = '/postgres';
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    // Identifier cannot be a bind parameter; the name was checked by assertTestDatabase.
    if (!rowCount) await client.query(`CREATE DATABASE "${name.replace(/"/g, '')}"`);
  } finally {
    await client.end();
  }
}
