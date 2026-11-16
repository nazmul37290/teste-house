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
| GET | `/products` | List: `q` (search: full-text on name + short description, plus trigram similarity), `category` (slug, includes active subcategories), `brand` (slugs), `attr` (`attribute-slug:value-slug`, filterable attributes only; OR within an attribute, AND across), `minPrice`/`maxPrice` (effective price: sale price if set), `inStock`, `rating`, `sort` (`relevance` default with `q`, else `newest`; `price_asc`, `price_desc`, `popular`), `page`, `pageSize` (max 48). `meta.facets`: brands, price range and attribute values with counts, over the category/search only. Only visible products (ACTIVE, not deleted, an active variant); cards carry `price` (cheapest effective), `regularPrice` when on sale, `inStock`, never exact stock |
| GET | `/products/:slug` | Product detail: active variants with effective `price`, `regularPrice`, `pricePerUnit`, `inStock`/`lowStock`, attributes; images, breadcrumbs, related products (same category). 404 for hidden products |
| GET | `/products/:slug/reviews` | Approved reviews |
| GET | `/categories`, `/categories/:slug` | Category tree and detail |
| GET | `/brands` | Brands |
| GET | `/search/suggest?q=` | Up to 8 product names (prefix first, then similar); 60 requests per minute per IP. Full search is `GET /products?q=` |
| GET | `/homepage` | `hero` banners (position `home_hero`, within their dates) and resolved `sections` (CATEGORY_GRID, PRODUCT_LIST, BANNER_STRIP, TEXT for CUSTOM_HTML); defaults when none are configured; a section with an invalid config is skipped |
| GET | `/redirects/resolve?path=` | Redirect for an old URL (`{ toPath, statusCode }`) or 404 |
| GET | `/settings/public` | Store name, logo, contact, GTM ID |
| POST | `/checkout/quote` | Full server-side price breakdown, from the same code as the order: body `{ items[{variantId, quantity}], couponCode?, district | addressId, phone? }` (strict). Returns `lines` (list/unit price, line total, allocated discount), `subtotal`, `discountTotal`, `deliveryCharge`, `grandTotal`, `zone {name, charge, freeDeliveryThreshold, estimatedDays}`, `coupon` (`{code, applied}` or `{code, applied: false, reason, message}`: a bad coupon does not fail the quote) and `paymentMethods` usable for that district and total. Replaces separate zone, payment-method and coupon-check endpoints (decided in Phase 6). 60 per minute per IP |
| GET/POST/PATCH/DELETE | `/cart`, `/cart/items`, `/cart/items/:id` | Guest or customer cart. `POST /cart/items {variantId, quantity}` adds to an existing line; `PATCH /cart/items/:id {quantity}` sets it (1 to 50). Every call returns the whole cart: lines with current `unitPrice`/`regularPrice`/`lineTotal`, `maxQuantity` (stock capped at 50, never the exact stock), `problem` (`UNAVAILABLE`, `OUT_OF_STOCK`, `NOT_ENOUGH_STOCK` or null), `itemCount`, `subtotal` (lines without a problem), `hasProblems`. Reasons: `UNAVAILABLE`, `OUT_OF_STOCK`, `NOT_ENOUGH_STOCK` (with `maxQuantity`), `CART_FULL` (50 lines); another cart's line is 404. Writes need the CSRF header; responses are `Cache-Control: private, no-store` |
| POST | `/orders` | Place order (guest or signed in). `Idempotency-Key` header (UUID) required; 201 for a new order, 200 with the original order for a repeated key, `409 IDEMPOTENCY_MISMATCH` when the key was used with another phone. Returns the order (number, status, totals, items, address, timeline). Reasons: `UNAVAILABLE` / `OUT_OF_STOCK` (with `variantIds`), `DELIVERY_NOT_AVAILABLE`, `PAYMENT_METHOD_UNAVAILABLE`, `COD_NOT_AVAILABLE`, `PAYMENT_METHOD_LIMIT`, coupon reasons (`COUPON_NOT_FOUND`, `COUPON_INACTIVE`, `COUPON_NOT_STARTED`, `COUPON_EXPIRED`, `COUPON_USED_UP`, `COUPON_LIMIT_REACHED`, `COUPON_MIN_ORDER`); `409 PRICE_CHANGED` with `details[0].quote`. 10 per minute per IP |
| POST | `/orders/track` | Guest tracking: body `{ orderNumber, phone }` (POST so the phone never appears in URLs or logs). 404 unless both match. Returns status, timeline, items and totals, payment method, and only the district and division of the address. 10 per minute per IP |
| GET | `/sitemap-data` | Visible product and category slugs with `updatedAt` (used by the web sitemap) |

