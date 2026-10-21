# Reddit Pain Radar — Worker

Standalone **backend worker** for Reddit Pain Radar. It runs as a scheduled
job: fetches Reddit posts, extracts pain signals (regex + DeepSeek LLM),
scores them, clusters themes, and generates a markdown report (optionally
emailed via Resend).

There is **no web server and no frontend** here — just the pipeline, a Typer
CLI, and an APScheduler loop.

## Stack

| Concern            | Choice                                              |
| ------------------ | --------------------------------------------------- |
| Runtime            | Python 3.11+                                        |
| Package manager    | [uv](https://docs.astral.sh/uv/)                    |
| HTTP client        | httpx (async)                                       |
| Validation         | pydantic v2 + pydantic-settings (`.env`)            |
| Database           | SQLAlchemy 2.0 + Alembic, psycopg (Supabase/Neon)   |
| LLM                | OpenAI SDK pointed at DeepSeek (`base_url`)         |
| Rate limiting      | aiolimiter (60 requests/minute to Reddit)           |
| Scheduling         | APScheduler (or system cron later)                  |
| Email              | Resend                                              |
| Logging            | structlog (JSON)                                    |
| Testing            | pytest + pytest-asyncio + respx (httpx mocking)     |

> The spec mentions `responses`; that library only mocks `requests`/urllib3,
> not httpx — so the httpx-level tests use **respx** instead (both are pinned
> in the `dev` dependency group).

## Setup

```bash
uv sync                     # install dependencies into .venv
cp .env.example .env        # then fill in credentials
uv run alembic upgrade head # create tables
uv run python scripts/seed_subreddits.py
```

Required in `.env`: `DATABASE_URL`, `REDDIT_CLIENT_ID`,
`REDDIT_CLIENT_SECRET`, `DEEPSEEK_API_KEY`. Optional: `RESEND_API_KEY` +
`REPORT_TO_EMAIL` (email is skipped when unset).

## Usage

```bash
uv run radar run              # full pipeline once: fetch → extract → score → report
uv run radar fetch            # fetch + extract only (no report)
uv run radar report           # report from already-stored signals (--since-hours N)
uv run radar schedule         # APScheduler loop (default: cron 0 6 * * *)
uv run radar run --no-email   # ...without sending the report email

# equivalents without the CLI
uv run python scripts/run_once.py --no-email
uv run python scripts/seed_subreddits.py
```

With system cron instead of the built-in scheduler:

```cron
0 6 * * * cd /path/to/reddit-pain-radar-worker && uv run radar run
```

## Tests & checks

```bash
uv run pytest                       # full suite (no DB / network needed)
uv run alembic upgrade head --sql   # print the DDL without a database
uv run radar --help
```

## Pipeline

1. **fetch** — for each active subreddit: `fetch_subreddit_posts` (sort/timeframe
   from config) plus optional keyword searches from active `keyword_sets`.
   Upserts into `raw_posts` (full raw payload in `raw_json`).
2. **extract** — unprocessed posts go through the regex patterns
   (`extract/patterns.py`, ±1-sentence quotes, deduped), then DeepSeek
   analyzes each unique quote (≤10 concurrent, cached per quote-hash) for
   `theme / reasoning / urgency_score / wtp_score`. Quotes the model rejects
   (`theme: null`) are dropped. Posts are marked `processed`.
3. **score** — signals grouped by `llm_theme`; composite score per spec:
   `(urgency*0.3 + wtp*0.4 + min(freq/5,1)*10*0.3) * 10`, stored on each signal.
4. **cluster** — exact-theme groups; >20 themes triggers a second LLM pass that
   merges them into ≤10 broader themes (JSON mapping).
5. **report** — markdown + JSON written to a `reports` row
   (`pending → generating → complete|failed`) and emailed via Resend.

## Layout

```
src/radar/
├── config.py          # Settings (pydantic-settings, .env)
├── logging.py         # structlog JSON logging
├── cli.py             # Typer CLI (radar run|fetch|report|schedule)
├── db/                # models, engine/session, Alembic migrations
├── reddit/            # async OAuth client, schemas, rate limiter
├── extract/           # regex patterns, extractor, DeepSeek wrapper
├── score/             # composite scoring engine
├── report/            # clustering, markdown rendering, Resend email
└── jobs/              # fetch_job pipeline + APScheduler wiring
tests/                 # pytest suite (mocked HTTP, no DB)
scripts/               # seed_subreddits.py, run_once.py
```

## Database

Tables: `subreddits`, `keyword_sets`, `raw_posts`, `pain_signals`,
`reports` (+ `report_status` enum). Indexes match the spec
(`raw_posts.reddit_id` unique, `subreddit_id`, `created_utc`, `processed`,
`pain_signals.raw_post_id`, `pain_signals.composite_score`).

The schema here is owned by **this worker's** Alembic migrations. It is
separate from the Next.js landing page's Drizzle schema in the repo root —
share a database only if you intentionally align the two.
