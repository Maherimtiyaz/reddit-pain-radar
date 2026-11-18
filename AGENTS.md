<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# AGENTS.md

## Project Identity

**PainProof** — "problems worth building, with proof." For first-time founders and indie hackers. Three layers:

1. **PainProof Weekly** — free newsletter of real pains, each with linked proof (audience). Drafted by the app, sent by a newsletter tool, archived at `/weekly`.
2. **Check My Idea** — $9 one-off report at `/check`: an idea checked against real evidence, with a verdict (build / niche down / skip / not enough evidence) and a PainProof Score.
3. **PainProof Pro** — $19/month: 30 checks a month, report history, niche-watch alerts, in `/dashboard`.

Evidence comes **only** from sources with public APIs (Hacker News via Algolia, GitHub issues). The software must **not** collect data from Reddit, X or LinkedIn (that is what shut down GummySearch). Business plan and playbooks: `painproof/`.

The landing page has one job: **turn visitors into newsletter subscribers and buyers**. Every claim must be true today or labelled "soon" — **no invented testimonials, counts, logos or scarcity**. Sections that sell something switch on only when it can be bought (`lib/check/availability.ts`).

## Tech Stack (as built)

- **Framework:** Next.js **16.4.6** (App Router, Turbopack) + TypeScript (strict). `cacheComponents` and `partialPrefetching` are enabled in `next.config.ts`.
- **React:** 19.3.0.
- **Styling:** Tailwind CSS v4 (CSS-first `@theme` in `app/globals.css`).
- **Animation:** `motion` (v14, imported from `motion/react`) — **not** `framer-motion`.
- **UI Components:** shadcn/ui CLI v4 (`radix-nova` style, `nova` preset, neutral base). Aceternity-style effects are **hand-built** in `components/ui` (no `@aceternity` registry).
- **Icons:** Lucide React. Note: brand icons (`Twitter`, `Github`, `Linkedin`) were removed from lucide — inline the SVGs (see `components/sections/footer.tsx`).
- **Fonts:** Geist Sans + Geist Mono via `next/font`.
- **Database:** Drizzle ORM **v1 (RC)** + `node-postgres` (`pg`), migrations via `drizzle-kit`. Postgres RLS for tenant isolation (see Database section).
- **Auth:** Auth.js v5 (`next-auth@beta`) with the email magic-link provider (`next-auth/providers/resend`). Database sessions. The adapter is **hand-written** in `lib/auth/adapter.ts` (`@auth/drizzle-adapter` cannot bundle against drizzle v1 RC — it imports the removed `PgDatabase` export).
- **LLM:** any OpenAI-compatible chat API in JSON mode via plain `fetch` (`lib/llm/client.ts`, no SDK). DeepSeek by default.
- **Payments / email:** Stripe (Checkout, webhooks, customer portal) and Resend.
- **Scheduled jobs:** GitHub Actions (`.github/workflows/painproof-cron.yml`) — no worker process; everything runs in the Next app or `tsx` scripts.
- **Deployment:** Vercel.

### Next 16 / shadcn v4 gotchas

- `next lint` was removed. The lint script is plain `eslint`.
- shadcn components import `cn` from the `"cn"` package, **not** `@/lib/utils`. `lib/utils.ts` just re-exports: `export { cn } from "cn"`.
- Read version-matched docs from `node_modules/next/dist/docs/` before using unfamiliar APIs.
- Default shadcn button sizes are small (`default` = `h-8`). Landing CTAs must be touch-friendly: pass `className="h-12 ..."`.
- With `cacheComponents`, a route that reads `cookies()`/`headers()` (or DB data behind them) **fails the build** unless it is wrapped in `<Suspense>` or opts out with `export const instant = false`. Session-gated routes (`/login`, `/dashboard`) use `instant = false` **and** call `await connection()` before the first dynamic read, so the dev prerender pass doesn't flag the session read / server-action forms. See `node_modules/next/dist/docs/01-app/02-guides/authentication-with-cache-components.md`.
- `next dev` does **not** read `PORT` from `.env`. Start the local server with `$env:PORT=3100; npm run dev` (or set `PORT` in the shell) when you need the dev origin to match `AUTH_URL`.