Not part of this API but called by it: the web app's `POST /api/revalidate` (body `{ "tags": ["catalog"] }`, header `x-revalidate-secret`; 401 on a wrong secret, 400 on bad tags, `{ "revalidated": [...] }` on success). Only the worker calls it, see `docs/design.md` section 8.

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

Better Auth paths above are its standard endpoints under `basePath` (names confirmed against 1.7.25). Our `/auth/login` and `/auth/register` are mounted before Better Auth's catch-all and need the `X-Requested-With` header. Better Auth's own `/auth/sign-up/email`, `/auth/sign-in/email` and `/auth/update-user` return 404 over HTTP for customers (see `auth.md` section 2). The email links bring the customer back to the web pages `/email-verified` and `/reset-password`.
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
| Products | `GET /admin/products?q=&status=&categoryId=&brandId=&page=` (q matches name or SKU), `GET /admin/products/:id` [`products.view`]; `POST /admin/products` (may include `variants`) [`products.create`]; `PATCH /admin/products/:id`, `POST /admin/products/bulk-status`, `PUT /admin/products/:id/images` (`mediaIds` in display order, first = primary), `POST /admin/products/:id/variants`, `PATCH/DELETE /admin/variants/:id` [`products.update`]; `DELETE /admin/products/:id` (soft) [`products.delete`]. Money in and out as strings (`"450.00"`), net content as `unit` + `unitValue` (`"1.5"`). Stock is never set here except `initialStock` on a new variant. Reasons: `PRODUCT_NEEDS_VARIANT`, `ONE_VALUE_PER_ATTRIBUTE`, `DUPLICATE_SKU`, `LAST_ACTIVE_VARIANT`; `409` `SKU_TAKEN`, `SLUG_TAKEN`, `VARIANT_HAS_HISTORY`. `GET /admin/products/export.csv` [`products.view`]; `POST /admin/products/import?dryRun=true|false` (multipart `file`, UTF-8 CSV up to 2 MB / 2000 rows) [`products.create` and `products.update`]: returns a per-row report; applying with errors is `422 CSV_INVALID` and writes nothing |
| Taxonomy | `GET/POST /admin/categories`, `PATCH/DELETE /admin/categories/:id` [`categories.manage`]; `GET/POST /admin/brands`, `PATCH/DELETE /admin/brands/:id`, `GET/POST /admin/tags`, `PATCH/DELETE /admin/tags/:id` [`brands.manage`, as the permission descriptions say]; `GET/POST /admin/attributes`, `PATCH/DELETE /admin/attributes/:id`, `POST /admin/attributes/:id/values`, `PATCH/DELETE /admin/attribute-values/:id` [`categories.manage`]. The `GET` lists are also open to `products.view` (the product editor needs them). Categories come back depth-first with `depth`. Business-rule reasons: `UNKNOWN_PARENT`, `CATEGORY_CYCLE`, `CATEGORY_TOO_DEEP` (max 4 levels); `409` with `CATEGORY_HAS_CHILDREN`, `CATEGORY_HAS_PRODUCTS`, `BRAND_HAS_PRODUCTS`, `ATTRIBUTE_IN_USE`, `VALUE_IN_USE` |
| Media | `POST /admin/media` (multipart: `file` + `altText`), `PATCH /admin/media/:id` (alt text), `DELETE /admin/media/:id` (`409 MEDIA_IN_USE` while used) [`media.upload`]; `GET /admin/media?q=&page=` (library) [`media.upload` or `products.view`]. Each item carries `urls` for every width |
| Inventory | `GET /admin/inventory?q=&lowStock=true&page=` (variants, lowest stock first, with `isLow` and `nearestExpiry`), `GET /admin/inventory/movements?variantId=&page=`, `GET /admin/inventory/variants/:id/batches` [`inventory.view`]; `POST /admin/inventory/adjust` (`variantId`, signed `quantity`, `reason`, optional `batchId`), `POST /admin/inventory/receive` (`variantId`, `quantity`, optional `batchNo`, `manufacturedAt`, `expiryDate`, `reason`) [`inventory.adjust`]. Reasons: `INSUFFICIENT_STOCK`, `BATCH_MISMATCH`; `409 BATCH_EXISTS` |
| Orders | `GET /admin/orders`, `GET /:id`, `PATCH /:id` (edit), `POST /:id/status`, `POST /:id/notes`, `POST /:id/book-courier`, `POST /bulk/book-courier`, `GET /:id/invoice`, `GET /:id/packing-slip` [`orders.*`] |
| Customers | `GET /admin/customers`, `GET /:id`, `POST /:id/block` [`customers.*`] |
| Reviews | `GET /admin/reviews`, `POST /:id/approve|reject|reply`, `DELETE /:id` [`reviews.moderate`] |
| Coupons | `GET /admin/coupons?q=`, `POST /admin/coupons`, `PATCH/DELETE /admin/coupons/:id` [`coupons.manage`]. `value` is taka for `FIXED` and a percent (up to 100, two decimals) for `PERCENT`; `type` and `value` are sent together on update. `409` `CODE_TAKEN`, `COUPON_IN_USE` (used coupons are turned off, not deleted); `422 COUPON_USED` when renaming a used coupon |
| Marketing | CRUD `/banners`, `/homepage-sections`, `/redirects` [`marketing.manage`] Banners: `GET/POST /admin/banners`, `PATCH/DELETE /admin/banners/:id` (link: a site path or an `https://` URL only; optional start/end, end after start). Homepage sections: `GET/POST /admin/homepage-sections`, `PUT/DELETE /admin/homepage-sections/:id` (whole-section replace; config validated against its type's schema in `packages/shared/src/storefront-schemas.ts`). `marketing.manage` may also read `GET /admin/categories`, `/admin/products` and `/admin/media` for the pickers |
| Payments | `GET /admin/payment-methods`, `PATCH /admin/payment-methods/:id` (`name`, `isActive`, `sortOrder`, `config { scope?, minAmount?, maxAmount? }`; config is merged, `null` clears a limit; `scope` only for COD) [`payments.toggle`] |
| Shipping | `GET/POST /admin/delivery-zones`, `PATCH/DELETE /admin/delivery-zones/:id` [`shipping.manage`]. Money as strings; `districts` must be real district names (`BD_DISTRICTS`). Reasons: `DISTRICT_IN_OTHER_ZONE` (422); `409` code taken, `ZONE_IN_USE` (orders use it: turn it off instead). Setting `isDefault` moves the default from the old zone. `GET /admin/courier/balance` (Phase 8) |
| Staff | `GET/POST /admin/roles`, `GET/PATCH/DELETE /admin/roles/:id`, `PUT /admin/roles/:id/permissions`, `GET /admin/permissions` [`roles.manage`; `GET /admin/roles` also `users.manage`]. `GET/POST /admin/users`, `GET/PATCH /admin/users/:id` (name, role, `isActive`), `PUT /admin/users/:id/password` [`users.manage`]. No `DELETE` for staff: deactivate instead (see `design.md` section 4). Business-rule reasons: `SYSTEM_ROLE`, `UNKNOWN_ROLE`, `CANNOT_DEACTIVATE_SELF`, `CANNOT_CHANGE_OWN_ROLE`, `USE_CHANGE_PASSWORD`, `LAST_SUPER_ADMIN`; `409` with `ROLE_IN_USE` |
| Settings | `GET/PUT /admin/settings` [`settings.manage`]. `PUT` takes any subset of the keys in `SETTING_DEFINITIONS` (unknown keys are rejected) and audits only the keys that changed. Public subset: `GET /settings/public` (no auth, `Cache-Control: public, max-age=60`) |
| Audit | `GET /admin/audit-logs` [`audit.view`] |
