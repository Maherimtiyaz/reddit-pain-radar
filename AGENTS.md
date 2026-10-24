<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Project Identity

Single-page landing page for **Reddit Pain Radar** — a SaaS that scans Reddit communities, scores pain signals by urgency and monetization potential, and delivers actionable product opportunity reports to solo founders, indie hackers, and product teams.

The page has one job: **convert visitors into early-access signups at $29/month**. Every section must earn its place. No filler.

## Tech Stack (as built)

- **Framework:** Next.js **16.4.0** (App Router, Turbopack) + TypeScript (strict). `cacheComponents` and `partialPrefetching` are enabled in `next.config.ts`.
- **React:** 19.3.0.
- **Styling:** Tailwind CSS v4 (CSS-first `@theme` in `app/globals.css`).
- **Animation:** `motion` (v14, imported from `motion/react`) — **not** `framer-motion`.
- **UI Components:** shadcn/ui CLI v4 (`radix-nova` style, `nova` preset, neutral base). Aceternity-style effects are **hand-built** in `components/ui` (no `@aceternity` registry).
- **Icons:** Lucide React. Note: brand icons (`Twitter`, `Github`, `Linkedin`) were removed from lucide — inline the SVGs (see `components/sections/footer.tsx`).
- **Fonts:** Geist Sans + Geist Mono via `next/font`.
- **Database:** Drizzle ORM **v1 (RC)** + `node-postgres` (`pg`), migrations via `drizzle-kit`. Postgres RLS for tenant isolation (see Database section).
- **Ingestion workers:** two independent Python paths. `workers/` holds legacy script-style ingestion (`requests` + `psycopg[binary]`), run directly with `python`. `reddit-pain-radar-worker/` is a standalone `uv` project (httpx, SQLAlchemy 2.0 + Alembic, DeepSeek via the OpenAI SDK, APScheduler) with its own CLI, schema, and `AGENTS.md`. Neither is wired into any npm script or the Next app (see Ingestion Workers section).
- **Deployment:** Vercel.

### Next 16 / shadcn v4 gotchas

- `next lint` was removed. The lint script is plain `eslint`.
- shadcn components import `cn` from the `"cn"` package, **not** `@/lib/utils`. `lib/utils.ts` just re-exports: `export { cn } from "cn"`.
- Read version-matched docs from `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Default shadcn button sizes are small (`default` = `h-8`). Landing CTAs must be touch-friendly: pass `className="h-12 ..."`.

## Build & Development Commands

```bash
npm install         # install dependencies
npm run dev         # dev server (localhost:3000)
npm run start        # serve the production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier --write .
npm run format:check
npm run build       # production build
npm run db:generate # generate SQL migrations from db/schema.ts
npm run db:migrate  # apply pending migrations
npm run db:push     # push schema directly (dev only)
npm run db:studio   # Drizzle Studio
npm run db:export:waitlist # landing waitlist -> CSV on stdout (append `-- --out file.csv`)
npm run evidence:sync     # cron entry point: radar fetch -> export -> db:ingest

# local database harness (Docker Postgres on host port 5434, two RLS roles)
npm run db:up       # start Postgres
npm run db:down     # stop it
npm run db:reset    # wipe -> migrate -> seed a fresh database
npm run db:seed     # seed one tenant + evidence; prints an API key
npm run api:smoke   # end-to-end v1 API smoke test (server must be running)
npm run stripe:smoke # end-to-end billing webhook test (server must run with the same secret)

