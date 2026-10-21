"""Markdown (and minimal HTML) rendering for pain-signal reports."""

from __future__ import annotations

import html
import re
from datetime import datetime
from typing import Sequence

from radar.db.models import PainSignal
from radar.report.cluster import ThemeCluster

_HEADING_RE = re.compile(r"^(#{1,4})\s+(.*)$")
_ORDERED_RE = re.compile(r"^\d+\.\s+(.*)$")
_UNORDERED_RE = re.compile(r"^[-*]\s+(.*)$")
_LINK_RE = re.compile(r"\[([^\]]+)\]\(([^)\s]+)\)")
_BOLD_RE = re.compile(r"\*\*([^*]+)\*\*")
_ITALIC_RE = re.compile(r"(?<!\*)\*([^*]+)\*(?!\*)")


def _fmt_date(value: datetime | str) -> str:
    if isinstance(value, datetime):
        return value.date().isoformat()
    return str(value)


def _date_range(date_range: tuple) -> tuple[str, str]:
    start, end = date_range[0], date_range[1]
    return _fmt_date(start), _fmt_date(end)


def _evidence_lines(cluster: ThemeCluster) -> list[str]:
    """``1. "quote" — u/author ([source](url))`` for up to three signals."""
    lines: list[str] = []
    for number, signal in enumerate(cluster.top_3_quotes, start=1):
        post = signal.post
        author = post.author if post and post.author else "unknown"
        permalink = (
            post.permalink
            if post and post.permalink
            else "https://www.reddit.com"
        )
        quote = " ".join(signal.verbatim_quote.split())
        lines.append(f'{number}. "{quote}" — u/{author} ([source]({permalink}))')
    if not lines:
        lines.append("_No verbatim evidence captured._")
    return lines


def _opportunity_line(cluster: ThemeCluster) -> str:
    """One LLM sentence for the theme (the first reasoning we have)."""
    for signal in cluster.top_3_quotes:
        if signal.llm_reasoning:
            return signal.llm_reasoning.strip()
    return (
        f"Opportunity to address '{cluster.theme_name}' reported by "
        f"{cluster.frequency} poster(s)."
    )


def _theme_section(index: int, cluster: ThemeCluster) -> str:
    lines = [
        f"## Theme {index}: {cluster.theme_name}",
        f"- **Frequency:** {cluster.frequency} signals",
        f"- **Urgency:** {cluster.avg_urgency}/10",
        f"- **Willingness to Pay:** {cluster.avg_wtp}/10",
        f"- **Composite Score:** {cluster.composite_score}/100",
        "",
        "### Verbatim Evidence",
    ]
    lines.extend(_evidence_lines(cluster))
    lines.extend(["", "### Opportunity", _opportunity_line(cluster)])
    return "\n".join(lines)


def _methodology_section(model: str) -> str:
    return "\n".join(
        [
            "## Methodology",
            "- Data source: Reddit API (OAuth App-Only)",
            f"- Model: {model}",
            "- Scoring: composite = urgency*0.3 + wtp*0.4 + frequency*0.3",
        ]
    )


def _posts_analyzed(cluster: ThemeCluster) -> int:
    return len({signal.raw_post_id for signal in cluster.signals})


def render_markdown(cluster: ThemeCluster, subreddit_name: str, date_range: tuple) -> str:
    """Render a report for a single theme cluster (spec entry point)."""
    start, end = _date_range(date_range)
    lines = [
        f"# Pain Signal Report: r/{subreddit_name}",
        "",
        f"**Period:** {start} to {end}",
        f"**Posts analyzed:** {_posts_analyzed(cluster)}",
        f"**Pain signals detected:** {cluster.frequency}",
        "",
        "## Executive Summary",
        f"Top 3 themes by composite score: {cluster.theme_name} "
        f"({cluster.composite_score}/100)",
        f"Highest opportunity: **{cluster.theme_name}** "
        f"(score: {cluster.composite_score}/100)",
        "",
        _theme_section(1, cluster),
        "",
        _methodology_section("DeepSeek Chat"),
    ]
    return "\n".join(lines)


def render_report(
    clusters: Sequence[ThemeCluster],
    subreddit_name: str,
    date_range: tuple,
    *,
    posts_analyzed: int,
    n_signals: int,
    model: str = "deepseek-chat",
) -> str:
    """Render the full multi-theme report used by the job.

    Themes are ordered by composite score (highest opportunity first).
    """
    ordered = sorted(clusters, key=lambda cluster: cluster.composite_score, reverse=True)
    if not ordered:
        raise ValueError("render_report() needs at least one cluster")
    start, end = _date_range(date_range)

    top_themes = ", ".join(
        f"{cluster.theme_name} ({cluster.composite_score}/100)"
        for cluster in ordered[:3]
    )
    best = ordered[0]
    lines = [
        f"# Pain Signal Report: r/{subreddit_name}",
        "",
        f"**Period:** {start} to {end}",
        f"**Posts analyzed:** {posts_analyzed}",
        f"**Pain signals detected:** {n_signals}",
        "",
        "## Executive Summary",
        f"Top 3 themes by composite score: {top_themes}",
        f"Highest opportunity: **{best.theme_name}** "
        f"(score: {best.composite_score}/100)",
    ]
    for index, cluster in enumerate(ordered, start=1):
        lines.extend(["", _theme_section(index, cluster)])
    lines.extend(["", _methodology_section(model)])
    return "\n".join(lines)


# -- minimal markdown -> HTML (for the Resend email) -------------------------

def _inline(text: str) -> str:
    escaped = html.escape(text, quote=False)
    escaped = _LINK_RE.sub(
        lambda match: (
            f'<a href="{html.escape(match.group(2), quote=True)}">{match.group(1)}</a>'
        ),
        escaped,
    )
    escaped = _BOLD_RE.sub(r"<strong>\1</strong>", escaped)
    escaped = _ITALIC_RE.sub(r"<em>\1</em>", escaped)
    return escaped


def markdown_to_html(markdown: str) -> str:
    """Convert the subset of markdown the reports use into HTML."""
    output: list[str] = []
    paragraph: list[str] = []
    list_tag: str | None = None

    def close_paragraph() -> None:
        if paragraph:
            output.append("<p>" + _inline(" ".join(paragraph)) + "</p>")
            paragraph.clear()

    def close_list() -> None:
        nonlocal list_tag
        if list_tag:
            output.append(f"</{list_tag}>")
            list_tag = None

    for raw_line in markdown.splitlines():
        line = raw_line.strip()
        if not line:
            close_list()
            close_paragraph()
            continue

        heading = _HEADING_RE.match(line)
        if heading:
            close_list()
            close_paragraph()
            level = len(heading.group(1))
            output.append(f"<h{level}>{_inline(heading.group(2))}</h{level}>")
            continue

        ordered = _ORDERED_RE.match(line)
        unordered = _UNORDERED_RE.match(line)
        if ordered or unordered:
            close_paragraph()
            wanted = "ol" if ordered else "ul"
            if list_tag != wanted:
                close_list()
                list_tag = wanted
                output.append(f"<{wanted}>")
            item = ordered.group(1) if ordered else unordered.group(1)
            output.append(f"<li>{_inline(item)}</li>")
            continue

        close_list()
        paragraph.append(line)

    close_list()
    close_paragraph()
    return "\n".join(output)
