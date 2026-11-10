# Authentication

Customers and admins sign in with [Better Auth](https://better-auth.com/docs), pinned to **`better-auth` 1.7.20** and **`@better-auth/redis-storage` 1.7.20** (latest stable on 2026-11-11; 1.8 is beta). Admin authorization (RBAC) is ours, not Better Auth's. This file is the source of truth for auth; `design.md` section 3 only summarises it.

## 1. Decisions

| # | Decision |
|---|---|
| 1 | **Two Better Auth instances** on one Postgres: `customerAuth` and `adminAuth`, with separate tables, base paths and cookie prefixes (section 2). The Better Auth docs do not cover two instances, so Phase 3 starts with a spike that proves it. Fallback if it fails: one instance with a `type` field on a single user table. |
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
| 12 | **Next.js middleware** only does an optimistic session-cookie presence check. Every real check happens server-side against the API. |

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
| Extra user fields (`user.additionalFields`, `input: false`) | `phone` (required, unique), `status`, `lastLoginAt` | `roleId`, `isActive`, `lastLoginAt` |

Common options for both:

- `database: prismaAdapter(prisma, { provider: 'postgresql' })` (one shared Prisma client).
- `advanced.database.generateId: 'uuid'` (our IDs are UUIDs).
- `secret` from `BETTER_AUTH_SECRET` (at least 32 chars), `baseURL` from `BETTER_AUTH_URL` (the public web origin).
- `secondaryStorage: redisStorage({ client, keyPrefix })` with an ioredis client and a per-instance key prefix (`ba:c:` and `ba:a:`).
- `session.storeSessionInDatabase: true` and `verification.storeInDatabase: true`. With secondary storage, Better Auth defaults to keeping sessions and verification tokens in Redis only. We also keep them in Postgres, so a Redis restart or flush neither logs everyone out nor invalidates pending email links, and admins can list and revoke sessions.
- `session.updateAge: 86400`, `session.cookieCache: { enabled: true, maxAge: 300 }`.
- `telemetry: { enabled: false }`.

Table columns are exactly what `npx auth@1.7.20 generate` produced for these configs (checked on 2026-11-11). Our tables and extra columns are kept. If an upgrade changes the expected columns, re-run the generator on a throwaway config and reconcile `prisma/schema.prisma` by hand.

## 3. Flows

**Register (customer).** `POST /api/v1/auth/register` (`registerSchema`: name, phone, password, optional email). Normalize the phone with `normalizePhone()`. Lowercase the email or use `<phone>@phone.invalid`. Run the Redis lockout and rate limit checks. Reject a duplicate phone or email with `409 CONFLICT`. Create the user and credential account through `customerAuth.api.signUpEmail` (server call), forward its `Set-Cookie` headers (`returnHeaders: true`), and return the profile. A verification email is queued only for a real email.

**Login (customer).** `POST /api/v1/auth/login` (`loginSchema`: identifier, password). `parseLoginIdentifier()` decides email or phone and normalizes it. Look up the customer and reject blocked customers. Call `customerAuth.api.signInEmail({ body: { email: storedEmail, password }, returnHeaders: true })` and forward `Set-Cookie`. Every failure returns the same `401` message, whether or not the identifier exists. Failures increment the lockout counters (section 6). On success, set `lastLoginAt` and merge the guest cart (Phase 6).

**Session, logout.** Better Auth handlers under `/api/v1/auth/*` (`get-session`, `sign-out`). The API reads sessions with `customerAuth.api.getSession({ headers: fromNodeHeaders(req.headers) })`.

**Verify email.** `emailVerification.sendVerificationEmail` enqueues the `email-verify` template on the `email.send` queue (no await in the request path, per the Better Auth timing-attack warning). It is skipped for `@phone.invalid`. `sendOnSignUp: true` for real emails, `expiresIn` 24 h, `autoSignInAfterVerification: true`. The `afterEmailVerification(user)` hook runs the guest-order linking service (section 4).

**Forgot and reset password.** `emailAndPassword.sendResetPassword` enqueues `password-reset`, skipped for `@phone.invalid`. `resetPasswordTokenExpiresIn` 1 h, `revokeSessionsOnPasswordReset: true`. Phone-only customers must add and verify a real email first.

**Change email (phone-only customer adds a real email).** Better Auth `user.changeEmail` with verification sent to the new address. After verification, the same linking hook runs.

**Admin login.** `POST /api/v1/admin/auth/sign-in/email` (Better Auth handler). A `databaseHooks.session.create.before` hook on `adminAuth` rejects inactive admins (`isActive = false`). When 2FA is on, the response is `twoFactorRedirect: true` and the client continues with `/two-factor/verify-totp` (or a backup code). `GET /api/v1/admin/auth/me` is ours: it returns the admin profile, role and permission keys for the UI.

**Admin 2FA.** `twoFactor({ issuer: <store name> })`. Enabling requires the password and a verified TOTP code (`skipVerificationOnEnable: false`). Better Auth encrypts the secret and backup codes with `BETTER_AUTH_SECRET`, so rotating the secret needs `BETTER_AUTH_SECRETS` (versioned) rather than a plain replace. The plugin adds its own lockout after repeated wrong codes.

**Admin users.** Created only by an admin with `users.manage` (our endpoint, which calls `adminAuth`'s internal adapter and password hasher). There is no public sign-up. The Super Admin is created by the seed in development and by a one-off command in production (Phase 12 runbook).

## 4. Guest-order linking

Runs only from `afterEmailVerification` (and after a verified email change):

```sql
UPDATE orders SET "customerId" = $customerId
WHERE "customerId" IS NULL AND "contactEmail" = $verifiedEmail;
```

- Never link by phone, even if it matches.
- `@phone.invalid` addresses are never verified, so they never link.
- Idempotent: running twice changes nothing.

## 5. Cookies

- Names follow `<prefix>.<name>`: `shop_c.session_token` and `shop_c.session_data` (cookie cache), and `shop_a.session_token`, `shop_a.session_data` and `shop_a.two_factor` (during the 2FA step). Prefixes are separate, so a customer session can never be read as an admin session.
- `httpOnly`; `Secure` in production (`advanced.useSecureCookies` forced on when `NODE_ENV=production`); `SameSite=Lax`; host-only on the web origin (decision 10), so `COOKIE_DOMAIN` is only needed for the fallback.
- CSRF: Better Auth checks the `Origin` against `trustedOrigins` (the web origin, from `CORS_ORIGINS`). Our own state-changing routes additionally require the custom header from `api-conventions.md`.

## 6. Rate limits and lockout

Better Auth `rateLimit`: `enabled: true` in all environments except tests (Better Auth disables it in development by default; we turn it on so local behaviour matches production), `storage: 'secondary-storage'`, default window 60 s, max 100. Custom rules (paths are relative to each instance's `basePath`):

| Path | Window | Max |
|---|---|---|
| `/sign-in/email` | 60 s | 5 |
| `/sign-up/email` | 60 s | 3 |
| `/request-password-reset` (forgot password) | 300 s | 3 |
| `/send-verification-email` (resend) | 300 s | 3 |
| `/two-factor/*` | plugin default (3 per 10 s) | |

Our `/login` and `/register` endpoints call `auth.api` server-side, which Better Auth does not rate limit, so they enforce their own Redis limits: a progressive delay and a temporary lockout after repeated failures, keyed per normalized identifier and per IP. Responses are `429 RATE_LIMITED` with `Retry-After`.

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
- `middleware.ts` only checks that a session cookie exists for `/account/*` (`shop_c.session_token`) and `/admin/*` (`shop_a.session_token`) and redirects to login if not. Real checks happen server-side against the API (`get-session`, `/admin/auth/me`).
- Client: `createAuthClient({ basePath: '/api/v1/auth' })`, and for admins `createAuthClient({ basePath: '/api/v1/admin/auth', plugins: [twoFactorClient()] })`.

## 9. Environment

`BETTER_AUTH_SECRET` (at least 32 chars; `openssl rand -base64 32`), `BETTER_AUTH_URL` (public web origin). For rotation, use `BETTER_AUTH_SECRETS` (`2:new,1:old`). `REDIS_URL` is shared with BullMQ.

## 10. Open items

- Phase 3 spike: two instances side by side (not covered by the Better Auth docs).
- `getSessionCookie` from `better-auth/cookies` with a custom prefix: confirm its options in Phase 3 before writing the middleware.
- SMS OTP login and SMS password reset (when SMS is added).
- Google login (ACC-8, could-have).
