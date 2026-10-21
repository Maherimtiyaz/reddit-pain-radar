"""Regex patterns that detect pain-point phrases in Reddit posts."""

from __future__ import annotations

import re

PAIN_PATTERNS: tuple[str, ...] = (
    r"I wish there was",
    r"I wish there were",
    r"anyone else struggling",
    r"anyone else have this problem",
    r"how do you (guys |all )?handle",
    r"how do you (guys |all )?deal with",
    r"is there a tool",
    r"is there a (good |better )?way to",
    r"this is driving me (insane|crazy|nuts)",
    r"I hate (that|when|how)",
    r"why is there no",
    r"why isn't there",
    r"looking for a solution",
    r"looking for a tool",
    r"any recommendations for",
    r"what do you use (for|to)",
    r"frustrated with",
    r"tired of",
    r"sick of",
    r"struggling with",
)

COMPILED_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(pattern, re.IGNORECASE | re.MULTILINE) for pattern in PAIN_PATTERNS
)


def find_pain_matches(text: str) -> list[re.Match[str]]:
    """Every pain-phrase match in ``text``, ordered by position in the text."""
    if not text:
        return []
    matches: list[re.Match[str]] = []
    for pattern in COMPILED_PATTERNS:
        matches.extend(pattern.finditer(text))
    matches.sort(key=lambda match: match.start())
    return matches


def has_pain_phrase(text: str) -> bool:
    """Cheap check: does ``text`` contain any pain phrase at all?"""
    return any(pattern.search(text or "") for pattern in COMPILED_PATTERNS)
