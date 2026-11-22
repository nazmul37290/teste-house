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
- [x] Products and variants CRUD with SEO fields, food fields, images, status, flags
- [x] Inventory: adjustments, movement log, optional batches and expiry, low-stock threshold
- [x] CSV import and export
- [ ] Enter the first 50 products

## Phase 5: Storefront catalog and SEO

- [x] Home (banners, sections), category and product pages (SSR/ISR, tag revalidation)
- [x] Listing filters, sort, pagination; search with suggestions
- [x] Metadata, canonical, OG, JSON-LD, sitemap, robots, redirects
- [ ] Performance pass: image sizes, fonts, Core Web Vitals check
- [x] Placeholder legal pages and footer links

## Phase 6: Cart, checkout, COD orders, accounts

- [x] Guest and customer cart with merge on login
- [x] Delivery zone quote; admin zone management with toggles
- [x] Coupons (admin and validation)
- [x] `POST /checkout/quote` and strict `POST /orders` schema (rejects any client money field)
- [x] Order creation transaction using `calculateOrderTotals()`, idempotency, stock decrement, movements, price snapshots
- [x] `PRICE_CHANGED` handling in the checkout UI
- [x] Concurrency tests (last unit, coupon usage limit) and database CHECK tests
- [x] Payment method listing with admin toggles and COD scope
- [x] Order confirmation page, guest tracking (order number + phone)
- [x] Customer area: profile, addresses, order history, cancel, invoice PDF
- [x] Guest-order linking on email verification (hook from Phase 3; linked orders show in the order history)
- [x] Order emails (placed, confirmed, cancelled)
- [x] Admin order management: list, detail, status machine, edit, notes, invoice and packing slip

## Phase 7: Online payment (UddoktaPay)

- [x] `PaymentGateway` adapter, charge creation, return page
- [x] Webhook plus verify, amount check, idempotency
- [x] Unpaid order expiry job, stock release
- [x] Admin toggle and payment records view; refunds recorded manually

## Phase 8: Steadfast

- [ ] Adapter and status map (from official docs) (seam, states and mapping done; Steadfast adapter waits for the docs from the merchant dashboard)
- [x] Single and bulk booking via queue; shipment record; order status change
- [ ] Webhook plus polling sync; courier events timeline (polling and timeline done; webhook waits for the docs)
- [x] Customer tracking timeline and shipped email
- [x] Courier balance display in admin (shows "not connected" until the adapter exists)

## Phase 9: Reviews, ratings, wishlist

- [x] Wishlist (guest local, merge on login)
- [x] Reviews with delivered-purchase check, photos, moderation, rating aggregation
- [x] Rating shown on product and in JSON-LD

## Phase 10: GTM, consent, SEO audit

- [x] GTM provider, `track()` helper, all ecommerce events
- [x] Consent banner with Consent Mode v2
- [x] GA4 (direct) and Meta Pixel IDs in admin settings; events sent to both through the same helper; Pixel only after marketing consent (verified in a browser with test IDs: consent order, Pixel `PageView`/`ViewContent`, GA4 `view_item`)
- [ ] Owner: real GA4 and Pixel IDs; check GA4 DebugView and Meta Test events, including one `PageView` per page change
- [ ] Verify in GTM preview and GA4 DebugView; `purchase` dedup check (dataLayer and dedup verified in a browser; GTM preview / DebugView need the owner's container)
- [ ] SEO audit: Lighthouse, structured data validation, sitemap check (structured data, sitemap, metadata, robots done; Lighthouse needs permission to run)

## Phase 11: Hardening and launch prep

- [x] Security checklist from `design.md` section 12 reviewed item by item (`docs/security-review.md`; server items listed for the owner)
- [x] Rate limits tuned; Turnstile if bots appear (table in `api-conventions.md` section 4; Turnstile deferred until bots appear)
- [ ] Backups configured and a restore tested (scripts and restore drill done locally, `docs/operations.md`; scheduling on the server is the owner's)
- [x] Load test of browse and checkout paths (results in `docs/operations.md`; repeat on staging)
- [ ] Error tracking and uptime monitoring (Sentry wired, off until `SENTRY_DSN` is set; uptime monitors are set up by the owner, `docs/operations.md`)
- [ ] User acceptance test with the owner (full order to delivery on staging; script in `docs/uat-checklist.md`)

## Phase 12: Go live

- [ ] Production Dokploy project, domains, Cloudflare, secrets
- [ ] Production migrate and seed (real Super Admin, real zones and charges)
- [x] Policy pages editable in the admin (`/admin/pages`)
- [ ] Return policy and legal pages entered (owner, in `/admin/pages`)
- [ ] Smoke test of one real COD order and one real online payment
- [ ] Launch, monitor, fix list for the first week
