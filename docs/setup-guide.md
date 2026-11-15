# Setup guide

How to run this project on your machine, what every command does, how Docker fits in, and how to put the site live on a VPS with Dokploy. It assumes you know Node.js and Git, but have not worked with a monorepo or Docker before.

Contents:

1. [The big picture](#1-the-big-picture)
2. [The monorepo, explained](#2-the-monorepo-explained)
3. [Docker, explained](#3-docker-explained)
4. [Run the project locally](#4-run-the-project-locally)
5. [Command reference](#5-command-reference)
6. [Daily workflow](#6-daily-workflow)
7. [Troubleshooting](#7-troubleshooting)
8. [Going live with Dokploy](#8-going-live-with-dokploy)
9. [After launch: deploys, migrations, backups](#9-after-launch-deploys-migrations-backups)

---

## 1. The big picture

The store is made of five running pieces:

| Piece        | What it is                                                    | Port (local)                  | Where it runs locally        |
| ------------ | ------------------------------------------------------------- | ----------------------------- | ---------------------------- |
| **web**      | Next.js: the storefront and the admin panel (`/admin`)        | 3000                          | On your machine (`pnpm dev`) |
| **api**      | Express: the only thing that talks to the database            | 4000                          | On your machine (`pnpm dev`) |
| **postgres** | The database                                                  | 5432                          | In Docker                    |
| **redis**    | Fast in-memory store: sessions, rate limits, job queue        | 6379                          | In Docker                    |
| **mailpit**  | Fake email server that catches every email so you can read it | 1025 (SMTP), 8025 (web inbox) | In Docker                    |

There is also a **worker**: the same API code started with a different command (`src/worker.ts`). It runs background jobs from the Redis queue: today it sends emails; later phases add courier booking and other jobs. `pnpm dev` starts it together with the API and web, so locally you never start it by hand.

```
Your browser ──> web (localhost:3000) ──> api (localhost:4000) ──> postgres, redis
                                                         └─────> mailpit (dev emails)
```

On the live server the picture is the same, except everything runs in Docker, and Cloudflare plus Traefik (from Dokploy) sit in front to provide HTTPS and the domain name.

---

## 2. The monorepo, explained

### Separate repos vs. one repo

You may be used to this:

```
shop-frontend/   (own Git repo, own package.json, own node_modules)
shop-backend/    (own Git repo, own package.json, own node_modules)
```

With that layout, if the frontend and backend both need the same validation rules or types, you copy them, or publish a private npm package, and they drift apart over time.

A **monorepo** puts everything in **one Git repo**:

```
ecommerce-repo/
  apps/
    web/          the Next.js app       (package name: @shop/web)
    api/          the Express app       (package name: @shop/api)
  packages/
    shared/       code both apps use     (package name: @shop/shared)
  prisma/         database schema, migrations, seed
  docker/         Dockerfiles and the local compose file
  docs/           specs and guides
  package.json    ROOT package.json: scripts that run across all apps
  pnpm-workspace.yaml
```

Each folder under `apps/` and `packages/` is still a normal Node project with its own `package.json`. You can think of each one as a "mini repo". The difference is that they live together and can import each other directly.

### Workspaces: how the apps find each other

`pnpm-workspace.yaml` tells pnpm "every folder in `apps/*` and `packages/*` is a package". So when `apps/api/package.json` says:

```json
"@shop/shared": "workspace:*"
```

pnpm does **not** download anything. It links `apps/api/node_modules/@shop/shared` to the local `packages/shared` folder. Change a function in `packages/shared`, and both the API and the web app see the change immediately. No publishing, no copying.

That is why the important business rules live in `packages/shared`: `calculateOrderTotals()` (prices and totals), `normalizePhone()`, permission keys, and the Zod schemas that validate forms in the browser **and** requests on the server. One copy, used everywhere.

### One install for everything

- You run `pnpm install` **once, at the root**. It installs dependencies for every app and package.
- There is **one lockfile** (`pnpm-lock.yaml`) at the root. Never run `npm install` inside a subfolder; that creates a second lockfile and breaks the setup.
- pnpm keeps one copy of each package version on disk and links it into every project, so installs are smaller than with npm.

### Running scripts: root vs. one app

The root `package.json` has scripts that act on the whole repo:

```bash
pnpm dev          # starts api AND web together
pnpm test         # runs tests in every package that has tests
pnpm typecheck    # type-checks every package
```

To run a script in **one** package, use `--filter` with the package name:

```bash
pnpm --filter @shop/api dev      # only the API
pnpm --filter @shop/web build    # only build the web app
pnpm --filter @shop/shared test  # only the shared tests
```

To add a dependency to one package:

```bash
pnpm --filter @shop/api add some-package
pnpm --filter @shop/web add -D some-dev-package
```

Where to find what:

| You want to change...                        | Look in                                         |
| -------------------------------------------- | ----------------------------------------------- |
| A page, component or admin screen            | `apps/web/src`                                  |
| An API endpoint or business logic            | `apps/api/src`                                  |
| Validation, prices, phone rules, permissions | `packages/shared/src`                           |
| A database table or column                   | `prisma/schema.prisma`, then create a migration |
| Default data (roles, zones, settings)        | `prisma/seed.ts`                                |

---

## 3. Docker, explained

### The problem Docker solves

To run this project you need PostgreSQL 17, Redis 7 and a mail catcher. Without Docker you would install each one on Windows, configure it, and hope your versions match the server's. With Docker you run a single command, and you get exactly the same versions as everyone else and as production.

### Four words you need

| Word             | Meaning                                                                                                                          | Analogy                                           |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| **Image**        | A packaged, read-only snapshot of a program plus everything it needs (OS files, runtime, config). Example: `postgres:17-alpine`. | An installer or a recipe                          |
| **Container**    | A running copy of an image, isolated from your system. You can start, stop and delete it.                                        | The installed, running program                    |
| **Volume**       | A storage area that survives when a container is deleted. The database files live here.                                          | An external hard drive plugged into the container |
| **Port mapping** | `5432:5432` means "port 5432 on my PC goes to port 5432 inside the container".                                                   | A door from your PC into the container            |

Two more files:

- **Dockerfile**: a recipe to **build your own image**. This repo has `docker/Dockerfile.api` and `docker/Dockerfile.web`, used for production.
- **Compose file** (`docker/compose.dev.yml`): a list of containers to start together, with their ports, passwords and volumes. One command starts all of them.

### Docker on Windows

Docker containers are Linux programs. On Windows, **Docker Desktop** runs them inside a small Linux virtual machine provided by **WSL2** (Windows Subsystem for Linux). That is why Docker would not start until you ran `wsl --update`: the WSL2 Linux kernel was missing.

Each time you want to work on the project, **Docker Desktop must be running** (whale icon in the system tray). You can set it to start with Windows in Docker Desktop > Settings > General.

### How this project uses Docker locally

Locally, Docker runs **only the services**: Postgres, Redis and Mailpit. The web and API run directly with Node (`pnpm dev`), because that gives you instant hot reload when you save a file.

`docker/compose.dev.yml` defines:

| Service  | Image                | Login                                         | Data kept in                        |
| -------- | -------------------- | --------------------------------------------- | ----------------------------------- |
| postgres | `postgres:17-alpine` | user `shop`, password `shop`, database `shop` | volume `pgdata` (survives restarts) |
| redis    | `redis:7-alpine`     | none                                          | not kept (fine for dev)             |
| mailpit  | `axllent/mailpit`    | none                                          | not kept                            |

These passwords are for your machine only. Production uses strong generated passwords.

### Docker commands you will actually use

The `pnpm db:*` scripts wrap the common ones, but it helps to know them:

```bash
# start all dev services in the background (-d = detached); same as: pnpm db:up
docker compose -f docker/compose.dev.yml up -d

# show what is running and whether it is healthy
docker compose -f docker/compose.dev.yml ps

# stop and remove the containers; the database volume is KEPT; same as: pnpm db:down
docker compose -f docker/compose.dev.yml down

# show logs of one service (Ctrl+C to stop following)
docker compose -f docker/compose.dev.yml logs -f postgres

# open a SQL shell inside the postgres container
docker compose -f docker/compose.dev.yml exec postgres psql -U shop -d shop

# DANGER: stop AND delete the database volume (wipes all local data)
docker compose -f docker/compose.dev.yml down -v
```

To browse the database with a GUI, you can also use `pnpm exec prisma studio` (opens in the browser), or connect any database tool (DBeaver, TablePlus, pgAdmin) to `localhost:5432` with user `shop`, password `shop`.

---

## 4. Run the project locally

### One-time setup

**Requirements:** Node.js 22 or newer, Git, Docker Desktop (with WSL2 updated). pnpm comes through Corepack, which ships with Node:

```bash
corepack enable          # makes the `pnpm` command available, at the version in package.json
```

**Steps** (run from the repo root):

```bash
# 1. Install all dependencies for every app and package
pnpm install

# 2. Create your local environment file (never commit .env)
cp .env.example .env
#    then edit .env: set BETTER_AUTH_SECRET to a random value
#    (Git Bash: openssl rand -base64 32)

# 3. The web app's env file (optional on your machine: the built-in defaults are the same)
cp apps/web/.env.example apps/web/.env.local

# 4. Start Postgres, Redis and Mailpit (Docker Desktop must be running)
pnpm db:up

# 5. Generate the Prisma client (TypeScript code for talking to the DB)
pnpm db:generate

# 6. Create all tables by applying the migrations in prisma/migrations
pnpm db:deploy

# 7. Fill in the default data: permissions, roles, payment methods, zones, settings
pnpm db:seed

# 8. Start the API and the web app together
pnpm dev
```

Then open:

| URL                          | What you see                                                 |
| ---------------------------- | ------------------------------------------------------------ |
| http://localhost:3000        | The storefront (still a skeleton)                            |
| http://localhost:4000/health | The API's health check                                       |
| http://localhost:8025        | Mailpit: every email the app sends lands here (from Phase 3) |

What you can try today:

| URL | What it is |
|---|---|
| http://localhost:3000/register | Create a customer account (mobile number required, email optional). The verification email appears in Mailpit |
| http://localhost:3000/login | Sign in with the mobile number or the email |
| http://localhost:3000/account | The signed-in customer: details, add or change email, resend verification, sign out |
| http://localhost:3000/admin | Admin panel. Sign in with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` from `.env` |
| `/admin/staff`, `/admin/roles`, `/admin/settings` | Staff accounts, roles and permissions, store settings (each needs its permission) |
| `/admin/security` | Turn on two-factor authentication (scan the QR code with an authenticator app) and change your password |

Stop `pnpm dev` with `Ctrl+C`. If `pnpm dev` says a port is in use, an earlier `pnpm dev` is still running in another terminal: use that one, or stop it first.

### Why the two env files?

- `.env` at the root is read by the API, Prisma and the seed.
- Next.js only reads env files from its **own** folder, so `apps/web` needs `apps/web/.env.local`.
- Variables starting with `NEXT_PUBLIC_` are baked into the browser JavaScript, so **never put a secret in a `NEXT_PUBLIC_` variable**.

---

## 5. Command reference

All commands run from the repo root.

### Every day

| Command        | What it does                                                                                    |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `pnpm db:up`   | Starts the Docker services (Postgres, Redis, Mailpit). Safe to run if they are already running. |
| `pnpm dev`     | Starts the API (port 4000), the worker and web (port 3000) with hot reload.                                 |
| `pnpm db:down` | Stops the Docker services. Data in Postgres is kept.                                            |

### Database

| Command                   | What it does                                                                                                                                                                   | When                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| `pnpm db:generate`        | Generates the Prisma client from `prisma/schema.prisma` into `apps/api/src/generated` (not committed).                                                                         | After `pnpm install` and after every schema change |
| `pnpm db:migrate`         | **Dev only.** Compares the schema with the database, writes a new migration file in `prisma/migrations`, and applies it. It asks for a name, for example `add_product_badges`. | When you change `schema.prisma`                    |
| `pnpm db:deploy`          | Applies migration files that have not been applied yet. Never creates new ones. This is what production runs.                                                                  | Fresh setup, after pulling new migrations          |
| `pnpm db:seed`            | Builds the API bundle and runs `prisma/seed.ts`. Safe to run many times (it updates or inserts, never duplicates).                                                             | Fresh setup, after the seed changes                |
| `pnpm exec prisma studio` | Opens a web UI to browse and edit the data.                                                                                                                                    | Whenever you want to look at the data              |

**Migration files are code:** commit them with the schema change. Never edit a migration that has already been applied anywhere; make a new one instead.

### Quality checks

Run these before every commit (CI on GitHub runs the same):

| Command                 | What it does                                                                                                                                                                                                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint`             | ESLint over the whole repo: finds bugs and bad patterns                                                                                                                                                                       |
| `pnpm typecheck`        | TypeScript in strict mode over every package                                                                                                                                                                                  |
| `pnpm test`             | Vitest unit tests in every package that has them                                                                                                                                                                              |
| `pnpm format`           | Prettier: rewrites files to the standard formatting                                                                                                                                                                           |
| `pnpm test:integration` | API tests against real Postgres and Redis (needs `pnpm db:up`). They use a separate database, `shop_test` (created automatically, never your dev data), and Redis db 1. It is never reset; tests use unique emails and phones |

### Build

| Command      | What it does                                                                                                                                                    |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm build` | Production build of every package (API bundle into `apps/api/dist`, Next.js into `apps/web/.next`). You rarely need this locally; Docker runs it on the server. |

---

## 6. Daily workflow

```bash
# morning
# (start Docker Desktop if it is not running)
git pull
pnpm install          # only needed if package.json or pnpm-lock.yaml changed
pnpm db:generate      # only needed if schema.prisma changed
pnpm db:deploy        # only needed if new migrations arrived
pnpm db:up
pnpm dev

# before committing
pnpm lint && pnpm typecheck && pnpm test
```

Changing the database schema:

1. Edit `prisma/schema.prisma`.
2. `pnpm db:migrate`, and give it a short name.
3. Open the new `prisma/migrations/<timestamp>_<name>/migration.sql` and read it. In particular, delete any `DROP INDEX` lines for the hand-made indexes from `20261115000100_constraints_and_search` (see `database.md` section 7).
4. Commit the schema and the migration together.

---

## 7. Troubleshooting

| Symptom                                            | Cause and fix                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Docker Desktop is unable to start`                | WSL2 problem. Admin PowerShell: `wsl --update`, restart Windows, start Docker Desktop.                                                                                                  |
| `failed to connect to the docker API`              | Docker Desktop is not running. Start it and wait for "Engine running".                                                                                                                  |
| `port is already allocated` (5432, 6379...)        | Something else uses that port, for example a Postgres installed on Windows. Stop it, or change the left side of the port in `compose.dev.yml` (e.g. `5433:5432`) and in `DATABASE_URL`. |
| `Can't reach database server at localhost:5432`    | Run `pnpm db:up` and wait for `postgres` to show `healthy` in `docker compose ... ps`.                                                                                                  |
| `Cannot find module .../generated/prisma/client`   | Run `pnpm db:generate`.                                                                                                                                                                 |
| Strange "Cannot find package" errors after pulling | The install is broken or out of date. Delete `node_modules` (`CI=true pnpm install` reinstalls cleanly).                                                                                |
| Port 3000 or 4000 in use                           | An old `pnpm dev` is still running. Close that terminal, or end the `node` process in Task Manager.                                                                                     |
| Want a clean database                              | `docker compose -f docker/compose.dev.yml down -v`, then `pnpm db:up`, `pnpm db:deploy`, `pnpm db:seed`. **Deletes all local data.**                                                    |

---

## 8. Going live with Dokploy

### What Dokploy is

**Dokploy** is a free, self-hosted control panel you install on your VPS. It gives you a web dashboard where you:

- connect your GitHub repo;
- create **applications** (it builds a Docker image from your Dockerfile and runs it as a container);
- create **databases** (Postgres, Redis) with a few clicks;
- attach domains; its built-in **Traefik** proxy gets free HTTPS certificates automatically;
- set environment variables, view logs, redeploy, and schedule backups.

In short, it does on the server what `docker compose` does on your PC, plus building, domains, HTTPS and auto-deploy, all from a browser.

### How production differs from local

|                 | Local                            | Production (Dokploy)                                                               |
| --------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| web and api     | `pnpm dev` with Node, hot reload | Docker containers built from `docker/Dockerfile.web` and `docker/Dockerfile.api`   |
| Postgres, Redis | `compose.dev.yml`                | Dokploy database services, internal network only (not reachable from the internet) |
| Env vars        | `.env` and `apps/web/.env.local` | Set in the Dokploy dashboard per service                                           |
| Emails          | Mailpit (caught, never sent)     | Mailgun (really sent)                                                              |
| HTTPS           | none                             | Traefik (Let's Encrypt) plus Cloudflare                                            |
| Migrations      | `pnpm db:deploy` by hand         | Run automatically when the api container starts (`RUN_MIGRATIONS=true`)            |

What the Dockerfiles do, in plain words:

- **`Dockerfile.api`**: copies the repo, installs dependencies, generates the Prisma client, bundles the API, then copies only what is needed into a small final image. On start, `docker/api-entrypoint.sh` runs `prisma migrate deploy` if `RUN_MIGRATIONS=true`, then starts the server on port 4000. It runs as a non-root user and has a health check on `/health`.
- **`Dockerfile.web`**: builds Next.js in "standalone" mode (a self-contained server with only the files it needs) and runs it on port 3000. The `NEXT_PUBLIC_*` values are **build arguments**, because Next.js bakes them into the JavaScript at build time.

### What you need before starting

1. **A VPS**: Ubuntu 24.04 LTS, at least 2 vCPU, 4 GB RAM, 40 GB disk. Building Next.js needs RAM; with 2 GB, builds can fail.
2. **A domain name**, for example `yourshop.com.bd`.
3. **A Cloudflare account** (free plan), with the domain's nameservers pointed to Cloudflare.
4. **The GitHub repo** (Dokploy pulls code from it).
5. **A Mailgun account** with your domain verified (for real emails). UddoktaPay and Steadfast credentials come later (Phases 7 and 8).

### Step 1: Prepare the server

SSH into the VPS as root (your provider gives you the IP and password or key):

```bash
ssh root@YOUR_SERVER_IP

# update the system
apt update && apt upgrade -y

# basic firewall: allow SSH, HTTP, HTTPS only
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
```

Use SSH keys instead of passwords, and later turn off password login (`design.md` section 12 has the full hardening list: fail2ban, automatic security updates).

Important: Dokploy's own dashboard runs on port **3000**. Open it temporarily for setup (`ufw allow 3000`), and close it again (`ufw delete allow 3000`) once the dashboard has its own domain with HTTPS (step 2).

### Step 2: Install Dokploy

Follow the official instructions at https://docs.dokploy.com (check them, because the command may change). At the time of writing it is one command:

```bash
curl -sSL https://dokploy.com/install.sh | sh
```

It installs Docker and starts Dokploy. Then open `http://YOUR_SERVER_IP:3000`, and create the admin account. Use a strong password: this dashboard controls everything.

In Dokploy's settings, give the dashboard its own domain (for example `panel.yourshop.com.bd`) with HTTPS, then close port 3000 in the firewall.

### Step 3: DNS in Cloudflare

In Cloudflare > DNS, add `A` records pointing to the server IP:

| Name                  | Points to | Used by                           |
| --------------------- | --------- | --------------------------------- |
| `@` (yourshop.com.bd) | server IP | web                               |
| `www`                 | server IP | web (redirect to the bare domain) |
| `api`                 | server IP | api                               |
| `panel`               | server IP | Dokploy dashboard                 |

Proxy status (the orange cloud) **on** for `@`, `www` and `api`. Set SSL/TLS mode to **Full (strict)**. Because the shop uses `cf-connecting-ip` for the customer's real IP, the server must accept web traffic **only from Cloudflare** (restrict ports 80 and 443 to Cloudflare's IP ranges, or use a Cloudflare Tunnel). See `auth.md` section 6. Do this before launch.

### Step 4: Create the project and databases

In the Dokploy dashboard:

1. **Create a project** called `production` (and later `staging`, if you want a test copy).
2. Inside it, **create a database > PostgreSQL**. Choose version 17, and let Dokploy generate a strong password. Do **not** expose it publicly. Note its **internal connection URL**; it looks like `postgresql://user:pass@<service-name>:5432/db`.
3. **Create a database > Redis**. Version 7, not exposed. Note its internal URL (`redis://...`).

"Internal" means only the other containers in the project can reach them, by service name. Nothing on the internet can.

### Step 5: Create the api application

1. **Create an application** called `api`.
2. **Source:** connect GitHub, choose the repo, branch `main`.
3. **Build type:** Dockerfile. **Dockerfile path:** `docker/Dockerfile.api`. **Build context:** the repo root (`.`).
4. **Environment variables:** every variable from `docs/design.md` section 14 that the API uses, with production values. Most importantly:
   ```
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=<internal Postgres URL from step 4>
   REDIS_URL=<internal Redis URL from step 4>
   APP_URL=https://yourshop.com.bd
   API_URL=https://api.yourshop.com.bd
   CORS_ORIGINS=https://yourshop.com.bd
   BETTER_AUTH_SECRET=<new random value, never the dev one>
   BETTER_AUTH_URL=https://yourshop.com.bd
   MAIL_PROVIDER=mailgun
   MAIL_FROM=...
   MAILGUN_API_KEY=...  MAILGUN_DOMAIN=...  MAILGUN_BASE_URL=...
   UPLOAD_DIR=/data/uploads
   PUBLIC_MEDIA_URL=https://api.yourshop.com.bd/media
   REVALIDATE_SECRET=<random, same as in web>
   RUN_MIGRATIONS=true
   ```
5. **Volume (mount):** a persistent volume mounted at `/data/uploads`. Without it, every uploaded product image is lost on the next deploy.
6. **Domain:** `api.yourshop.com.bd`, container port `4000`, HTTPS on.
7. **Deploy.** Watch the build logs. When it finishes, `https://api.yourshop.com.bd/health` should answer.

### Step 6: Create the web application

1. **Create an application** called `web`, same repo and branch.
2. **Dockerfile path:** `docker/Dockerfile.web`. **Build context:** repo root.
3. **Build arguments** (build-time variables; they are baked into the browser code):
   ```
   NEXT_PUBLIC_SITE_URL=https://yourshop.com.bd
   NEXT_PUBLIC_API_URL=https://api.yourshop.com.bd
   ```
4. **Environment variables** (runtime):
   ```
   API_INTERNAL_URL=http://<api service name>:4000
   REVALIDATE_SECRET=<same value as in api>
   ```
   `API_INTERNAL_URL` uses the **internal** address, so the web server talks to the API inside the server without going out to the internet and back.
5. **Domain:** `yourshop.com.bd` (and `www`), container port `3000`, HTTPS on.
6. **Deploy.**

Then add a **worker** application the same way: same repo, same `docker/Dockerfile.api`, the same environment variables as `api`, but with the **command overridden to `node dist/worker.js`**, no domain, no volume needed yet, and `RUN_MIGRATIONS` not set (only the api runs migrations). Without the worker, no emails are sent: they wait in the queue, and each attempt is recorded in `notification_logs`.

### Step 7: Seed and create the Super Admin

The first deploy creates the tables (migrations run on start). The default data (roles, zones, settings) and the real Super Admin account still need to be created once. Open the **api** application's terminal in Dokploy (it opens a shell inside the running container) and run:

```sh
# 1. Default data: permissions, roles, payment methods, zones, settings. Safe to run again.
node dist/seed.js

# 2. The Super Admin. `read -s` asks for the password without showing it or saving it in the history.
read -s SUPER_ADMIN_PASSWORD && export SUPER_ADMIN_PASSWORD
SUPER_ADMIN_EMAIL=owner@yourshop.com.bd SUPER_ADMIN_NAME="Store Owner" node dist/create-super-admin.js
unset SUPER_ADMIN_PASSWORD
```

The password needs at least 12 characters. Running the command again with the same email changes nothing (it never resets a password). The seed never creates an admin in production; `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` are for your machine only. After the first login, turn on two-factor authentication for this account.

### Step 8: Auto-deploy and backups

- **Auto-deploy:** turn on auto-deploy (GitHub webhook) for `api` and `web`. Every push to `main` then rebuilds and redeploys. CI (`.github/workflows`) runs lint, typecheck, tests and build on every push, so keep `main` green.
- **Backups:** in the Postgres service, schedule daily backups to S3-compatible storage (Cloudflare R2 or Backblaze B2): keep 7 daily and 4 weekly. Back up the uploads volume too. **Test a restore** before launch; a backup you have never restored is a guess.

### Go-live checklist (short version)

Phases 11 and 12 of `development-plan.md` have the full list. In short:

- [ ] All env vars set with production values; secrets different from dev
- [ ] HTTPS works on the shop and the API domains; Cloudflare SSL is Full (strict)
- [ ] Ports 80 and 443 accept only Cloudflare; Postgres and Redis are not public
- [ ] Uploads volume mounted; backups scheduled and one restore tested
- [ ] Super Admin created with strong credentials and 2FA on
- [ ] Real delivery charges, store name, logo and contact details set in admin
- [ ] Return policy and legal pages entered
- [ ] One real COD order and one real online payment tested end to end

---

## 9. After launch: deploys, migrations, backups

**Deploying a change:** commit, push to `main`, and Dokploy rebuilds. The api container runs any new migrations before it starts. If a build fails, the old container keeps running, so the site stays up. Read the build log in Dokploy.

**Rolling back:** redeploy an earlier deployment from the Dokploy history, or `git revert` the bad commit and push. A migration is not undone by redeploying old code. That is why destructive schema changes are done in two steps (`database.md` section 7).

**Logs:** each application has a Logs tab in Dokploy. Start there when something breaks.

**Staging (optional):** a second Dokploy project, `staging`, built from a `develop` branch, with its own database and test credentials. Try changes there before they reach real customers.
