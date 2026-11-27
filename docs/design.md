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

- Cart: guests get an httpOnly `shop_cart` cookie (32 random bytes, 30 days from the last change, `SameSite=Lax`, `Secure` in production); `carts.sessionToken` stores only its SHA-256. The first signed-in request that still carries the cookie merges the guest cart into the customer cart (sum quantities, cap at stock and at 50 per line), deletes the guest cart and clears the cookie. Cart prices are for display; the order reads prices again inside its transaction.
- Checkout calls `POST /orders` with an `Idempotency-Key` header. The transaction steps are in `database.md` section 5. The client never sends prices or totals; all money rules are in `pricing.md`. The checkout UI shows the breakdown returned by `POST /checkout/quote` and sends `expectedGrandTotal` only so the server can detect a price change.
- `POST /checkout/quote` runs the same code as the order (lines, zone, coupon, totals, usable payment methods) without writing anything; the checkout page shows only these numbers and re-quotes when the cart, district or coupon changes.
- Zone: the zone that lists the district, else the default zone. A zone that is turned off refuses the order (`DELIVERY_NOT_AVAILABLE`); it does not fall back to the default zone.
- Payment methods: active ones that checkout supports (only `COD` until the UddoktaPay adapter exists in Phase 7). COD with scope `DHAKA_ONLY` is allowed only in the zone with code `inside-dhaka`; optional min/max amounts apply to the grand total.
- Order number: `nextval` of the `orderSeq` sequence inside the transaction, formatted `ORD-000123`. Each order also adds its quantities to `products.soldCount` (best-seller sorting).
- After commit (never failing the order): ordered lines leave the cart, the `order-placed` email goes to a real contact email, `admin-new-order` to `notifications.adminEmail`, low-stock checks run, and the storefront `catalog` tag is refreshed.
- Confirmation page `/order/<number>` shows the order kept in the tab's sessionStorage (nothing else in the URL); otherwise it links to `/track`, where order number + phone are sent in a POST body.

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

**Status changes** go through `changeOrderStatus()` (`order-status.service.ts`): the order row is locked (`SELECT ... FOR UPDATE`), the transition and any caller rule (customers: only from PENDING or CONFIRMED) are checked (`422 INVALID_TRANSITION`), then in the same transaction: `CANCELLED`/`FAILED` restock with `CANCEL_RELEASE` movements and give the coupon use back; `RETURNED` restocks with `RETURN` movements (the coupon stays used); all three lower `products.soldCount`. After commit: `order-confirmed` / `order-cancelled` emails, low-stock checks, storefront refresh.

**Online payment orders:** created as `PENDING` with `paymentStatus = PENDING`. A scheduled job cancels unpaid online orders after 30 minutes and restores stock.

## 6. Payments (UddoktaPay and COD)

See `integrations.md`. Summary:

1. Create order (transaction, `paymentStatus = PENDING`), then create a `payments` row `INITIATED` and call the gateway adapter `createCharge()`; the order response carries `payment.redirectUrl` (or `payment.error`: the order is kept and can be paid with `POST /orders/pay`).
2. Customer pays on the gateway; the browser returns to `/payment/return?invoice_id=...`, which asks `POST /payments/uddoktapay/confirm` and only **displays** the result.
3. Confirmation always comes from our own `verify()` call (return page, webhook, reconcile job or expiry job), applied by `applyVerification()`: amount and order must match, then `payments.status = SUCCESS`, `orders.paymentStatus = PAID` and the order is auto-confirmed (decided in Phase 7). Processing is idempotent. Details in `integrations.md` section 2.

## 7. Steadfast courier

- Booking runs in a queue job (`courier.book`) with exponential backoff; the admin sees the result per order.
- On success: create `shipments` row, set tracking fields, move the order to `HANDED_TO_COURIER`, email the customer with tracking.
- Status sync: webhook endpoint (token-protected) plus a polling job every 30 minutes for non-terminal shipments. Each change writes a `courier_events` row and goes through `changeOrderStatus` with `source = COURIER`.
- COD amount = `grandTotal` when payment is COD and unpaid, else 0.

## 8. Background jobs (BullMQ)

