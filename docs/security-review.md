# Security review

Phase 11 review of the checklist in `design.md` section 12, item by item. **Code** means done and tested in this repository. **Server** means the owner (or whoever runs the VPS) must do it; the exact steps are in `operations.md` and `setup-guide.md`. Reviewed 2026-11-18.

| # | Checklist item | Status | Evidence / what to do |
|---|---|---|---|
| 1 | HTTPS only, HSTS | Code + Server | API: Helmet sends HSTS. Web: `Strict-Transport-Security` in production (`apps/web/next.config.ts`). Server: Cloudflare SSL mode **Full (strict)**, "Always Use HTTPS" on; Dokploy domains with HTTPS (Let's Encrypt). |
| 2 | Helmet headers | Code | API: `helmet()` in `apps/api/src/app.ts`. Web (added in Phase 11): `X-Frame-Options: SAMEORIGIN`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera, microphone, geolocation, payment off), `Cross-Origin-Opener-Policy: same-origin`. Checked with `curl -I`. No Content-Security-Policy on the web yet: GTM loads whatever tags are configured in GTM, so a strict CSP needs a per-tag allow-list; revisit once the GTM setup is final. |
| 3 | Strict CORS | Code | `cors({ origin: CORS_ORIGINS, credentials: true })`; browsers call the API through the same-origin `/api/v1` rewrite anyway. Set `CORS_ORIGINS` to the shop domain only. |
| 4 | Cloudflare WAF and bot protection | Server | Cloudflare: Managed WAF rules on, Bot Fight Mode on, rate-limiting rule for `/api/v1/auth/*` as a second layer. |
| 5 | Zod validation, unknown fields rejected | Code | Every route parses with a schema from `packages/shared`; bodies use `strictObject`; the order schema rejects any money field (test in `tests/integration/orders.test.ts`). |
| 6 | Prisma only, no string-built SQL | Code | Raw SQL only through Prisma's tagged templates (`$queryRaw`, `$executeRaw`), which bind parameters; no `$queryRawUnsafe` anywhere (checked with grep). |
| 7 | Better Auth; real client IP | Code + Server | Auth via Better Auth (`docs/auth.md`). In production the client IP is taken only from the header named by `CLIENT_IP_HEADER` (`apps/api/src/lib/client-ip.ts`, default `cf-connecting-ip`; `x-shop-client-ip` behind Caddy). Server: the proxy that sets it must be the only way in (Cloudflare allow-list on 80/443, or on the shared VPS: Traefik's 8081/8443 and app ports closed to the internet), otherwise that header could be forged. |
| 8 | Redis-backed rate limits | Code | Full table in `api-conventions.md` section 4. Added in Phase 11: cart writes (120/min per IP), review submit and edit (10/hour per customer, test in `reviews.test.ts`), wishlist writes (120/min per customer). Login and register use the progressive lockout (`apps/api/src/lib/lockout.ts`). |
| 9 | Server-side pricing, stock, coupons; idempotent orders | Code | `calculateOrderTotals()` only; order transaction with idempotency key, conditional stock updates, coupon advisory lock; race tests in `orders.test.ts`. |
| 10 | Signed or token-verified webhooks | Code | UddoktaPay: API-key header compared in constant time, and the payment is verified with the gateway (the body is never trusted). Steadfast webhook not added yet (waits for the official docs). Storefront revalidation: shared secret, constant-time compare. |
| 11 | No secrets in Git | Code | History scanned: no `.env` file was ever committed; no keys in the history (only test passwords). `.env.example` has names only. |
| 12 | Separate values per environment | Server | New random `BETTER_AUTH_SECRET`, `REVALIDATE_SECRET`, database password per environment (staging and production never share). |
| 13 | Postgres and Redis not public | Server | Dokploy: no published ports for the database services; apps reach them on the internal network. Strong generated passwords. |
| 14 | Non-root containers, minimal images, health checks | Code | Both images: `node:22-alpine`, multi-stage, `USER node`, `HEALTHCHECK`. Phase 11: the web health check now calls `/api/health` (it no longer depends on the API being up). |
| 15 | Host: UFW, key-only SSH, fail2ban, automatic updates | Server | `ufw default deny incoming`, allow 22/80/443; `PasswordAuthentication no`; `fail2ban`; `unattended-upgrades`. Steps in `operations.md`. |
| 16 | Audit log for admin writes | Code | `recordAudit` on every admin write (who, what, before, after; secrets redacted, test `audit-redaction.test.ts`). |
| 17 | Optional Turnstile | Deferred | Not added: the plan says add it when bots appear. Rate limits and lockout cover the forms today. |
| 18 | `pnpm audit` and Dependabot; pinned versions | Code | CI runs `pnpm audit --prod --audit-level high`. `.github/dependabot.yml`: weekly, grouped minor/patch, Prisma and TypeScript majors held back on purpose. One accepted finding, documented in `pnpm-workspace.yaml`: picomatch ReDoS (GHSA-fc5q-39xc-vjpf) only through `vitest`, an optional peer of Better Auth; test tooling, never run in the shop, no patched version yet. Re-check monthly. |

Also reviewed:

- **Uploads:** magic-byte check, sharp re-encode, metadata stripped, random names, 5 MB limit, decompression-bomb guard (admin and customer review photos alike).
- **Error tracking:** Sentry is off unless `SENTRY_DSN` is set; the SDK's default collection of cookies, headers, bodies and query strings is switched off and a scrubber removes anything left (`apps/api/src/lib/sentry.ts`, test `sentry.test.ts`).
- **Personal data in analytics:** no names, phones or emails in dataLayer events (`design.md` section 10).