vercel --prod       # deploy (out of scope unless asked)
```

**There is no test suite and no CI** (no `npm test`, no `.github/`, no pre-commit hooks). `typecheck` + `lint` + `build` are the only automated checks. `scripts/api-smoke.ts` (`npm run api:smoke`) is a manual end-to-end check of the v1 API; it needs `npm run db:reset` and a running server.

**Always run `npm run typecheck` and `npm run lint` (then `npm run build`) before declaring a task complete.**

To verify a single component in isolation, run `npm run dev` and check `localhost:3000`; there is no per-file test or typecheck shortcut.

### Python ingestion workers

Not wrapped by npm. Install deps into a virtualenv (`.venv/` is gitignored) and run from the repo root. Requires the Reddit/DeepSeek env vars below.

```bash
pip install -r workers/requirements.txt
python workers/reddit_client.py fetch saas --limit 100 --timeframe week
python workers/reddit_client.py search "too expensive" SaaS --limit 50
python workers/pain_extractor.py data/raw/<file>.json --json-out out.json --db-url "$DATABASE_URL"
```

## Project Structure

```
/app
  layout.tsx             # fonts, metadata, MotionProvider, dark-only shell
  page.tsx               # composes all sections + SoftwareApplication JSON-LD
  globals.css            # Tailwind v4 @theme tokens + keyframes
  opengraph-image.tsx    # ImageResponse OG image (no binary asset)
  icon.svg               # favicon
  sitemap.ts             # /sitemap.xml
  robots.ts              # /robots.txt
  /api/v1                # JSON backend (route handlers), API-key authed
    me/route.ts          # GET org behind the key
    reports/route.ts     # GET list · POST generate
    reports/[id]/route.ts# GET one report (markdown + JSON)
    subreddits/route.ts  # GET list · POST track
    subreddits/[id]/route.ts # DELETE untrack
    keyword-sets/route.ts# GET list · POST create
    keyword-sets/[id]/route.ts # PATCH keywords · DELETE
    keys/route.ts        # GET list · POST mint (plaintext returned once)
    keys/[id]/route.ts   # DELETE revoke
  /api/webhooks
    stripe/route.ts      # POST billing webhook (Stripe-Signature verified, no API key)
/components
  /sections              # one file per section (kebab-case)
    announcement-bar.tsx  navbar.tsx        hero.tsx
    social-proof.tsx      how-it-works.tsx  features.tsx
    demo-report.tsx       testimonials.tsx  pricing.tsx
    faq.tsx               final-cta.tsx     footer.tsx
  /ui                    # shadcn primitives + hand-built effects
    button.tsx input.tsx accordion.tsx
    spotlight.tsx aurora-background.tsx bento-grid.tsx
    animated-testimonials.tsx marquee.tsx
    reveal.tsx count-up.tsx section.tsx
  /providers
    motion-provider.tsx  # MotionConfig reducedMotion="user"
/lib
  motion.ts              # shared variants (fadeUp, stagger*, scaleIn, ...)
  copy.ts                # all marketing copy
  site.ts                # site config, nav links, Stripe env
  utils.ts               # cn re-export
  rate-limit.ts          # in-memory fixed-window limiter (best-effort)
  /actions
    waitlist.ts          # "use server" — joinWaitlist() email capture (+throttle, source)
  /api                   # helpers for the v1 route handlers
    http.ts              # json() / apiError() / unauthorized()
    auth.ts              # authenticate(req) -> { orgId, keyId } from a Bearer key
    validate.ts          # dependency-free body parsers (reports, subreddits, keys)
  /auth
    api-key.ts           # generateApiKey() / hashApiKey() / safeEqualHex()
  /billing
    limits.ts            # plan quotas + trial expiry: effectivePlan()/reportQuota()/startOfUtcMonth()
  /email
    welcome.ts           # Resend welcome email (logged to console when RESEND_API_KEY unset)
  /reports
    generate.ts          # pure: pain signals -> ranked themes + markdown
    service.ts           # runReport(orgId, input): load signals, generate, persist
  /stripe
    client.ts            # lazy Stripe SDK instance + isStripeConfigured()
    webhook.ts           # checkout -> provision org/key/email; subscription events -> plan sync
/db
  schema.ts              # 11 tables, enums, relations, RLS policies, inferred types
  index.ts               # pooled pg client + drizzle() (relations wired)
  tenant.ts              # withTenant(orgId, fn) — RLS-scoped transaction
  admin.ts               # privileged client (DATABASE_ADMIN_URL), bypasses RLS
  queries.ts             # DAL: subreddits/keyword sets/reports/api keys + provisioning
/scripts
  export-waitlist.ts     # `npm run db:export:waitlist` — CSV export (no admin route)
  db-seed.ts             # `npm run db:seed` — tenant + evidence + API key for the harness
  ingest-evidence.ts     # `npm run db:ingest` — worker JSONL -> raw_posts/pain_signals
  sync-evidence.ts       # `npm run evidence:sync` — cron entry point: fetch -> export -> ingest
  /lib
    evidence.ts          # shared rpr-evidence/v1 parse + idempotent import (both scripts use it)
  api-smoke.ts           # `npm run api:smoke` — end-to-end v1 API assertions
  stripe-webhook-smoke.ts # `npm run stripe:smoke` — billing webhook assertions (signed synthetic events)
/db/init
  01-roles.sql           # harness roles: rpr_owner (owner) + rpr_app (non-owner)
