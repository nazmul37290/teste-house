# Claude Code prompts

Paste these into Claude Code (VS Code extension), in order, one per session. They assume the repo from `ecommerce-repo.zip`, with `CLAUDE.md` at the root.

## How to use

- **One prompt per session.** Finish, run the checks, commit, tag `phase-N`, then `/clear` (or open a new session) before the next prompt. Small context means fewer mistakes.
- **Start in plan mode** and approve the plan before it edits files. Always for auth, schema, checkout and payments.
- **Pin stable versions only.** Before adding a dependency, check `pnpm view <pkg> dist-tags`. Never use beta, rc or canary. This already bit us twice (Prisma 8 rc, TypeScript 7).
- **Read official docs first** for Better Auth, UddoktaPay, Steadfast and Mailgun. The prompts say so. If Claude Code cannot reach a doc, it must say so instead of guessing.
- **Do not tick the checklist** in `docs/development-plan.md` until `pnpm lint`, `pnpm typecheck`, `pnpm test` and `pnpm build` pass.
- **Keep docs in sync.** When a decision changes, the same commit updates the doc.
- Order matters: **Step 0 (Better Auth) comes before Phase 2 (first migration)**, so the first migration already has the right auth tables.

---

## Step 0: Switch to Better Auth (docs, schema, env only)

### Decisions in this prompt (change them before you run it if you disagree)

1. **Two Better Auth instances** on one Postgres: customers and admins, with separate tables, base paths and cookie prefixes. The Better Auth docs do not cover running two instances, so Phase 3 starts with a small spike. Fallback if it fails: one instance with a `type` field.
2. **Login by email or phone through our own thin endpoint.** It resolves the identifier, then calls Better Auth's email sign-in. I am not using the phone-number plugin now: it is built around SMS OTP, and its docs say a phone number sent to the sign-up or sign-in routes is rejected. Revisit when SMS is added.
3. **Phone-only customers** get a placeholder email (`<phone>@phone.invalid`) because Better Auth requires an email. It is never verified and never mailed.
4. **Guest-order linking** happens only after a real email is verified (an after-verification hook), never by phone.
5. **Password hashing** is Better Auth's default (scrypt). No argon2, which avoids native-module trouble in Alpine Docker builds.
6. **Admin RBAC stays ours** (`roles`, `permissions`, `role_permissions`). I am not using Better Auth's admin or organization access-control plugins. Admin sign-up is disabled.
7. **Same-origin API for the browser**: Next.js rewrites `/api/v1/*` to the API, so cookies are first-party. This avoids Safari tracking-protection problems. Fallback: cross-subdomain cookies.

### Prompt

