# Reddit Pain Radar — Landing Page

Single-page marketing site for **Reddit Pain Radar**, a SaaS that scans Reddit
communities, scores pain signals by urgency and willingness to pay, and delivers
build-ready opportunity reports. The page has one job: convert visitors into
early-access signups at $29/month.

Built with **Next.js 16 (App Router)** and **Tailwind CSS v4**, and animated with
**motion** (`motion/react`). Effects are hand-built in `components/ui` (no external
UI registries).

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

Copy `.env.example` to `.env.local` and fill in as needed:

| Variable                          | Purpose                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` | CTA target. If unset, CTAs fall back to `#waitlist`.                           |
| `NEXT_PUBLIC_SITE_URL`            | Canonical origin for metadata/sitemap (default `https://redditpainradar.com`). |
| `DATABASE_URL`                    | PostgreSQL connection string used by Drizzle ORM (`db/`).                      |
| `DATABASE_ADMIN_URL`              | Optional privileged (RLS-bypassing) connection for signup + API-key lookup.    |
| `STRIPE_SECRET_KEY`               | Stripe API key used by the billing webhook.                                    |
| `STRIPE_WEBHOOK_SECRET`           | Signature secret for `POST /api/webhooks/stripe`.                              |
| `STRIPE_PRICE_STARTER` / `_PRO`   | Price ids mapped to plans; `_STARTER` powers `GET /api/checkout`.        |
| `RESEND_API_KEY`                  | Transactional email (welcome key). Unset → emails are logged, not sent.        |
| `EMAIL_FROM`                      | Optional Resend from-address (default `onboarding@resend.dev`).                |

## Scripts

```bash
npm run dev          # dev server (localhost:3000)
npm run build        # production build
npm run start        # serve the production build
npm run lint         # eslint
npm run typecheck    # tsc --noEmit
npm run format       # prettier --write .
npm run format:check
npm run db:generate  # generate SQL migrations from db/schema.ts
npm run db:migrate   # apply pending migrations
npm run db:push      # push schema directly (dev only)
npm run db:studio    # Drizzle Studio
npm run db:export:waitlist # waitlist -> CSV on stdout (`-- --out file.csv`)

# local database harness (Docker)
npm run db:up        # start Postgres on host port 5434 (two RLS roles)
npm run db:down      # stop it
npm run db:reset     # wipe -> migrate -> seed a fresh database
npm run db:seed      # seed one tenant + evidence; prints an API key
npm run api:smoke    # end-to-end v1 API smoke test (server must be running)
npm run stripe:smoke # end-to-end billing webhook test (server + secret must match)
```

Always run `npm run typecheck`, `npm run lint`, and `npm run build` before shipping.

## Backend API

JSON endpoints under `app/api/v1/**`, authenticated with `Authorization: Bearer <api-key>`.
An API key maps to an org; only its SHA-256 hash is stored.

| Method             | Route                      | Purpose                                          |
| ------------------ | -------------------------- | ------------------------------------------------ |
| `GET`              | `/api/v1/me`               | Org + plan limits (quota, usage) behind the key. |
| `GET` / `POST`     | `/api/v1/reports`          | List reports / generate one from stored signals. |
| `GET`              | `/api/v1/reports/:id`      | One report, including `markdown` + `json`.       |
| `GET` / `POST`     | `/api/v1/subreddits`       | List / track a subreddit.                        |
| `DELETE`           | `/api/v1/subreddits/:id`   | Stop tracking a subreddit.                       |
| `GET` / `POST`     | `/api/v1/keyword-sets`     | List / create a keyword set.                     |
| `PATCH` / `DELETE` | `/api/v1/keyword-sets/:id` | Replace keywords / delete the set.               |
| `GET` / `POST`     | `/api/v1/keys`             | List / mint a key (plaintext returned once).     |
| `DELETE`           | `/api/v1/keys/:id`         | Revoke a key.                                    |

`POST /api/v1/reports` accepts `{ subredditIds?, keywordSetId?, title? }`; when
`keywordSetId` is given, the evidence is restricted to signals matching that
set's keywords.

**Plan limits** (`lib/billing/limits.ts`) are enforced per calendar month
(UTC), counting non-failed reports: **trial 3** (14 days from signup, then
effectively 0 until checkout), **starter 50**, **pro 500**. Over-quota
requests get `402 { error: { code: "plan_limit_reached" } }` (or
`trial_expired`); `GET /api/v1/me` and every successful `POST /api/v1/reports`
carry `reportQuota` / `reportsUsedThisMonth`, and `/me` also returns
`effectivePlan` (trial expiry folded in).

Report generation is synchronous: `lib/reports/service.ts` validates that the
requested subreddits and keyword set belong to the org, reads the shared
`pain_signals` for those subreddits (optionally narrowed by keyword — matched
case-insensitively against the post title/body and the quote), ranks them into
themes (`lib/reports/generate.ts`), and stores the markdown + JSON on the report
row.

### Self-serve checkout

