import { defineConfig } from 'vitest/config';

// Integration tests run against real Postgres (shop_test) and Redis (db 1); see tests/integration/global-setup.ts.
export default defineConfig({
  test: {
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/global-setup.ts'],
    // One shared database: run files one after another.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 120_000,
  },
});