```text
We are replacing the custom JWT and refresh-token auth in our design with Better Auth. This step changes docs, the Prisma schema and env config only. Do NOT write feature code and do NOT create migrations.

First read CLAUDE.md and every doc it lists. Then read the current official Better Auth docs (https://better-auth.com/docs): installation, Express integration, Prisma adapter, concepts/database, session-management, cookies, rate-limit, email, and plugins/two-factor. Run `pnpm view better-auth dist-tags` and choose the latest STABLE version (no beta or rc). Use plan mode: show me the plan and any open questions, and wait for my OK before editing.

Decisions already made (do not reopen unless you find a real blocker, and tell me if you do):
1. Two Better Auth instances sharing one Postgres:
   - customerAuth: tables customers (user), customer_sessions, customer_accounts, customer_verifications; basePath /api/v1/auth; cookie prefix shop_c.
   - adminAuth: tables admin_users (user), admin_sessions, admin_accounts, admin_verifications, plus the twoFactor plugin tables; basePath /api/v1/admin/auth; cookie prefix shop_a; email-and-password sign-up disabled.
   The docs do not cover multiple instances. Plan a spike at the start of Phase 3 to prove it. Fallback: one instance with one user table and a type field.
2. Customers log in with ONE field that accepts email or phone. Our own endpoint POST /api/v1/auth/login runs parseLoginIdentifier() from packages/shared, finds the customer, then calls auth.api.signInEmail with that customer's stored email. Do not use the phoneNumber plugin for now.
3. POST /api/v1/auth/register uses the shared registerSchema: phone mandatory and normalized, email optional. Phone-only customers get the placeholder email <normalizedPhone>@phone.invalid, which is never verified and never mailed. Phone stays unique on the customer table.
4. Verification emails go only to real emails. Customers may log in unverified. Guest orders are linked to a customer ONLY in the after-email-verification hook, by matching orders.contactEmail to the verified email. Never link by phone.
5. Password reset is by email. A phone-only customer must add and verify a real email in their profile before they can reset by email (record SMS reset as a future item).
6. Password hashing: Better Auth default. Remove argon2 everywhere (docs, seed, dependencies list). The seed must create the Super Admin through Better Auth's internal adapter and password hasher, not by writing hashes itself (Phase 3 implements this).
7. Admin RBAC stays ours: roles, permissions, role_permissions, admin_users.roleId. requirePermission() reads the admin session from adminAuth. Do not use Better Auth's admin or organization plugins. Optional 2FA via the twoFactor plugin on adminAuth, recommended for Super Admin.
8. Rate limiting: Better Auth rateLimit with Redis secondary storage (@better-auth/redis-storage) and stricter custom rules for sign-in, sign-up, forgot-password and resend-verification. In production, client IP comes from cf-connecting-ip via advanced.ipAddress (note in docs: the origin must accept traffic only from Cloudflare, otherwise this header can be spoofed). Our own login and register endpoints also keep a Redis lockout per identifier and IP.
9. Sessions: customers 30 days, admins 7 days, updateAge 1 day, session cookie cache on, httpOnly, Secure in production, SameSite=Lax.
10. Cookies and origin: Next.js rewrites /api/v1/* to the API so the browser only talks to one origin (webhooks may use the same path). Fallback is crossSubDomainCookies with a parent domain and trustedOrigins. Decide in the plan and document it.
11. Express: mount Better Auth with toNodeHandler using Express 5 syntax (/api/v1/auth/*splat and /api/v1/admin/auth/*splat) BEFORE express.json(). Our own /login and /register routes are mounted before those catch-alls and use route-level express.json().
12. Next.js: middleware only does an optimistic session-cookie check (getSessionCookie with our cookie prefixes). Every real check happens server-side against the API.

Deliverables:
- New docs/auth.md: the full auth design above (flows for register, login, verify email, reset password, guest linking, admin login, 2FA, sessions, cookies, rate limits, mounting order, open items).
- Update CLAUDE.md (hard rules and the docs table), docs/requirements.md (ACC section and RBAC section), docs/design.md (sections 3, 4, 12, 14 and the env var table), docs/database.md (tables, ERD, seed section, guest-linking rule), docs/api-conventions.md (auth routes and cookie names), docs/integrations.md (verification and reset emails are triggered from Better Auth callbacks and go through the email queue), docs/development-plan.md (rewrite the Phase 3 tasks around Better Auth, including the spike).
- prisma/schema.prisma: create a throwaway Better Auth config outside the repo and run `npx auth@latest generate` to see the exact columns Better Auth expects, then reconcile with our schema. Keep our table names. Remove RefreshToken, VerificationToken, TokenSubject, TokenPurpose, Customer.passwordHash, AdminUser.passwordHash and AdminUser.twoFactorSecret. Add the session, account, verification and two-factor models for both instances. Keep the Customer phone column (unique, normalized). Keep AdminUser.roleId.
- Env: remove JWT_ACCESS_SECRET, JWT_REFRESH_SECRET and ENCRYPTION_KEY (if nothing else uses it); add BETTER_AUTH_SECRET and BETTER_AUTH_URL. Update apps/api/src/config/env.ts, its test, .env.example and the env table in docs/design.md.

Acceptance:
- pnpm lint, pnpm typecheck and pnpm test pass.
- `pnpm exec prisma validate` passes (DATABASE_URL set).
- Search the repo: no leftover mentions of JWT, refresh token or argon2 in docs or code.
- Commit as "docs: switch auth to Better Auth".
- Finish with a list of open questions and anything in the Better Auth docs that contradicted these decisions.
```