docker-compose.yml       # local Postgres 16 on :5434, roles wired so RLS applies
/workers                 # legacy script-style Python ingestion pipeline (no npm wiring)
  reddit_client.py       # app-only OAuth client: fetch/search + raw JSON to data/raw
  pain_extractor.py      # regex filter -> DeepSeek -> raw_posts/pain_signals
  requirements.txt       # requests, psycopg[binary]
/reddit-pain-radar-worker  # standalone Python worker (separate uv project; own rules)
  src/radar/             # fetch -> extract -> score -> cluster -> report
  tests/                 # pytest suite (no DB or network needed)
/public                  # empty — OG image is generated, favicon is app/icon.svg
/data                    # gitignored; raw payloads (data/raw) + exported evidence (evidence.jsonl)
/drizzle                 # generated SQL migrations (committed)
drizzle.config.ts        # drizzle-kit config (dialect postgresql, schema/out)
```

`reddit-pain-radar-worker/` is a **self-contained Python project** with its own
`AGENTS.md`; the repo-root rules below do **not** apply to those files. The
Next.js app and the worker never import each other, and each owns its own
schema (Drizzle here, Alembic there).

**Rules:** each section lives in its own file under `/components/sections/`; `app/page.tsx` only imports and arranges sections.

## Database (Drizzle ORM v1 RC + node-postgres)

- **Single schema file:** `db/schema.ts` (`drizzle.config.ts` points at it). All column names are written **explicitly in `snake_case`** with camelCase JS keys — drizzle-kit v1 has no top-level `casing` option, so do not rely on it.
- **11 tables:** `users`, `orgs`, `memberships`, `subreddits`, `keyword_sets`, `raw_posts`, `pain_signals`, `reports`, `api_keys`, `stripe_events`, `waitlist`. Enums: `role` (`owner|admin|member`), `plan` (`trial|starter|pro`), `report_status` (`queued|running|complete|failed`).
- **PKs:** `uuid().defaultRandom()`. Scores are `real`. `reports.subreddit_ids` is `uuid[]`. `keyword_sets.keywords` is `jsonb string[]`.
- **Dedupe:** `pain_signals` has a unique index on `(raw_post_id, theme, md5(verbatim_quote))` so re-running extraction never duplicates signals (the quote is hashed to stay within the btree index-tuple limit).
- **Tenant isolation (defense in depth):** app-layer DAL **plus** Postgres RLS. `orgs`, `memberships`, `subreddits`, `keyword_sets`, `reports`, `api_keys` are declared with `pgTable.withRLS(...)` and carry a `tenant_isolation` policy (`USING`/`WITH CHECK` on `org_id`, or `id` for `orgs`, matching `current_setting('app.current_org_id')`). `raw_posts`/`pain_signals` are **global shared evidence — intentionally not org-scoped**.
- **Querying:** use `db` (`db/index.ts`) for global tables; use `withTenant(orgId, fn)` (`db/tenant.ts`) for anything org-scoped so `app.current_org_id` is set transaction-locally (safe with the shared pool).
- **DAL:** all data access goes through `db/queries.ts` (subreddits, keyword sets incl. `getKeywordSet`, reports, API keys, plus `fetchSignalsForReport`). Org-scoped functions wrap `withTenant`; global evidence reads use `db`. `fetchSignalsForReport({ subreddits, keywords? })` filters by subreddit names and, when keywords are given, case-insensitively matches them against the post `title`/`body` and the signal `verbatim_quote` (LIKE wildcards in keywords are escaped).
- `waitlist` (early-access emails) is global too. The landing form calls `joinWaitlist` (`lib/actions/waitlist.ts`), which normalizes/throttles the input, records a `source` slug, inserts through `db`, and returns success without persisting (logging only) when `DATABASE_URL` is unset — so the page works on a Stripe-only deploy.
- **Signup/system paths** that must create an `org` / first `membership` inside an empty tenant need a privileged (RLS-bypassing) connection, since RLS denies writes before `app.current_org_id` exists. Those use `adminDb` (`db/admin.ts`), which connects with `DATABASE_ADMIN_URL` (a table-owning role) and falls back to `DATABASE_URL`. Also required to resolve an API key to an org before authentication (`findPrincipalByKeyHash`).
- After editing the schema, run `npm run db:generate`, then `npm run db:migrate`. `drizzle.config.ts` prefers `DATABASE_ADMIN_URL` so the migrator runs as the table **owner** (needed to create the `drizzle` schema and the policies); the app runtime must connect with `DATABASE_URL` as a **non-owner** role, or owners/superusers would bypass RLS.
- **Local harness:** `docker-compose.yml` + `db/init/01-roles.sql` provision Postgres 16 on host **:5434** with `rpr_owner` (owner) and `rpr_app` (non-owner) so RLS is genuinely enforced. `npm run db:up|down|reset` manage it; `db:reset` wipes → migrates → seeds one tenant + evidence and writes an API key to `.seed/api-key` (gitignored). `npm run api:smoke` then asserts the whole v1 surface against a running server.
- Relations use `defineRelations(schema, (r) => {...})` with `r.one` / `r.many`, and are passed to `drizzle({ client, relations })`.
- `drizzle.config.ts` loads env via `import "dotenv/config"`, which reads **`.env` only — not `.env.local`**. So `db:*` scripts need `DATABASE_URL` (and `DATABASE_ADMIN_URL`) in `.env`, even though `next dev` also reads `.env.local`.
- The Python workers write `raw_posts` / `pain_signals` directly with `psycopg` (`--db-url`), bypassing Drizzle and RLS — those two tables are global, so no tenant context is needed. Signal inserts are idempotent (`ON CONFLICT DO NOTHING` against the dedupe index).

## Ingestion Workers (Python)

`workers/` is a standalone pipeline that populates the global evidence tables; it is never imported by the Next app and has no npm scripts. Run scripts from the repo root.

- `workers/reddit_client.py` — app-only (client-credentials) OAuth client with token-bucket rate limiting (60/min), 429/5xx backoff, and pagination. Persists every raw JSON response to `data/raw/` **before** parsing (gitignored). CLI: `fetch <subreddit> --limit --timeframe` or `search <query> <subreddit> --limit`.
- `workers/pain_extractor.py` — cheap regex prefilter (`PAIN_PATTERNS`) then one DeepSeek chat completion per qualifying post (bounded to 10 concurrent threads). Writes signals to JSON (`--json-out`) and/or upserts `raw_posts` + idempotently inserts `pain_signals` (`--db-url`). The system prompt is overridable via `REDDIT_PAIN_CLUSTER_PROMPT`.
- `workers/requirements.txt` pins `requests` and `psycopg[binary]`; there is no `pyproject.toml`/lockfile. Both scripts honor `LOG_LEVEL`.
- **Evidence bridge (worker → app):** the worker owns ingestion in its **own database** (Alembic schema; table names collide with the app's Drizzle schema by design, so the two DBs must never be merged). Evidence crosses the seam as a versioned file, not a shared connection: `uv run radar export --out ../data/evidence.jsonl` (worker DB → `rpr-evidence/v1` JSONL; unthemed signals dropped), then `npm run db:ingest -- data/evidence.jsonl` (file → `raw_posts`/`pain_signals`, idempotent: posts upsert by `reddit_id` keeping row UUIDs, signals no-op against the dedupe index). `scripts/seed_evidence.py` (worker) + the importer cover the whole loop locally without Reddit/DeepSeek keys — see the README's "Feeding the app" section.
- **Bridge automation:** `npm run evidence:sync` (`scripts/sync-evidence.ts`) is the cron entry point: `radar fetch` (warn-and-continue on failure) → `radar export` → in-process import via `scripts/lib/evidence.ts`. It **strips the app's `DATABASE_URL` from the worker subprocess env** — the worker's Settings prefer process env over its `.env`, and leaking the app's URL would make it query the app schema (shared table names, different columns). `--skip-fetch` / `EVIDENCE_SKIP_FETCH=1` skip stage 1. `npm run db:reset` wipes the whole Postgres volume, worker DB included: restore it with `uv run alembic upgrade head` + `seed_evidence.py`.

## Backend API (v1)

JSON route handlers under `app/api/v1/**`. They are part of the backend only — no additional **pages** are added (see Do NOT).

- **Auth:** `Authorization: Bearer <key>`. `lib/api/auth.ts` hashes the presented key (SHA-256), resolves it to an org via the privileged client, re-checks in constant time, and returns `{ orgId, keyId }`. Unknown/missing keys get `401 { error: { message, code } }`. Keys are generated by `lib/auth/api-key.ts` (`rpr_<base64url>`); only the hash is stored, so a mint (`POST /api/v1/keys`) returns the plaintext exactly once.
- **Billing webhook:** `POST /api/webhooks/stripe` (not under `/api/v1`; no API key — verified via `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET`). `checkout.session.completed` provisions org + owner + first API key + welcome email (Resend; logged to console when unconfigured); `customer.subscription.updated`/`deleted` keep `orgs.plan` in sync (non-active → `trial`); `invoice.payment_failed` is audit-only. Handlers are idempotent (redeliveries never mint a second key) and every accepted event is recorded in `stripe_events`. `npm run stripe:smoke` covers it end-to-end with signed synthetic events.
- **Plan enforcement:** `lib/billing/limits.ts` maps plans to monthly report quotas (trial 3 · starter 50 · pro 500, calendar month UTC, failed runs free) and folds trial expiry (14 days from `orgs.createdAt`) into `effectivePlan` — no cron needed, and `orgs.plan` stays the billing source of truth. `POST /api/v1/reports` returns `402` with `plan_limit_reached`/`trial_expired` when over quota; `GET /api/v1/me` and report responses expose `reportQuota`/`reportsUsedThisMonth`.
- **Endpoints:**
  - `GET /api/v1/me` — org `{ id, name, slug, plan }`.
  - `GET /api/v1/reports` — recent reports; `POST /api/v1/reports` — generate one synchronously from stored `pain_signals` (body: `{ subredditIds?, keywordSetId?, title? }`; no `subredditIds` ⇒ all of the org's tracked subreddits).
  - `GET /api/v1/reports/:id` — one report incl. `markdown` + `json`.
  - `GET|POST /api/v1/subreddits` · `DELETE /api/v1/subreddits/:id`.
  - `GET|POST /api/v1/keyword-sets` · `PATCH|DELETE /api/v1/keyword-sets/:id`.
  - `GET|POST /api/v1/keys` · `DELETE /api/v1/keys/:id`.
- **Report generation:** `lib/reports/service.ts#runReport` resolves and **validates ownership of** subreddits (unknown ids → error, not silently dropped) and the optional keyword set → `fetchSignalsForReport` (subreddit + keyword filter) → `lib/reports/generate.ts` (pure: groups themes case-insensitively, averages `urgency`/`wtp`/`composite`, keeps the strongest quotes, renders markdown) → persists `status: complete` + `markdown_content` + `json_content`. On failure the row is marked `failed`. Synchronous is fine at landing scale; the seam to move behind a queue is `createReport({ status: "queued" })` + a worker finishing it.
- **Validation:** `lib/api/validate.ts` — dependency-free parsers (no zod). IDs are UUID-checked before hitting Postgres; subreddit names are normalized (strip `r/`, 2–21 word chars). Responses are `{ data }` or `{ error: { message, code } }`.
- Route handlers read the request, so they are dynamic by default (Next 16 GET handlers are no longer statically cached). `params` is a **Promise** — `const { id } = await ctx.params`.

## Design System

### Colors (dark only — no light mode, no theme toggle)

Tokens are defined in `app/globals.css` under `@theme` and used as Tailwind utilities (e.g. `bg-canvas`, `text-ink`, `border-line`).

| Utility                                  | Value                             | Usage                             |
| ---------------------------------------- | --------------------------------- | --------------------------------- |
| `canvas`                                 | `#0a0a0a`                         | page background                   |
| `surface` / `surface-2`                  | `#111111` / `#161616`             | cards / nested surfaces           |
| `line`                                   | `#1f1f1f`                         | borders and dividers              |
| `brand` / `brand-light` / `brand-violet` | `#6366f1` / `#818cf8` / `#8b5cf6` | CTAs, accents, links              |
| `signal`                                 | `#10b981`                         | success / positive signals        |
| `urgency`                                | `#f59e0b`                         | urgency indicators                |
| `ink` / `ink-muted` / `ink-faint`        | `#fafafa` / `#a1a1aa` / `#82828b` | text tiers (faint ≥4.5:1 on dark) |

Do **not** use `dark:` variants — the site is dark by default. Prefer token utilities over raw hex classes.

### Typography & Spacing

- Headings: `font-heading` (Geist Sans), `font-semibold`, `tracking-tight`, `text-balance`.
- Body: `text-ink-muted`, `leading-relaxed`.
- Section rhythm: `Section` primitive (`py-20 md:py-28`); container is `max-w-6xl mx-auto px-6`.

## Animation Rules

All animation uses `motion` (`motion/react`). Presets live in `lib/motion.ts`; primitives (`Reveal`, `RevealGroup`, `RevealItem`) live in `components/ui/reveal.tsx`.

- Every section animates on scroll into view (`whileInView`, `viewport={{ once: true }}`).
- **Reduced motion** is handled globally by `MotionProvider` (`<MotionConfig reducedMotion="user">`), which skips transform/layout animation while keeping opacity fades.
  - Do **not** branch on `useReducedMotion()` during render — that diverges between server and client and causes hydration mismatches. Use it only inside effects (e.g. disabling autoplay in `AnimatedTestimonials`, instant count in `CountUp`).
- No `useEffect` for animations; use motion props. `CountUp` is the one intentional rAF exception.

## Code Conventions

- TypeScript strict. No `any`. Avoid non-null assertions.
- Components: PascalCase functions, one per file, named exports (`export function Hero()`), kebab-case filenames.
- Default to Server Components; add `"use client"` only for hooks, motion, or browser APIs.
- Imports: `@/` alias for all internal imports.
- Tailwind classes only — no CSS modules / styled-components / inline `style` except dynamic motion values.
- SVGs are inlined where needed (logos, social icons); Lucide for UI glyphs.
- Import animation presets from `@/lib/motion`; avoid ad-hoc variants unless section-specific.

## SEO & Metadata

- `app/layout.tsx` exports `metadata` (title default + template, description, canonical, OpenGraph, Twitter `summary_large_image`, robots) and `viewport` (`themeColor: #0a0a0a`, `colorScheme: dark`).
- OG image is generated at build time by `app/opengraph-image.tsx` via `next/og` `ImageResponse` — **no binary `/public/og-image.png`**.
- JSON-LD: `SoftwareApplication` in `app/page.tsx`; `FAQPage` in `components/sections/faq.tsx`.
- `app/sitemap.ts` and `app/robots.ts` are generated from `lib/site.ts`.

## Environment Variables

- `NEXT_PUBLIC_STRIPE_PAYMENT_LINK` — CTA target. If unset, CTAs fall back to `#waitlist` (the email-capture section).
- `NEXT_PUBLIC_SITE_URL` — canonical origin for metadata/sitemap (defaults to `https://redditpainradar.com`).
- `DATABASE_URL` — PostgreSQL connection string for Drizzle (`db/`). Required by `db:*` scripts and runtime queries.
- `DATABASE_ADMIN_URL` — optional privileged (table-owning) connection used by `db/admin.ts` for signup provisioning and API-key→org lookup. Falls back to `DATABASE_URL` when unset (fine locally; on a hardened deploy the app role should be non-owner so RLS applies to normal traffic).
- `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` — required by the billing webhook (`app/api/webhooks/stripe`); the route answers `503` until both are set.
- `STRIPE_PRICE_STARTER` / `STRIPE_PRICE_PRO` — optional price-id → plan mapping; active subscriptions on unknown prices default to `starter`.
- `RESEND_API_KEY` / `EMAIL_FROM` — transactional email (welcome key on signup). Without `RESEND_API_KEY` the email is printed to the server log instead of sent.

`lib/site.ts` exposes the two public vars. See `.env.example`.

The Python workers read additional server-only vars (never exposed to the client, no `NEXT_PUBLIC_` prefix): `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`, `REDDIT_RAW_DATA_DIR` (default `data/raw`), `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`, `REDDIT_PAIN_CLUSTER_PROMPT`, and `LOG_LEVEL`. See `.env.example` for defaults.

## Anchor IDs

`#top` (hero), `#how-it-works`, `#features`, `#demo`, `#testimonials`, `#pricing`, `#faq`, `#waitlist`. `section[id]` has `scroll-margin-top: 5rem` for the sticky navbar.

## Do NOT

- Use light mode or a theme toggle.
- Use `dark:` Tailwind variants.
- Use generic placeholder images — use SVG/CSS mockups, gradients, or the hand-built effect components.
- Add **pages** or marketing routes beyond the single landing page (no `/blog`, `/docs`, `/pricing`). Backend JSON route handlers under `app/api/**` are expected and OK.
- Pull in UI libraries beyond shadcn/ui + hand-built Aceternity-style patterns.
- Add unnecessary dependencies.
- Write CSS outside Tailwind classes (except `@theme` tokens/keyframes in `globals.css`).
- Branch on `useReducedMotion()` during render.

## Verification Checklist

1. `npm run typecheck` — zero errors
2. `npm run lint` — zero warnings
3. `npm run build` — completes
4. No console errors at `localhost:3000` (including with `prefers-reduced-motion: reduce`)
5. Animations play on scroll
6. Responsive at 375 / 768 / 1440 widths
7. No horizontal scroll on any viewport

## References

- motion: https://motion.dev
- shadcn/ui: https://ui.shadcn.com
- Next.js (local, version-matched): `node_modules/next/dist/docs/`
