# Food E-commerce

Monorepo for a Bangladesh food store: Next.js storefront and admin (`apps/web`), Express API (`apps/api`), shared code (`packages/shared`), Prisma schema (`prisma/`). Specs are in `docs/`; Claude Code reads `CLAUDE.md` first.

## First run

Requirements: Node 22+, pnpm 10 (`corepack enable`), Docker.

```bash
pnpm install
cp .env.example .env                 # then replace the three secrets (openssl rand -base64 48)
cp apps/web/.env.example apps/web/.env.local
pnpm db:up                           # Postgres, Redis, Mailpit (mail UI: http://localhost:8025)
pnpm db:generate                     # generate the Prisma client
pnpm db:migrate --name init          # first migration (then add the SQL from docs/database.md section 4)
pnpm db:seed                         # permissions, roles, payment methods, zones, settings, Super Admin
pnpm dev                             # web http://localhost:3000, api http://localhost:4000/health
```

Checks: `pnpm lint && pnpm typecheck && pnpm test`.

## Working with Claude Code in VS Code

1. Open this folder in VS Code and install the recommended extensions (prompted automatically).
2. Open Claude Code. It loads `CLAUDE.md` and follows the docs it lists.
3. Work one phase at a time from `docs/development-plan.md`. Prompt template:

> Read CLAUDE.md and the docs it lists. We are on Phase 3 of docs/development-plan.md. First propose a short plan for the unchecked tasks and wait for my OK, then implement task by task with tests. Do not start other phases. Tick the checklist as you go.

Use plan mode for anything touching the schema, auth, checkout or payments.

## Deploying with Dokploy

Dokploy is installed on the VPS (not part of this repo). Create projects, services and domains in its dashboard; see `docs/design.md` section 13. Build contexts are the repo root with `docker/Dockerfile.api` and `docker/Dockerfile.web`. Set `RUN_MIGRATIONS=true` on one api instance so migrations apply at start.