| Queue / job | Purpose |
|---|---|
| `email.send` | Transactional and admin emails, retries, writes `notification_logs` |
| `courier`: `courier.book`, `courier.sync` | Booking per order (5 attempts, exponential backoff; after the last one a staff note on the order, the order is untouched) and status polling every 30 minutes for orders with the courier (job scheduler) |
| `payments.maintenance`: `payment.reconcile`, `order.expire-unpaid` | Every 5 minutes (BullMQ job schedulers): re-verify open online payments; cancel online orders unpaid after 30 minutes (stock and coupon released) |
| (no own queue) | Low-stock alert: checked right after each committed stock change (`checkLowStock()`); the email itself goes through `email.send` (`admin-low-stock`) |
| `cache.revalidate` | After a successful admin write (catalog, inventory, media, banners, homepage sections, settings) the API enqueues the matching tags (`catalog`, `homepage`, `settings`); the worker POSTs them to the web app's `POST /api/revalidate` at `WEB_INTERNAL_URL` with the `x-revalidate-secret` header. Jobs for the same tags within one second collapse into one (job id from the tags), 5 attempts with backoff. Without `REVALIDATE_SECRET` nothing is enqueued and pages refresh on their 5-minute timer |
| `media.cleanup` (on `payments.maintenance`, hourly) | Delete review photos never attached to a review after 24 h (files, then rows). Shop images are never removed automatically |
| `token.cleanup` | Delete expired refresh and verification tokens |

## 9. SEO implementation

