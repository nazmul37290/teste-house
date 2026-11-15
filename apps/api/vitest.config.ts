import { defineConfig } from 'vitest/config';

// Unit tests only: no Postgres or Redis needed. Integration tests use vitest.integration.config.ts.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/integration/**', '**/node_modules/**'],
  },
});
