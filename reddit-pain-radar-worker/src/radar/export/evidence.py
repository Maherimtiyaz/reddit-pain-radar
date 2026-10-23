"""Export ingested evidence (posts + scored signals) as JSONL.

The consumer is the Next.js app's importer at the repo root
(``npm run db:ingest -- data/evidence.jsonl``). The two projects keep
independent schemas on purpose — their ``raw_posts``/``pain_signals``
tables even share names while differing in columns — so the seam is a
versioned file contract, never a shared database connection.

Contract (one JSON object per line, UTF-8):

    {"version": 1, "post": {...}, "signals": [...]}

Only signals with an ``llm_theme`` are exported: per the LLM contract a
null theme means "not a pain point". Timestamps are ISO-8601 UTC.
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable

import structlog
from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from radar.db.models import PainSignal, RawPost

log = structlog.get_logger(__name__)

EVIDENCE_SCHEMA_VERSION = 1


def _iso(value: datetime | None) -> str | None:
    """ISO-8601 UTC timestamp, or None when the column is unset."""
    return value.isoformat() if value is not None else None


def load_posts(session: Session, *, since: datetime | None = None) -> list[RawPost]:
    """Load posts oldest-first with subreddit and signals eagerly joined."""
    stmt = (
        select(RawPost)
        .options(joinedload(RawPost.subreddit), joinedload(RawPost.signals))
        .order_by(RawPost.created_utc)
    )
    if since is not None:
        stmt = stmt.where(RawPost.created_utc >= since)
    return list(session.scalars(stmt).unique())


def serialize_post(post: RawPost) -> dict[str, Any]:
    """Map a worker post onto the app importer's field names."""
    return {
        "redditId": post.reddit_id,
        "subreddit": post.subreddit.name,
        "title": post.title,
        "body": post.body,
        "author": post.author,
        "score": post.score,
        "numComments": post.num_comments,
        "createdUtc": _iso(post.created_utc),
        "url": post.permalink,
        "fetchedAt": _iso(post.fetched_at),
    }


def serialize_signal(signal: PainSignal) -> dict[str, Any]:
    """Map a scored signal onto the app importer's field names."""
    return {
        "theme": signal.llm_theme,
        "verbatimQuote": signal.verbatim_quote,
        "urgencyScore": signal.urgency_score,
        "wtpScore": signal.wtp_score,
        "compositeScore": signal.composite_score,
        "extractedAt": _iso(signal.extracted_at),
    }


def write_evidence(posts: Iterable[RawPost], out: Path) -> tuple[int, int]:
    """Write one JSON line per post; returns (posts_written, signals_written)."""
    out.parent.mkdir(parents=True, exist_ok=True)
    post_count = 0
    signal_count = 0
    with out.open("w", encoding="utf-8") as handle:
        for post in posts:
            scored = [s for s in post.signals if s.llm_theme is not None]
            record = {
                "version": EVIDENCE_SCHEMA_VERSION,
                "post": serialize_post(post),
                "signals": [serialize_signal(s) for s in scored],
            }
            handle.write(json.dumps(record, ensure_ascii=False) + "\n")
            post_count += 1
            signal_count += len(scored)
    log.info(
        "evidence_written",
        posts=post_count,
        signals=signal_count,
        out=str(out),
    )
    return post_count, signal_count


def export_evidence(
    session: Session, out: Path, *, since: datetime | None = None
) -> tuple[int, int]:
    """Load posts from the worker DB and write the JSONL evidence file."""
    return write_evidence(load_posts(session, since=since), out)
