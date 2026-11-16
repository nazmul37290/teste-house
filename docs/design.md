# Design

How the system is built. Requirements are in `requirements.md`; tables are in `database.md`.

## 1. Architecture

```
Browser -> Cloudflare (CDN, WAF) -> Traefik (Dokploy, TLS)
                                      |-> web  (Next.js, port 3000)  shop.<domain>
                                      |-> api  (Express, port 4000)  api.<domain>
                                             |-> postgres (internal only)
                                             |-> redis    (internal only)
                                             |-> /data/uploads (persistent volume)
                                             |-> BullMQ worker (same image, different command)
```

- `web` renders the storefront (SSR/ISR) and the admin UI (`/admin`, client-heavy, behind login).
- `api` is the only thing that touches the database. The browser calls `/api/v1/*` on the web origin, and Next.js rewrites it to `api` (same-origin, first-party auth cookies; see `auth.md`). Server-side fetches use the internal URL (`API_INTERNAL_URL`).
- The worker runs queue jobs: emails, Steadfast booking and sync, payment expiry, low-stock alerts, sitemap/cache revalidation.

## 2. Repository layout (monorepo, pnpm workspaces)

```
ecommerce/
  CLAUDE.md
  apps/
    web/            Next.js (App Router) storefront + /admin
    api/            Express API (+ worker entry)
  packages/
    shared/         Zod schemas, types, permission keys, constants, normalizePhone()
    config/         eslint, tsconfig, prettier presets
  prisma/           schema.prisma, migrations, seed.ts
  docker/           Dockerfile.web, Dockerfile.api, compose.dev.yml, compose.prod.yml
  docs/
  prisma.config.ts
  pnpm-workspace.yaml
  .env.example
```

API layout: `routes -> controllers -> services -> repositories`. Controllers parse and respond; services hold business rules and transactions; repositories wrap Prisma. Shared Zod schemas validate both the web forms and the API.

## 3. Authentication and sessions

Full design in **`auth.md`**. Summary:

- **Better Auth**, two instances: `customerAuth` (`/api/v1/auth`, cookie prefix `shop_c`) and `adminAuth` (`/api/v1/admin/auth`, prefix `shop_a`), with separate tables (`customer_*` and `admin_*`).
- Database-backed sessions (customers 30 days, admins 7 days, refreshed daily) in `httpOnly`, `Secure` (production), `SameSite=Lax` cookies, mirrored in Redis secondary storage. Sessions are revocable.
- Passwords: Better Auth default (scrypt), stored in `*_accounts.password`.
- Login field accepts email or phone through our own `/auth/login` endpoint: detect by format, normalize, look up, then call Better Auth's email sign-in. Responses never reveal whether the identifier exists.
- Lockout: Better Auth rate limits (Redis) plus our own progressive delay per identifier and IP on `/login` and `/register`.
- Email verification and password reset use Better Auth verification records (expiry 24 h and 1 h); emails go through the `email.send` queue.
- Admin: sign-up disabled; optional TOTP 2FA (`twoFactor` plugin), strongly recommended for Super Admin.
- Same origin: Next.js rewrites `/api/v1/*` to the API, so auth cookies are first-party.
- CSRF: Better Auth checks `Origin` against trusted origins; our state-changing routes also require a custom header (`X-Requested-With`) plus strict CORS to the known origins.

## 4. Authorization (dynamic RBAC)

