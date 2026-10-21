"""Composite opportunity scoring.

Formula (0-100)::

    (urgency * 0.3 + wtp * 0.4 + frequency_normalized * 0.3) * 10

where ``frequency_normalized = min(frequency / 5, 1.0)`` (5+ occurrences
already maxes out the frequency component).
"""

from __future__ import annotations

from dataclasses import dataclass
from statistics import fmean
from typing import Iterable

from radar.db.models import PainSignal

FREQUENCY_CAP = 5
WEIGHT_URGENCY = 0.3
WEIGHT_WTP = 0.4
WEIGHT_FREQUENCY = 0.3


def compute_composite_score(urgency: float, wtp: float, frequency: int) -> float:
    """Composite score 0-100 from average urgency/wtp and signal frequency."""
    frequency_norm = min(max(frequency, 0) / FREQUENCY_CAP, 1.0)
    raw = (
        (urgency * WEIGHT_URGENCY)
        + (wtp * WEIGHT_WTP)
        + (frequency_norm * 10 * WEIGHT_FREQUENCY)
    )
    return round(min(max(raw * 10, 0.0), 100.0), 2)


@dataclass(slots=True)
class ThemeStats:
    """Aggregated numbers for one theme."""

    theme: str
    frequency: int
    avg_urgency: float
    avg_wtp: float
    composite_score: float


def group_by_theme(signals: Iterable[PainSignal]) -> dict[str, list[PainSignal]]:
    """Group signals by ``llm_theme`` (signals without a theme are skipped)."""
    groups: dict[str, list[PainSignal]] = {}
    for signal in signals:
        theme = signal.llm_theme
        if not theme:
            continue
        groups.setdefault(theme, []).append(signal)
    return groups


def compute_theme_stats(theme: str, signals: list[PainSignal]) -> ThemeStats:
    """Frequency + average urgency/wtp + composite for one theme."""
    if not signals:
        raise ValueError("compute_theme_stats() needs at least one signal")
    urgency = fmean(
        [
            signal.urgency_score if signal.urgency_score is not None else 0.0
            for signal in signals
        ]
    )
    wtp = fmean(
        [signal.wtp_score if signal.wtp_score is not None else 0.0 for signal in signals]
    )
    return ThemeStats(
        theme=theme,
        frequency=len(signals),
        avg_urgency=round(urgency, 2),
        avg_wtp=round(wtp, 2),
        composite_score=compute_composite_score(urgency, wtp, len(signals)),
    )


def score_signals(signals: Iterable[PainSignal]) -> dict[str, float]:
    """Score every themed signal in place; returns ``{theme: composite}``."""
    groups = group_by_theme(signals)
    scores: dict[str, float] = {}
    for theme, members in groups.items():
        stats = compute_theme_stats(theme, members)
        for signal in members:
            signal.composite_score = stats.composite_score
        scores[theme] = stats.composite_score
    return scores
