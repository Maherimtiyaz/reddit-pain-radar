# PainProof

**Problems worth building, with proof.** PainProof helps first-time founders
and indie hackers find, and check, product ideas using real public evidence
from Hacker News and GitHub. Every quote is verbatim and linked to its source.

| Product              | What it is                                                               | Where                                                    |
| -------------------- | ------------------------------------------------------------------------ | -------------------------------------------------------- |
| **PainProof Weekly** | Free newsletter: 5–7 real pains of the week, each with linked proof      | Drafted by `npm run weekly:draft`, archived at `/weekly` |
| **Check My Idea**    | $9 report: verdict, PainProof Score, quotes, competitors, a 48-hour test | `/check`                                                 |
| **PainProof Pro**    | $19/month: 30 checks a month, report history, niche-watch alerts         | `/dashboard`                                             |

The business plan, validation kit, newsletter playbook and sample reports are
in [`painproof/`](painproof/README.md).

Built with Next.js 16 (App Router, Cache Components), Tailwind CSS v4,
`motion`, Drizzle ORM (Postgres with row-level security), Auth.js magic links,
Stripe and Resend. Conventions for contributors and agents: [AGENTS.md](AGENTS.md).

## Getting started

```bash
npm install
npm run dev            # http://localhost:3000
```

The landing page works with no configuration. For the database-backed parts,
copy `.env.example` to `.env`, then:

```bash
npm run db:up          # Docker Postgres on :5434 with an owner + an app role (RLS enforced)
npm run db:reset       # migrate + seed a Pro workspace, an API key and a sample check
PORT=3100 npm run dev  # matches AUTH_URL=http://localhost:3100 for sign-in
```

Sign in at `/login` with `founder@painproof.test`. Without `RESEND_API_KEY`, the
dev server log prints the magic link.

To run real checks, set `DEEPSEEK_API_KEY` (or `LLM_API_KEY` + `LLM_BASE_URL` +
`LLM_MODEL` for any OpenAI-compatible provider):

```bash
npm run check:idea -- "Invoice reminders for freelance designers"   # prints the report
npm run evidence:smoke -- "invoice reminders"                       # are HN/GitHub reachable?
```

## How it works

**Evidence** (`lib/evidence/`): Hacker News (Algolia search API) and GitHub
issue search, fetched at request time, validated field by field, and
normalized into one `Evidence` shape. PainProof never scrapes, and its
software never collects from Reddit, X or LinkedIn.

**Check My Idea** (`lib/check/`):

```
idea → LLM plans short queries → collect HN comments, Show HN launches, GitHub issues
     → LLM scores demand / willingness to pay / openness / ease, citing numbered items only
     → our code keeps only verbatim quotes from items it marked relevant
     → our code computes the score: (D×0.30 + W×0.30 + O×0.25 + E×0.15)×10
       75+ build · 55–74 niche down · <55 skip · thin evidence → "not enough evidence"
```

**Buying a check:** `/check` → $9 Stripe Checkout (promotion codes allowed, so
you can hand out 100%-off codes) → the webhook queues the check exactly once →
it runs after the webhook responds → the private link `/check/[id]?t=…` is
emailed. Stuck runs restart when the report is opened or via `npm run
check:resume`.

**PainProof Weekly** (`lib/weekly/`): every Monday the cron collects the past
week's pain-phrase HN comments, busy Ask HN threads and most-upvoted GitHub
feature requests. The model picks 5–7 pains, every quote is verified, and a
draft is saved and emailed to `WEEKLY_EDITOR_EMAIL`. You review it, paste the
markdown into Beehiiv or Kit (they send it), then:

```bash
npm run weekly:publish -- 2026-11-16            # publish to /weekly/2026-11-16
npm run weekly:publish -- 2026-11-16 --drop 3,5 # drop pains 3 and 5 first
```

**PainProof Pro** (`/dashboard`): run checks (30 per UTC month; failed runs
don't count), see every report, watch up to 5 topics (a model-free Monday
digest of new pain quotes, `npm run watch:digest`) and manage billing in
Stripe's customer portal. Canceled subscriptions pause features but keep
reports.

**API** (`/api/v1`, `Authorization: Bearer <key>`): `GET /me`,
`POST /checks` `{ idea }` → 202, `GET /checks`, `GET /checks/:id` (result +
markdown when complete), `GET|POST /keys`, `DELETE /keys/:id`.

## Scripts

```bash
npm run dev | build | start
npm run typecheck | test | lint | format | format:check

npm run check:idea -- "idea" [--save] [--json]   # run a check from the terminal
npm run check:resume                              # restart stuck paid checks
npm run weekly:draft                              # draft this week's issue (DB + LLM)
npm run weekly:publish -- <slug> [--drop n,m]     # publish a draft to /weekly
npm run watch:digest                              # email Pro niche-watch digests
npm run evidence:smoke -- "topic"                 # live source check

npm run db:up | db:down | db:reset | db:seed      # local Postgres harness
npm run db:generate | db:migrate | db:studio      # schema → migrations
npm run db:export:waitlist -- --out subscribers.csv  # newsletter signups → CSV

npm run api:smoke     # v1 API end to end (server running, after db:reset)
npm run stripe:smoke  # Stripe webhook end to end (server and script share STRIPE_WEBHOOK_SECRET)
```

CI (`.github/workflows/ci.yml`) runs typecheck, tests, lint, format check and
build on every pull request. Unit tests use Node's built-in runner through
`tsx` and never touch the network.

