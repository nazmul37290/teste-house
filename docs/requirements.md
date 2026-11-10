# Requirements

Version 1.0. Priority: **M** must have at launch, **S** should have, **C** could have later.

## 1. Scope

Online store for packaged food items. Customers browse, search and order as guests or registered users, pay by Cash on Delivery (COD) or an online gateway (UddoktaPay). Orders ship via Steadfast courier. Staff manage everything from a role-based admin panel.

Out of scope for v1: blog, Bangla language, multi-currency, multi-vendor, mobile app, SMS (OTP and notifications are deferred).

## 2. Decisions already made

| Topic | Decision |
|---|---|
| Language / currency | English, BDT only |
| Payments | COD + UddoktaPay. Each method can be toggled on/off in admin. COD scope switchable in admin: inside Dhaka only, or all of Bangladesh |
| Customers | Accounts and guest checkout both. Phone mandatory; email optional for guests |
| Login | One identifier field accepting email or phone, plus password |
| Guest-order linking | Guest orders attach to an account only after **verified email** match. No SMS OTP for now |
| Admin roles | Created dynamically (manager, salesman, ...). `permissions` table, assigned to roles |
| Reviews / wishlist | Needed. No blog |
| Email | Mailgun by default; provider switchable via env (SMTP via Nodemailer) |
| Courier | Steadfast. Account active. Credentials come from env |
| Delivery charges | Managed in admin, each zone/charge individually toggleable |
| Minimum order | 1 item (no minimum amount rule at launch) |
| Initial catalog | About 50 products, entered via admin |
| Batch / expiry | Optional per variant |
| Store name / logo | Provided later; read from settings |
| Legal pages | Added later; placeholder pages and footer links now |
| Hosting | Existing VPS and domain, Dokploy, Docker. Scale later if needed |

## 3. Catalog

- **CAT-1 (M)** Nested categories, brands, tags.
- **CAT-2 (M)** Product: name, slug, short and long description, brand, category, images, status (draft, active, archived).
- **CAT-3 (M)** Variants (for example 250 g / 500 g / 1 kg, or 500 ml / 1 L): SKU, price, sale price, stock, structured net content (unit + amount), display label, shipping weight.
- **CAT-3a (M)** Variant attributes managed in admin (for example Flavor, Type); each can be marked filterable on the storefront. Price per unit shown on the product page.
- **CAT-4 (S)** Food fields: ingredients, nutrition facts, shelf life, origin; optional batch and expiry per variant.
- **CAT-5 (M)** Per-product SEO fields: meta title, description, canonical, OG image.
- **CAT-6 (S)** Related products (same category by default).
- **CAT-7 (S)** CSV import and export of products.
- **CAT-8 (M)** Featured / new arrival / best seller flags; banners and homepage sections managed from admin.

## 4. Browse and search

- **BRW-1 (M)** Category listing, pagination, sort (price, newest, popularity).
- **BRW-2 (M)** Filters: brand, price range, availability, rating.
- **BRW-3 (M)** Search with suggestions (Postgres full-text + trigram; Meilisearch is a future upgrade path).
- **BRW-4 (S)** Out-of-stock products show a disabled buy button.

## 5. Accounts

- **ACC-1 (M)** Sign up: name, phone (mandatory), password, email optional (recommended).
- **ACC-2 (M)** Login with email or phone + password.
- **ACC-3 (M)** Phone normalized to a single format so matching is reliable.
- **ACC-4 (M)** Forgot/reset password by email.
- **ACC-5 (M)** Profile, multiple saved addresses with a default, change password.
- **ACC-6 (M)** Order history with status timeline, reorder, invoice PDF.
- **ACC-7 (M)** Wishlist; guest wishlist merges into the account on login.
- **ACC-8 (C)** Google login.

### Guest checkout and linking

