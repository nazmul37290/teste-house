# Development plan

Work one phase at a time. Tick boxes as tasks finish. Each phase ends with: lint, typecheck and tests passing, docs updated if decisions changed, a demo on staging, and a Git tag (`phase-N`).

## How to run a phase with Claude Code

Start each phase with a prompt like:

> Read CLAUDE.md and the docs it lists. We are on Phase N of docs/development-plan.md. First propose a short plan for the unchecked tasks, wait for my OK, then implement task by task with tests. Do not start other phases. Tick the checklist as you go.

Use plan mode for anything that touches the database schema, auth, checkout or payments.

## Phase 0: Requirements (done)

- [x] Requirements approved (`requirements.md`)
- [x] Open items recorded (return policy, legal text, store name and logo)

## Phase 1: Database design (this package)

- [x] Prisma schema (`prisma/schema.prisma`)
- [x] ERD and rules (`database.md`)
- [x] Review schema with the owner (approved, including units, attributes and price snapshots)

## Step 0: Switch auth to Better Auth (docs, schema, env)

- [x] `docs/auth.md`; schema reconciled with `npx auth@1.7.20 generate`; JWT, refresh-token and argon2 design removed; `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` env

## Phase 2: Foundation

- [x] pnpm monorepo, TypeScript strict, ESLint, Prettier
- [x] `apps/api` Express skeleton: config loader (Zod-validated env), logger, error handler, liveness endpoint (readiness endpoint comes with the DB and Redis clients in Phase 3)
- [x] `apps/web` Next.js skeleton with Tailwind, base layout, robots and sitemap stubs, noindex admin layout
- [x] `packages/shared`: `normalizePhone()`, permission keys, base Zod schemas
- [x] `packages/shared`: `calculateOrderTotals()` (integer paisa) with unit and property tests (58 tests)
- [x] Prisma config and idempotent seed written
- [x] Generate the client; first migration (`20261115000000_init`, from `prisma migrate diff`) and the raw SQL migration for constraints and indexes (`20261115000100_constraints_and_search`, `docs/database.md` section 4); seed typechecked (now in `pnpm typecheck`) and bundled
- [x] Apply both migrations and run the seed against local Postgres
- [x] Docker: `Dockerfile.api`, `Dockerfile.web`, `compose.dev.yml` (Postgres, Redis, Mailpit); [ ] verify both images build on a machine with Docker
- [x] GitHub Actions: lint, typecheck, test, build
- [ ] Dokploy staging project: services, domains, env vars, auto-deploy

## Phase 3: Auth, RBAC, admin shell

- [x] Spike: two Better Auth instances (`customerAuth`, `adminAuth`) side by side with the Prisma adapter, separate tables, base paths and cookie prefixes, mounted before `express.json()` (passed; fallback not needed)
- [x] API foundation: Redis client, BullMQ, `/health/ready`, `MailTransport` (Mailgun and SMTP), `email.send` job with `notification_logs`, worker entry, `email-verify` and `password-reset` templates
- [x] Customer auth: `customerAuth` config (Redis secondary storage, rate-limit rules, IP header), our `/auth/register` and `/auth/login` (email or phone, placeholder email, Redis lockout), sessions, logout, email verification, password reset
- [x] Guest-order linking in the after-email-verification hook (verified email only, never phone)
- [x] Admin auth: `adminAuth` config, sign-up disabled, optional TOTP 2FA, 7-day sessions; Super Admin seeded through Better Auth
- [x] `requirePermission` middleware with Redis cache; roles, permissions, users CRUD
- [x] Admin UI shell: layout, navigation filtered by permissions, roles and users screens (plus 2FA setup and change password under My security; minimal customer register, login, verify, forgot/reset and account pages)
- [x] Audit logging helper
- [x] Settings API and screen (store name, logo, contact, SEO defaults, GTM ID)

## Phase 4: Catalog management (admin)

- [x] Media upload pipeline (validation, sharp sizes, alt text required)
- [x] Categories (tree), brands, tags (plus attributes and values)
- [ ] Products and variants CRUD with SEO fields, food fields, images, status, flags
- [ ] Inventory: adjustments, movement log, optional batches and expiry, low-stock threshold
- [ ] CSV import and export
- [ ] Enter the first 50 products

## Phase 5: Storefront catalog and SEO

- [ ] Home (banners, sections), category and product pages (SSR/ISR, tag revalidation)
- [ ] Listing filters, sort, pagination; search with suggestions
- [ ] Metadata, canonical, OG, JSON-LD, sitemap, robots, redirects
- [ ] Performance pass: image sizes, fonts, Core Web Vitals check
- [ ] Placeholder legal pages and footer links

## Phase 6: Cart, checkout, COD orders, accounts

- [ ] Guest and customer cart with merge on login
- [ ] Delivery zone quote; admin zone management with toggles
- [ ] Coupons (admin and validation)
- [ ] `POST /checkout/quote` and strict `POST /orders` schema (rejects any client money field)
- [ ] Order creation transaction using `calculateOrderTotals()`, idempotency, stock decrement, movements, price snapshots
- [ ] `PRICE_CHANGED` handling in the checkout UI
- [ ] Concurrency tests (last unit, coupon usage limit) and database CHECK tests
- [ ] Payment method listing with admin toggles and COD scope
- [ ] Order confirmation page, guest tracking (order number + phone)
- [ ] Customer area: profile, addresses, order history, cancel, invoice PDF
- [ ] Guest-order linking on email verification
- [ ] Order emails (placed, confirmed, cancelled)
- [ ] Admin order management: list, detail, status machine, edit, notes, invoice and packing slip

## Phase 7: Online payment (UddoktaPay)

- [ ] `PaymentGateway` adapter, charge creation, return page
- [ ] Webhook plus verify, amount check, idempotency
- [ ] Unpaid order expiry job, stock release
- [ ] Admin toggle and payment records view; refunds recorded manually

## Phase 8: Steadfast

- [ ] Adapter and status map (from official docs)
- [ ] Single and bulk booking via queue; shipment record; order status change
- [ ] Webhook plus polling sync; courier events timeline
- [ ] Customer tracking timeline and shipped email
- [ ] Courier balance display in admin

## Phase 9: Reviews, ratings, wishlist

- [ ] Wishlist (guest local, merge on login)
- [ ] Reviews with delivered-purchase check, photos, moderation, rating aggregation
- [ ] Rating shown on product and in JSON-LD

## Phase 10: GTM, consent, SEO audit

- [ ] GTM provider, `track()` helper, all ecommerce events
- [ ] Consent banner with Consent Mode v2
- [ ] Verify in GTM preview and GA4 DebugView; `purchase` dedup check
- [ ] SEO audit: Lighthouse, structured data validation, sitemap check

## Phase 11: Hardening and launch prep

- [ ] Security checklist from `design.md` section 12 reviewed item by item
- [ ] Rate limits tuned; Turnstile if bots appear
- [ ] Backups configured and a restore tested
- [ ] Load test of browse and checkout paths
- [ ] Error tracking and uptime monitoring
- [ ] User acceptance test with the owner (full order to delivery on staging)

## Phase 12: Go live

- [ ] Production Dokploy project, domains, Cloudflare, secrets
- [ ] Production migrate and seed (real Super Admin, real zones and charges)
- [ ] Return policy and legal pages entered
- [ ] Smoke test of one real COD order and one real online payment
- [ ] Launch, monitor, fix list for the first week
