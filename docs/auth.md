# Authentication

Customers and admins sign in with [Better Auth](https://better-auth.com/docs), pinned to **`better-auth` 1.7.25** and **`@better-auth/redis-storage` 1.7.25** (latest 1.7 patch on 2026-11-15; moved from 1.7.20 in Phase 3), with `ioredis` 5 (the storage package's peer range). Admin authorization (RBAC) is ours, not Better Auth's. This file is the source of truth for auth; `design.md` section 3 only summarises it.

## 1. Decisions

| # | Decision |
|---|---|
| 1 | **Two Better Auth instances** on one Postgres: `customerAuth` and `adminAuth`, with separate tables, base paths and cookie prefixes (section 2). The Better Auth docs do not cover two instances; the Phase 3 spike proved it works (`apps/api/tests/integration/auth-instances.test.ts`: separate cookies, tables and Redis prefixes, and neither instance accepts the other's session). |
| 2 | **Login by email or phone** through our own endpoint `POST /api/v1/auth/login`: `parseLoginIdentifier()` from `packages/shared` detects the type and normalizes it, we look the customer up, then call `customerAuth.api.signInEmail` with that customer's stored email. The phone-number plugin is not used (it is built around SMS OTP). |
| 3 | **Register** via our own `POST /api/v1/auth/register` with the shared `registerSchema`: phone mandatory and normalized, email optional. Phone-only customers get the placeholder email `<normalizedPhone>@phone.invalid` (Better Auth requires an email). It is never verified and never mailed. `customers.phone` stays unique. |
| 4 | **Email verification** only for real emails. Customers may log in unverified. Guest orders are linked **only** in the after-email-verification hook, by matching `orders.contactEmail` to the verified email. Never by phone. |
| 5 | **Password reset** by email. A phone-only customer must first add and verify a real email in their profile. SMS reset is a future item. |
| 6 | **Password hashing:** Better Auth default (scrypt). No argon2 (avoids native modules in Alpine images). The seed creates the Super Admin through Better Auth's internal adapter and password hasher, never by writing hashes itself. |
| 7 | **Admin RBAC stays ours:** `roles`, `permissions`, `role_permissions`, `admin_users.roleId`. `requirePermission()` reads the admin session from `adminAuth`. Better Auth's admin and organization plugins are not used. Optional TOTP 2FA via the `twoFactor` plugin on `adminAuth`, strongly recommended for Super Admin. Admin sign-up is disabled. |
| 8 | **Rate limiting:** Better Auth `rateLimit` with Redis secondary storage plus stricter custom rules (section 6). Our own `/login` and `/register` also keep a Redis lockout per identifier and IP, because server-side `auth.api` calls are not rate limited by Better Auth. |
| 9 | **Sessions:** customers 30 days, admins 7 days, `updateAge` 1 day, cookie cache on, `httpOnly`, `Secure` in production, `SameSite=Lax`. |
| 10 | **Same origin:** Next.js rewrites `/api/v1/*` to the API, so the browser only talks to the web origin and auth cookies are first-party (no Safari ITP issues). Fallback: `crossSubDomainCookies` on the parent domain plus `trustedOrigins`. |
| 11 | **Express mounting:** Better Auth handlers mounted with `toNodeHandler` before `express.json()` (section 7). |
| 12 | **Next.js proxy** (`apps/web/src/proxy.ts`; Next 16 renamed `middleware.ts` to `proxy.ts`) only does an optimistic session-cookie presence check. Every real check happens server-side against the API. |

## 2. Instances

| | `customerAuth` | `adminAuth` |
|---|---|---|
| `basePath` | `/api/v1/auth` | `/api/v1/admin/auth` |
| Cookie prefix (`advanced.cookiePrefix`) | `shop_c` | `shop_a` |
| User model | `Customer` (`customers`) | `AdminUser` (`admin_users`) |
| Session / account / verification | `CustomerSession`, `CustomerAccount`, `CustomerVerification` | `AdminSession`, `AdminAccount`, `AdminVerification` |
| Plugins | none | `twoFactor` (table `AdminTwoFactor` / `admin_two_factors`) |
| `emailAndPassword` | enabled; sign-up only through our `/register` | enabled, `disableSignUp: true` |
| `session.expiresIn` | 30 days | 7 days |
| Extra user fields (`user.additionalFields`) | `phone` (required, unique; see note below), `status`, `lastLoginAt` (`input: false`) | `roleId`, `isActive`, `lastLoginAt` (`input: false`) |
| `disabledPaths` (HTTP only; server-side `auth.api` calls still work) | `/sign-up/email`, `/sign-in/email`, `/update-user` | none (sign-up is disabled by `disableSignUp`) |

Note on `phone`: Better Auth 1.7 rejects a create when a field is both `required` and `input: false`, even on server-side calls, so `phone` is a normal input field. The two HTTP routes that accept user input (`/sign-up/email`, `/update-user`) are disabled, which leaves our `/auth/register` (and later `/me`) as the only way to set it, always through `normalizePhone()`. The customer `/sign-in/email` HTTP route is disabled too, so nobody can skip our `/auth/login` and its lockout. A `databaseHooks.session.create.before` hook rejects `BLOCKED` customers on every path that creates a session (login, sign-up, verification auto sign-in).

Common options for both:

- `database: prismaAdapter(prisma, { provider: 'postgresql' })` (one shared Prisma client).
- `advanced.database.generateId: 'uuid'` (our IDs are UUIDs).
- `secret` from `BETTER_AUTH_SECRET` (at least 32 chars), `baseURL` from `BETTER_AUTH_URL` (the public web origin).
- `secondaryStorage: redisStorage({ client, keyPrefix })` with an ioredis client and a per-instance key prefix (`ba:c:` and `ba:a:`).
- `session.storeSessionInDatabase: true` and `verification.storeInDatabase: true`. With secondary storage, Better Auth defaults to keeping sessions and verification tokens in Redis only. We also keep them in Postgres, so a Redis restart or flush neither logs everyone out nor invalidates pending email links, and admins can list and revoke sessions.
- `session.updateAge: 86400`, `session.cookieCache: { enabled: true, maxAge: 300 }`.
- `telemetry: { enabled: false }`.

Table columns match what Better Auth expects for these configs. The Prisma adapter checks this itself: it compares each instance's expected schema (core tables, extra fields and the `twoFactor` plugin) with the generated Prisma data model, and fails every request with `Prisma schema mismatch` if they differ. The integration tests cover both the passing check and a deliberate mismatch, so an upgrade that changes the expected columns fails the tests; then reconcile `prisma/schema.prisma` and add a migration. Model names are Prisma client properties (`customer`, `customerSession`, `adminTwoFactor`, ...).

## 3. Flows

**Register (customer).** `POST /api/v1/auth/register` (`registerSchema`: name, phone, password, optional email). Normalize the phone with `normalizePhone()`. Lowercase the email or use `<phone>@phone.invalid`. Run the Redis lockout and rate limit checks. Reject a duplicate phone or email with `409 CONFLICT`. Create the user and credential account through `customerAuth.api.signUpEmail` (server call), forward its `Set-Cookie` headers (`returnHeaders: true`), and return the profile. A verification email is queued only for a real email.

**Login (customer).** `POST /api/v1/auth/login` (`loginSchema`: identifier, password). `parseLoginIdentifier()` decides email or phone and normalizes it. Look up the customer and reject blocked customers. Call `customerAuth.api.signInEmail({ body: { email: storedEmail, password }, returnHeaders: true })` and forward `Set-Cookie`. Every failure (wrong password, unknown or malformed identifier, blocked customer, placeholder `@phone.invalid` typed as the identifier) returns the same `401` message; an unknown identifier still runs a password hash, so the timing does not reveal whether it exists. Failures increment the lockout counters (section 6). On success, set `lastLoginAt` and merge the guest cart (Phase 6).

**Session, logout.** Better Auth handlers under `/api/v1/auth/*` (`get-session`, `sign-out`). The API reads sessions with `customerAuth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.

**Verify email.** `emailVerification.sendVerificationEmail` enqueues the `email-verify` template on the `email.send` queue (no await in the request path, per the Better Auth timing-attack warning). It is skipped for `@phone.invalid`. `sendOnSignUp: true` for real emails, `expiresIn` 24 h, `autoSignInAfterVerification: true`. The `afterEmailVerification(user)` hook runs the guest-order linking service (section 4).

**Forgot and reset password.** `emailAndPassword.sendResetPassword` enqueues `password-reset`, skipped for `@phone.invalid`. `resetPasswordTokenExpiresIn` 1 h, `revokeSessionsOnPasswordReset: true`. Phone-only customers must add and verify a real email first.

**Change email (phone-only customer adds a real email).** Better Auth `POST /auth/change-email` (`user.changeEmail.enabled`, `updateEmailWithoutVerification: true`). An unverified customer (a phone-only placeholder, or a real address not yet verified) has the email swapped at once, still unverified, and gets one normal verification email; clicking it verifies the address and runs the linking hook. A verified customer keeps the old address until they click the link sent to the new one; the swap keeps it verified and runs the hook. Without `updateEmailWithoutVerification`, Better Auth 1.7 would swap an unverified customer's email on click but leave it unverified, so a second email would be needed before guest orders could link.

**Admin login.** `POST /api/v1/admin/auth/sign-in/email` (Better Auth handler). A `databaseHooks.session.create.before` hook on `adminAuth` rejects inactive admins (`isActive = false`, `403`), and `requireAdmin` re-checks `isActive` on every admin request, so deactivating an admin locks them out at once; a `session.create.after` hook sets `lastLoginAt`. Admin passwords need at least 12 characters (`minPasswordLength`, shared `adminPasswordSchema`). When 2FA is on, the response is `twoFactorRedirect: true` and the client continues with `/two-factor/verify-totp` (or a backup code). `GET /api/v1/admin/auth/me` is ours: it returns the admin profile, role and permission keys for the UI (the system role gets every key, in code).

**Admin 2FA.** `twoFactor()` without a fixed issuer: the admin UI sends the store name (public setting `store.name`) as `issuer` in `POST /two-factor/enable`, which is when the QR code (`totpURI`) is generated, so the name is never hardcoded. Enabling requires the password and a verified TOTP code (`skipVerificationOnEnable: false`). Better Auth encrypts the secret and backup codes with `BETTER_AUTH_SECRET`, so rotating the secret needs `BETTER_AUTH_SECRETS` (versioned) rather than a plain replace. The plugin adds its own lockout after repeated wrong codes.

**Admin users.** Created only by an admin with `users.manage` (our endpoint, which calls `adminAuth`'s internal adapter and password hasher). There is no public sign-up. The Super Admin is created by `ensureSuperAdmin()` (idempotent; never changes an existing admin or resets a password): by the seed in development, and by `node dist/create-super-admin.js` in production (`docs/setup-guide.md` section 8, step 7).

## 4. Guest-order linking

Runs only from `afterEmailVerification` (and after a verified email change), in `apps/api/src/services/guest-linking.service.ts`:

```sql
UPDATE orders SET "customerId" = $customerId
WHERE "customerId" IS NULL AND "contactEmail" = $verifiedEmail;
```

- Never link by phone, even if it matches.
- `@phone.invalid` addresses are never verified, so they never link.
- Idempotent: running twice changes nothing.

**Revocation and the cookie cache.** `session.cookieCache` (5 minutes) lets `getSession` trust the signed `session_data` cookie without checking storage, so a revoked session would keep working for up to 5 minutes. `requireAdmin` therefore calls `getSession` with `query: { disableCookieCache: true }`, so deactivating an admin or resetting their password ends their sessions at once. Customer routes that must react at once (for example after `customers.block`, which must also call `internalAdapter.deleteUserSessions`) need the same option.

## 5. Cookies

- Names follow `<prefix>.<name>`: `shop_c.session_token` and `shop_c.session_data` (cookie cache), and `shop_a.session_token`, `shop_a.session_data` and `shop_a.two_factor` (during the 2FA step). Prefixes are separate, so a customer session can never be read as an admin session.
- `httpOnly`; `Secure` in production (`advanced.useSecureCookies` forced on when `NODE_ENV=production`); `SameSite=Lax`; host-only on the web origin (decision 10), so `COOKIE_DOMAIN` is only needed for the fallback.
- CSRF: Better Auth checks the `Origin` against `trustedOrigins` (the web origin, from `CORS_ORIGINS`). Our own state-changing routes additionally require the custom header from `api-conventions.md`.

## 6. Rate limits and lockout

Better Auth `rateLimit`: `enabled: true` in all environments except tests (Better Auth disables it in development by default; we turn it on so local behaviour matches production), `storage: 'secondary-storage'`, default window 60 s, max 100. Custom rules (paths are relative to each instance's `basePath`):

| Path | Window | Max |
|---|---|---|
| `/sign-in/email` (admin only; disabled over HTTP for customers) | 60 s | 5 |
| `/sign-up/email` | disabled on both instances | |
| `/request-password-reset` (forgot password) | 300 s | 3 |
| `/send-verification-email` (resend) | 300 s | 3 |
| `/two-factor/*` | plugin default (3 per 10 s) | |

Our `/login` and `/register` endpoints call `auth.api` server-side, which Better Auth does not rate limit, so they enforce their own Redis limits (`apps/api/src/lib/lockout.ts`). A required wait is answered with `429 RATE_LIMITED` and `Retry-After`, never by sleeping, so nobody can hold connections open:

| Limit | Key | Rule |
|---|---|---|
| Login failures | normalized identifier (`email:...` or `phone:...`) | 3 free failures, then a doubling wait (1 s, 2 s, 4 s, ... up to 60 s) before the next attempt; locked at 10 failures until the 15-minute window ends; a successful login resets it |
| Login failures | client IP | locked at 50 failures in 15 minutes (loose on purpose: mobile carriers put many customers behind one IP) |
| Registrations | client IP | 10 attempts per hour (every attempt counts) |

**Client IP.** In production, `advanced.ipAddress.ipAddressHeaders: ['cf-connecting-ip']`, and Express `trust proxy` is set to match. This is safe only if the origin accepts traffic **only from Cloudflare** (firewall or Cloudflare Tunnel); otherwise anyone can spoof the header. In development, the default `x-forwarded-for` (or `127.0.0.1`) is used.

## 7. Express mounting order

```ts
app.post('/api/v1/auth/login', express.json(), loginHandler);        // ours, route-level JSON parser
app.post('/api/v1/auth/register', express.json(), registerHandler);  // ours
app.get('/api/v1/admin/auth/me', express.json(), adminMeHandler);    // ours
app.all('/api/v1/auth/*splat', toNodeHandler(customerAuth));          // Better Auth (Express 5 syntax)
app.all('/api/v1/admin/auth/*splat', toNodeHandler(adminAuth));
app.use(express.json());                                              // everything else, AFTER the handlers
```

Our routes come first, so the catch-alls never shadow them. Better Auth must come before the global `express.json()`, which would otherwise consume the request body.

## 8. Next.js

- `next.config.ts` rewrites `/api/v1/:path*` to `${API_INTERNAL_URL}/api/v1/:path*`.
- `src/proxy.ts` only checks that a session cookie exists for `/account/*` (`shop_c.session_token`) and `/admin/*` except `/admin/login` (`shop_a.session_token`), using `getSessionCookie(request, { cookiePrefix })` from `better-auth/cookies` (it also finds the `__Secure-` names used in production), and redirects to the login page with `?next=` if not. Real checks happen server-side against the API: the admin layout calls `/admin/auth/me` and redirects to login when it fails; `/account` calls `get-session`. `?next=` only accepts same-site relative paths.
- Client: `createAuthClient({ basePath: '/api/v1/auth' })`, and for admins `createAuthClient({ basePath: '/api/v1/admin/auth', plugins: [twoFactorClient()] })`.

## 9. Environment

`BETTER_AUTH_SECRET` (at least 32 chars; `openssl rand -base64 32`), `BETTER_AUTH_URL` (public web origin). For rotation, use `BETTER_AUTH_SECRETS` (`2:new,1:old`). `REDIS_URL` is shared with BullMQ.

## 10. Open items

- SMS OTP login and SMS password reset (when SMS is added).
- Google login (ACC-8, could-have).
