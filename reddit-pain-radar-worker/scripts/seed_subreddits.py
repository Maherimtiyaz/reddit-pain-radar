"""Populate test data: active subreddits + keyword sets.

Usage:
    uv run python scripts/seed_subreddits.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# Fallback so the script also works when the package is not installed.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from sqlalchemy import select

from radar.db.models import KeywordSet, Subreddit
from radar.db.session import session_scope
from radar.logging import configure_logging

SUBREDDITS: list[tuple[str, str]] = [
    ("SaaS", "r/SaaS"),
    ("Entrepreneur", "r/Entrepreneur"),
    ("startups", "r/startups"),
    ("indiehackers", "r/indiehackers"),
    ("smallbusiness", "r/smallbusiness"),
    ("ProductManagement", "r/ProductManagement"),
    ("webdev", "r/webdev"),
]

KEYWORD_SETS: list[tuple[str, list[str]]] = [
    (
        "pricing pain",
        [
            "too expensive",
            "pricing",
            "price increase",
            "not worth it",
            "cancel my subscription",
        ],
    ),
    (
        "workflow friction",
        [
            "waste time",
            "manually",
            "spreadsheet",
            "copy paste",
            "no api",
        ],
    ),
    (
        "tool requests",
        [
            "is there a tool",
            "looking for a tool",
            "i wish there was",
            "alternative to",
        ],
    ),
]


def seed() -> tuple[int, int]:
    """Insert missing subreddits/keyword sets; returns (subreddits, keyword_sets)."""
    with session_scope() as session:
        existing_subs = set(session.scalars(select(Subreddit.name)))
        added_subs = 0
        for name, display_name in SUBREDDITS:
            if name in existing_subs:
                continue
            session.add(Subreddit(name=name, display_name=display_name))
            added_subs += 1

        existing_sets = set(session.scalars(select(KeywordSet.name)))
        added_sets = 0
        for name, keywords in KEYWORD_SETS:
            if name in existing_sets:
                continue
            session.add(KeywordSet(name=name, keywords=keywords))
            added_sets += 1

    return added_subs, added_sets


def main() -> int:
    configure_logging()
    added_subs, added_sets = seed()
    print(f"seeded subreddits={added_subs} keyword_sets={added_sets}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