## Build & Development Commands

```bash
npm install         # install dependencies
npm run dev         # dev server (localhost:3000; start with PORT=3100 for auth testing)
npm run start        # serve the production build
npm run typecheck   # tsc --noEmit
npm test            # unit tests (tests/**/*.test.ts, node:test via tsx)
npm run evidence:smoke # live HN + GitHub source check (network)
npm run check:idea -- "idea" # run a Check My Idea report (needs an LLM key)
npm run weekly:draft  # draft this week's PainProof Weekly (DB + LLM)
npm run weekly:publish -- <slug> [--drop 3,5] # publish a draft to /weekly
npm run watch:digest  # email Pro niche-watch digests (privileged DB)
npm run lint        # eslint
npm run format      # prettier --write .
npm run format:check
npm run build       # production build
npm run db:generate # generate SQL migrations from db/schema.ts
npm run db:migrate  # apply pending migrations
npm run db:push     # push schema directly (dev only)
npm run db:studio   # Drizzle Studio
npm run db:export:waitlist # landing waitlist -> CSV on stdout (append `-- --out file.csv`)
npm run check:resume  # restart stuck paid checks (cron hourly)

# local database harness (Docker Postgres on host port 5434, two RLS roles)
npm run db:up       # start Postgres
npm run db:down     # stop it
npm run db:reset    # wipe -> migrate -> seed a fresh database
npm run db:seed     # seed a Pro workspace + sample check; prints an API key
npm run api:smoke   # end-to-end v1 API smoke test (me, checks, keys; server must be running)
npm run stripe:smoke # end-to-end Stripe webhook test: subscriptions + check purchases (server must run with the same secret)

vercel --prod       # deploy (out of scope unless asked)
```

**Tests:** `npm test` runs `tests/**/*.test.ts` with Node's built-in test runner via `tsx --test` (no extra dependencies; `@/` imports work). Tests must not hit the network — inject `fetchImpl`/`sleep` (see `lib/evidence/http.ts`). **CI** (`.github/workflows/ci.yml`) runs typecheck, test, lint, format check and build on every PR. `scripts/api-smoke.ts` (`npm run api:smoke`) is a manual end-to-end check of the v1 API; it needs `npm run db:reset` and a running server.

**Always run `npm run typecheck`, `npm test` and `npm run lint` (then `npm run build`) before declaring a task complete.**

To verify a single component in isolation, run `npm run dev` and check `localhost:3000` (or `localhost:3100` when started with `PORT=3100`); there is no per-file test or typecheck shortcut.

### Testing magic-link sign-in locally

1. `AUTH_SECRET` must be set in `.env` (any random string; see `.env.example`).
2. `npm run db:up && npm run db:reset` — seeds `founder@painproof.test` / Pro workspace `Acme Indie Studio` with a finished sample check.
3. `$env:PORT=3100; npm run dev` (keep `AUTH_URL=http://localhost:3100` in `.env`).
4. Open `http://localhost:3100/login`, enter the seed email. With `RESEND_API_KEY` unset, the **dev** server log prints the magic link; paste it into the browser. (Production builds never log sign-in links — for `next start` tests, insert a `sessions` row and set the `authjs.session-token` cookie instead.)
5. You land on `/dashboard` with the seeded org. Signing out deletes the session row.

## Project Structure

