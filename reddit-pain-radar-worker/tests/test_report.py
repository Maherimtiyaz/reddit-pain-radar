"""Tests for clustering, markdown rendering, and email payload building."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

import pytest

from radar.db.models import PainSignal
from radar.report.cluster import cluster_signals
from radar.report.email import build_email_payload
from radar.report.render import markdown_to_html, render_markdown, render_report

UTC = timezone.utc
PERIOD = (datetime(2026, 10, 1, tzinfo=UTC), datetime(2026, 10, 14, tzinfo=UTC))


# -- clustering --------------------------------------------------------------

async def test_cluster_groups_by_theme_and_sorts_by_score(
    signals: list[PainSignal],
) -> None:
    clusters = await cluster_signals(signals)

    # sorted by composite score descending: 69 > 64
    assert [cluster.theme_name for cluster in clusters] == [
        "Pricing anxiety",
        "Manual spreadsheet work",
    ]

    spreadsheet = clusters[1]
    assert spreadsheet.frequency == 3
    assert spreadsheet.avg_urgency == 6.0
    assert spreadsheet.avg_wtp == 7.0
    assert spreadsheet.composite_score == 64.0
    assert len(spreadsheet.top_3_quotes) == 3

    pricing = clusters[0]
    assert pricing.frequency == 1
    assert pricing.composite_score == 69.0


async def test_cluster_ignores_signals_without_a_theme(
    signals: list[PainSignal],
) -> None:
    clusters = await cluster_signals(signals)
    assert all("passing" not in cluster.theme_name for cluster in clusters)
    assert sum(cluster.frequency for cluster in clusters) == 4


async def test_cluster_merges_when_theme_count_exceeds_threshold(
    make_signal: Callable[..., PainSignal],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    signals = [
        make_signal(
            theme=f"Theme number {i}",
            urgency=5.0,
            wtp=5.0,
            quote=f"unique quote {i}",
        )
        for i in range(25)
    ]

    merge_calls: list[int] = []

    async def fake_merge(themes: list[str], *, max_themes: int = 10) -> dict[str, str]:
        merge_calls.append(len(themes))
        return {theme: f"Merged group {i % 3}" for i, theme in enumerate(themes)}

    monkeypatch.setattr("radar.report.cluster.merge_themes", fake_merge)

    clusters = await cluster_signals(signals, max_themes=20, merge_target=10)

    assert merge_calls == [25]  # second-pass LLM call happened
    assert len(clusters) == 3  # <= merge_target
    assert sum(cluster.frequency for cluster in clusters) == 25


async def test_cluster_skips_merge_below_threshold(
    signals: list[PainSignal],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_merge(*args: object, **kwargs: object) -> dict[str, str]:
        raise AssertionError("merge_themes must not be called below the threshold")

    monkeypatch.setattr("radar.report.cluster.merge_themes", fake_merge)
    clusters = await cluster_signals(signals, max_themes=20)
    assert len(clusters) == 2


# -- rendering ---------------------------------------------------------------

async def test_render_markdown_includes_required_sections(
    signals: list[PainSignal],
) -> None:
    clusters = await cluster_signals(signals)
    best = clusters[0]

    markdown = render_markdown(best, "SaaS", PERIOD)

    assert markdown.startswith("# Pain Signal Report: r/SaaS")
    assert "**Period:** 2026-10-01 to 2026-10-14" in markdown
    assert "**Posts analyzed:**" in markdown
    assert f"**Pain signals detected:** {best.frequency}" in markdown
    assert "## Executive Summary" in markdown
    assert f"## Theme 1: {best.theme_name}" in markdown
    assert "- **Frequency:**" in markdown
    assert "- **Urgency:**" in markdown
    assert "- **Willingness to Pay:**" in markdown
    assert "- **Composite Score:**" in markdown
    assert "### Verbatim Evidence" in markdown
    assert "u/founder_pat" in markdown
    assert "https://www.reddit.com/r/SaaS/comments/abc123/i_wish/" in markdown
    assert "### Opportunity" in markdown
    assert "## Methodology" in markdown
    assert "OAuth App-Only" in markdown
    assert "composite = urgency*0.3 + wtp*0.4 + frequency*0.3" in markdown


async def test_render_report_covers_all_themes_sorted(
    signals: list[PainSignal],
) -> None:
    clusters = await cluster_signals(signals)

    markdown = render_report(
        clusters,
        "SaaS",
        PERIOD,
        posts_analyzed=12,
        n_signals=len(signals),
        model="deepseek-chat",
    )

    assert "## Theme 1: Pricing anxiety" in markdown
    assert "## Theme 2: Manual spreadsheet work" in markdown
    assert "**Posts analyzed:** 12" in markdown
    assert f"**Pain signals detected:** {len(signals)}" in markdown
    assert "Highest opportunity: **Pricing anxiety**" in markdown
    assert "Top 3 themes by composite score:" in markdown
    assert "- Model: deepseek-chat" in markdown


def test_render_report_requires_a_cluster() -> None:
    with pytest.raises(ValueError):
        render_report([], "SaaS", PERIOD, posts_analyzed=0, n_signals=0)


def test_markdown_to_html_renders_report_elements() -> None:
    rendered = markdown_to_html(
        "# Title\n\nSome **bold** text and a [link](https://x.test/a).\n\n"
        "- first\n- second\n"
    )
    assert "<h1>Title</h1>" in rendered
    assert "<strong>bold</strong>" in rendered
    assert '<a href="https://x.test/a">link</a>' in rendered
    assert "<ul>" in rendered and "<li>first</li>" in rendered
    assert "<p>" in rendered


# -- email payload -----------------------------------------------------------

def test_build_email_payload_contains_text_and_html() -> None:
    payload = build_email_payload(
        subject="Weekly report",
        markdown_body="# Hi\n\nSome text with **bold**.",
        from_email="reports@example.com",
        to="me@example.com",
    )
    assert payload["to"] == ["me@example.com"]
    assert payload["from"] == "reports@example.com"
    assert "# Hi" in payload["text"]
    assert "<h1>Hi</h1>" in payload["html"]
    assert "<strong>bold</strong>" in payload["html"]