---

## Phase 2: Finish the foundation

```text
Read CLAUDE.md and the docs it lists. We are finishing Phase 2 of docs/development-plan.md. Use plan mode first. Assume `pnpm db:up` has Postgres, Redis and Mailpit running and .env exists.

Tasks:
1. `pnpm db:generate`. Create the first migration named `init` from prisma/schema.prisma with `--create-only`, review the SQL, then apply it.
2. Second migration `constraints_and_indexes` containing the raw SQL from docs/database.md section 4: pg_trgm, CHECK constraints (stock, prices, unit pair, pricing integrity on orders and order_items, coupon value, payment and refund amounts), partial unique indexes, trigram indexes. Make sure every column name matches the real generated names. Add integration tests that try to insert inconsistent rows (for example grandTotal that does not match, negative stock, duplicate default address) and expect the database to refuse them.
3. Seed: add prisma/seed.ts to the api typecheck now that the client exists. Fix any type errors. Remove the Super Admin creation from the seed for now (Phase 3 creates it through Better Auth). Run `pnpm db:seed` twice and prove it is idempotent (row counts unchanged).
4. Docker: build both images locally (`docker build -f docker/Dockerfile.api .` and `docker build -f docker/Dockerfile.web .` from the repo root), run them against the dev services, and confirm /health. Fix whatever breaks.
5. CI: add Postgres and Redis service containers to .github/workflows/ci.yml, run migrations, seed and the integration tests there.
6. Write docs/dokploy-setup.md: a step-by-step guide for me to do by hand on the VPS (install Dokploy, create the project, Postgres and Redis services, api, worker and web applications from this repo, env var table, domains, Cloudflare DNS and SSL mode, S3-compatible backups, auto-deploy webhook, staging vs production). You cannot do these steps; only document them, from the official Dokploy docs.

Acceptance: lint, typecheck, test and build pass; migrations apply on an empty database; seed is idempotent; both images build and answer /health. Tick the Phase 2 boxes, commit, tag phase-2.
```

---

## Phase 3: Auth, RBAC, admin shell

```text
Read CLAUDE.md, docs/auth.md and the docs it lists. We are on Phase 3 of docs/development-plan.md. Use plan mode. Read the current Better Auth docs again before writing code, and use the stable version chosen in Step 0.

Order of work:
A. SPIKE FIRST (small, throwaway if needed): prove two Better Auth instances (customerAuth and adminAuth) work side by side with the Prisma adapter, separate tables, basePaths and cookie prefixes, mounted in Express 5 before express.json(). If it fails, stop and show me the fallback (one instance with a type field) before continuing.
B. API foundation: Redis client, BullMQ setup, /health/ready (DB and Redis), a MailTransport interface with Mailgun and SMTP implementations (Nodemailer for SMTP) chosen by MAIL_PROVIDER, an email.send queue job that writes notification_logs, and a worker entry point that runs queues. Email templates for email-verify and password-reset (HTML and plain text, store name and logo read from settings).
C. Customer auth: customerAuth config (Redis secondary storage, rate limit rules, IP header config), our POST /auth/register and POST /auth/login (email or phone, placeholder email for phone-only customers, Redis lockout), Better Auth handlers for sessions, logout, email verification and password reset. Verification and reset mails go through the email queue and are skipped for @phone.invalid addresses. Implement the guest-order linking service (match orders.contactEmail to the verified email, customerId IS NULL) and call it from the after-verification hook; test it with direct database inserts because orders arrive in Phase 6.
D. Admin auth: adminAuth config, sign-up disabled, optional TOTP 2FA, 7-day sessions. Seed the Super Admin through Better Auth's internal adapter and password hasher using SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD (dev only; production uses a one-off command with different values).
E. RBAC: requirePermission(key) middleware with a Redis permission cache invalidated when a role changes; Super Admin (isSystem role) bypasses checks; admin CRUD APIs for roles, role permissions, permissions (read-only) and admin users; the system role cannot be edited or deleted. Audit log helper, called on every admin write.
F. Settings API (public and admin) for store name, logo, contact, SEO defaults, GTM ID.
G. Web: initialise shadcn/ui. Customer pages: login (one identifier field), register (name, phone, optional email, password), verify-email result, forgot and reset password. Admin: login, 2FA step, layout with navigation filtered by the permissions from /admin/auth/me, roles screen (create role, tick permissions), users screen, settings screen. Next.js rewrites for /api/v1, and middleware with only an optimistic cookie check.

Tests (required): integration tests against real Postgres and Redis for register, login by email, login by phone, wrong password, rate limit and lockout, verification linking guest orders by email and NOT by phone, admin cannot sign up, permission denied returns 403, Super Admin bypass, role edit invalidates the cache, system role cannot be deleted.

Acceptance: lint, typecheck, test, build pass; I can log in as Super Admin locally, create a Manager role with some permissions, create a user with that role and see the menu shrink. Tick Phase 3 boxes, commit, tag phase-3.
```