```
auth.ts                    NextAuth config: adapter, Resend provider, session callback
app/
  layout.tsx page.tsx      dark-only shell; landing composes sections + JSON-LD
  globals.css              Tailwind v4 @theme tokens + keyframes
  opengraph-image.tsx icon.svg sitemap.ts robots.ts
  check/page.tsx           Check My Idea order form ($9)
  check/[id]/page.tsx      private report (?t=token), noindex, self-refreshing
  weekly/page.tsx          PainProof Weekly archive
  weekly/[slug]/page.tsx   one published issue
  login/page.tsx           magic-link sign-in
  dashboard/               PainProof Pro (session-gated, instant = false)
    layout.tsx page.tsx    usage, check form, history, niche watch, billing
    checks/[id]/page.tsx   a workspace's report (no token needed)
  privacy/ terms/          legal pages
  api/auth/[...nextauth]/  Auth.js handlers
  api/checkout/            GET -> Pro subscription Checkout (falls back)
  api/webhooks/stripe/     subscriptions + check purchases (runs checks via after())
  api/v1/                  API-key authed JSON: me, checks, checks/[id], keys, keys/[id]
components/
  sections/                one file per landing section (kebab-case)
    announcement-bar navbar hero sources how-it-works features
    demo-report pricing faq final-cta footer checkout-success
  check/                   report-view, check-form, page-shell, refresh-while-pending
  weekly/                  issue-view, subscribe-cta
  dashboard/               pro-check-form, watch-topic-form
  ui/                      shadcn primitives + hand-built effects
  brand/ legal/ providers/
lib/
  copy.ts site.ts motion.ts utils.ts rate-limit.ts
  evidence/                HN + GitHub adapters, fetchJson, pain detector, collect
  llm/client.ts            OpenAI-compatible JSON chat (DeepSeek default)
  check/                   engine (plan/assess/score/run/render), store, purchase, pro, availability
  weekly/                  generate, render, store
  watch/                   niche-watch digest + store
  billing/limits.ts        plans: effectivePlan, checkQuota, watchTopicLimit
  actions/                 waitlist, auth, check (order), pro (dashboard)
  api/                     http, auth, handler, validate
  auth/                    api-key, adapter
  dashboard/data.ts        requireDashboardUser, getProDashboardData, getDashboardCheck
  email/                   magic-link, welcome, check-ready, weekly-draft, watch-digest
  stripe/                  client, webhook
db/
  schema.ts                tables, enums, relations, RLS policies
  index.ts admin.ts tenant.ts queries.ts pool-options.ts
  init/01-roles.sql        harness roles: rpr_owner (owner) + rpr_app (non-owner)
drizzle/                   generated SQL migrations (committed)
scripts/                   check-idea check-resume weekly-draft weekly-publish watch-digest
                           evidence-smoke db-seed api-smoke stripe-webhook-smoke export-waitlist
tests/                     node:test unit tests (no network)
painproof/                 business plan, validation kit, newsletter playbook, samples
docker-compose.yml         local Postgres 16 on :5434 with the two roles
```

The local harness keeps its historical names (`rpr_owner`, `rpr_app`, database `pain_radar`, container `rpr-postgres`); they are internal and renaming them would break existing local volumes.

**Rules:** each landing section lives in its own file under `/components/sections/`; `app/page.tsx` only imports and arranges sections.

## Database (Drizzle ORM v1 RC + node-postgres)

- **Single schema file:** `db/schema.ts` (`drizzle.config.ts` points at it). All column names are written **explicitly in `snake_case`** with camelCase JS keys — drizzle-kit v1 has no top-level `casing` option, so do not rely on it.
- **12 tables:**
  - Identity & tenancy: `users`, `accounts`, `sessions`, `verification_tokens` (Auth.js, global), `orgs`, `memberships` (RLS).
  - Billing: `api_keys` (RLS), `stripe_events` (global audit).
  - PainProof: `idea_checks` (global; private-link access, `org_id` for Pro), `weekly_issues` (global, public once published), `watch_topics` (RLS), `waitlist` (newsletter signups, global).
  - Enums: `role`, `plan` (`trial|starter|pro`), `idea_check_status`, `weekly_issue_status`.