## Deploy (Vercel)

### 1. Database (RLS needs two roles)

Hosted Postgres (Neon, Supabase, RDS) must let you create a **non-owner** app
role. Table owners bypass row-level security, so the runtime must not use the
migration role.

```sql
-- run as the database owner
create role rpr_app login password '<strong-password>';
grant usage on schema public to rpr_app;
```

Migrate on each release, then grant the app role access to any new tables:

```bash
DATABASE_ADMIN_URL="postgres://owner:<pw>@<host>/<db>?sslmode=require" npm run db:migrate
psql "postgres://owner:<pw>@<host>/<db>" -c \
  "grant select, insert, update, delete on all tables in schema public to rpr_app;"
```

> **Upgrading from Reddit Pain Radar:** the `DROP_reddit_pipeline_tables`
> migration permanently drops `subreddits`, `keyword_sets`, `raw_posts`,
> `pain_signals` and `reports`. Back them up first if you want that data
> (the command is in the migration file).

### 2. Environment variables

| Variable                                      | Required       | Notes                                                                            |
| --------------------------------------------- | -------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                                | yes            | `rpr_app` role, `?sslmode=require` (Neon: the `-pooler` host)                    |
| `DATABASE_ADMIN_URL`                          | yes            | Owner role: provisioning, API-key lookup, digests                                |
| `AUTH_SECRET`                                 | yes            | `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |
| `AUTH_URL`                                    | recommended    | `https://<domain>`                                                               |
| `NEXT_PUBLIC_SITE_URL`                        | yes            | Canonical origin for metadata, sitemap and email links                           |
| `DEEPSEEK_API_KEY`                            | yes            | Or `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL`                                  |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` | yes            |                                                                                  |
| `STRIPE_PRICE_CHECK`                          | to sell checks | One-time $9 price                                                                |
| `STRIPE_PRICE_PRO`                            | to sell Pro    | Recurring $19/month price                                                        |
| `RESEND_API_KEY` / `EMAIL_FROM`               | yes            | Verified sending domain, e.g. `PainProof <hello@painproof.co>`                   |
| `WEEKLY_EDITOR_EMAIL`                         | for the cron   | Where weekly drafts go                                                           |
| `GITHUB_TOKEN`                                | optional       | Higher GitHub search limits                                                      |

Pages that sell something read these at build time: **redeploy after
changing Stripe prices or the LLM key.** Without them the site shows
"launching soon" instead of taking money it can't deliver on.

### 3. Stripe

1. Product **Check My Idea**: $9 one-time price → `STRIPE_PRICE_CHECK`.
2. Product **PainProof Pro**: $19/month recurring price → `STRIPE_PRICE_PRO`.
3. Settings → Billing → **Customer portal**: turn it on (cancel, card, invoices).
4. Optional: a 100%-off coupon and promotion code for early testers.
5. Webhook endpoint `https://<domain>/api/webhooks/stripe`, events
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
   `customer.subscription.updated`, `customer.subscription.deleted`,
   `invoice.payment_failed`. Copy its signing secret to `STRIPE_WEBHOOK_SECRET`.

The webhook route has `maxDuration = 300` because paid checks run after it
responds. Vercel plans cap function duration.

### 4. Email

Verify your sending domain in Resend, then set `RESEND_API_KEY` and
`EMAIL_FROM`. Newsletter **sending** happens in Beehiiv or Kit. Export
signups with `npm run db:export:waitlist`.

### 5. Scheduled jobs

`.github/workflows/painproof-cron.yml` runs on the default branch:

- Mondays 06:17 UTC: `weekly:draft`, then `watch:digest`.
- Hourly: `check:resume`.

Repository **secrets**: `APP_DATABASE_URL`, `APP_DATABASE_ADMIN_URL`,
`DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `WEEKLY_EDITOR_EMAIL`,
`STRIPE_SECRET_KEY`. **Variables**: `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`,
`STRIPE_PRICE_CHECK`, and optionally `DEEPSEEK_BASE_URL` / `DEEPSEEK_MODEL`.

### 6. After the first deploy

```bash
curl -sI https://<domain> | grep -Ei "x-frame|referrer|strict-transport"
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/v1/me                 # 401
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://<domain>/api/checkout  # 302 to Stripe
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<domain>/api/webhooks/stripe   # 400
```

Then do each real flow once in Stripe test mode:

1. Buy a check with a 100%-off code. The report link should arrive by email.
2. Subscribe to Pro, sign in at `/login`, run a check, add a watch topic.
3. Run the cron workflow manually (`workflow_dispatch`) and read the draft email.

## Project structure

See the tree in [AGENTS.md → Project Structure](AGENTS.md#project-structure).
In short: `app/` (pages and route handlers), `components/` (landing sections,
report views, dashboard forms), `lib/` (evidence, LLM, check engine, weekly,
watch, billing, Stripe, email), `db/` (schema, clients, RLS tenant helper),
`scripts/` (CLI jobs and smoke tests), `tests/` (unit tests), `drizzle/`
(migrations), `painproof/` (business docs).

## Design notes

- **Dark only.** No light mode, no theme toggle, no `dark:` variants. Tokens
  live in `app/globals.css` under `@theme` (`bg-canvas`, `text-ink`, `border-line`, …).
- **Copy** is centralized in `lib/copy.ts`. Every claim must be true today or
  marked "soon": no invented testimonials, counts or scarcity.
- **Reduced motion** is handled globally by `MotionProvider`.