All landing CTAs are plain links to **`GET /api/checkout`**, which redirects
into Stripe's hosted subscription Checkout when `STRIPE_SECRET_KEY` and
`STRIPE_PRICE_STARTER` are set (with `metadata.plan = "starter"`, feeding the
provisioning webhook below). Unconfigured installs — or a Stripe error —
degrade to `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`, then the on-page `#waitlist`,
so a partially-configured deploy never shows a dead CTA. The endpoint is
rate-limited per IP (10/min, in-memory). Success returns to
`/?checkout=success`, where a dismissible banner
(`components/sections/checkout-success.tsx`) confirms the API key email is
on its way; cancel returns to `#pricing`.

### Billing webhook

`POST /api/webhooks/stripe` (unauthenticated — authenticity comes from the
`Stripe-Signature` header verified with `STRIPE_WEBHOOK_SECRET`) turns a
Stripe checkout into a live account:

- `checkout.session.completed` — creates the org + owner, records the Stripe
  customer, mints the first API key, and emails it via Resend (logged to the
  server console when `RESEND_API_KEY` is unset). Redeliveries never mint a
  second key.
- `customer.subscription.updated` — syncs `orgs.plan`; non-active/unpaid
  subscriptions fall back to `trial`.
- `customer.subscription.deleted` — downgrades the org to `trial`.
- `invoice.payment_failed` — audit log only (downgrades ride in on the
  subscription event above).

Every accepted event is recorded in `stripe_events` (unique
`stripe_event_id`) for audit. `npm run stripe:smoke` exercises the whole
flow offline by signing synthetic events.

## Database

The data layer lives in `db/` and uses **Drizzle ORM v1 (RC)** with
**node-postgres**.

- `db/schema.ts` — eleven tables (`users`, `orgs`, `memberships`, `subreddits`,
  `keyword_sets`, `raw_posts`, `pain_signals`, `reports`, `api_keys`,
  `stripe_events`, `waitlist`), enums, indexes, relations, and the
  `tenant_isolation` RLS policies.
- `db/index.ts` — pooled `pg` client wrapped by `drizzle()` (+ relations).
- `db/tenant.ts` — `withTenant(orgId, fn)` runs a transaction with
  `app.current_org_id` set so Postgres RLS restricts every org-scoped query.
- `db/admin.ts` — privileged (RLS-bypassing) client for signup provisioning and
  API-key → org lookup, via `DATABASE_ADMIN_URL`.
- `db/queries.ts` — the DAL (subreddits, keyword sets, reports, API keys, and the
  shared-evidence reader `fetchSignalsForReport` used by report generation).
- `pain_signals` carries a unique dedupe index on
  `(raw_post_id, theme, md5(verbatim_quote))`, so the Python extractor can be
  re-run without creating duplicate signals.

Migrations are committed under `drizzle/`. Generate after schema changes, then
apply:

```bash
npm run db:generate
npm run db:migrate
```

### Local database harness

`docker-compose.yml` + `db/init/01-roles.sql` provision a disposable Postgres
with **two roles**, so row-level security is exercised for real:

- `rpr_owner` — owns the database and tables; migrations run as this role
  (`DATABASE_ADMIN_URL`) and owners bypass RLS.
- `rpr_app` — the runtime role (`DATABASE_URL`); a non-owner, so the
  `tenant_isolation` policies actually apply.

```bash
npm run db:up      # Postgres on host port 5434 (5432/5433 may be other projects)
npm run db:reset   # wipe -> migrate -> seed (fresh tenant + evidence)
npm run dev        # start the app (PORT=3100 if 3000 is taken)
npm run api:smoke  # 30+ assertions across every v1 route
```

`drizzle-kit` prefers `DATABASE_ADMIN_URL` so the migrator can create the
`drizzle` schema and the owner-scoped policies; the app talks to `DATABASE_URL`
as the non-owner role. `db:seed` writes its API key to `.seed/api-key`
(gitignored), which `npm run api:smoke` reads.

## Deploy

Deploy on Vercel, then set the environment variables above in the project dashboard.

```bash
vercel --prod
```

## Project Structure

