"""Tests for the composite scoring engine."""

from __future__ import annotations

from typing import Callable

import pytest

from radar.db.models import PainSignal
from radar.score.scorer import (
    compute_composite_score,
    compute_theme_stats,
    group_by_theme,
    score_signals,
)


def test_composite_formula_matches_spec() -> None:
    # (8*0.3 + 9*0.4 + 1.0*10*0.3) * 10 = 90
    assert compute_composite_score(8, 9, 5) == 90.0
    # frequency 1 -> normalized 0.2 -> (2.4 + 3.6 + 0.6) * 10 = 66
    assert compute_composite_score(8, 9, 1) == 66.0
    # frequency above the cap of 5 does not add anything
    assert compute_composite_score(8, 9, 40) == 90.0
    # extremes
    assert compute_composite_score(0, 0, 0) == 0.0
    assert compute_composite_score(10, 10, 5) == 100.0


def test_group_by_theme_skips_unthemed_signals(signals: list[PainSignal]) -> None:
    groups = group_by_theme(signals)
    assert set(groups) == {"Manual spreadsheet work", "Pricing anxiety"}
    assert len(groups["Manual spreadsheet work"]) == 3


def test_score_signals_sets_composite_on_each_signal(
    signals: list[PainSignal],
) -> None:
    scores = score_signals(signals)

    assert scores == pytest.approx(
        {"Manual spreadsheet work": 64.0, "Pricing anxiety": 69.0}
    )
    for signal in signals:
        if signal.llm_theme == "Manual spreadsheet work":
            assert signal.composite_score == 64.0
        elif signal.llm_theme == "Pricing anxiety":
            assert signal.composite_score == 69.0
        else:
            assert signal.composite_score is None  # untouched without a theme


def test_theme_stats_averages_and_frequency(
    make_signal: Callable[..., PainSignal],
) -> None:
    group = [
        make_signal(urgency=4.0, wtp=6.0),
        make_signal(urgency=8.0, wtp=8.0),
    ]
    stats = compute_theme_stats("Manual spreadsheet work", group)

    assert stats.frequency == 2
    assert stats.avg_urgency == 6.0
    assert stats.avg_wtp == 7.0
    # (6*0.3 + 7*0.4 + 0.4*10*0.3) * 10 = 58.0
    assert stats.composite_score == 58.0


def test_theme_stats_requires_signals(
    make_signal: Callable[..., PainSignal],
) -> None:
    with pytest.raises(ValueError):
        compute_theme_stats("Empty", [])