- Product, category, home and static pages are server components with `generateMetadata`; metadata comes from the SEO fields with template fallbacks from `Setting`.
- Every storefront fetch is cached by Next with tags (`catalog` on all of them, plus `product:<slug>`, `category:<slug>`, `homepage`; the settings fetch is tagged `settings`) and `revalidate: 300` as a safety net. `POST /api/revalidate` (web) checks the secret in constant time, accepts 1 to 20 tags matching `^[a-z0-9][a-z0-9:_-]{0,99}$` and calls `revalidateTag(tag, { expire: 0 })`, so the next request gets fresh data. Admin writes revalidate `catalog` as a whole: simple, and the catalog is small.
- Slugs are unique and permanent in URLs; a slug change inserts a `redirects` row (301). Next.js middleware or `redirects()` serves them.
- JSON-LD component renders `Product` (with `Offer`, `availability`, `priceCurrency: BDT`, `aggregateRating` when rating count > 0), `BreadcrumbList`, `Organization`, `WebSite`.
- `app/sitemap.ts` (one sitemap: home, categories, products from `GET /sitemap-data`; split into several only if it nears 50,000 URLs; policy pages are listed once written; while unwritten they are `noindex` and left out) and `app/robots.ts` (disallow `/admin`, `/cart`, `/checkout`, `/account`, `/api`).
- Listing pages with filters: canonical to the unfiltered URL; `noindex` on multi-filter combinations; `rel` links for pagination.
- Images via `next/image` with a custom loader that picks our pre-generated WebP width (200/500/1000/1600, the next one up), so Next never re-encodes (`images.imageSizes`/`deviceSizes` in `next.config.ts` are set to exactly those widths, so each `srcset` entry is a distinct file); two web fonts self-hosted at build time by `next/font` (no request to Google from visitors' browsers, `display: swap`), see section 16; explicit width/height, priority only for the LCP image.
- JSON-LD is rendered as a `<script type="application/ld+json">` with `<` escaped, so text from the catalog can never close the script tag.

## 10. GTM and analytics

- **Tools:** public settings `gtm.containerId`, `ga4.measurementId` and `meta.pixelId`, each optional (all empty = no tracking, no banner). `ConsentAndTracking` (`apps/web/src/components/analytics/`) loads `gtm.js` and `gtag/js?id=G-...` after the page is interactive, and the Meta Pixel (`fbevents.js`, base code from Meta's get-started guide, checked 2026-11-22) only once the visitor allowed marketing cookies; nothing under `/admin`. GA4 either directly or as a GTM tag, never both.
- **Consent Mode v2:** an inline script in `<head>` (`trackingBootScript` in `packages/shared/src/analytics.ts`, only when a tool is set; IDs re-checked against their patterns before they go into the script) creates `dataLayer` and `gtag()` and sets the default before anything else, then GA4's `config` (Google requires the consent default before any measurement command) and `window.__shopTracking` (which tools are on): `analytics_storage`, `ad_storage`, `ad_user_data`, `ad_personalization` all `denied`, `wait_for_update: 500`; a saved choice (`localStorage shop:consent`) is re-applied right after. Banner: "Accept all", "Only necessary", "Choose" (analytics / marketing); `gtag('consent','update', ...)` and, for the Pixel, `fbq('consent','grant'|'revoke')` (loaded on the first grant); "Cookie settings" in the footer reopens it. Necessary cookies (cart, sign-in) need no consent.
- **One helper:** `apps/web/src/lib/analytics.ts` (`trackEcommerce`, `track`, `trackPurchaseOnce`) is the only code that sends events: to the dataLayer (GTM), to `gtag('event', ...)` when GA4 is set, and to `fbq('track', ...)` when the Pixel is set and marketing is allowed (`metaPixelEvent` in `packages/shared` maps the names and builds `content_ids`, `contents`, `value`, `currency: BDT`, `num_items`; Purchase carries the order number as `eventID` for later Conversions API deduplication; events without a Meta standard name are not sent); ecommerce events push `{ ecommerce: null }` first. Pure payload builders live in `packages/shared/src/analytics.ts` (tested). Items: `item_id` = SKU, `item_name`, `item_brand`, `item_category`, `item_variant`, `price`, `quantity`, `item_list_name`/`index` in lists; `currency: 'BDT'`. Money strings become numbers with two decimals for GA4 only. No names, phones or emails are ever sent.
- **Page views between pages:** GA4 counts them with enhanced measurement ("page changes based on browser history events", a GA4 stream setting). The Pixel sends `PageView` when it loads and is not sent again by our code on client navigation; Meta's docs do not say whether the Pixel tracks history changes itself, so this is checked in Events Manager > Test events (setup guide).
- **Events and where they fire:** `view_item_list` (every product grid: category name, "Search results", home section title, "Related products"; once per list content), `select_item` (click on a product in a grid), `view_item` (product page, the variant shown first), `add_to_cart` (buy box), `remove_from_cart` (cart remove or minus), `view_cart` (drawer opened, `/cart`), `begin_checkout` (checkout with a loaded cart), `add_shipping_info` (first quote for a district, `shipping_tier` = zone name), `add_payment_info` (Place order, `payment_type` = method code), `purchase`, `add_to_wishlist`, `search` (`search_term`), `sign_up` (`method: phone`), `login` (`method: phone|email`).
- **`purchase`:** values from the server's order view, never the cart; `transaction_id` = order number, `value` = grand total, `shipping`, `discount`, `coupon`. COD: on the confirmation page. Online: on the payment return page only after the server verified the payment. Once per order per browser (`localStorage shop:purchased:<orderNumber>`); a reload sends nothing. Purchase items carry SKU, name, variant, price, quantity (brand and category are not in the order snapshot).
- Phase 2: server-side GTM and Meta Conversions API with event deduplication.

## 11. File handling

- Volume mounted at `/data/uploads`; configured by `UPLOAD_DIR`.
- Flow: admin uploads (multipart, memory storage limited to 5 MB, one file) -> validate magic bytes ourselves (JPEG, PNG, WebP only; the decoder must agree with the bytes; SVG, GIF, HEIC rejected) -> sharp applies the EXIF orientation, strips all metadata (EXIF, GPS, ICC), refuses decompression bombs (40 MP) and images under 100 px, and writes WebP (quality 82) at 200, 500, 1000 and 1600 px wide -> files `products/YYYY/MM/<uuid>-<width>.webp` (the uploaded name is never used) -> insert `media` row with alt text (required, 3 to 200 characters). Images are never upscaled: a 1200 px upload still gets a `-1600` file, at 1200 px, so every width always exists and `mediaUrl(base, path, width)` (`packages/shared`) never has to check. AVIF is not generated for now. If the database insert fails, the written files are deleted.
- `media` stores `path` (the base, without width), `mime` (`image/webp`), the original upload size, the oriented width and height, and the alt text. Deleting is refused (`409 MEDIA_IN_USE`) while a product image, OG image, category, brand, banner or review photo uses it; the row goes first, then the files.
- Public files are served by the API's static handler at `/media/*` with `Cache-Control: public, max-age=31536000, immutable` (Cloudflare caches them) and `Cross-Origin-Resource-Policy: cross-origin`, because the web origin shows them (Helmet's default `same-origin` would block them). Private files (invoices, packing slips) are generated on demand behind auth with `pdfkit` (built-in Helvetica, so money is written `Tk 1,680`; names outside Latin-1 do not render yet) from the stored order snapshot, never from current prices.
- Storage is behind a `StorageDriver` interface (`put`, `delete`, `url`) so it can move to S3/R2 later.
- Orphan cleanup job removes media with no references after 7 days.

## 12. Security checklist

Reviewed item by item in Phase 11: `docs/security-review.md` (status, evidence, server actions).


- HTTPS only, HSTS, Helmet headers, strict CORS, Cloudflare WAF and bot protection.
- Zod validation on all inputs, reject unknown fields; Prisma only (no string-built SQL).
- Auth via Better Auth (`auth.md`); real client IP from the one header named by `CLIENT_IP_HEADER` (Cloudflare `cf-connecting-ip`, or `x-shop-client-ip` set by Caddy), and the app is reachable only through that proxy so the header cannot be spoofed (`auth.md` section 6).
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
| Core | `NODE_ENV`, `APP_URL`, `API_URL`, `COOKIE_DOMAIN`, `CORS_ORIGINS`, `CLIENT_IP_HEADER` (production; default `cf-connecting-ip`) |
| Database | `DATABASE_URL`, `REDIS_URL` |
| Auth | `BETTER_AUTH_SECRET` (signs cookies, encrypts 2FA secrets; at least 32 chars), `BETTER_AUTH_URL` (public web origin) |
| Mail | `MAIL_PROVIDER` (`mailgun` or `smtp`), `MAIL_FROM`, `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_BASE_URL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` |
| Steadfast | `STEADFAST_BASE_URL`, `STEADFAST_API_KEY`, `STEADFAST_SECRET_KEY`, `STEADFAST_WEBHOOK_TOKEN` |
| UddoktaPay | `UDDOKTAPAY_BASE_URL` (the merchant's installation), `UDDOKTAPAY_API_KEY` (also authenticates the webhook) |
| Files | `UPLOAD_DIR`, `PUBLIC_MEDIA_URL` |
| Frontend | `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_API_URL`, `API_INTERNAL_URL` (target of the `/api/v1/*` rewrite and server-side fetches), `REVALIDATE_SECRET` (web and api/worker, same value, at least 16 chars), `WEB_INTERNAL_URL` (api/worker: internal address of the web app for revalidation) |
| Error tracking (optional) | api/worker: `SENTRY_DSN`, `SENTRY_ENVIRONMENT`, `SENTRY_RELEASE`; web runtime: `SENTRY_DSN`; web build arguments: `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` (see `operations.md` section 3) |
| Optional (later) | `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` |

Keep `.env.example` in sync with this table.

## 15. Local development

`docker compose -f docker/compose.dev.yml up` starts Postgres and Redis (and optionally Mailpit for email testing). `pnpm dev` runs web and api with hot reload. Seed creates the Super Admin from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` (dev only).

## 16. Design system (storefront and admin)

Brand: **Teste House** (name and logo come from the `store.name` and `store.logo` settings; the logo PNGs live in `apps/web/public/brand/`, app icons in `apps/web/src/app/`). Tokens are Tailwind v4 `@theme` variables in `apps/web/src/app/globals.css`; components use the token names, never raw hex.

| Token | Hex | Use |
|---|---|---|
| `petrol` | #003442 | Brand ink from the logo: primary buttons, headings, header band, footer |
| `petrol-soft` / `petrol-tint` | #0F4C5C / #E3EEF0 | Hover on petrol / selected and info backgrounds |
| `haldi` / `haldi-soft` | #E8A317 / #FBEFD2 | The one warm accent (sale tag, cart count, star fill, hero stroke). Always with petrol text, never yellow text on a light background |
| `rice` / `surface` | #F6F7F4 / #FFFFFF | Page background / cards, inputs, drawers |
| `line` | #DCE3E4 | Borders and dividers |
| `ink` / `ink-muted` | #14262B / #4E6066 | Text / secondary text (both AA on rice and white) |
| `success`, `warning`, `danger` (+ `-soft`) | #1E7A4C, #A15C07, #B42318 | States |

Tailwind's `neutral-*` scale is remapped to petrol-tinted greys, so older classes stay on brand.

- **Type:** headings in Young Serif (one weight, `font-display`, H1/H2 and the hero only), body and UI in Hind Siliguri (400 to 700; it also covers Bengali for a later Bangla version). Sentence case everywhere, no all-caps labels.
- **Shape:** radius by hierarchy: 8 px controls (`rounded-control`), 12 px cards (`rounded-card`), 20 px hero, banners and gallery (`rounded-feature`). Cards are flat with a border; the single shadow (`shadow-raised`) is only for raised layers: sticky header after scroll, drawers, popovers, toasts.
- **Motion:** only in answer to the shopper: cart drawer and filter sheet slide in, toasts, accordion, carousel swipe. Nothing animates on page load; `prefers-reduced-motion` turns transitions off.
- **Building blocks:** `components/ui.tsx` (Button and `buttonClass`, inputs, Field, Alert, Card, Badge, PageHeader, AuthCard), `components/toast.tsx` (`toast()` from any client code, one `<Toaster />` in the root layout, no dependency), `components/carousel.tsx` (native scroll snap, arrows on wider screens, no autoplay), `components/shop/icons.tsx` (line icons), `components/auth-shell.tsx` (logo above sign-in cards).
- **Home hero:** a slider of the banners placed at "Home hero" (Banners page): fixed 8:3 frame (1:1 on phones when a phone image is set), swipe, arrows, dots, autoplay every 6 s that stops on hover or focus, when the tab is hidden, with the pause button, and never runs with reduced motion. With no active hero banner the text hero (petrol band, steam pattern) shows instead.
- **Highlights strip:** up to four `{ icon, title, text }` from the `home.highlights` setting (Homepage page in the admin); when empty it is built automatically from store facts.
- **Admin dashboard:** period filter (7 / 30 / 90 days) above everything it scopes; needs-attention counts linking to the filtered lists; stat tiles (sales as the one hero figure, proportional numerals, change against the previous period with an arrow and words); sales per day as a single-series petrol line with a 10% wash, hairline grid, one direct label (the best day), crosshair tooltip on hover and arrow keys, and a table view; ranked thin bars (one hue, every value printed) for top products, statuses, payment methods and districts; recent orders and low stock lists. Hand-drawn SVG, no chart library.
- **Content rule:** the storefront states only facts the system enforces. The home page facts and FAQ come from `GET /store-facts` (payment methods and delivery zones); testimonials are real approved reviews from `GET /reviews/recent` and the section hides when there are none. No invented numbers, no stock photos, no returns answer until the policy exists.
- **Product cards:** price and stock state first; one-tap add (with a toast) when the product has a single in-stock variant (`quickAddVariantId`), otherwise an Options link.
- **Phones first:** search under the logo, category shelf that scrolls, filter sheet, swipeable gallery, bottom add-to-cart bar on product pages, admin menu folded into a top bar. Verified with Playwright at 1440x900, 768x1024 and 390x844 (no console errors, no broken images, no horizontal scroll).

## 17. Shop status (live / maintenance) and admin navigation

- **Setting:** `store.mode` (`live` | `maintenance`) and `store.maintenanceMessage`, public. Switched with the drop-down at the top of the admin sidebar (`components/admin/store-mode-switch.tsx`, `PUT /admin/settings`, `settings.manage`, audited) or in Settings; the sidebar reads the status uncached.
- **Storefront:** `apps/web/src/proxy.ts` runs on every page (not on `_next`, `/api` or files). In maintenance it rewrites shop pages to `/maintenance` with **HTTP 503**, `Retry-After: 600` and `Cache-Control: no-store`, so search engines treat it as temporary and keep the pages indexed. The status is read from `GET /settings/public` at most every 10 seconds per server process; if the API cannot be reached the last known status stays (so an API restart never closes the shop). `/payment/*` and `/order/*` stay open so online payments and confirmations in progress finish. Signed-in admins (confirmed with `GET /admin/auth/me`, remembered for a minute) see the shop with a notice in the shop layout. `/maintenance` itself redirects shoppers to `/` while live; admins may preview it any time.
- **API:** the proxy is not a security boundary. `POST /orders` and `POST /orders/pay` call `assertStoreLive()` and answer `503 MAINTENANCE`; tracking, webhooks, payment verification, jobs and the admin keep working.
- **Admin navigation:** `ADMIN_NAV_GROUPS` in `apps/web/src/lib/admin-nav.ts`: Dashboard, then folding groups Sales (orders, payments, coupons, reviews), Catalog, Storefront (banners, homepage, policy pages), Store setup (delivery zones, payment methods, settings), Team (staff, roles); My security at the bottom. Links the admin cannot open are hidden and empty groups dropped (cosmetic only; the API checks). The group holding the current page is open; other open groups are remembered in `localStorage` (`shop:admin-nav-open`).