```
app/
  layout.tsx             fonts, metadata, MotionProvider, dark-only shell
  page.tsx               composes all sections + SoftwareApplication JSON-LD
  globals.css            Tailwind v4 @theme tokens + keyframes
  opengraph-image.tsx    generated OG image (ImageResponse)
  icon.svg               favicon
  sitemap.ts             /sitemap.xml
  robots.ts              /robots.txt
  api/v1/                JSON backend (route handlers), API-key authed
components/
  sections/              one file per page section (kebab-case)
    announcement-bar.tsx  navbar.tsx        hero.tsx
    social-proof.tsx      how-it-works.tsx  features.tsx
    demo-report.tsx       testimonials.tsx  pricing.tsx
    faq.tsx               final-cta.tsx     footer.tsx
  ui/                    shadcn primitives + hand-built effect components
    button.tsx input.tsx accordion.tsx
    spotlight.tsx aurora-background.tsx bento-grid.tsx
    animated-testimonials.tsx marquee.tsx
    reveal.tsx count-up.tsx section.tsx
  providers/
    motion-provider.tsx  global reduced-motion config
lib/
  motion.ts              shared animation variants
  copy.ts                all marketing copy
  site.ts                site config, nav links, Stripe env
  utils.ts               cn re-export
  rate-limit.ts          in-memory fixed-window limiter
  actions/waitlist.ts    joinWaitlist() server action
  api/                   v1 API helpers (http, auth, validate)
  auth/api-key.ts        API key generate/hash helpers
  reports/               report generator (pure) + runReport service
db/
  schema.ts              tables, enums, relations, RLS policies, inferred types
  index.ts               pooled pg client + drizzle() instance
  tenant.ts              withTenant() RLS-scoped transaction helper
  admin.ts               privileged (RLS-bypassing) drizzle instance
  queries.ts             data-access layer
scripts/
  export-waitlist.ts     waitlist -> CSV export
  db-seed.ts             seed the local harness (tenant + evidence + API key)
  api-smoke.ts           end-to-end v1 API smoke test
db/init/01-roles.sql     harness roles (rpr_owner / rpr_app)
docker-compose.yml       local Postgres with RLS roles
drizzle/                 generated SQL migrations (committed)
drizzle.config.ts        drizzle-kit config
reddit-pain-radar-worker/  standalone Python worker (separate uv project)
  src/radar/             fetch -> extract -> score -> cluster -> report
  tests/                 pytest suite (no DB or network needed)
```

## Worker

`reddit-pain-radar-worker/` is a self-contained Python project that ingests
Reddit evidence into **its own database** (Alembic-managed; its schema shares
table names with the app's Drizzle schema but not columns, so the two
databases must stay separate) and can generate its own scored reports. It has
no web server and is not imported by the Next.js app.

```bash
cd reddit-pain-radar-worker
uv sync                       # install dependencies
uv run pytest                 # tests — must pass before any change ships
uv run alembic upgrade head   # create tables (its own DATABASE_URL)
uv run radar run              # full pipeline once: fetch -> extract -> score -> report
uv run radar schedule         # APScheduler loop (default: cron 0 6 * * *)
```

### Feeding the app (worker → app evidence bridge)

Customer-facing reports are generated by the **app** from `raw_posts` /
`pain_signals` in the app database. Evidence crosses from the worker to the
app through a versioned JSONL file (`rpr-evidence/v1`) — never a shared
database connection:

```bash
cd reddit-pain-radar-worker
uv run radar export --out ../data/evidence.jsonl  # posts + scored signals
cd ..
npm run db:ingest -- data/evidence.jsonl          # idempotent upsert into the app DB
```

The export drops signals without an LLM theme ("not a pain point"), the
import refreshes posts by `reddit_id` while keeping row UUIDs stable, and
re-running either side is a no-op — so a nightly cron can run
fetch → export → ingest without dedupe bookkeeping.
`uv run python scripts/seed_evidence.py` seeds the worker database with
realistic sample evidence (no Reddit/DeepSeek keys) to exercise the whole
bridge locally.

For a single scheduled command, the orchestrator runs all three stages:

```bash
npm run evidence:sync                    # fetch -> export -> ingest (cron entry point)
npm run evidence:sync -- --skip-fetch    # export + ingest only (bash/cmd)
# PowerShell: $env:EVIDENCE_SKIP_FETCH = "1"; npm run evidence:sync
```

A failed fetch only warns (so export+ingest still move what the worker DB
already holds); export/ingest failures exit non-zero for cron to notice.
The orchestrator strips the app's `DATABASE_URL` from the worker's
environment — the worker always resolves its own from
`reddit-pain-radar-worker/.env`, and the two must never cross.

```cron
0 6 * * * cd /path/to/reddit-pain-radar && npm run evidence:sync
```

Note: `npm run db:reset` recreates the whole Postgres volume, **worker
database included** — after a reset, restore it with
`uv run alembic upgrade head` + `uv run python scripts/seed_evidence.py`
(or a real `uv run radar fetch`).

See `reddit-pain-radar-worker/README.md` for the full pipeline description and
`reddit-pain-radar-worker/AGENTS.md` for the conventions that govern it. The
older `workers/` scripts remain as a simpler, script-style ingestion path.

## Design Notes

- **Dark only.** No light mode, no theme toggle, no `dark:` variants.
- **Design tokens** live in `app/globals.css` under `@theme` and are used as
  Tailwind utilities (`bg-canvas`, `text-ink`, `border-line`, `text-brand`, ...).
- **Copy** is centralized in `lib/copy.ts`; edit there, not in the section files.
- **Reduced motion** is handled by `MotionProvider` (`MotionConfig reducedMotion="user"`).
  Never branch on `useReducedMotion()` during render.

See `AGENTS.md` for the full conventions and verification checklist.
