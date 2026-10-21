"""Shared fixtures for the worker test-suite.

All fixtures build *transient* ORM objects — no database connection needed.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

import pytest

from radar.db.models import PainSignal, RawPost, Subreddit

UTC = timezone.utc


@pytest.fixture
def subreddit() -> Subreddit:
    return Subreddit(name="SaaS", display_name="r/SaaS")


@pytest.fixture
def raw_post(subreddit: Subreddit) -> RawPost:
    return RawPost(
        reddit_id="t3_abc123",
        subreddit=subreddit,
        title="I wish there was a tool for this",
        body=(
            "It costs me hours every week. "
            "I am frustrated with spreadsheets."
        ),
        author="founder_pat",
        score=42,
        num_comments=7,
        created_utc=datetime(2026, 10, 1, 12, 0, tzinfo=UTC),
        permalink="https://www.reddit.com/r/SaaS/comments/abc123/i_wish/",
        raw_json={"kind": "t3", "data": {"id": "abc123"}},
    )


@pytest.fixture
def make_signal(
    raw_post: RawPost,
) -> Callable[..., PainSignal]:
    """Factory for unscored/scored pain signals attached to ``raw_post``."""

    def _make(
        *,
        theme: str | None = "Manual spreadsheet work",
        urgency: float | None = 6.0,
        wtp: float | None = 7.0,
        quote: str = "It costs me hours every week.",
        composite: float | None = None,
        reasoning: str | None = "Teams lose hours to manual data wrangling.",
    ) -> PainSignal:
        return PainSignal(
            post=raw_post,
            matched_phrase="frustrated with",
            verbatim_quote=quote,
            llm_theme=theme,
            llm_reasoning=reasoning if theme else None,
            urgency_score=urgency,
            wtp_score=wtp,
            composite_score=composite,
            extracted_at=datetime(2026, 10, 14, tzinfo=UTC),
        )

    return _make


@pytest.fixture
def signals(make_signal: Callable[..., PainSignal]) -> list[PainSignal]:
    """Three signals in one theme, one in another, one without a theme."""
    return [
        make_signal(
            theme="Manual spreadsheet work",
            urgency=6.0,
            wtp=7.0,
            quote="It costs me hours every week.",
        ),
        make_signal(
            theme="Manual spreadsheet work",
            urgency=6.0,
            wtp=7.0,
            quote="I waste hours copying data by hand.",
        ),
        make_signal(
            theme="Manual spreadsheet work",
            urgency=6.0,
            wtp=7.0,
            quote="Nobody should maintain spreadsheets like this.",
        ),
        make_signal(
            theme="Pricing anxiety",
            urgency=9.0,
            wtp=9.0,
            quote="I would pay for a fix today.",
        ),
        make_signal(
            theme=None,
            urgency=None,
            wtp=None,
            quote="Just a passing note.",
            reasoning=None,
        ),
    ]
