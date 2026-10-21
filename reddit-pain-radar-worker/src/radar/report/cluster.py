"""Theme clustering: group pain signals by ``llm_theme``.

When there are more than ``max_themes`` (default 20) distinct themes, a
second-pass LLM call merges them into at most ``merge_target`` (default 10)
broader themes via an explicit JSON mapping.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Sequence

import structlog

from radar.db.models import PainSignal
from radar.extract.llm import complete_json
from radar.score.scorer import compute_theme_stats, group_by_theme

log = structlog.get_logger(__name__)

MERGE_PROMPT_TEMPLATE = """You are consolidating themes for a pain-signal report.

Merge these themes into at most {max_themes} broader themes.
Return a JSON object mapping EVERY original theme to one of the merged themes,
for example: {{"Original theme": "Merged theme"}}.

Rules:
- Every input theme must appear as a key exactly once.
- Values must be specific, 3-6 words.
- Use at most {max_themes} distinct values.

Themes:
{themes}
"""


@dataclass(slots=True)
class ThemeCluster:
    """One theme plus its aggregated stats and strongest evidence."""

    theme_name: str
    signals: list[PainSignal]
    frequency: int
    avg_urgency: float
    avg_wtp: float
    composite_score: float
    top_3_quotes: list[PainSignal] = field(default_factory=list)


async def merge_themes(themes: list[str], *, max_themes: int = 10) -> dict[str, str]:
    """Ask the LLM to map many themes onto at most ``max_themes`` groups."""
    prompt = MERGE_PROMPT_TEMPLATE.format(
        max_themes=max_themes,
        themes="\n".join(f"- {theme}" for theme in themes),
    )
    raw = await complete_json(prompt, temperature=0.0)
    mapping = raw.get("mapping") if isinstance(raw.get("mapping"), dict) else raw
    known = {theme.casefold(): theme for theme in themes}
    result: dict[str, str] = {}
    for key, value in mapping.items():
        source = known.get(str(key).casefold())
        if source is not None and isinstance(value, str) and value.strip():
            result[source] = value.strip()
    # themes the model skipped keep their own name (still a complete mapping)
    for theme in themes:
        result.setdefault(theme, theme)
    log.info(
        "themes_merged", before=len(themes), after=len(set(result.values()))
    )
    return result


def _top_signals(signals: list[PainSignal], k: int = 3) -> list[PainSignal]:
    """Highest-scoring signals first (urgency breaks ties)."""

    def sort_key(signal: PainSignal) -> tuple[float, float]:
        return (
            signal.composite_score or 0.0,
            signal.urgency_score or 0.0,
        )

    return sorted(signals, key=sort_key, reverse=True)[:k]


async def cluster_signals(
    signals: Sequence[PainSignal],
    *,
    max_themes: int = 20,
    merge_target: int = 10,
) -> list[ThemeCluster]:
    """Group signals by ``llm_theme``, merging with the LLM when too many."""
    groups = group_by_theme(list(signals))
    if not groups:
        return []

    if len(groups) > max_themes:
        mapping = await merge_themes(sorted(groups), max_themes=merge_target)
        merged: dict[str, list[PainSignal]] = {}
        for theme, members in groups.items():
            merged.setdefault(mapping.get(theme, theme), []).extend(members)
        groups = merged

    clusters: list[ThemeCluster] = []
    for theme, members in groups.items():
        stats = compute_theme_stats(theme, members)
        for member in members:
            # keep the per-signal score in sync even if scoring was skipped
            if member.composite_score is None:
                member.composite_score = stats.composite_score
        clusters.append(
            ThemeCluster(
                theme_name=theme,
                signals=members,
                frequency=stats.frequency,
                avg_urgency=stats.avg_urgency,
                avg_wtp=stats.avg_wtp,
                composite_score=stats.composite_score,
                top_3_quotes=_top_signals(members),
            )
        )

    clusters.sort(key=lambda cluster: cluster.composite_score, reverse=True)
    return clusters
