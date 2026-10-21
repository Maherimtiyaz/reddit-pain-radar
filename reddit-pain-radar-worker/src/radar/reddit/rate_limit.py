"""Rate-limiter setup for Reddit API calls (60 requests/minute by default)."""

from __future__ import annotations

from aiolimiter import AsyncLimiter

DEFAULT_RATE = 60
DEFAULT_PERIOD = 60.0

_limiter: AsyncLimiter | None = None


def build_limiter(
    per_minute: int = DEFAULT_RATE, period: float = DEFAULT_PERIOD
) -> AsyncLimiter:
    """Create an ``AsyncLimiter`` allowing ``per_minute`` requests per ``period``."""
    return AsyncLimiter(max(1, int(per_minute)), period)


def get_limiter(per_minute: int | None = None) -> AsyncLimiter:
    """Process-wide limiter singleton (created on first use)."""
    global _limiter
    if _limiter is None:
        _limiter = build_limiter(per_minute or DEFAULT_RATE)
    return _limiter


def reset_limiter() -> None:
    """Forget the singleton (used by tests)."""
    global _limiter
    _limiter = None