---

## Phase 4: Catalog management (admin)

```text
Read CLAUDE.md and the docs it lists (requirements CAT-*, database.md section 3a, design.md section 11). We are on Phase 4. Use plan mode.

Build the admin side of the catalog, each endpoint with Zod validation, requirePermission and an audit log entry:
1. Media pipeline: multipart upload (5 MB limit), magic-byte validation (jpg, png, webp only), sharp re-encode to WebP at 200, 500, 1000 and 1600 px, EXIF stripped, random UUID file names under UPLOAD_DIR/products/YYYY/MM, mandatory alt text, StorageDriver interface with a local-disk implementation, static serving with immutable cache headers, orphan cleanup job (7-day grace).
2. Categories (tree with cycle protection), brands, tags, and attributes with values (Flavor, Type seeds).
3. Products and variants: name, slug (unique, auto from name, editable), descriptions, food fields, SEO fields, flags, status, images with a primary image and ordering. Variants with SKU, price, salePrice (must be 0 <= salePrice < price), stock, low-stock threshold, structured unit and unitValue (both or neither), generated display label like "500 g" with an admin override, shipping weight, attribute values (one per attribute). Money enters as strings and is converted to integer paisa with parsePaisa from packages/shared; reject floats.
4. Slug change inserts a 301 row in redirects. Price changes write before and after to the audit log.
5. Inventory: stock adjustment with reason, stock_movements log with balanceAfter, optional batches with expiry, low-stock alert job (email through the existing queue).
6. CSV import and export for products and variants with a dry-run mode that reports row errors before writing anything; provide a template CSV.
7. Admin UI (shadcn/ui): lists with search, filter and pagination; product form with variant table, image uploader, SEO tab; category tree editor; inventory screen.
8. A cache.revalidate job that calls the Next.js revalidate endpoint (secret from REVALIDATE_SECRET) after catalog writes; the storefront consumes it in Phase 5.

Tests: slug uniqueness and redirect creation, salePrice rules, unit pair rule, upload rejects a renamed .exe and oversized files, stock movement balance, CSV dry-run catches bad rows, permissions enforced.

Acceptance: lint, typecheck, test, build pass. I can create a product with two variants and images from the admin. Tick Phase 4 boxes, commit, tag phase-4.
```

---

## Phase 5: Storefront catalog and SEO