- Guest supplies name, **phone (mandatory)**, address, optional email. No account is created automatically.
- The order stores `customerId = null` plus normalized `contactPhone` and `contactEmail`.
- When a customer's **email is verified**, orders with the same `contactEmail` are attached to that customer. Phone-only matches stay unlinked (they can still track by order number + phone).
- Order confirmation page offers "Create an account to track this order" with the form prefilled.
- Guest tracking: order number + phone, no login.
- Guest cart persists (cookie + server) and merges into the account cart at login.

## 6. Cart and checkout

- **CHK-1 (M)** Cart drawer: quantity update, remove, live subtotal, stock validation.
- **CHK-2 (M)** Single-page checkout: contact, address, delivery, payment, review.
- **CHK-3 (M)** Delivery charge by zone (for example inside Dhaka, outside Dhaka) with optional free-delivery threshold; managed in admin, each zone toggleable.
- **CHK-4 (M)** Coupons: fixed or percent, min order, max discount, usage limit, per-customer limit, dates.
- **CHK-5 (M)** Price, stock, coupon, delivery charge and totals are calculated on the server at order creation using the rules in `pricing.md`. The client never supplies amounts. If the customer's displayed total differs from the server's, the order is refused with `PRICE_CHANGED` and the new breakdown.
- **CHK-6 (M)** Idempotent order creation (idempotency key).
- **CHK-7 (M)** Stock decremented in the order transaction; restored on cancel or failed payment.
- **CHK-8 (C)** Abandoned cart capture.
- Address form uses division, district, upazila dropdowns; district drives the delivery zone.

## 7. Payments

- **PAY-1 (M)** COD.
- **PAY-2 (M)** UddoktaPay behind a gateway adapter interface.
- **PAY-3 (M)** Admin toggle per payment method; checkout shows only enabled methods.
- **PAY-4 (S)** COD scope setting (Dhaka only vs all Bangladesh); optional min/max order amount per method.
- **PAY-5 (M)** Payment attempts stored separately from orders (gateway IDs, status, raw responses).
- **PAY-6 (M)** Gateway verification is server-side and is the source of truth.
- **PAY-7 (S)** Refunds recorded by admin.

## 8. Orders

Status flow: `PENDING -> CONFIRMED -> PROCESSING -> HANDED_TO_COURIER -> IN_TRANSIT -> DELIVERED`, with `CANCELLED`, `RETURNED`, `FAILED` branches.

- Every status change is written to `OrderStatusHistory` (who, when, note, source).
- Human-friendly order number (`ORD-000123`) separate from the internal ID.
- Admin can edit items or address before dispatch, add internal notes, print invoice and packing slip.
- Customers can cancel while status is `PENDING` or `CONFIRMED`.
- Flag repeat orders from the same phone or IP; track cancel/return ratio per phone for COD risk.

## 9. Reviews and ratings

- Only customers with a **delivered** order for the product can review (verified purchase badge).
- 1 to 5 stars, optional title, text and photos.
- Reviews are `PENDING` until approved (auto-approve setting available).
- Product keeps `ratingAvg` and `ratingCount`; exposed as Product schema for SEO.
- One review per customer per product.

## 10. Notifications

- Transactional emails: order placed, confirmed, shipped (with tracking), delivered, cancelled, email verification, password reset.
- Admin alert emails: new order, low stock.
- Sent through a queue with retries; every send logged in `NotificationLog`.
- `NotificationChannel` interface so SMS can be plugged in later without touching callers.

## 11. Admin panel

| Module | Capabilities |
|---|---|
| Dashboard | Today's orders and revenue, pending count, low stock, top products, sales chart |
| Catalog | Products, variants, categories, brands, images, SEO fields, bulk actions |
| Inventory | Stock levels, adjustments with reason, movement log, low-stock threshold |
| Orders | Filters, detail, status update, edit, notes, invoice, courier booking |
| Customers | List, detail, order history, block/unblock |
| Reviews | Moderate, reply, delete |
| Marketing | Coupons, banners, homepage sections, redirects |
| Payments and shipping | Payment method toggles and COD scope, delivery zones and charges (each toggleable), Steadfast enable/disable |
| Users and roles | Staff accounts, dynamic roles, permission assignment |
| Settings | Store info, logo, contact, GTM ID, SEO defaults |
| Activity log | Audit trail of admin actions |

