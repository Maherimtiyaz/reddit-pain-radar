"""Tests for the JSONL evidence export (the app importer's file contract)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Callable

from radar.db.models import PainSignal, RawPost
from radar.export.evidence import (
    EVIDENCE_SCHEMA_VERSION,
    export_evidence,
    serialize_post,
    serialize_signal,
    write_evidence,
)


class _FakeScalars:
    """Mimics the ``scalars(...).unique()`` chain used by ``load_posts``."""

    def __init__(self, posts: list[RawPost]) -> None:
        self._posts = posts

    def unique(self) -> "_FakeScalars":
        return self

    def __iter__(self) -> Any:
        return iter(self._posts)


class _FakeSession:
    """Minimal stand-in for a SQLAlchemy Session (tests never touch a DB)."""

    def __init__(self, posts: list[RawPost]) -> None:
        self._posts = posts

    def scalars(self, _statement: Any) -> _FakeScalars:
        return _FakeScalars(self._posts)


def _read_lines(path: Path) -> list[dict[str, Any]]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


# -- serialization -----------------------------------------------------------


def test_serialize_post_maps_app_field_names(raw_post: RawPost) -> None:
    raw_post.fetched_at = raw_post.created_utc

    post = serialize_post(raw_post)

    assert post["redditId"] == "t3_abc123"
    assert post["subreddit"] == "SaaS"
    assert post["title"] == "I wish there was a tool for this"
    assert post["author"] == "founder_pat"
    assert post["score"] == 42
    assert post["numComments"] == 7
    assert post["url"] == raw_post.permalink
    assert post["createdUtc"] == "2026-10-01T12:00:00+00:00"
    assert post["fetchedAt"] == "2026-10-01T12:00:00+00:00"


def test_serialize_signal_maps_scores(make_signal: Callable[..., PainSignal]) -> None:
    signal = make_signal(theme="Pricing anxiety", urgency=9.0, wtp=9.0, composite=69.0)

    payload = serialize_signal(signal)

    assert payload["theme"] == "Pricing anxiety"
    assert payload["verbatimQuote"] == "It costs me hours every week."
    assert payload["urgencyScore"] == 9.0
    assert payload["wtpScore"] == 9.0
    assert payload["compositeScore"] == 69.0
    assert payload["extractedAt"] == "2026-10-14T00:00:00+00:00"


# -- file contract -----------------------------------------------------------


def test_write_evidence_emits_versioned_records(
    raw_post: RawPost, make_signal: Callable[..., PainSignal], tmp_path: Path
) -> None:
    raw_post.fetched_at = raw_post.created_utc
    make_signal(theme="Pricing anxiety", urgency=9.0, wtp=9.0, composite=69.0)
    out = tmp_path / "evidence.jsonl"

    posts, signals = write_evidence([raw_post], out)

    assert (posts, signals) == (1, 1)
    lines = _read_lines(out)
    assert len(lines) == 1
    record = lines[0]
    assert record["version"] == EVIDENCE_SCHEMA_VERSION
    assert record["post"]["redditId"] == "t3_abc123"
    assert record["signals"][0]["theme"] == "Pricing anxiety"


def test_write_evidence_drops_signals_without_a_theme(
    raw_post: RawPost, make_signal: Callable[..., PainSignal], tmp_path: Path
) -> None:
    raw_post.fetched_at = raw_post.created_utc
    make_signal(theme=None, quote="Just a passing note.")
    out = tmp_path / "evidence.jsonl"

    posts, signals = write_evidence([raw_post], out)

    # The post is still exported (keyword filters match title/body), but the
    # unthemed signal is dropped: null theme means "not a pain point".
    assert (posts, signals) == (1, 0)
    record = _read_lines(out)[0]
    assert record["signals"] == []


def test_write_evidence_is_deterministic(
    raw_post: RawPost, make_signal: Callable[..., PainSignal], tmp_path: Path
) -> None:
    raw_post.fetched_at = raw_post.created_utc
    make_signal(theme="Pricing anxiety")
    first = tmp_path / "a.jsonl"
    second = tmp_path / "b.jsonl"

    write_evidence([raw_post], first)
    write_evidence([raw_post], second)

    assert first.read_text(encoding="utf-8") == second.read_text(encoding="utf-8")


def test_write_evidence_handles_no_posts(tmp_path: Path) -> None:
    out = tmp_path / "nested" / "evidence.jsonl"

    posts, signals = write_evidence([], out)

    assert (posts, signals) == (0, 0)
    assert out.read_text(encoding="utf-8") == ""


# -- end-to-end (fake session) ----------------------------------------------


def test_export_evidence_loads_and_writes(
    raw_post: RawPost, make_signal: Callable[..., PainSignal], tmp_path: Path
) -> None:
    raw_post.fetched_at = raw_post.created_utc
    make_signal(theme="Pricing anxiety", composite=69.0)
    make_signal(theme=None, quote="Just a passing note.")
    out = tmp_path / "evidence.jsonl"

    posts, signals = export_evidence(_FakeSession([raw_post]), out)

    assert (posts, signals) == (1, 1)
    record = _read_lines(out)[0]
    assert record["post"]["subreddit"] == "SaaS"
    assert len(record["signals"]) == 1
    assert record["signals"][0]["compositeScore"] == 69.0