```text
Read CLAUDE.md and the docs it lists (requirements sections 4 and 14, design.md sections 9 and 10). We are on Phase 5. Use plan mode.

Build the public storefront with Next.js App Router, server components by default, mobile-first Tailwind:
1. Public catalog API: GET /products (filters: category, brand, price range, availability, rating, attributes; sort: price, newest, popularity; pagination), /products/:slug, /categories, /brands, /homepage, /settings/public, /search/suggest (Postgres full-text plus trigram).
2. Pages: home (banners and sections from admin), category (with filters), product detail (variant picker showing unit label, price per unit computed in code, sale price, stock state, gallery, ingredients and nutrition), search results, static pages with placeholder legal text and footer links.
3. ISR with tag-based revalidation (product:<slug>, category:<slug>) wired to the cache.revalidate job from Phase 4.
4. SEO: generateMetadata with template fallbacks from settings, canonical URLs (filters canonicalise to the unfiltered URL, multi-filter combinations noindex), OpenGraph and Twitter cards, JSON-LD (Product with Offer in BDT and aggregateRating only when there are reviews, BreadcrumbList, Organization, WebSite), dynamic sitemap.xml split by type, robots.txt blocking /admin, /cart, /checkout, /account and /api, redirects table served as 301s, custom 404 with search.
5. Performance: next/image with the generated sizes, explicit dimensions, priority only for the LCP image, font optimisation, minimal client JS. Targets: LCP under 2.5 s, CLS under 0.1, INP under 200 ms on a mid-range phone profile.
6. Add the seeded data or a script so I can see about 50 products locally.

Tests: unit tests for price-per-unit, canonical and noindex rules, sitemap output, JSON-LD shape. Run Lighthouse (mobile) on home, category and product pages and put the scores in docs/seo-audit.md with anything below target.

Acceptance: lint, typecheck, test, build pass; structured data validates; sitemap lists active products only. Tick Phase 5 boxes, commit, tag phase-5.
```

---

## Phase 6a: Cart, delivery zones, coupons, quote

```text
Read CLAUDE.md, docs/pricing.md, docs/database.md section 5 and the docs they list. We are on Phase 6, part A. Use plan mode. Money rules are strict: read pricing.md fully first.

Build:
1. Cart: guest cart by sessionToken cookie, customer cart by customerId, merge on login (sum quantities, cap at stock), stock validation, API for add, update, remove, clear.
2. Delivery zones: admin CRUD with isActive toggle, districts list, charge, free-delivery threshold, one default zone; public quote endpoint for a district.
3. Payment methods: admin toggle, COD scope setting (DHAKA_ONLY or NATIONWIDE), public list filtered by district.
4. Coupons: admin CRUD, validation service (active, dates, min order, usage limit, per-customer limit by customer or phone).
5. POST /checkout/quote: loads prices from the database, resolves zone and coupon, calls calculateOrderTotals() from packages/shared and returns the full breakdown. The client sends only variant IDs, quantities, coupon code and district.
6. Web: cart drawer and cart page that display the server quote (never compute totals in the browser), checkout page up to the review step (contact, address with division, district and upazila dropdowns, delivery, payment). No order creation yet.

Tests: quote endpoint rejects any client money field, uses the database price after a price change, inactive zone and inactive variant rejected, COD not offered outside Dhaka when scope is DHAKA_ONLY, coupon rules including limits.

Acceptance: lint, typecheck, test, build pass. Tick the matching boxes, commit.
```

## Phase 6b: Order creation

```text
Read CLAUDE.md, docs/pricing.md, docs/database.md section 5 and docs/api-conventions.md. We are on Phase 6, part B. Use plan mode; this is the most sensitive code in the project.

Implement POST /orders exactly as docs/database.md section 5 describes, in one database transaction:
- Strict createOrderSchema from packages/shared (rejects every client money field).
- Idempotency-Key header (UUID): the same key returns the original order and never decrements stock twice.
- Load variants, require active variant and ACTIVE product, resolve zone and payment method rules, validate coupon, call calculateOrderTotals(), snapshot listPrice, unitPrice, lineTotal and the allocated discountAmount on order_items.
- If expectedGrandTotal is sent and differs from the server total, return 409 PRICE_CHANGED with the new breakdown and create nothing.
- Conditional stock decrement (UPDATE ... WHERE stockQty >= n) plus a stock_movements row with balanceAfter; conditional coupon usedCount increment; per-customer coupon limit checked under an advisory lock.
- Order number ORD-000123 from orderSeq; first order_status_history row; clear the cart after commit; enqueue emails after commit.
- Guests: contact phone mandatory and normalized, email optional. Logged-in customers: customerId set.
- Status machine function changeOrderStatus() per docs/design.md section 5, with stock and coupon restoration on CANCELLED, FAILED and RETURNED.

Tests (all required): worked example from pricing.md end to end; tampered expectedGrandTotal; price changed after cart add; inactive variant, out of stock, inactive zone, COD not allowed; two concurrent orders for the last unit (exactly one succeeds); coupon usageLimit 1 with two concurrent orders; duplicate Idempotency-Key; cancel restores stock and coupon; database CHECKs reject an inconsistent total inserted directly.

Acceptance: lint, typecheck, test, build pass. Show me the concurrency test output. Commit.
```

