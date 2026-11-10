import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 does not load .env by itself; dotenv above does. DATABASE_URL must be set for
// generate, migrate and seed (see .env.example).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  // Seeding runs through the API bundle (`pnpm db:seed`) because it needs the API's dependencies.
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