## 12. Roles and permissions (RBAC)

- Tables: `Role`, `Permission`, `RolePermission`; each `AdminUser` has one role (upgradeable to many later).
- Permission key convention `module.action`: `products.view|create|update|delete`, `orders.view|update_status|book_courier|cancel`, `inventory.adjust`, `customers.view|block`, `coupons.manage`, `reviews.moderate`, `payments.toggle`, `shipping.manage`, `settings.manage`, `roles.manage`, `users.manage`, `reports.view`.
- Keys are declared in `packages/shared` and seeded by migration; roles and assignments are edited in the admin UI.
- **Super Admin** is a system role: always has every permission; cannot be edited or deleted.
- Enforced on the API; the UI only hides controls.

## 13. Steadfast courier

- **STF-1** Credentials read from env.
- **STF-2** "Send to Steadfast" on an order creates the parcel (recipient, phone, address, COD amount, note). COD amount is 0 for prepaid orders.
- **STF-3** Save consignment ID, tracking code, tracking URL; order status becomes `HANDED_TO_COURIER`.
- **STF-4** Bulk send through the queue with a per-order result.
- **STF-5** Status sync by webhook (if enabled) plus scheduled polling as fallback.
- **STF-6** Map courier statuses to internal statuses and write order history.
- **STF-7** Show courier balance and fee for reconciliation.
- **STF-8** Retry with backoff; a Steadfast outage never blocks order placement.
- **STF-9** Customer-facing tracking timeline.

## 14. SEO

- Server-rendered or ISR pages for home, category, product, static pages.
- Clean slugs (`/category/honey`, `/product/pure-honey-500g`); slug changes create automatic 301 redirects.
- Unique title and meta description per page (admin-editable, template fallback), canonical tags, OpenGraph and Twitter cards.
- JSON-LD: `Product` (+ `Offer`, availability, price in BDT, `aggregateRating`), `BreadcrumbList`, `Organization`, `WebSite`, `FAQPage` where used.
- Dynamic `sitemap.xml` and `robots.txt` (block `/admin`, `/cart`, `/checkout`, `/account`).
- Filter/pagination URLs: canonical or `noindex` on filter combinations.
- Performance targets: LCP under 2.5 s, CLS under 0.1, INP under 200 ms. `next/image`, WebP/AVIF, lazy loading.
- Mandatory image alt text, one `h1` per page, breadcrumbs, custom 404 with search.
- Redirect manager in admin.

## 15. GTM and analytics

- GTM container ID is a setting; snippet loads site-wide except `/admin`.
- GA4 ecommerce `dataLayer` events: `view_item_list`, `select_item`, `view_item`, `add_to_cart`, `remove_from_cart`, `view_cart`, `begin_checkout`, `add_shipping_info`, `add_payment_info`, `purchase` (once per order, deduplicated by transaction ID), plus `add_to_wishlist`, `search`, `sign_up`, `login`.
- Item payload: item ID (SKU), name, brand, category, variant, price, quantity, currency `BDT`.
- Cookie consent banner controls analytics and marketing tags (Consent Mode v2).
- Phase 2: server-side GTM / Meta Conversions API.

## 16. Non-functional

- Mobile-first UI; WCAG AA contrast.
- Cached catalog pages respond under 300 ms at the server; API p95 under 500 ms at expected load.
- Zero-downtime deploys through Dokploy; health endpoints; auto-restart.
- Daily DB backup (7 daily + 4 weekly retained) to off-server storage; uploads synced daily; restore tested monthly.
- Structured JSON logs, uptime monitoring, error tracking (Sentry free tier).
- Tests for pricing, coupons, order creation, stock and RBAC logic; CI runs lint, typecheck, tests.

## 17. Open items

- Return and refund policy rules (can be written together with the legal pages).
- Legal page text (privacy, terms).
- Store name and logo.
