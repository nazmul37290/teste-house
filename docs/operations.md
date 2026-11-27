# Operations runbook

What to set up on the server before launch, and what to do every month. Written for whoever runs the VPS (the owner or a developer). Commands assume Ubuntu on the VPS and Dokploy as in `setup-guide.md` section 8.

## 1. Server hardening (once)

```bash
# Firewall: only SSH and web. Better: allow 80/443 only from Cloudflare's IP ranges
# (https://www.cloudflare.com/ips/) so nobody can reach the origin directly.
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 80,443/tcp
sudo ufw enable

# Key-only SSH: in /etc/ssh/sshd_config set
#   PasswordAuthentication no
#   PermitRootLogin prohibit-password
sudo systemctl reload ssh

# Ban repeated failed logins, install security updates automatically.
sudo apt install -y fail2ban unattended-upgrades
sudo dpkg-reconfigure -plow unattended-upgrades
```

Cloudflare: SSL mode **Full (strict)**, Always Use HTTPS, WAF managed rules, Bot Fight Mode. The app reads the visitor IP from the header named by `CLIENT_IP_HEADER` (`cf-connecting-ip` behind Cloudflare, the default). On the shared Hostinger VPS, Caddy terminates TLS and forwards to Dokploy's Traefik on `127.0.0.1:8081`; Caddy sets `X-Shop-Client-IP` and the api/worker run with `CLIENT_IP_HEADER=x-shop-client-ip`. Either way the header is only trustworthy when nothing reaches the app around that proxy.

Dokploy: the Postgres and Redis services must have **no published ports**. Every environment gets its own generated secrets.

## 2. Backups

Requirement: daily database backup, 7 daily + 4 weekly kept, stored off the server; uploads copied daily; restore tested monthly.

**Primary: Dokploy's scheduled backups.** In Dokploy, add an S3-compatible destination (Cloudflare R2 or Backblaze B2: create a bucket and an access key), then on the Postgres service open Backups and schedule a daily backup to it. Check the retention options of your Dokploy version; if it cannot keep 7 daily + 4 weekly, use a bucket lifecycle rule or the fallback script below.

**Fallback / manual: `scripts/backup/`** (run from a container or host that has `pg_dump` 17 and `rclone`):

| Script | What it does |
|---|---|
| `backup-db.sh` | `pg_dump` custom format to `BACKUP_DIR/daily/shop-<UTC time>.dump`, a weekly copy on Sundays, keeps 7 daily + 4 weekly, and copies the file to `RCLONE_REMOTE` if set. A failed dump never replaces a good file. |
| `restore-db.sh <file> <new_db>` | Restores into a **new** database. Refuses to overwrite the live database unless given `--replace-live`. |
| `sync-uploads.sh` | Copies `UPLOAD_DIR` (product and review images) to `RCLONE_REMOTE/uploads` (copy, not sync: a file deleted by mistake stays in the bucket). |

Schedule (for example in Dokploy's scheduled jobs, or cron on the host):

```
30 2 * * *  DATABASE_URL=... BACKUP_DIR=/backups RCLONE_REMOTE=r2:shop-backups /opt/shop/scripts/backup/backup-db.sh
0  3 * * *  UPLOAD_DIR=/data/uploads RCLONE_REMOTE=r2:shop-backups /opt/shop/scripts/backup/sync-uploads.sh
```

### Monthly restore drill (15 minutes)

1. Take the newest backup file (from the bucket, not the server).
2. `ADMIN_URL=postgresql://<user>:<pass>@<db-host>:5432/postgres ./restore-db.sh shop-<date>.dump shop_restore_check`
3. Compare row counts of the restored database with the live one (orders, products, customers, payments at least). They match up to orders placed since the backup.
4. `DROP DATABASE shop_restore_check;` and note the date in your log.

Tested in Phase 11 (2026-11-18) on the development database: backup 156 KB, restored into `shop_restore_check`, **all 51 tables had identical row counts**, the refusal to restore over the live database worked.

## 3. Monitoring

**Health endpoints**

| URL | Meaning |
|---|---|
| `https://api.<domain>/health` | API process is up (container health check uses it). |
| `https://api.<domain>/health/ready` | API can reach Postgres and Redis. |
| `https://<domain>/api/health` | Web server is up (does not call the API). |

**Uptime monitoring:** a free UptimeRobot (or Better Stack) account with three HTTP monitors on the URLs above, every 5 minutes, alerts by email and SMS/WhatsApp to the owner and the developer. Add a keyword monitor on the home page for the store name so a broken page is noticed, not just a dead server.

**Error tracking (Sentry, free tier):** create one Sentry project (Node) for api + worker and one (Next.js) for the web. Set:

| Where | Variables |
|---|---|
| api and worker | `SENTRY_DSN`, `SENTRY_ENVIRONMENT=production`, optional `SENTRY_RELEASE` (git commit) |
| web (runtime) | `SENTRY_DSN` |
| web (build arguments) | `NEXT_PUBLIC_SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_ENVIRONMENT` |

Only unexpected errors (HTTP 5xx, crashes, background jobs that ran out of retries) are sent. Cookies, headers, request bodies, query strings and user details are never sent (`apps/api/src/lib/sentry.ts`, `apps/web/src/lib/sentry-options.ts`). Leave `SENTRY_DSN` empty to turn it off.

**Logs:** the API writes JSON logs (pino) to stdout; read them in Dokploy (Logs tab) per service. Each request is one short line (method, path, status, time); request and response headers are not logged, and neither are `/media` images and `/health` checks.

## 4. Load test

`scripts/load/load-test.mjs` (no dependencies):

```bash
node scripts/load/load-test.mjs --base https://staging.<domain> --scenario browse --concurrency 20 --seconds 60
node scripts/load/load-test.mjs --base https://staging.<domain> --scenario checkout --concurrency 20 --seconds 60 --rotate-ip yes
```

It never places orders. Run it against **staging**, not production. `--rotate-ip yes` simulates many visitors so per-IP limits do not hide the real work (only where the app trusts `X-Forwarded-For`; behind Cloudflare the real limits apply, which is correct).

Results on a development machine (production builds of api and web, demo catalog, 20 concurrent users, 30 s, 2026-11-18):

| Path | Requests/s | p50 | p95 | p99 | Errors |
|---|---|---|---|---|---|
| Home page | 41 | 102 ms | 123 ms | 134 ms | 0 |
| Category page | 40 | 101 ms | 122 ms | 157 ms | 0 |
| Product page | 42 | 102 ms | 125 ms | 220 ms | 0 |
| Search page | 43 | 101 ms | 124 ms | 152 ms | 0 |
| API product list | 38 | 44 ms | 63 ms | 73 ms | 0 |
| API search suggest | 39 | 23 ms | 39 ms | 47 ms | 0 (some 429: the 60/min per visitor limit, by design) |
| API cart | 392 | 4 ms | 7 ms | 9 ms | 0 |
| API checkout quote | 393 | 46 ms | 55 ms | 67 ms | 0 |

Targets (requirements section 16): catalog pages under 300 ms at the server, API p95 under 500 ms. Both are met with a wide margin. Repeat on staging after deploying (the VPS and the network differ from a laptop).

## 5. Monthly checklist

- Restore drill (section 2).
- `pnpm audit --prod` and the Dependabot pull requests; re-check the accepted finding in `pnpm-workspace.yaml`.
- Sentry: any new errors?
- Disk space on the VPS (`df -h`), Docker cleanup (`docker system prune` for old images).
- Admin staff list: remove people who left (deactivate).
