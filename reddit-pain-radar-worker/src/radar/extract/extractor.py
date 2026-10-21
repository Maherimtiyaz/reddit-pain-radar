"""Regex-based pain-signal extraction (no LLM involved).

``extract_pain_signals`` combines the post title + body, finds every pain
phrase, captures the surrounding ±1 sentences as a verbatim quote, and
deduplicates quotes (case-insensitive, first 50 characters). Returned
``PainSignal`` rows carry no LLM scores yet.
"""

from __future__ import annotations

import re
from datetime import datetime, timezone

from radar.db.models import PainSignal, RawPost
from radar.extract.patterns import find_pain_matches

SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")
QUOTE_DEDUPE_CHARS = 50


def split_sentences(text: str) -> list[str]:
    """Split ``text`` on ``.``, ``!``, ``?`` boundaries (punctuation kept)."""
    return [part.strip() for part in SENTENCE_SPLIT_RE.split(text) if part.strip()]


def _sentence_index(text: str, sentences: list[str], offset: int) -> int:
    """Index of the sentence containing the character position ``offset``."""
    cursor = 0
    last = 0
    for index, sentence in enumerate(sentences):
        start = text.find(sentence, cursor)
        if start == -1:
            start = cursor
        if start <= offset < start + len(sentence):
            return index
        cursor = start + len(sentence)
        last = index
    return last


def extract_quotes(text: str) -> list[tuple[str, str]]:
    """``(matched_pattern, quote)`` for each pain match, deduplicated.

    The quote is the matched sentence plus up to one sentence before and
    after it. Duplicate quotes (case-insensitive, first 50 chars) collapse
    to the first pattern that produced them.
    """
    if not text:
        return []
    sentences = split_sentences(text)
    if not sentences:
        return []

    results: list[tuple[str, str]] = []
    seen: set[str] = set()
    for match in find_pain_matches(text):
        index = _sentence_index(text, sentences, match.start())
        window = sentences[max(0, index - 1) : index + 2]
        quote = " ".join(window).strip()
        if not quote:
            continue
        key = quote.casefold()[:QUOTE_DEDUPE_CHARS]
        if key in seen:
            continue
        seen.add(key)
        results.append((match.re.pattern, quote))
    return results


async def extract_pain_signals(post: RawPost) -> list[PainSignal]:
    """Extract unscored pain signals from a raw post (spec entry point)."""
    text = f"{post.title}\n{post.body}".strip()
    now = datetime.now(timezone.utc)
    signals: list[PainSignal] = []
    for matched_phrase, quote in extract_quotes(text):
        signals.append(
            PainSignal(
                post=post,
                matched_phrase=matched_phrase,
                verbatim_quote=quote,
                extracted_at=now,
            )
        )
    return signals
