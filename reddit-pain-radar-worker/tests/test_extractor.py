"""Tests for the regex pain-signal extractor."""

from __future__ import annotations

from radar.db.models import RawPost
from radar.extract.extractor import extract_pain_signals, extract_quotes, split_sentences


def test_split_sentences_keeps_punctuation() -> None:
    sentences = split_sentences("First one. Second one! Third one?")
    assert sentences == ["First one.", "Second one!", "Third one?"]


async def test_extracts_quotes_with_surrounding_sentences(raw_post: RawPost) -> None:
    raw_post.title = "Anyone else struggling with reporting?"
    raw_post.body = (
        "It eats a whole morning. "
        "I am tired of rebuilding dashboards. "
        "Someone please fix this."
    )

    signals = await extract_pain_signals(raw_post)

    assert signals, "expected at least one signal"
    phrases = {signal.matched_phrase for signal in signals}
    assert "anyone else struggling" in phrases
    assert "tired of" in phrases

    for signal in signals:
        assert signal.post is raw_post
        # not analyzed yet -> LLM fields stay empty
        assert signal.llm_theme is None
        assert signal.urgency_score is None
        assert signal.wtp_score is None
        assert signal.composite_score is None
        assert signal.extracted_at is not None

    quote = next(
        signal.verbatim_quote for signal in signals if signal.matched_phrase == "tired of"
    )
    # matched sentence plus ±1 sentence window
    assert "tired of rebuilding dashboards" in quote
    assert quote.startswith("It eats a whole morning.")


async def test_deduplicates_identical_quote_windows(raw_post: RawPost) -> None:
    # two different patterns match inside the same single sentence -> one quote
    raw_post.title = "Looking for a solution: I am sick of manual work."
    raw_post.body = ""

    signals = await extract_pain_signals(raw_post)

    assert len(signals) == 1
    assert signals[0].matched_phrase in {"looking for a solution", "sick of"}


async def test_returns_empty_list_without_pain_phrases(raw_post: RawPost) -> None:
    raw_post.title = "We shipped version 2 today"
    raw_post.body = "Nothing to see here."

    assert await extract_pain_signals(raw_post) == []


def test_extract_quotes_is_case_insensitive() -> None:
    results = extract_quotes("I WISH THERE WAS a better way to do this.")
    assert len(results) == 1
    pattern, quote = results[0]
    assert pattern == "I wish there was"
    assert "I WISH THERE WAS" in quote
