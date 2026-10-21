"""Main scheduled job: fetch -> extract -> score -> cluster -> report -> email.

The pipeline runs in four phases, each exposed as its own coroutine so the
CLI can run pieces independently:

1. ``collect_posts``   — pull listings (and optional keyword searches) from
   Reddit and upsert ``raw_posts``;
2. ``extract_signals`` — regex extraction + DeepSeek analysis of unprocessed
   posts, marking them ``processed``;
3. ``build_report``    — score, cluster, render markdown/JSON, persist a
   ``reports`` row and (optionally) email it;
4. ``run_fetch_job``   — orchestrate all three phases.

DB sessions are synchronous (SQLAlchemy Session + psycopg); that is fine for
a single scheduled worker — one transaction at a time.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Sequence
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload, selectinload

from radar.config import Settings, get_settings
from radar.db.models import (
    KeywordSet,
    PainSignal,
    RawPost,
    Report,
    ReportStatus,
    Subreddit,
)
from radar.db.session import session_scope
from radar.extract.extractor import extract_pain_signals
from radar.extract.llm import analyze_pain_signal, clear_analysis_cache, quote_key
from radar.reddit.client import RedditClient, RedditError
from radar.reddit.schemas import RedditPost
from radar.report.cluster import ThemeCluster, cluster_signals
from radar.report.email import email_configured, send_report_email
from radar.report.render import render_report
from radar.score.scorer import score_signals

log = structlog.get_logger(__name__)


# -- phase 1: fetch ----------------------------------------------------------

@dataclass(slots=True)
class CollectStats:
    subreddits: int = 0
    posts_fetched: int = 0
    posts_new: int = 0
    searches: int = 0


def _active_keywords(session: Session, settings: Settings) -> list[str]:
    """Deduped keywords from active keyword sets (bounded per set)."""
    if not settings.enable_keyword_search or settings.search_keywords_per_set <= 0:
        return []
    keywords: list[str] = []
    seen: set[str] = set()
    sets = session.scalars(
        select(KeywordSet).where(KeywordSet.active.is_(True)).order_by(KeywordSet.created_at)
    ).all()
    for keyword_set in sets:
        added = 0
        for keyword in keyword_set.keywords or []:
            cleaned = str(keyword).strip()
            if not cleaned or cleaned.casefold() in seen:
                continue
            seen.add(cleaned.casefold())
            keywords.append(cleaned)
            added += 1
            if added >= settings.search_keywords_per_set:
                break
    return keywords


async def _safe_fetch(
    client: RedditClient, subreddit: Subreddit, settings: Settings
) -> list[RedditPost]:
    """Fetch a listing; log-and-degrade to ``[]`` on any Reddit error."""
    try:
        return await client.fetch_subreddit_posts(
            subreddit.name,
            sort=settings.fetch_sort,
            timeframe=settings.fetch_timeframe,
            limit=settings.fetch_limit,
        )
    except RedditError as exc:
        log.warning("fetch_failed", subreddit=subreddit.name, error=str(exc))
        return []


async def _safe_search(
    client: RedditClient, subreddit: Subreddit, query: str, settings: Settings
) -> list[RedditPost]:
    """Search a subreddit for one keyword; degrade to ``[]`` on errors."""
    try:
        return await client.search_subreddit(
            subreddit.name,
            query,
            sort="relevance",
            timeframe=settings.fetch_timeframe,
            limit=settings.search_limit,
        )
    except RedditError as exc:
        log.warning(
            "search_failed", subreddit=subreddit.name, query=query, error=str(exc)
        )
        return []


def _upsert_posts(
    session: Session,
    subreddit: Subreddit,
    posts: Sequence[RedditPost],
    fetched_at: datetime,
) -> int:
    """Insert new posts / refresh metrics of known ones; returns new-row count."""
    candidates = list(posts)
    if not candidates:
        return 0
    ids = [post.reddit_id for post in candidates]
    existing = {
        row.reddit_id: row
        for row in session.scalars(select(RawPost).where(RawPost.reddit_id.in_(ids)))
    }
    inserted = 0
    for post in candidates:
        row = existing.get(post.reddit_id)
        if row is not None:
            row.score = post.score
            row.num_comments = post.num_comments
            row.fetched_at = fetched_at
            continue
        session.add(
            RawPost(
                reddit_id=post.reddit_id,
                subreddit=subreddit,
                title=post.title[:500],
                body=post.body,
                author=post.author[:80],
                score=post.score,
                num_comments=post.num_comments,
                created_utc=post.created_utc,
                permalink=post.permalink[:500],
                fetched_at=fetched_at,
                raw_json=post.raw_json,
                processed=False,
            )
        )
        inserted += 1
    return inserted


async def collect_posts(
    client: RedditClient,
    session: Session,
    settings: Settings,
    *,
    now: datetime,
) -> CollectStats:
    """Fetch listings (+ optional keyword searches) into ``raw_posts``."""
    stats = CollectStats()
    subreddits = list(
        session.scalars(
            select(Subreddit).where(Subreddit.active.is_(True)).order_by(Subreddit.name)
        )
    )
    if not subreddits:
        log.warning("no_active_subreddits")
        return stats
    stats.subreddits = len(subreddits)

    keywords = _active_keywords(session, settings)

    for subreddit in subreddits:
        collected: dict[str, RedditPost] = {}
        for post in await _safe_fetch(client, subreddit, settings):
            collected[post.reddit_id] = post

        if settings.enable_keyword_search and keywords:
            for keyword in keywords:
                for post in await _safe_search(client, subreddit, keyword, settings):
                    collected.setdefault(post.reddit_id, post)
                stats.searches += 1

        if collected:
            subreddit.last_fetched_at = now
        stats.posts_new += _upsert_posts(
            session, subreddit, collected.values(), now
        )
        stats.posts_fetched += len(collected)
        log.info(
            "subreddit_collected",
            subreddit=subreddit.name,
            posts=len(collected),
        )

    session.commit()
    return stats


# -- phase 2: extract --------------------------------------------------------

@dataclass(slots=True)
class ExtractStats:
    posts_scanned: int = 0
    quotes_found: int = 0
    signals_kept: int = 0
    signals_rejected: int = 0
    llm_failures: int = 0


async def extract_signals(
    session: Session, settings: Settings, *, limit: int | None = None
) -> ExtractStats:
    """Regex-extract + DeepSeek-analyze every unprocessed post.

    Concurrent DeepSeek calls are capped by the semaphore in ``extract.llm``.
    Quotes are analyzed once per run (cached by quote hash); posts whose
    analysis failed stay ``processed = False`` so the next run retries them.
    """
    if not settings.deepseek_api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY is not configured; cannot extract pain signals."
        )
    clear_analysis_cache()

    stats = ExtractStats()
    posts = list(
        session.scalars(
            select(RawPost)
            .where(RawPost.processed.is_(False))
            .order_by(RawPost.created_utc.desc())
            .limit(limit or settings.max_posts_per_run)
        )
    )
    if not posts:
        log.info("no_unprocessed_posts")
        return stats

    # 1) regex extraction for every post
    drafts_by_post: dict[RawPost, list[PainSignal]] = {}
    for post in posts:
        stats.posts_scanned += 1
        drafts = await extract_pain_signals(post)
        stats.quotes_found += len(drafts)
        if drafts:
            drafts_by_post[post] = drafts

    if not drafts_by_post:
        for post in posts:
            post.processed = True
        session.commit()
        log.info("no_pain_quotes_found", posts=stats.posts_scanned)
        return stats

    # 2) dedupe quotes across the run by hash, then analyze each unique quote
    contexts: dict[str, tuple[RawPost, str]] = {}
    drafts_by_key: dict[str, list[PainSignal]] = {}
    for post, drafts in drafts_by_post.items():
        for draft in drafts:
            key = quote_key(draft.verbatim_quote)
            contexts.setdefault(key, (post, draft.verbatim_quote))
            drafts_by_key.setdefault(key, []).append(draft)

    results = await asyncio.gather(
        *(
            analyze_pain_signal(post, quote)
            for post, quote in contexts.values()
        ),
        return_exceptions=True,
    )

    failed_keys: set[str] = set()
    for key, result in zip(contexts.keys(), results):
        if isinstance(result, BaseException):
            failed_keys.add(key)
            stats.llm_failures += 1
            log.warning("llm_analysis_failed", quote_key=key, error=str(result))
            continue
        theme = result.get("theme")
        if not theme:
            # not a pain point -> drop the signal entirely
            stats.signals_rejected += len(drafts_by_key[key])
            continue
        for draft in drafts_by_key[key]:
            draft.llm_theme = theme
            draft.llm_reasoning = result.get("reasoning")
            draft.urgency_score = result.get("urgency_score")
            draft.wtp_score = result.get("wtp_score")
            session.add(draft)
            stats.signals_kept += 1

    # 3) mark posts processed (unless one of their quotes failed this run)
    for post, drafts in drafts_by_post.items():
        if any(quote_key(draft.verbatim_quote) in failed_keys for draft in drafts):
            continue
        post.processed = True
    for post in posts:
        if post not in drafts_by_post:
            post.processed = True

    session.commit()
    if stats.llm_failures:
        log.error(
            "extraction_had_failures",
            failures=stats.llm_failures,
            kept=stats.signals_kept,
        )
    log.info(
        "extraction_done",
        posts=stats.posts_scanned,
        quotes=stats.quotes_found,
        kept=stats.signals_kept,
        rejected=stats.signals_rejected,
    )
    return stats


# -- phase 3: report ---------------------------------------------------------

@dataclass(slots=True)
class ReportOutcome:
    report_id: UUID
    themes: int = 0
    signals: int = 0
    emailed: bool = False


def _report_json(
    clusters: Sequence[ThemeCluster],
    *,
    subreddit_names: Sequence[str],
    date_range: tuple[datetime, datetime],
    posts_analyzed: int,
    n_signals: int,
) -> dict[str, Any]:
    """The ``reports.json_content`` payload."""
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "subreddits": list(subreddit_names),
        "period": {
            "start": date_range[0].isoformat(),
            "end": date_range[1].isoformat(),
        },
        "posts_analyzed": posts_analyzed,
        "pain_signals_detected": n_signals,
        "themes": [
            {
                "theme": cluster.theme_name,
                "frequency": cluster.frequency,
                "avg_urgency": cluster.avg_urgency,
                "avg_wtp": cluster.avg_wtp,
                "composite_score": cluster.composite_score,
                "quotes": [
                    {
                        "quote": signal.verbatim_quote,
                        "author": signal.post.author if signal.post else None,
                        "permalink": signal.post.permalink if signal.post else None,
                        "matched_phrase": signal.matched_phrase,
                        "urgency_score": signal.urgency_score,
                        "wtp_score": signal.wtp_score,
                    }
                    for signal in cluster.top_3_quotes
                ],
            }
            for cluster in clusters
        ],
    }


async def build_report(
    session: Session,
    settings: Settings,
    *,
    since: datetime,
    send_email: bool = True,
) -> ReportOutcome | None:
    """Score + cluster + render + persist (+ email) for a signal window.

    Returns ``None`` when no themed signals were extracted in the window.
    """
    signals = list(
        session.scalars(
            select(PainSignal)
            .where(
                PainSignal.extracted_at >= since,
                PainSignal.llm_theme.is_not(None),
            )
            .options(
                selectinload(PainSignal.post).joinedload(RawPost.subreddit),
            )
        )
    )
    if not signals:
        log.info("no_signals_in_window", since=since.isoformat())
        return None

    posts = {signal.post.id: signal.post for signal in signals}
    subreddit_names = sorted(
        {post.subreddit.name for post in posts.values() if post.subreddit}
    )
    subreddit_ids: list[str] = sorted(
        {str(post.subreddit_id) for post in posts.values()}
    )
    dates = [post.created_utc for post in posts.values()]
    date_range = (min(dates), max(dates))
    posts_analyzed = len(posts)

    keyword_set = session.scalars(
        select(KeywordSet)
        .where(KeywordSet.active.is_(True))
        .order_by(KeywordSet.created_at)
        .limit(1)
    ).first()

    report = Report(
        subreddit_ids=subreddit_ids,
        keyword_set_id=keyword_set.id if keyword_set else None,
        status=ReportStatus.pending,
    )
    session.add(report)
    session.flush()
    session.commit()  # committed now so a later rollback can still mark `failed`
    report_id = report.id

    report.status = ReportStatus.generating
    session.commit()

    try:
        score_signals(signals)
        clusters = await cluster_signals(
            signals,
            max_themes=settings.max_themes_before_merge,
            merge_target=settings.merged_theme_target,
        )
        if not clusters:
            raise RuntimeError("no scorable themes after clustering")

        label = ", ".join(subreddit_names) or "unknown"
        markdown = render_report(
            clusters,
            label,
            date_range,
            posts_analyzed=posts_analyzed,
            n_signals=len(signals),
            model=settings.deepseek_model,
        )
        report.markdown_content = markdown
        report.json_content = _report_json(
            clusters,
            subreddit_names=subreddit_names,
            date_range=date_range,
            posts_analyzed=posts_analyzed,
            n_signals=len(signals),
        )
        report.status = ReportStatus.complete
        report.generated_at = datetime.now(timezone.utc)
        report.error = None
        session.commit()
    except Exception as exc:
        session.rollback()
        failed = session.get(Report, report_id)
        if failed is not None:
            failed.status = ReportStatus.failed
            failed.error = str(exc)[:2000]
            session.commit()
        log.exception("report_generation_failed", report_id=str(report_id))
        raise

    emailed = False
    if send_email and email_configured(settings):
        subject = (
            f"Pain Signal Report: r/{', '.join(subreddit_names) or 'unknown'} "
            f"({_fmt(date_range[0])} to {_fmt(date_range[1])})"
        )
        try:
            email_id = send_report_email(
                subject=subject, markdown_body=markdown, settings=settings
            )
            emailed = email_id is not None
        except Exception:
            # a delivery hiccup must not invalidate a generated report
            log.exception("report_email_failed", report_id=str(report_id))
    elif send_email:
        log.info("email_skipped_not_configured")

    log.info(
        "report_generated",
        report_id=str(report_id),
        themes=len(clusters),
        signals=len(signals),
        emailed=emailed,
    )
    return ReportOutcome(
        report_id=report_id,
        themes=len(clusters),
        signals=len(signals),
        emailed=emailed,
    )


def _fmt(value: datetime) -> str:
    return value.date().isoformat()


# -- orchestration -----------------------------------------------------------

@dataclass(slots=True)
class JobResult:
    posts_fetched: int = 0
    posts_new: int = 0
    signals_kept: int = 0
    signals_rejected: int = 0
    llm_failures: int = 0
    themes: int = 0
    report_id: str | None = None
    emailed: bool = False
    started_at: datetime | None = field(default=None)


async def run_fetch_job(
    *,
    settings: Settings | None = None,
    send_email: bool = True,
) -> JobResult:
    """Run the full pipeline once (fetch -> extract -> score -> report)."""
    settings = settings or get_settings()
    started = datetime.now(timezone.utc)
    log.info("job_started", started=started.isoformat(), environment=settings.environment)
    if not settings.deepseek_api_key:
        raise RuntimeError(
            "DEEPSEEK_API_KEY is not configured; the worker cannot extract pain signals."
        )
    if not settings.reddit_client_id or not settings.reddit_client_secret:
        raise RuntimeError(
            "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are not configured."
        )

    with session_scope() as session:
        async with RedditClient(
            client_id=settings.reddit_client_id,
            client_secret=settings.reddit_client_secret,
            user_agent=settings.reddit_user_agent,
        ) as client:
            collect = await collect_posts(client, session, settings, now=started)

        extract = await extract_signals(session, settings)

        since = started - timedelta(hours=settings.report_since_hours)
        outcome = await build_report(
            session, settings, since=since, send_email=send_email
        )

    result = JobResult(
        posts_fetched=collect.posts_fetched,
        posts_new=collect.posts_new,
        signals_kept=extract.signals_kept,
        signals_rejected=extract.signals_rejected,
        llm_failures=extract.llm_failures,
        themes=outcome.themes if outcome else 0,
        report_id=str(outcome.report_id) if outcome else None,
        emailed=outcome.emailed if outcome else False,
        started_at=started,
    )
    log.info(
        "job_finished",
        posts_fetched=result.posts_fetched,
        posts_new=result.posts_new,
        signals_kept=result.signals_kept,
        themes=result.themes,
        report_id=result.report_id,
        emailed=result.emailed,
    )
    return result
