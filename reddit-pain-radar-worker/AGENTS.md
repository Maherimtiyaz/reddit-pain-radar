# AGENTS.md — Reddit Pain Radar Worker

Instructions for AI agents (and humans) working in
`reddit-pain-radar-worker/`. This directory is a **self-contained Python
project** inside the larger Next.js landing-page repo; the repo-root rules
(Next.js, Tailwind, npm scripts) do **not** apply to these files.

## What this is

A standalone, scheduled backend worker: fetch Reddit posts → extract pain
signals (regex + DeepSeek) → score → cluster themes → render/email reports.
**No web server, no frontend, no API routes.** Runs as a scheduled job
(APScheduler) or via cron calling the CLI.

## Commands (run from this directory)

```bash
uv sync                          # install deps (.venv, editable package)
uv run pytest                    # tests — must pass before any change ships
uv run radar --help              # CLI sanity check
uv run alembic upgrade head      # apply migrations (needs DATABASE_URL)
uv run alembic upgrade head --sql  # verify migration DDL offline (no DB)
uv run radar run | fetch | report | schedule
uv run python scripts/seed_subreddits.py
```

There is **no CI and no linter config** in this project — `uv run pytest` is
the gate. Keep the test suite green; new behavior needs tests in `tests/`.

## Architecture rules

- Package lives in `src/radar/` (src layout). Internal imports use
  `from radar... ` absolute paths.
- Async everywhere for I/O (`httpx`, `openai`, `aiolimiter`); DB access is a
  synchronous SQLAlchemy 2.0 `Session` via `session_scope()`
  (`radar.db.session`). One transaction at a time — this is a single worker.
- Config comes only from `radar.config.get_settings()` (cached). Never read
  `os.environ` directly; add a `Settings` field + `.env.example` entry.
- Logging is **structlog JSON** (`radar.logging.configure_logging`). Use
  `log = structlog.get_logger(__name__)` and keyword fields
  (`log.info("event", count=3)`) — never `print()` in library code.
- Errors that callers should degrade on derive from `RedditError`
  (`RedditAuthError`, `RedditRateLimitError`, `RedditUnavailableError`,
  `RedditApiError`). The 503/listing-degrade contract lives in
  `reddit/client.py`.
- SQLAlchemy models: SQLAlchemy 2.0 style only (`Mapped` / `mapped_column`),
  UUID PKs, explicit indexes in `__table_args__` matching the spec. After any
  model change: `uv run alembic revision --autogenerate -m "..."` (needs a
  live DB) — or hand-write the migration, then verify with
  `alembic upgrade head --sql`, and mirror it exactly in `tests`.
- The DB schema here is owned by **this worker's Alembic migrations**. Do not
  touch the repo-root Drizzle schema (`db/schema.ts`) or the legacy
  `workers/` scripts — they are a separate, older ingestion path.

## Domain rules (do not silently change)

- Composite score formula (spec):
  `(urgency*0.3 + wtp*0.4 + min(frequency/5, 1)*10*0.3) * 10`, 0–100,
  rounded to 2 decimals — `score/scorer.py`.
- Regex list and flags (`re.IGNORECASE | re.MULTILINE`) —
  `extract/patterns.py`. Quotes = matched sentence ±1, deduped case-insensitive
  on the first 50 chars.
- LLM contract: JSON with `theme / reasoning / urgency_score / wtp_score`;
  `theme: null` means "not a pain point" → signal dropped. ≤10 concurrent
  calls, per-quote-hash cache reset per run (`clear_analysis_cache()`).
- Clustering: exact `llm_theme` grouping; >20 themes → second LLM pass merging
  into ≤10 themes as a JSON mapping.
- Report lifecycle: `pending → generating → complete|failed`, with the
  `reports` row committed *before* generation so failures can be recorded.
- Reddit client: app-only OAuth, 60 req/min (aiolimiter), max 3 pages × 100
  posts, 429 backoff 1/2/4/8s, 401 → refresh once, 503 → log + empty list.

## Testing conventions

- `pytest` + `asyncio_mode = auto` (async tests need no decorator); fixtures
  build **transient ORM objects** — tests never need Postgres or network.
- HTTP is mocked with **respx** (the spec's `responses` only patches
  `requests`, not httpx; both stay in the `dev` group).
- `RedditClient(..., sleep=..., limiter=...)` exists for tests: inject a fake
  sleep to assert backoff timing without waiting.

## Do NOT

- Add a web framework, API routes, or frontend assets.
- Read env vars outside `Settings`; forget `.env.example` updates.
- Use `print()` for diagnostics in `src/`.
- Introduce a second source of truth for the schema (no raw SQL in app code).
- Call Reddit/DeepSeek/Resend in tests.
- Depend on the repo-root Next.js app (or vice versa).