## Phase 6c: Customer area, tracking, guest linking, emails

```text
Read CLAUDE.md, docs/auth.md and the docs they list. We are on Phase 6, part C. Use plan mode.

Build:
1. Order confirmation page with the server breakdown, plus the "create an account to track this order" prompt prefilled with name, phone and email.
2. Guest tracking by order number plus phone (rate limited, same response for wrong number and wrong phone).
3. Customer area: profile (including adding and verifying a real email for phone-only customers), saved addresses with a default, order history and detail with status timeline, cancel while PENDING or CONFIRMED, reorder, invoice PDF.
4. Confirm the guest-order linking from Phase 3 end to end now that real orders exist: a guest order with email X becomes visible to the customer after X is verified, and an order matching only the phone stays unlinked.
5. Order emails through the queue: placed, confirmed, cancelled (and admin new-order alert). Templates with store name and logo from settings.

Tests: ownership (a customer cannot read another customer's order, returns 404), tracking rate limit, linking by verified email only, cancel rules, invoice totals equal the order totals.

Acceptance: lint, typecheck, test, build pass. Commit.
```

## Phase 6d: Admin order management

```text
Read CLAUDE.md and the docs it lists. We are on Phase 6, part D. Use plan mode.

Build the admin order screens and APIs with requirePermission and audit logs: order list with filters (status, payment status, date, phone, order number) and bulk actions; order detail with timeline, items, address, payment and shipment info, internal notes; status changes through changeOrderStatus() only; edit items or address before HANDED_TO_COURIER by re-running calculateOrderTotals() with stored order-time prices for existing lines (see docs/pricing.md section 7), with stock movements; paid online orders cannot change total (cancel and refund instead); invoice and packing slip PDFs; repeat-order and COD-risk flags (same phone or IP, cancel and return ratio).

Tests: every disallowed status transition is rejected, edit recalculates totals correctly and keeps invariants, permission checks per action.

Acceptance: lint, typecheck, test, build pass. Tick the Phase 6 boxes, commit, tag phase-6.
```

---

## Phase 7: UddoktaPay

```text
Read CLAUDE.md, docs/integrations.md section 2 and docs/pricing.md section 7. We are on Phase 7. Use plan mode.

FIRST read the official UddoktaPay developer documentation (find it from their official site) and tell me the exact endpoints, auth header, request and response fields, verify call and webhook behaviour you found, with links. Do not guess any of it. If the docs are unreachable, stop and ask me.

Then implement behind the PaymentGateway adapter in apps/api/src/integrations/uddoktapay:
- createCharge from the server order total (never client amounts), payments row INITIATED, redirect URL returned.
- Return page that only displays state.
- Webhook plus verify call: confirm with the gateway, compare amount and order reference with our database, then mark SUCCESS and orders.paymentStatus PAID. Idempotent; unique (methodId, gatewayTxnId). A mismatch marks the payment FAILED, flags the order for review and never marks it paid.
- order.expire-unpaid job cancels unpaid online orders after 30 minutes and restores stock; a late successful payment on a cancelled order is flagged for admin review, not silently applied.
- Admin: payment records view, method toggle already exists, manual refund records (sum of refunds cannot exceed the paid amount).
- Raw request and response stored on payments. Credentials only from env.

Tests with the gateway mocked: success, failed, duplicate webhook, amount mismatch, spoofed webhook without valid verification, expiry, late payment on cancelled order.

Acceptance: lint, typecheck, test, build pass; a sandbox payment works end to end if UddoktaPay offers a sandbox (tell me what I need to provide). Commit, tag phase-7.
```