- **PKs:** `uuid().defaultRandom()`. JSON payloads (`idea_checks.result`, `weekly_issues.content`) are typed with `$type<...>()` from `lib/check/types.ts` / `lib/weekly/types.ts`.
- **Auth columns:** `users.email_verified` is added for the adapter; `users.image` maps to the pre-existing `avatar_url` column. New signups store a lowercased email, and both the adapter and `createOrgWithOwner` match emails case-insensitively so Stripe-provisioned users are reused rather than duplicated.
- **Tenant isolation (defense in depth):** app-layer scoping **plus** Postgres RLS. `orgs`, `memberships`, `api_keys`, `watch_topics` are `pgTable.withRLS(...)` with a `tenant_isolation` policy on `org_id` (or `id` for `orgs`) = `current_setting('app.current_org_id')`. `idea_checks` is global: public checks are opened by token; Pro queries always filter by `org_id` (`lib/check/store.ts`).
- **Querying:** `db` (`db/index.ts`) for global tables; `withTenant(orgId, fn)` (`db/tenant.ts`) for RLS tables so `app.current_org_id` is set transaction-locally. `adminDb` (`db/admin.ts`, `DATABASE_ADMIN_URL`, table owner) only for system paths: provisioning an org, resolving an API key, `findOrgForUser`, and the niche-watch digest across workspaces.
- **Data access:** shared identity/billing reads live in `db/queries.ts`; each PainProof feature keeps its own store next to it (`lib/check/store.ts`, `lib/weekly/store.ts`, `lib/watch/store.ts`).
- After editing the schema, run `npm run db:generate`, then `npm run db:migrate`. Migrations run as the table **owner** (`DATABASE_ADMIN_URL`); the app runtime must connect as a **non-owner** (`DATABASE_URL`) or RLS is bypassed. The harness grants the app role access to new tables via default privileges; on hosted Postgres, re-run the README's `grant` after adding tables.
- **Local harness:** `docker-compose.yml` + `db/init/01-roles.sql` — Postgres 16 on host **:5434** with `rpr_owner` and `rpr_app`. `npm run db:reset` wipes → migrates → seeds a Pro workspace, writes its API key to `.seed/api-key` (gitignored) and prints a sample check link.
- Relations use `defineRelations(schema, (r) => {...})`, passed to `drizzle({ client, relations })`.
- `drizzle.config.ts` loads **`.env` only — not `.env.local`**, so `db:*` scripts need `DATABASE_URL`/`DATABASE_ADMIN_URL` in `.env`.
- History: the Reddit-era tables (`subreddits`, `keyword_sets`, `raw_posts`, `pain_signals`, `reports`) were dropped by the `DROP_reddit_pipeline_tables` migration.

## Evidence layer (PainProof sources)

`lib/evidence/` fetches public evidence at request time (no Python worker needed; runs on Vercel):

- `types.ts` — the normalized `Evidence` shape every source returns (`id` = `${source}:${externalId}`, verbatim `text`, `url` to the original, engagement numbers).
- `hackernews.ts` — Algolia HN search (`comment` / `story` / `show_hn` / `ask_hn`, `sinceDays`, relevance or date sort). No key.
- `github.ts` — GitHub issue search (sorted by 👍, `label`, `minReactions`, `sinceDays`). Caller text is stripped of `key:value` qualifiers. Optional `GITHUB_TOKEN`; a 401 falls back to unauthenticated.
- `http.ts` — `fetchJson`: `cache: "no-store"`, per-attempt timeout, bounded retry on 429/5xx/network errors honouring `Retry-After`.
- `pain.ts` — regex prefilter for pain + willingness-to-pay phrases and verbatim quote extraction (quotes are always exact substrings).
- `collect.ts` — `collectEvidence(searches)` runs searches with per-source concurrency (HN 4, GitHub 2), de-dupes, and records per-search errors instead of throwing. `selectPainful` keeps items with pain phrases plus their quotes.

Rules: only sources with public APIs; never scrape; every quote shown to a user must keep its `url`. The regex prefilter is a hint, not a gate — on real data most relevant comments contain no stock pain phrase, so relevance/pain judgement belongs to the LLM step.

## Check My Idea engine

`lib/check/` turns one idea into a verified report. Pipeline (`run.ts#runIdeaCheck`, all I/O injectable for tests):

