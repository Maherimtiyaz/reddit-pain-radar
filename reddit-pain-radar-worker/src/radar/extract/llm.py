"""DeepSeek client wrapper (OpenAI SDK with a DeepSeek ``base_url``).

- one shared ``AsyncOpenAI`` client (retries handled by the SDK);
- at most ``llm_max_concurrency`` (default 10) calls in flight via a semaphore;
- per-run cache keyed by the hash of the quote, so the same quote is only
  analyzed once.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
from typing import Any

import structlog
from openai import AsyncOpenAI
from pydantic import BaseModel, ConfigDict, Field

from radar.config import get_settings
from radar.db.models import RawPost

log = structlog.get_logger(__name__)

_client: AsyncOpenAI | None = None
_semaphore: asyncio.Semaphore | None = None
_cache: dict[str, dict[str, Any]] = {}


class PainAnalysis(BaseModel):
    """Validated shape of one quote analysis."""

    model_config = ConfigDict(extra="ignore")

    theme: str | None = None
    reasoning: str | None = None
    urgency_score: float | None = Field(default=None, ge=0, le=10)
    wtp_score: float | None = Field(default=None, ge=0, le=10)


def get_client() -> AsyncOpenAI:
    """Shared DeepSeek client, created on first use."""
    global _client
    if _client is None:
        settings = get_settings()
        if not settings.deepseek_api_key:
            raise RuntimeError(
                "DEEPSEEK_API_KEY is not configured; cannot call the LLM."
            )
        _client = AsyncOpenAI(
            api_key=settings.deepseek_api_key,
            base_url=settings.deepseek_base_url,
            timeout=settings.llm_timeout_seconds,
            max_retries=3,
        )
    return _client


def reset_client() -> None:
    """Drop the shared client/semaphore (used by tests / settings changes)."""
    global _client, _semaphore
    _client = None
    _semaphore = None


def _get_semaphore() -> asyncio.Semaphore:
    global _semaphore
    if _semaphore is None:
        _semaphore = asyncio.Semaphore(get_settings().llm_max_concurrency)
    return _semaphore


def quote_key(quote: str) -> str:
    """Stable cache key for a quote (SHA-256 of the trimmed, folded text)."""
    return hashlib.sha256(quote.strip().casefold().encode("utf-8")).hexdigest()


def clear_analysis_cache() -> None:
    """Reset the per-run quote cache (call at the start of each job run)."""
    _cache.clear()


def build_analysis_prompt(post: RawPost, quote: str) -> str:
    """The analysis prompt from the spec (JSON contract + rules)."""
    body = (post.body or "")[:2000]
    fields = """{
  "theme": "A 3-6 word theme name (e.g., 'Manual quote generation', 'Subscription fatigue')",
  "reasoning": "One sentence explaining why this is a pain point",
  "urgency_score": 0-10 (how frequently does this come up? 10 = daily frustration),
  "wtp_score": 0-10 (willingness to pay — does the author mention budget, paying for solutions, or high-value context like a business?)
}"""
    rules = """- Be specific. No generic themes.
- If the quote is not actually a pain point, return {"theme": null}.
- Urgency 7+ only if the post expresses strong emotion or describes a daily workflow problem.
- WTP 7+ only if the author is clearly a business owner or mentions spending money."""
    return (
        "You are a product opportunity analyst. Analyze this Reddit post and quote.\n\n"
        f"POST TITLE: {post.title}\n"
        f"POST BODY: {body}\n"
        f"EXTRACTED QUOTE: {quote}\n\n"
        "Return JSON with exactly these fields:\n"
        f"{fields}\n\n"
        f"Rules:\n{rules}\n"
    )


def _strip_fences(content: str) -> str:
    """Tolerate ```json fences even though we ask for raw JSON."""
    cleaned = content.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[1] if "\n" in cleaned else cleaned
        cleaned = cleaned.rsplit("```", 1)[0]
    return cleaned.strip()


def _clamp_score(value: Any) -> float | None:
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return max(0.0, min(10.0, number))


def _normalize(raw: dict[str, Any]) -> dict[str, Any]:
    """Coerce the model output into the shape ``PainAnalysis`` expects."""
    theme = raw.get("theme")
    if theme is not None:
        theme = str(theme).strip() or None
    if theme is None:
        # Spec: "If the quote is not actually a pain point, return {theme: null}."
        return {"theme": None}
    reasoning = str(raw.get("reasoning") or "").strip() or None
    return {
        "theme": theme,
        "reasoning": reasoning,
        "urgency_score": _clamp_score(raw.get("urgency_score")),
        "wtp_score": _clamp_score(raw.get("wtp_score")),
    }


async def complete_json(prompt: str, *, temperature: float | None = None) -> dict[str, Any]:
    """One JSON-mode completion through the shared, semaphore-guarded client."""
    settings = get_settings()
    client = get_client()
    async with _get_semaphore():
        response = await client.chat.completions.create(
            model=settings.deepseek_model,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=(
                settings.llm_temperature if temperature is None else temperature
            ),
        )
    if not response.choices or response.choices[0].message is None:
        raise ValueError("LLM returned no completion choices")
    content = response.choices[0].message.content or ""
    cleaned = _strip_fences(content)
    try:
        parsed = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(f"LLM returned invalid JSON: {cleaned[:300]}") from exc
    if not isinstance(parsed, dict):
        raise ValueError("LLM returned JSON that is not an object")
    return parsed


async def analyze_pain_signal(post: RawPost, quote: str) -> dict[str, Any]:
    """Analyze one quote; cached per quote-hash for the current run.

    Returns ``{"theme": None, ...}`` when the quote is not a pain point.
    """
    key = quote_key(quote)
    cached = _cache.get(key)
    if cached is not None:
        return dict(cached)

    raw = await complete_json(build_analysis_prompt(post, quote))
    analysis = PainAnalysis.model_validate(_normalize(raw))
    result = analysis.model_dump()
    _cache[key] = result
    return dict(result)