---

## Phase 8: Steadfast

```text
Read CLAUDE.md, docs/integrations.md section 1 and docs/pricing.md section 7. We are on Phase 8. Use plan mode.

FIRST read the official Steadfast courier API documentation and tell me the exact endpoints, auth headers, request and response fields, status values, webhook format and whether the COD amount must be a whole taka, with links. Do not guess. If the docs are unreachable, stop and ask me. Credentials come from env (STEADFAST_*).

Then implement behind the CourierAdapter interface:
- createParcel from an order (COD amount = grandTotal for unpaid COD orders, 0 for prepaid; if whole-taka is required, enforce whole-taka prices in admin input rather than rounding at checkout).
- courier.book queue job with exponential backoff (max 5), never double-books an order, stores the raw response, creates the shipment, moves the order to HANDED_TO_COURIER through changeOrderStatus().
- Single and bulk booking from the admin with per-order results; shipping.steadfastEnabled setting respected.
- Status map file filled from the official docs; unknown statuses stored on the shipment and never change the order.
- Webhook (token verified, fast 200, processed in a job, idempotent) plus a 30-minute polling job for non-terminal shipments; every change writes courier_events and goes through changeOrderStatus() with source COURIER.
- Courier balance and fee in admin; customer tracking timeline and shipped email with tracking link.
- A Steadfast outage must never block order placement.

Tests with the courier mocked: booking success and failure with retry, duplicate booking prevented, webhook auth, status mapping, polling updates, bulk partial failure.

Acceptance: lint, typecheck, test, build pass. Commit, tag phase-8.
```

---

## Phase 9: Reviews, ratings, wishlist

```text
Read CLAUDE.md and the docs it lists (requirements sections 5 and 9, database.md section 5). We are on Phase 9. Use plan mode.

Build:
1. Wishlist: guest wishlist in local storage merged into the account on login; heart button on cards and product page; wishlist page.
2. Reviews: only customers with a DELIVERED order containing the product can review (isVerifiedPurchase, orderItemId); 1 to 5 stars, optional title, text and up to 3 photos through the existing media pipeline; one review per customer per product; PENDING until approved unless review.autoApprove is on; admin moderation (approve, reject, reply, delete); recompute products.ratingAvg and ratingCount after every approve, reject or delete.
3. Storefront: rating summary and review list with pagination, rating filter on listings, aggregateRating added to the Product JSON-LD only when ratingCount > 0.

Tests: eligibility (not purchased, not delivered, duplicate), moderation changes the aggregates correctly, rating CHECK 1..5, photo validation, guest wishlist merge.

Acceptance: lint, typecheck, test, build pass. Commit, tag phase-9.
```

---

## Phase 10: GTM, consent, SEO audit

```text
Read CLAUDE.md and the docs it lists (requirements section 15, design.md section 10, integrations.md section 4). We are on Phase 10. Use plan mode.

Build:
1. GtmProvider using gtm.containerId from public settings; not rendered under /admin; loads only per the consent state.
2. One track() helper that pushes GA4 ecommerce events to window.dataLayer (push { ecommerce: null } first): view_item_list, select_item, view_item, add_to_cart, remove_from_cart, view_cart, begin_checkout, add_shipping_info, add_payment_info, purchase, add_to_wishlist, search, sign_up, login. Item fields: item_id = SKU, item_name, item_brand, item_category, item_variant, price, quantity, currency BDT. No event is pushed from anywhere else.
3. purchase fires once per order on the confirmation page with transaction_id = orderNumber, guarded so a refresh or revisit does not fire it again; the value comes from the server order, not recomputed in the browser.
4. Cookie consent banner with Consent Mode v2 (default denied for analytics_storage, ad_storage, ad_user_data, ad_personalization; updated on accept; choice remembered).
5. docs/tracking-test-plan.md: each event, where it fires, the exact payload, and how I verify it in GTM Preview and GA4 DebugView.
6. SEO audit: Lighthouse and structured-data validation again on key pages, sitemap and robots check, results in docs/seo-audit.md.

Tests: track() payload shapes, purchase dedup, consent default state, admin pages never load GTM.

Acceptance: lint, typecheck, test, build pass. Commit, tag phase-10.
```