1. `normalizeIdea` — 15–600 chars, whitespace collapsed (`IdeaValidationError` otherwise).
2. `plan.ts#planCheck` — the LLM proposes 2–4-word queries (HN requires every word to match): pain queries → HN comments, competitor queries → Show HN, GitHub queries → issues by 👍. Output is validated; any failure falls back to a keyword plan.
3. `collectEvidence` (Phase 2 layer).
4. `assess.ts#selectForPrompt` — ≤40 pain candidates (pain phrase › engagement › recency) + ≤12 competitor stories, labelled `E1..En`.
5. `assess.ts#assessEvidence` — the LLM scores demand / wtp / openness / ease (0–10) citing labels only. **Validation is the safety net:** unknown labels are dropped; proof must cite an item the model marked relevant and must be a verbatim substring of that item (`verifyQuote`, 25–320 chars, tolerant only of case/whitespace/curly quotes); competitor links come only from cited items.
6. `score.ts` — **we** compute `(demand×0.30 + wtp×0.30 + openness×0.25 + ease×0.15)×10`; ≥75 build, 55–74 niche down, <55 skip. Fewer than 3 relevant items or 2 verified quotes → verdict `insufficient`, score `null` (never guess).
7. `render.ts` — markdown for email/export; `components/check/report-view.tsx` renders the same `CheckResult` as a page.

Storage (`store.ts`): `idea_checks` is **global** (no RLS); access is a private link `/check/[id]?t=<token>`, only the token's SHA-256 is stored, compared in constant time. `runStoredCheck` claims a row atomically (`queued → running`) so duplicate triggers never run twice. Statuses: `pending_payment → queued → running → complete | failed`.

Page: `app/check/[id]/page.tsx` — static shell + `<Suspense>` around the token check (reads `searchParams`, calls `connection()`); `noindex` + `referrer: no-referrer` so the token never leaks. While queued/running it re-renders every 5 s (`RefreshWhilePending`).

LLM: `lib/llm/client.ts` — any OpenAI-compatible chat API in JSON mode via fetch (no SDK). Defaults to DeepSeek (`DEEPSEEK_API_KEY`/`DEEPSEEK_BASE_URL`/`DEEPSEEK_MODEL`); `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` override.

CLI: `npm run check:idea -- "idea" [--save] [--email x] [--json]` runs a real check (needs an LLM key; `--save` also needs the DB and prints the private link).

### Selling a check ($9, `lib/check/purchase.ts`)

- **Availability** (`lib/check/availability.ts`, env-only): open when `STRIPE_SECRET_KEY` + `STRIPE_PRICE_CHECK` + an LLM key are set. The landing (hero note, pricing card, FAQ) and `/check` switch between "launching soon" and open. These pages are static → **redeploy after changing those env vars**.
- **Order:** `/check` → `lib/actions/check.ts#startCheckAction` (per-IP 5/10 min, `normalizeIdea`, email check) → `startCheckCheckout`: insert `pending_payment` row, create a `mode: "payment"` Checkout Session (`allow_promotion_codes`, `metadata = { kind: "idea_check", ideaCheckId, t: token }`, success → the private report URL), store the session id. A failed Stripe call deletes the row. Stripe's cancel URL is `/check?canceled=1` (read client-side via `useSyncExternalStore`).
- **Webhook:** `checkout.session.completed` / `async_payment_succeeded` with `metadata.kind === "idea_check"` → `markCheckPaid`: atomic `pending_payment → queued` matching id **and** session id; `paid` and `no_payment_required` (100%-off code) count as paid. The route schedules `runPaidCheck` with `after()` (`maxDuration = 300`) and logs `loggableOutcome` (never the token). The token from metadata is verified against the stored hash before it is emailed.
- **Delivery:** `lib/email/check-ready.ts` (Resend; logged without a key — link only in development).
- **Recovery:** the report page restarts a stale check via `after()` (`requeueIfStale`: queued > 60 s or running > 10 min); `npm run check:resume` does the same for all stuck rows and recovers the token from the Stripe session. Atomic claims make every path safe to repeat.

## PainProof Weekly (`lib/weekly/`)

The app **writes and archives** the newsletter; a newsletter tool (Beehiiv/Kit) **sends** it (unsubscribe compliance and deliverability stay there).

