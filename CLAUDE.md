# CLAUDE.md

Food e-commerce store for Bangladesh (canned food, Horlicks, honey, and similar packaged items). BDT only, English only for now.

## Read these first

Before starting any task, read the docs that apply. They are the source of truth; if code and docs disagree, stop and ask.

| File | Purpose |
|---|---|
| `docs/requirements.md` | What to build: features, rules, decisions already made |
| `docs/design.md` | How it is built: architecture, auth summary, checkout flow, security, SEO, GTM, files, deployment |
| `docs/auth.md` | Better Auth design: two instances, login by email or phone, sessions, cookies, rate limits, guest linking, 2FA |
| `docs/database.md` | Table reference, business rules, indexes, seed data, ERD |
| `prisma/schema.prisma` | The actual schema (single source of truth for the DB) |
| `docs/pricing.md` | Price, discount, delivery and total rules; read before touching anything money-related |
| `docs/api-conventions.md` | REST conventions, error format, route list |
| `docs/integrations.md` | Steadfast, UddoktaPay, Mailgun, GTM rules |
| `docs/development-plan.md` | Phases and task checklist; tick items as you finish them |

## Stack

- Monorepo (pnpm workspaces): `apps/web` (Next.js App Router, TypeScript, Tailwind), `apps/api` (Express, TypeScript), `packages/shared` (Zod schemas, types, permission keys, constants).
- PostgreSQL via Prisma (use the current major; the connection URL lives in `prisma.config.ts`, not in the schema; see `docs/database.md` section 2). Redis + BullMQ for rate limiting, sessions and background jobs.
- Docker; deployed with Dokploy on a VPS. Cloudflare in front.

## Working rules

1. Work on **one phase at a time** from `docs/development-plan.md`. Do not start the next phase until asked.
2. Do not add features outside `docs/requirements.md`. If something seems missing, ask.
3. When a decision changes, update the relevant doc in the same change.
4. Small, reviewable commits. Conventional commit messages (`feat:`, `fix:`, `chore:`, `docs:`).
5. Every new endpoint needs: Zod validation, permission or ownership check, and a test for the business logic.
6. Run `pnpm lint`, `pnpm typecheck` and `pnpm test` (and `pnpm test:integration` when the change touches the API) before saying a task is done.

## Hard rules (never break)

- **Money:** `Decimal(12,2)` in the DB, integer paisa in calculations, never floats. The server calculates every price, discount, delivery charge and total with `calculateOrderTotals()` from `packages/shared` (see `docs/pricing.md`). The client sends only variant IDs, quantities, coupon code, address, payment method and an idempotency key. Never accept or use a price, total, discount or delivery amount from the client; the order schema is `.strict()` and a test enforces it.
- **Secrets:** only in environment variables. Never commit `.env`; keep `.env.example` current (names only, no values). Steadfast, UddoktaPay and Mailgun credentials come from env.
- **Authentication:** Better Auth only (`docs/auth.md`), pinned to a stable version; two instances (`customerAuth`, `adminAuth`). Never write password hashes or session tokens yourself; go through Better Auth's API or internal adapter. Admin sign-up stays disabled.
- **Authorization:** enforce permissions on the API with `requirePermission('module.action')`. Hiding buttons in the UI is not security. Customers can only read their own data.
- **Phone numbers:** always normalize with the shared `normalizePhone()` helper before saving or comparing (`01XXXXXXXXX`).
- **Guest orders:** link a guest order to an account only after the matching **email is verified** (Better Auth after-verification hook). Never link by phone alone. Placeholder `@phone.invalid` emails are never verified or mailed.
- **Stock and orders:** create orders inside a DB transaction, with an idempotency key; decrement stock and write a `StockMovement` row in the same transaction.
- **Payments:** the gateway webhook/verify call is the source of truth, never the browser redirect.
- **Third-party APIs (Steadfast, UddoktaPay, Mailgun):** do not guess endpoints or payloads. Fetch the official documentation first, then implement behind the adapter interface in `docs/integrations.md`.
- **Times:** store UTC, display Asia/Dhaka.
- **Uploads:** validate magic bytes, re-encode with sharp, random file names, never use the user-supplied name on disk.
- **Admin RBAC:** permission keys live only in `packages/shared` and are seeded to the DB. Roles are dynamic; the Super Admin role is a system role and cannot be edited or deleted.

## Conventions

- TypeScript strict. ESLint + Prettier. No `any` without a comment explaining why.
- API: `/api/v1/...`, JSON envelope and error codes from `docs/api-conventions.md`.
- Layers in the API: `routes -> controllers -> services -> repositories (Prisma)`. Business logic lives in services only.
- Frontend: Server Components by default; client components only when needed. Admin lives under `/admin` with its own layout.
- Names: DB tables `snake_case` plural (mapped in Prisma), Prisma models `PascalCase`, files `kebab-case`.

## Commands

```bash
pnpm install
pnpm db:up              # Postgres, Redis, Mailpit via docker/compose.dev.yml
pnpm db:generate        # generate the Prisma client (needs DATABASE_URL in .env)
pnpm db:migrate         # create/apply migrations in dev
pnpm db:seed            # permissions, roles, payment methods, zones, settings, Super Admin
pnpm dev                # api on :4000, web on :3000
pnpm lint && pnpm typecheck && pnpm test
pnpm test:integration   # needs pnpm db:up; uses the shop_test database and Redis db 1
pnpm build
```

## Status

Phase 1 (schema) and Phase 2 (foundation) are scaffolded. Step 0 (switch auth to Better Auth 1.7.20: docs, schema, env) is done; the seed no longer creates the Super Admin (Phase 3 does, through Better Auth). `packages/shared` already contains `calculateOrderTotals()`, `normalizePhone()`, permission keys and the strict order schema, with tests. The first two migrations (init, plus the raw SQL constraints from `docs/database.md` section 4) are applied and the seed runs locally; `prisma/seed.ts` is covered by `pnpm typecheck`. Setup and deployment walkthrough: `docs/setup-guide.md`. Phase 3 in progress: the two-instance spike passed (Better Auth now 1.7.25); integration tests run with `pnpm test:integration` against `shop_test`. Pinned on purpose: Prisma 7.10.x (not the release candidate) and TypeScript 6.x (typescript-eslint does not support 7 yet).

## Open items (do not decide silently)

- Return and refund policy rules.
- Legal page text (privacy, terms): use placeholder pages until provided.
- Store name and logo: read from `Setting` rows; never hardcode.