- Permission keys are constants in `packages/shared`; the seed upserts them into `permissions`.
- RBAC is ours (Better Auth's admin and organization plugins are not used). The admin session comes from `adminAuth.api.getSession()`.
- Middleware `requirePermission('orders.update_status')` loads the admin's role permissions (cached in Redis, invalidated when a role changes) and rejects with 403.
- Super Admin (`roles.isSystem`) bypasses checks in code.
- `requirePermission('a', 'b')` with several keys passes when the admin holds any one of them (used where a screen needs a read-only list, e.g. `GET /admin/roles` for `users.manage`).
- No privilege escalation: an admin who is not a Super Admin can only grant permissions they hold themselves, can only assign roles whose permissions they hold, and cannot assign the Super Admin role or change a Super Admin account. Nobody can deactivate themselves, change their own role, or reset their own password through the staff endpoints (they use Better Auth's `/change-password`, which asks for the current one).
- At least one active Super Admin always remains. The check locks the active Super Admin rows (`FOR UPDATE`), so two Super Admins removing each other at the same moment cannot both succeed.
- Staff are never hard-deleted: every reference to `admin_users` is `SET NULL`, so deleting would erase who did what in the audit log, order notes and stock movements. Deactivating revokes all their sessions at once; resetting a password does too.
- Every admin write calls `recordAudit()` (`apps/api/src/services/audit.service.ts`) in the same transaction; fields that look like secrets (password, token, secret, hash, API key, backup codes) are stored as `[redacted]`.
- Customer routes enforce ownership (`order.customerId === req.user.id`); guest tracking requires order number plus phone.
- Admin UI reads the permission list from `/admin/auth/me` to hide menu items; the API is still the gate.

## 5. Checkout and orders

- Cart: guests get a `sessionToken` cookie; on login the guest cart merges into the customer cart (sum quantities, cap at stock).
- Checkout calls `POST /orders` with an `Idempotency-Key` header. The transaction steps are in `database.md` section 5. The client never sends prices or totals; all money rules are in `pricing.md`. The checkout UI shows the breakdown returned by `POST /checkout/quote` and sends `expectedGrandTotal` only so the server can detect a price change.
- Delivery quote: `GET /delivery-zones/quote?district=...&subtotal=...` returns the charge and zone for display; the server recomputes at order time.
- Payment methods list (`GET /payment-methods`) returns only active methods, filtered by COD scope for the chosen district.

**Order state machine** (enforced in one service function `changeOrderStatus`; every call writes `order_status_history`):

| From | Allowed next |
|---|---|
| PENDING | CONFIRMED, CANCELLED |
| CONFIRMED | PROCESSING, CANCELLED |
| PROCESSING | HANDED_TO_COURIER, CANCELLED |
| HANDED_TO_COURIER | IN_TRANSIT, DELIVERED, RETURNED, FAILED |
| IN_TRANSIT | DELIVERED, RETURNED, FAILED |
| DELIVERED | RETURNED |
| CANCELLED, FAILED, RETURNED | none (terminal) |

Side effects: `CANCELLED`/`FAILED`/`RETURNED` restore stock; `DELIVERED` sets `deliveredAt` and marks COD orders `PAID`; `CONFIRMED` sets `confirmedAt` and sends the confirmation email.

**Online payment orders:** created as `PENDING` with `paymentStatus = PENDING`. A scheduled job cancels unpaid online orders after 30 minutes and restores stock.

## 6. Payments (UddoktaPay and COD)

See `integrations.md`. Summary:

1. Create order (transaction), then create a `payments` row `INITIATED` and call the gateway adapter `createCharge()`; return the redirect URL.
2. Customer pays on the gateway; browser returns to a result page that only **displays** state.
3. The webhook (and a fallback verify call) confirms with the gateway, checks amount and order match, and sets `payments.status = SUCCESS`, `orders.paymentStatus = PAID`, then auto-confirms or leaves for manual confirmation per setting. Processing is idempotent.

## 7. Steadfast courier

- Booking runs in a queue job (`courier.book`) with exponential backoff; the admin sees the result per order.
- On success: create `shipments` row, set tracking fields, move the order to `HANDED_TO_COURIER`, email the customer with tracking.
- Status sync: webhook endpoint (token-protected) plus a polling job every 30 minutes for non-terminal shipments. Each change writes a `courier_events` row and goes through `changeOrderStatus` with `source = COURIER`.
- COD amount = `grandTotal` when payment is COD and unpaid, else 0.

## 8. Background jobs (BullMQ)

| Queue / job | Purpose |
|---|---|
| `email.send` | Transactional and admin emails, retries, writes `notification_logs` |
| `courier.book`, `courier.sync` | Steadfast booking and status polling |
| `order.expire-unpaid` | Cancel stale online-payment orders |
| (no own queue) | Low-stock alert: checked right after each committed stock change (`checkLowStock()`); the email itself goes through `email.send` (`admin-low-stock`) |
| `cache.revalidate` | After a successful admin write (catalog, inventory, media, banners, homepage sections, settings) the API enqueues the matching tags (`catalog`, `homepage`, `settings`); the worker POSTs them to the web app's `POST /api/revalidate` at `WEB_INTERNAL_URL` with the `x-revalidate-secret` header. Jobs for the same tags within one second collapse into one (job id from the tags), 5 attempts with backoff. Without `REVALIDATE_SECRET` nothing is enqueued and pages refresh on their 5-minute timer |
| `media.cleanup` | Remove orphaned files after a grace period |
| `token.cleanup` | Delete expired refresh and verification tokens |

## 9. SEO implementation

- Product, category, home and static pages are server components with `generateMetadata`; metadata comes from the SEO fields with template fallbacks from `Setting`.
- Every storefront fetch is cached by Next with tags (`catalog` on all of them, plus `product:<slug>`, `category:<slug>`, `homepage`; the settings fetch is tagged `settings`) and `revalidate: 300` as a safety net. `POST /api/revalidate` (web) checks the secret in constant time, accepts 1 to 20 tags matching `^[a-z0-9][a-z0-9:_-]{0,99}$` and calls `revalidateTag(tag, { expire: 0 })`, so the next request gets fresh data. Admin writes revalidate `catalog` as a whole: simple, and the catalog is small.
- Slugs are unique and permanent in URLs; a slug change inserts a `redirects` row (301). Next.js middleware or `redirects()` serves them.
- JSON-LD component renders `Product` (with `Offer`, `availability`, `priceCurrency: BDT`, `aggregateRating` when rating count > 0), `BreadcrumbList`, `Organization`, `WebSite`.
- `app/sitemap.ts` (one sitemap: home, categories, products from `GET /sitemap-data`; split into several only if it nears 50,000 URLs; legal placeholder pages are left out while they are `noindex`) and `app/robots.ts` (disallow `/admin`, `/cart`, `/checkout`, `/account`, `/api`).
- Listing pages with filters: canonical to the unfiltered URL; `noindex` on multi-filter combinations; `rel` links for pagination.
- Images via `next/image` with a custom loader that picks our pre-generated WebP width (200/500/1000/1600, the next one up), so Next never re-encodes (`images.imageSizes`/`deviceSizes` in `next.config.ts` are set to exactly those widths, so each `srcset` entry is a distinct file); system font stack, no web font download; explicit width/height, priority only for the LCP image.
- JSON-LD is rendered as a `<script type="application/ld+json">` with `<` escaped, so text from the catalog can never close the script tag.

## 10. GTM and analytics

- `GtmProvider` injects the container snippet using `gtm.containerId` (public setting); not rendered under `/admin`.
- One `track()` helper pushes GA4 ecommerce events to `window.dataLayer` (`ecommerce: null` before each push). Item objects use `item_id = sku`, `item_name`, `item_brand`, `item_category`, `item_variant`, `price`, `quantity`, `currency = 'BDT'`.
- `purchase` fires once on the order confirmation page, guarded by a `localStorage` flag per order number and sent with `transaction_id = orderNumber`.
- Consent banner (Consent Mode v2): default denied for `analytics_storage` and `ad_storage`, updated on accept.
- Phase 2: server-side GTM and Meta Conversions API with event deduplication.

## 11. File handling

- Volume mounted at `/data/uploads`; configured by `UPLOAD_DIR`.
- Flow: admin uploads (multipart, memory storage limited to 5 MB, one file) -> validate magic bytes ourselves (JPEG, PNG, WebP only; the decoder must agree with the bytes; SVG, GIF, HEIC rejected) -> sharp applies the EXIF orientation, strips all metadata (EXIF, GPS, ICC), refuses decompression bombs (40 MP) and images under 100 px, and writes WebP (quality 82) at 200, 500, 1000 and 1600 px wide -> files `products/YYYY/MM/<uuid>-<width>.webp` (the uploaded name is never used) -> insert `media` row with alt text (required, 3 to 200 characters). Images are never upscaled: a 1200 px upload still gets a `-1600` file, at 1200 px, so every width always exists and `mediaUrl(base, path, width)` (`packages/shared`) never has to check. AVIF is not generated for now. If the database insert fails, the written files are deleted.
- `media` stores `path` (the base, without width), `mime` (`image/webp`), the original upload size, the oriented width and height, and the alt text. Deleting is refused (`409 MEDIA_IN_USE`) while a product image, OG image, category, brand, banner or review photo uses it; the row goes first, then the files.
- Public files are served by the API's static handler at `/media/*` with `Cache-Control: public, max-age=31536000, immutable` (Cloudflare caches them) and `Cross-Origin-Resource-Policy: cross-origin`, because the web origin shows them (Helmet's default `same-origin` would block them). Private files (invoices) are generated on demand behind auth.
- Storage is behind a `StorageDriver` interface (`put`, `delete`, `url`) so it can move to S3/R2 later.
- Orphan cleanup job removes media with no references after 7 days.

## 12. Security checklist

- HTTPS only, HSTS, Helmet headers, strict CORS, Cloudflare WAF and bot protection.
- Zod validation on all inputs, reject unknown fields; Prisma only (no string-built SQL).
- Auth via Better Auth (`auth.md`); real client IP from `cf-connecting-ip` only, and the origin accepts traffic only from Cloudflare so that header cannot be spoofed.
- Redis-backed rate limits: login, register, forgot-password, verify-email resend, coupon check, order create, review submit, search suggest.
- Server-side pricing, stock and coupon logic; idempotency on orders; signed or token-verified webhooks.
- No secrets in Git; credentials only in environment variables; separate values per environment.
- Postgres and Redis not exposed publicly; strong generated passwords.
- Containers run as non-root, minimal base images, health checks.
- Host: UFW (80, 443, SSH only), key-only SSH, fail2ban, automatic security updates.
- Audit log for admin writes (who, what, before and after).
- Optional Cloudflare Turnstile on register, login and checkout.
- `pnpm audit` and Dependabot; pin versions.

## 13. Deployment on Dokploy

- Projects: `production` (and optional `staging`).
- Services: `postgres` and `redis` as Dokploy database services (internal network); `api`, `worker`, `web` as applications from the same Git repo, each with its own Dockerfile path and build context at the repo root.
- Domains: `<domain>` (or `shop.`) to `web`, `api.<domain>` to `api`. Traefik handles TLS.
- Auto-deploy on push to `main` (webhook); staging from `develop`.
- Release step for `api`: `prisma migrate deploy` before starting the server.
- Backups: Dokploy scheduled Postgres backups to an S3-compatible destination (Backblaze B2 or Cloudflare R2): daily, retain 7 daily and 4 weekly. Uploads volume synced daily (rclone or a Dokploy backup job). Test a restore monthly.
- Monitoring: uptime checks on `/health` of web and api; Sentry for errors.

## 14. Environment variables (names only; values live in Dokploy)

| Group | Variables |
|---|---|
| Core | `NODE_ENV`, `APP_URL`, `API_URL`, `COOKIE_DOMAIN`, `CORS_ORIGINS` |
| Database | `DATABASE_URL`, `REDIS_URL` |
| Auth | `BETTER_AUTH_SECRET` (signs cookies, encrypts 2FA secrets; at least 32 chars), `BETTER_AUTH_URL` (public web origin) |
| Mail | `MAIL_PROVIDER` (`mailgun` or `smtp`), `MAIL_FROM`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Steadfast | `STEADFAST_BASE_URL`, `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, `STEADFAST_WEBHOOK_TOKEN` |
| UddoktaPay | `UDDOKTAPAY_BASE_URL`, `UDDOKTAPAY_API_KEY`, `UDDOKTAPAY_WEBHOOK_SECRET` |
| Files | `UPLOAD_DIR`, `PUBLIC_MEDIA_URL` |
| Frontend | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` (target of the `/api/v1/*` rewrite and server-side fetches), `REVALIDATE_SECRET` (web and api/worker, same value, at least 16 chars), `WEB_INTERNAL_URL` (api/worker: internal address of the web app for revalidation) |
| Optional | `SENTRY_DSN`, `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |

Keep `.env.example` in sync with this table.

## 15. Local development

`docker compose -f docker/compose.dev.yml up` starts Postgres and Redis (and optionally Mailpit for email testing). `pnpm dev` runs web and api with hot reload. Seed creates the Super Admin from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (dev only).