- `generate.ts#generateWeeklyIssue` — collects the past 7 days (HN comments matching `WEEKLY_PHRASES`, Ask HN threads with ≥15 comments, open GitHub `enhancement` issues with ≥30 👍 from the last 45 days), keeps pain-phrase comments + all threads/issues ranked by engagement (≤60, labelled `E1..En`), and asks the model for 5–7 pains. `validateIssue` keeps a pain only with ≥1 verified verbatim quote (`verifyQuote`), one source never backs two pains, the verdict must be build/niche_down/skip, and the engagement line ("179 points · 92 comments") is computed by us. Fewer than 3 pains → `NotEnoughMaterialError`, no draft. Slug = the Monday (UTC) of the run; `weekStart` = 7 days earlier.
- `store.ts` — `weekly_issues` (global): `saveDraft` upserts but **never overwrites a published issue**; `publishIssue(slug, { drop })`; `listPublishedIssues`; `getPublishedIssue`.
- `render.ts` — markdown to paste into the newsletter tool (CTA: `/check` when sales are open, otherwise "reply with your idea").
- Commands: `npm run weekly:draft` (saves draft, writes `data/weekly/<slug>.md`, emails `WEEKLY_EDITOR_EMAIL`), `npm run weekly:publish -- <slug> [--drop 3,5]`.
- Pages: `/weekly` (archive) and `/weekly/[slug]` — static shell + `<Suspense>` + `connection()`; `generateMetadata` reads the issue (streams with the deferred content). The sitemap lists published issues and survives a DB outage.
- Cron: `.github/workflows/painproof-cron.yml` — Mondays 06:17 UTC `weekly:draft`; hourly `check:resume`. Secrets `APP_DATABASE_URL`, `DEEPSEEK_API_KEY`, `RESEND_API_KEY`, `WEEKLY_EDITOR_EMAIL`, `STRIPE_SECRET_KEY`; variables `NEXT_PUBLIC_SITE_URL`, `EMAIL_FROM`, `STRIPE_PRICE_CHECK`. The workflow's own `github.token` is used for GitHub search.

## PainProof Pro (`/dashboard`)

- **Plans** (`lib/billing/limits.ts`): `checkQuota` — pro/starter 30 checks per UTC month (failed checks excluded), trial/expired 0; `watchTopicLimit` — 5; `hasProAccess(plan)` gates every Pro action. `orgs.plan` stays owned by the Stripe webhooks (cancel → `trial`).
- **Checkout:** `GET /api/checkout` prefers `STRIPE_PRICE_PRO` (`metadata.plan=pro`), else legacy `STRIPE_PRICE_STARTER`. `isProSaleOpen()` (Stripe key + Pro price + LLM key) shows the Pro pricing card and upsells. The welcome email (`lib/email/welcome.ts`) points to `/login`; the API key is a secondary note.
- **Dashboard data:** `getProDashboardData()` / `getDashboardCheck()` in `lib/dashboard/data.ts`. Pro checks are `idea_checks` rows with `org_id` (app-layer scoped: `countOrgChecksSince`, `listOrgChecks`, `getOrgCheck` always filter by org). `/dashboard/checks/[id]` renders `CheckReportView` without a token.
- **Actions** (`lib/actions/pro.ts`, all re-check session → workspace → plan): `runProCheckAction` (per-user 10/10 min, quota, `after(runPaidCheck)` — the page sets `maxDuration = 300`), `addWatchTopicAction` / `removeWatchTopicAction` (`revalidatePath`), `openBillingPortalAction` (Stripe portal; `?billing=unavailable` notice on failure).
- **Niche watch:** `watch_topics` is org-scoped **with RLS** (`withTenant` for reads/writes). `lib/watch/digest.ts` is model-free: per topic, HN comments + GitHub issues newer than `last_sent_at` (≤14 days), `selectPainful` + issues with ≥10 👍, top 5 by engagement. `npm run watch:digest` lists targets with the privileged client (system path across tenants) and marks topics sent only after a delivered email.
- Grid layouts with truncating children need `min-w-0` on the grid items (`[&>*]:min-w-0`), or long titles overflow at 375px.

## Backend API (v1)

JSON route handlers under `app/api/v1/**`, for Pro customers who want checks from scripts or agents.

