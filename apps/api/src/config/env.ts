import { z } from 'zod';

/** All configuration comes from environment variables, validated at startup. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().default(4000),
  APP_URL: z.url().default('http://localhost:3000'),
  API_URL: z.url().default('http://localhost:4000'),
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:3000')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  COOKIE_DOMAIN: z.string().optional(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1).default('redis://localhost:6379'),

  // Better Auth (docs/auth.md): secret signs cookies and encrypts 2FA secrets; at least 32 chars.
  BETTER_AUTH_SECRET: z.string().min(32),
  // Public origin the browser uses (the web app, which rewrites /api/v1/* to the API).
  BETTER_AUTH_URL: z.url().default('http://localhost:3000'),

  MAIL_PROVIDER: z.enum(['mailgun', 'smtp']).default('smtp'),
  MAIL_FROM: z.string().default('Shop <no-reply@localhost>'),
  MAILGUN_API_KEY: z.string().optional(),
  MAILGUN_DOMAIN: z.string().optional(),
  MAILGUN_BASE_URL: z.string().optional(),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().default(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),

  STEADFAST_BASE_URL: z.string().optional(),
  STEADFAST_API_KEY: z.string().optional(),
  STEADFAST_SECRET_KEY: z.string().optional(),
  STEADFAST_WEBHOOK_TOKEN: z.string().optional(),

  UDDOKTAPAY_BASE_URL: z.string().optional(),
  UDDOKTAPAY_API_KEY: z.string().optional(),

  // Error tracking (optional): off when SENTRY_DSN is empty.
  SENTRY_DSN: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  SENTRY_ENVIRONMENT: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),

  UPLOAD_DIR: z.string().default('./uploads'),
  PUBLIC_MEDIA_URL: z.string().default('http://localhost:4000/media'),
  // Storefront cache refresh (docs/design.md section 9): the worker posts changed cache tags to the
  // web app. Without a secret, refreshes are skipped and pages update on their own timer instead.
  REVALIDATE_SECRET: z.string().min(16).optional(),
  WEB_INTERNAL_URL: z.url().default('http://localhost:3000'),
});

export type Env = z.infer<typeof schema>;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
