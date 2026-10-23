"""Populate the worker DB with realistic posts + scored pain signals.

A local-development stand-in for `radar fetch`: no Reddit credentials or
DeepSeek key needed. The seeded evidence flows through the same export
seam as real ingestion (`radar export`), so the worker -> app bridge can
be exercised end to end.

Usage:
    uv run python scripts/seed_evidence.py
"""

from __future__ import annotations

import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

# Fallback so the script also works when the package is not installed.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sqlalchemy import select

from radar.db.models import PainSignal, RawPost, Subreddit
from radar.db.session import session_scope
from radar.logging import configure_logging
from radar.score.scorer import score_signals

UTC = timezone.utc
NOW = datetime.now(UTC)

# (theme, verbatim_quote, urgency 0-10, willingness-to-pay 0-10)
POSTS: list[dict] = [
    {
        "reddit_id": "t3_seed_pricing_001",
        "subreddit": "SaaS",
        "title": "Am I crazy or has every SaaS gotten wildly expensive?",
        "body": (
            "We went from $29/mo to $99/seat in two years. I'm about to cancel "
            "and go back to spreadsheets because I can't justify the renewal. "
            "Every alternative quotes 'custom enterprise pricing' which means "
            "nobody publishes a price anymore."
        ),
        "author": "bootstrapped_ben",
        "score": 214,
        "num_comments": 87,
        "signals": [
            (
                "SaaS price spirals",
                "I'm about to cancel and go back to spreadsheets because I can't "
                "justify the renewal",
                8.5,
                9.0,
            ),
            (
                "Opaque enterprise pricing",
                "Every alternative quotes 'custom enterprise pricing' which means "
                "nobody publishes a price anymore",
                6.0,
                7.5,
            ),
        ],
    },
    {
        "reddit_id": "t3_seed_onboarding_001",
        "subreddit": "webdev",
        "title": "Spent my whole Sunday fighting a migration guide",
        "body": (
            "The docs assume you started from scratch. There's no path for "
            "importing an existing project, so I'm hand-copying config files "
            "and praying. I would pay good money for a tool that just does "
            "the migration for you."
        ),
        "author": "weekend_hacker",
        "score": 156,
        "num_comments": 43,
        "signals": [
            (
                "Missing migration tooling",
                "There's no path for importing an existing project",
                7.5,
                6.5,
            ),
            (
                "Paid migration tool demand",
                "I would pay good money for a tool that just does the migration "
                "for you",
                7.0,
                9.5,
            ),
        ],
    },
    {
        "reddit_id": "t3_seed_analytics_001",
        "subreddit": "startups",
        "title": "My analytics dashboard tells me nothing actionable",
        "body": (
            "Pretty charts, zero answers. I don't know which feature actually "
            "retains users. I'd love something that surfaces the 'why' behind "
            "churn instead of another pageview graph. Shut up and take my "
            "money if someone builds this."
        ),
        "author": "churned_cto",
        "score": 98,
        "num_comments": 31,
        "signals": [
            (
                "Actionable analytics gap",
                "I don't know which feature actually retains users",
                7.0,
                8.0,
            ),
            (
                "Churn insight demand",
                "I'd love something that surfaces the 'why' behind churn",
                8.0,
                8.5,
            ),
        ],
    },
]


def seed() -> tuple[int, int]:
    """Insert posts/signals missing by reddit_id; returns (posts, signals)."""
    with session_scope() as session:
        existing_ids = set(session.scalars(select(RawPost.reddit_id)))

        wanted = {item["subreddit"] for item in POSTS}
        subreddit_rows = session.scalars(
            select(Subreddit).where(Subreddit.name.in_(wanted))
        ).all()
        subreddits = {row.name: row for row in subreddit_rows}

        added_posts = 0
        added_signals = 0
        for index, item in enumerate(POSTS):
            if item["reddit_id"] in existing_ids:
                continue

            subreddit = subreddits.get(item["subreddit"])
            if subreddit is None:
                subreddit = Subreddit(
                    name=item["subreddit"], display_name=f"r/{item['subreddit']}"
                )
                session.add(subreddit)

            post = RawPost(
                reddit_id=item["reddit_id"],
                subreddit=subreddit,
                title=item["title"],
                body=item["body"],
                author=item["author"],
                score=item["score"],
                num_comments=item["num_comments"],
                created_utc=NOW - timedelta(hours=24 * (index + 1)),
                permalink=(
                    f"https://www.reddit.com/r/{item['subreddit']}/"
                    f"comments/{item['reddit_id'].removeprefix('t3_')}/"
                ),
                fetched_at=NOW,
            )
            signals = [
                PainSignal(
                    post=post,
                    matched_phrase="(seeded)",
                    verbatim_quote=quote,
                    llm_theme=theme,
                    llm_reasoning="Seeded for local development.",
                    urgency_score=urgency,
                    wtp_score=wtp,
                )
                for theme, quote, urgency, wtp in item["signals"]
            ]
            score_signals(signals)  # real composite formula, not a placeholder

            session.add(post)
            added_posts += 1
            added_signals += len(signals)

    return added_posts, added_signals


def main() -> int:
    configure_logging()
    added_posts, added_signals = seed()
    print(f"seeded posts={added_posts} signals={added_signals}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