- **Auth:** `Authorization: Bearer <key>`. `lib/api/auth.ts` hashes the key (SHA-256), resolves it to an org via the privileged client, re-checks in constant time. Unknown/missing keys get `401 { error: { message, code } }`. Keys (`rpr_<base64url>`, `lib/auth/api-key.ts`) are stored hashed; a mint returns the plaintext once. Per-IP limit across v1: 300/min (`lib/api/handler.ts`).
- **Endpoints:**
  - `GET /api/v1/me` — workspace, `effectivePlan`, `checkQuota`, `checksUsedThisMonth`.
  - `POST /api/v1/checks` `{ idea }` — starts a Pro check (same rules as the dashboard via `lib/check/pro.ts#startProCheck`) → `202 { id, status: "queued" }`; runs via `after()` (`maxDuration = 300`). Errors: `402 plan_required | quota_reached`, `400 invalid_idea`, `503 unavailable` (no LLM configured).
  - `GET /api/v1/checks` — recent checks; `GET /api/v1/checks/:id` — status and, when complete, `result` (JSON) + `markdown`.
  - `GET|POST /api/v1/keys` · `DELETE /api/v1/keys/:id`.
- **Validation:** `lib/api/validate.ts` — dependency-free parsers. IDs are UUID-checked before Postgres. Responses are `{ data }` or `{ error: { message, code } }`. An unreachable database answers `503 { code: "unavailable" }` with `Retry-After: 5`.
- **Checkout & webhook** (outside v1): `GET /api/checkout` sells Pro (see "PainProof Pro"); `POST /api/webhooks/stripe` (Stripe-Signature verified) provisions subscriptions, syncs plans, and queues paid checks. Handlers are idempotent; accepted events are recorded in `stripe_events`. `npm run stripe:smoke` covers both flows.
- Route handlers are dynamic by default. `params` is a **Promise** — `const { id } = await ctx.params`.

## Authentication & Dashboard

Identity is Auth.js v5 with the **email magic-link** provider and **database sessions**. There is no password or OAuth provider.

