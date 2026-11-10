# API conventions

Base path: `/api/v1`. JSON only. Validation with the Zod schemas in `packages/shared`.

## 1. Response format

Success:

```json
{ "data": { }, "meta": { "page": 1, "pageSize": 20, "total": 134 } }
```

`meta` appears only on lists. Errors:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Human readable", "details": [{ "path": "phone", "message": "Invalid phone" }] } }
```

| HTTP | Code | When |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body, query or param failed Zod validation |
| 401 | `UNAUTHENTICATED` | Missing or expired token |
| 403 | `FORBIDDEN` | Missing permission or not the owner |
| 404 | `NOT_FOUND` | Resource missing (also for other people's resources) |
| 409 | `CONFLICT` | Duplicate phone/email/slug/SKU, stale state, idempotency mismatch |
| 409 | `PRICE_CHANGED` | Client's `expectedGrandTotal` differs from the server's calculation; response carries the new breakdown and no order is created |
| 422 | `BUSINESS_RULE` | Out of stock, coupon invalid, COD not available, zone inactive |
| 429 | `RATE_LIMITED` | Rate limit hit (`Retry-After` header) |
| 500 | `INTERNAL_ERROR` | Unexpected; no internals in the message |

Business-rule errors carry a stable machine code in `error.details[0].reason` (for example `OUT_OF_STOCK`, `COUPON_EXPIRED`, `COD_NOT_AVAILABLE`).

## 2. Conventions

- Lists: `?page=1&pageSize=20` (max 100), `?sort=-createdAt` (prefix `-` for descending), filters as plain params (`?status=PENDING&from=2026-11-01`).
- IDs are UUIDs. Public catalog uses slugs.
- Money in JSON as strings with two decimals (`"1250.00"`); never floats.
- Timestamps in ISO 8601 UTC.
- `POST /orders` requires the `Idempotency-Key` header (UUID). Same key returns the original order.
- `POST /orders` body (strict schema, unknown or money fields are rejected): `items[{variantId, quantity}]` (or the server cart), `couponCode?`, `address` or `addressId`, `contact{name, phone, email?}` for guests, `paymentMethodCode`, `customerNote?`, `expectedGrandTotal?` (comparison only). The response returns the full server-calculated breakdown (lines, subtotal, discount, delivery, grand total). See `pricing.md`.
- Auth is Better Auth (`auth.md`). Cookies: `shop_c.session_token`, `shop_c.session_data` (customer); `shop_a.session_token`, `shop_a.session_data`, `shop_a.two_factor` (admin). The browser calls the API through the web origin (`/api/v1/*` rewrite), so cookies are first-party. State-changing calls need the CSRF header (Better Auth routes are protected by its `Origin` check).
- Permission is declared per admin route in the router file, next to the handler.
- Every admin write calls the audit logger.
- Webhooks live under `/webhooks/*`, are excluded from CSRF, and are authenticated by token or by calling the provider's verify API.
- Health: `GET /health` (liveness), `GET /health/ready` (DB + Redis).

## 3. Routes

### Public

| Method | Path | Purpose |
|---|---|---|
| GET | `/products` | List with filters (category, brand, price, availability, rating), sort, pagination |
| GET | `/products/:slug` | Product detail with variants, images, rating summary |
| GET | `/products/:slug/reviews` | Approved reviews |
| GET | `/categories`, `/categories/:slug` | Category tree and detail |
| GET | `/brands` | Brands |
| GET | `/search/suggest?q=` | Instant suggestions |
| GET | `/homepage` | Banners and sections |
| GET | `/settings/public` | Store name, logo, contact, GTM ID |
| GET | `/delivery-zones/quote` | Zone and charge for a district (display only; the order recalculates) |
| POST | `/checkout/quote` | Full server-side price breakdown for the current cart, coupon and district. The web app displays this instead of computing totals itself |
| GET | `/payment-methods` | Active methods, filtered by COD scope for the district |
| GET/POST/PATCH/DELETE | `/cart`, `/cart/items`, `/cart/items/:id` | Guest or customer cart |
| POST | `/coupons/validate` | Preview a discount |
| POST | `/orders` | Place order (guest or logged in) |
| GET | `/orders/track?orderNumber=&phone=` | Guest tracking |
| GET | `/sitemap-data` | Slugs and dates for sitemaps (internal use by web) |

### Customer auth and account

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register` | Ours. Name, phone, password, optional email (placeholder email for phone-only) |
| POST | `/auth/login` | Ours. `identifier` (email or phone) + password, then Better Auth email sign-in |
| GET | `/auth/get-session` | Better Auth. Current session |
| POST | `/auth/sign-out` | Better Auth. Revoke the session |
| GET | `/auth/verify-email?token=` | Better Auth. Email verification (the after-verification hook links guest orders) |
| POST | `/auth/send-verification-email` | Better Auth. Resend verification |
| POST | `/auth/request-password-reset`, `/auth/reset-password` | Better Auth. By email |
| POST | `/auth/change-email` | Better Auth. Add or change email (verification to the new address) |

Better Auth paths above are its standard endpoints under `basePath`. Confirm the exact names against the pinned version in Phase 3. Our `/auth/login` and `/auth/register` are mounted before Better Auth's catch-all.
| GET/PATCH | `/me` | Profile |
| POST | `/me/change-password` | |
| GET/POST/PATCH/DELETE | `/me/addresses`, `/me/addresses/:id` | Saved addresses |
| GET | `/me/orders`, `/me/orders/:id` | History and detail with timeline |
| POST | `/me/orders/:id/cancel` | Only PENDING or CONFIRMED |
| GET | `/me/orders/:id/invoice` | PDF |
| GET/POST/DELETE | `/me/wishlist`, `/me/wishlist/:productId` | Wishlist |
| POST | `/me/reviews` | Create review (delivered purchase required) |

### Webhooks

| Method | Path |
|---|---|
| POST | `/webhooks/uddoktapay` |
| POST | `/webhooks/steadfast` |

### Admin (`/admin/...`, separate auth; permission in brackets)

| Area | Routes |
|---|---|
| Auth | Better Auth (`adminAuth`, sign-up disabled): `POST /admin/auth/sign-in/email`, `POST /admin/auth/sign-out`, `GET /admin/auth/get-session`, 2FA `POST /admin/auth/two-factor/enable|verify-totp|verify-backup-code|disable`. Ours: `GET /admin/auth/me` (profile, role, permission keys) |
| Dashboard | `GET /admin/dashboard` [`reports.view`] |
| Products | CRUD `/admin/products`, nested `/variants`, `/images` [`products.*`]; bulk status; CSV import/export |
| Taxonomy | CRUD `/admin/categories`, `/admin/brands`, `/admin/tags` [`categories.manage`, `brands.manage`] |
| Media | `POST /admin/media`, `DELETE /admin/media/:id` [`media.upload`] |
| Inventory | `GET /admin/inventory`, `POST /admin/inventory/adjust`, batches CRUD [`inventory.*`] |
| Orders | `GET /admin/orders`, `GET /:id`, `PATCH /:id` (edit), `POST /:id/status`, `POST /:id/notes`, `POST /:id/book-courier`, `POST /bulk/book-courier`, `GET /:id/invoice`, `GET /:id/packing-slip` [`orders.*`] |
| Customers | `GET /admin/customers`, `GET /:id`, `POST /:id/block` [`customers.*`] |
| Reviews | `GET /admin/reviews`, `POST /:id/approve|reject|reply`, `DELETE /:id` [`reviews.moderate`] |
| Marketing | CRUD `/admin/coupons`, `/banners`, `/homepage-sections`, `/redirects` [`coupons.manage`, `marketing.manage`] |
| Payments | `GET /admin/payment-methods`, `PATCH /:id` (toggle, COD scope, limits) [`payments.toggle`] |
| Shipping | CRUD `/admin/delivery-zones` incl. toggle [`shipping.manage`]; `GET /admin/courier/balance` |
| Staff | CRUD `/admin/users`, `/admin/roles`, `GET /admin/permissions`, `PUT /admin/roles/:id/permissions` [`users.manage`, `roles.manage`] |
| Settings | `GET/PUT /admin/settings` [`settings.manage`] |
| Audit | `GET /admin/audit-logs` [`audit.view`] |