---

## Phase 11: Hardening and launch prep

```text
Read CLAUDE.md and docs/design.md section 12. We are on Phase 11. Use plan mode.

1. Go through the security checklist in design.md section 12 item by item against the actual code and write docs/security-review.md: each item, status (done, partial, missing), evidence (file or test), and fixes. Fix the gaps.
2. Specifically review: every route has validation and a permission or ownership check; no client money field anywhere; CSRF and CORS config; rate limits on login, register, forgot-password, tracking, coupon check, order create, review submit and search; no secrets or PII in logs; upload validation; webhook verification; IDOR tests for every customer resource; dependency audit (pnpm audit) and pinned versions.
3. Optional Cloudflare Turnstile on register, login and checkout, behind env flags.
4. Backups: scripts and docs for the Dokploy Postgres backup schedule, the uploads sync (rclone) and a restore procedure; a restore test script I can run on staging.
5. Load test (k6 or autocannon) for browse and checkout paths with the results and any fixes in docs/load-test.md.
6. Error tracking (Sentry) and uptime check endpoints, off unless env is set.
7. docs/uat-checklist.md: a step-by-step list for me to run a full order to delivery on staging (guest COD, customer COD, online payment, coupon, cancel, Steadfast booking, review).

Acceptance: lint, typecheck, test, build pass; security-review.md has no "missing" items left. Commit, tag phase-11.
```

---

## Phase 12: Go live

```text
Read CLAUDE.md and the docs it lists. We are on Phase 12. Use plan mode. You cannot touch the VPS, so produce documents and scripts for me to use.

1. docs/runbook.md: production deploy steps in Dokploy, env var checklist (names only), first-time migrate and the one-off command to create the real Super Admin (not the dev seed), real delivery zones and charges, Cloudflare checklist (DNS, SSL mode, only-Cloudflare origin rule so cf-connecting-ip cannot be spoofed), rollback steps, how to read logs, how to restore a backup.
2. scripts/smoke-test.sh: checks health endpoints, homepage, a product page, sitemap, robots, and creates no real orders.
3. docs/launch-checklist.md: return policy and legal pages entered, store name and logo set in settings, GTM ID set, Mailgun domain SPF/DKIM/DMARC verified, one real COD order and one real online payment smoke test, Steadfast live booking test, monitoring on.
4. docs/first-week.md: what to watch and a fix-list template.

Acceptance: documents are complete and consistent with the repo. Commit, tag phase-12.
```

---

## Handy extra prompts

**Review a finished phase (run in a fresh session)**

```text
Act as a senior reviewer. Read CLAUDE.md and the docs it lists, then review everything changed since the tag phase-<N-1>. Check against docs/pricing.md, docs/auth.md and docs/design.md section 12: money handled only as integer paisa on the server, every route validated and authorised, no secrets or personal data in logs, tests for the business rules. Report findings by severity with file and line, and do not change code until I approve.
```

**Fix failing checks**

```text
Run pnpm lint, pnpm typecheck, pnpm test and pnpm build. Fix every failure at its root cause (no skipped tests, no eslint-disable unless justified in a comment). Report what was wrong.
```

**Update docs after a decision change**

```text
We changed: <describe the decision>. Find every place in CLAUDE.md, docs/ and the code comments that is now wrong, update them in one commit, and list what you changed.
```