- **Config:** root `auth.ts` exports `{ handlers, auth, signIn, signOut }`. `app/api/auth/[...nextauth]/route.ts` re-exports the handlers. `auth()` is the server-side session read; it returns `null` when signed out.
- **Adapter:** `lib/auth/adapter.ts` is hand-written against the Drizzle tables. `@auth/drizzle-adapter@1.11` cannot be used with drizzle-orm v1 RC (it imports the removed runtime `PgDatabase` export, renamed `PgAsyncDatabase`), so only the `Adapter` methods needed for email + database sessions are implemented. `getUserByEmail` is **case-insensitive** and new users store a lowercased email, so a user provisioned by the Stripe webhook is reused on first sign-in instead of duplicated.
- **Tables:** `users` (extended with `email_verified`; `image` maps to the existing `avatar_url` column), `accounts`, `sessions`, `verification_tokens`. All four are global (no RLS). Tokens are single-use (`useVerificationToken` deletes and returns in one statement). Sessions cascade-delete with the user.
- **Flow:** the form calls `requestMagicLink` → `signIn("resend", { redirect: false })` → `sendMagicLinkEmail` (`lib/email/magic-link.ts`; with `RESEND_API_KEY` unset it logs the URL instead of sending) → the action redirects to `/login?sent=1`. The callback consumes the token, marks `email_verified`, creates the session cookie, redirects to `callbackUrl`. Sign-out deletes the session row.
- **Route protection:** no middleware (DB sessions can't run on the edge). `app/dashboard/layout.tsx` calls `requireDashboardUser()` and redirects to `/login`; `app/login/page.tsx` redirects signed-in users to `/dashboard`.
- **Cache Components:** `/login` and `/dashboard/**` export `instant = false` and call `await connection()` before the first session read, because they have no static shell. `connection()` lives in `requireDashboardUser` (covers all dashboard routes) and at the top of `LoginPage`. Don't remove them without wrapping the reads in `<Suspense>`.
- **Dashboard data:** `lib/dashboard/data.ts` (`requireDashboardUser`, `getProDashboardData`, `getDashboardCheck`) resolves the user's first org via `findOrgForUser` and returns plan, check usage, history and watch topics. Signed-in users with no org see a "No PainProof Pro workspace yet" upsell — sign-in itself never creates an org. See "PainProof Pro".
- **Auth actions:** `lib/actions/auth.ts` — `requestMagicLink` (server action, per-IP rate limited 10/10min) and `signOutAction`.
- **Env:** `AUTH_SECRET` is required at runtime (not build). `AUTH_URL` pins the callback origin (local dev `http://localhost:3100`). `RESEND_API_KEY`/`EMAIL_FROM` control delivery; without the key emails are logged (sign-in links only outside production).

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

All in `.env.example`. Server-only unless prefixed `NEXT_PUBLIC_`.

| Variable                                                                                     | Purpose                                                                           |
| -------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SITE_URL`                                                                       | Canonical origin (metadata, sitemap, email links). Default `https://painproof.co` |
| `NEXT_PUBLIC_STRIPE_PAYMENT_LINK`                                                            | Fallback for `GET /api/checkout`; else `#subscribe`                               |
| `DATABASE_URL` / `DATABASE_ADMIN_URL`                                                        | App role (non-owner, RLS applies) / table owner (migrations + system paths)       |
| `AUTH_SECRET` / `AUTH_URL`                                                                   | Auth.js (required at runtime) / callback origin                                   |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET`                                                | Stripe API + webhook verification                                                 |
| `STRIPE_PRICE_CHECK`                                                                         | One-time $9 price — opens Check My Idea                                           |
| `STRIPE_PRICE_PRO`                                                                           | Recurring $19/month price — opens Pro (`STRIPE_PRICE_STARTER` = legacy fallback)  |
| `RESEND_API_KEY` / `EMAIL_FROM`                                                              | Transactional email (logged when unset)                                           |
| `DEEPSEEK_API_KEY` (+ `_BASE_URL`, `_MODEL`) or `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL` | Model for checks and weekly drafts                                                |
| `GITHUB_TOKEN`                                                                               | Optional: higher GitHub search limits                                             |
| `WEEKLY_EDITOR_EMAIL`                                                                        | Where Monday's weekly draft is emailed                                            |
| `PG_POOL_MAX`                                                                                | Connections per function instance (default 3)                                     |

Availability switches (`isCheckSaleOpen`, `isProSaleOpen`) read env at **build** time on static pages — redeploy after changing Stripe price or LLM variables.

## Anchor IDs

`#top` (hero), `#how-it-works`, `#features`, `#sample` (real sample check), `#pricing`, `#faq`, `#subscribe` (newsletter signup; stored in the `waitlist` table with `source`, e.g. `newsletter` or `check-my-idea` from `?ref=`). `section[id]` has `scroll-margin-top: 5rem` for the sticky navbar.

## Do NOT

- Use light mode or a theme toggle.
- Use `dark:` Tailwind variants.
- Use generic placeholder images — use SVG/CSS mockups, gradients, or the hand-built effect components.
- Add **marketing pages** beyond the single landing page (no `/blog`, `/docs`, `/pricing`). Product routes (`/check`, `/check/[id]`, `/weekly`, `/weekly/[slug]`), app routes (`/login`, `/dashboard/**`, `/privacy`, `/terms`) and backend JSON route handlers under `app/api/**` are expected and OK.
- Pull in UI libraries beyond shadcn/ui + hand-built Aceternity-style patterns.
- Add unnecessary dependencies.
- Write CSS outside Tailwind classes (except `@theme` tokens/keyframes in `globals.css`).
- Branch on `useReducedMotion()` during render.

## Verification Checklist

1. `npm run typecheck` — zero errors
2. `npm test` — all pass (no network)
3. `npm run lint` — zero warnings
4. `npm run build` — completes
5. No console errors at your dev origin (`localhost:3000`, or `localhost:3100` with `PORT=3100`) (including with `prefers-reduced-motion: reduce`)
6. Animations play on scroll
7. Responsive at 375 / 768 / 1440 widths
8. No horizontal scroll on any viewport

## References

- motion: https://motion.dev
- shadcn/ui: https://ui.shadcn.com
- Next.js (local, version-matched): `node_modules/next/dist/docs/`
