"""Async Reddit client: OAuth app-only flow, rate limiting, retries, audit log.

Behavior (per spec):
- token from ``https://www.reddit.com/api/v1/access_token`` (client credentials),
  expires in 3600s and is refreshed automatically (60s before expiry);
- base URL ``https://oauth.reddit.com``;
- 60 req/min via ``aiolimiter.AsyncLimiter``;
- pagination via the ``after`` cursor, max 3 pages (300 posts);
- 429 -> exponential backoff 1s, 2s, 4s, 8s;
- 401 -> refresh token and retry once;
- 503 -> log a warning and return an empty list;
- every request logged with {method, url, status, remaining_quota, duration_ms}.
"""

from __future__ import annotations

import asyncio
import time
from typing import Any, Awaitable, Callable

import httpx
import structlog

from radar.config import get_settings
from radar.reddit.rate_limit import get_limiter
from radar.reddit.schemas import Listing, RedditPost, TokenResponse

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
OAUTH_BASE = "https://oauth.reddit.com"

MAX_PAGE_SIZE = 100
TOKEN_REFRESH_MARGIN = 60.0  # refresh 60s before expiry to avoid races
BACKOFF_DELAYS: tuple[float, ...] = (1.0, 2.0, 4.0, 8.0)
VALID_SORTS = frozenset({"hot", "new", "top"})
VALID_TIMEFRAMES = frozenset({"hour", "day", "week", "month", "year", "all"})

log = structlog.get_logger(__name__)


class RedditError(RuntimeError):
    """Base class for Reddit client errors."""


class RedditAuthError(RedditError):
    """OAuth failed (bad credentials or token endpoint down)."""


class RedditRateLimitError(RedditError):
    """429 persisted past the backoff budget."""


class RedditUnavailableError(RedditError):
    """Reddit answered 5xx / network failure — try again later."""


class RedditApiError(RedditError):
    """Any other 4xx or malformed response."""


def _normalize_subreddit(name: str) -> str:
    """Accept ``"SaaS"``, ``"r/SaaS"`` or ``"/r/SaaS"`` and return ``"SaaS"``."""
    cleaned = name.strip()
    if cleaned.startswith("/r/"):
        cleaned = cleaned[3:]
    elif cleaned.startswith("r/"):
        cleaned = cleaned[2:]
    return cleaned.strip("/")


class RedditClient:
    """Async, rate-limited Reddit client for listing/search endpoints."""

    def __init__(
        self,
        *,
        client_id: str | None = None,
        client_secret: str | None = None,
        user_agent: str | None = None,
        limiter: Any | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float | None = None,
        sleep: Callable[[float], Awaitable[None]] | None = None,
        max_pages: int | None = None,
    ) -> None:
        settings = get_settings()
        self.client_id = (
            client_id if client_id is not None else settings.reddit_client_id
        )
        self.client_secret = (
            client_secret if client_secret is not None else settings.reddit_client_secret
        )
        self.user_agent = user_agent or settings.reddit_user_agent
        if not self.client_id or not self.client_secret:
            raise RedditAuthError(
                "Reddit credentials missing: set REDDIT_CLIENT_ID and "
                "REDDIT_CLIENT_SECRET (or pass client_id/client_secret)."
            )

        self._limiter = limiter or get_limiter(settings.reddit_rate_per_minute)
        self._sleep = sleep or asyncio.sleep
        self._max_pages = max(1, max_pages or settings.reddit_max_pages)
        self._timeout = timeout or settings.reddit_timeout_seconds

        self._http = httpx.AsyncClient(
            timeout=self._timeout,
            transport=transport,
            headers={"User-Agent": self.user_agent},
            follow_redirects=True,
        )
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    # -- context management --------------------------------------------------

    async def __aenter__(self) -> "RedditClient":
        return self

    async def __aexit__(self, *exc: object) -> None:
        await self.aclose()

    async def aclose(self) -> None:
        await self._http.aclose()

    # -- auth ----------------------------------------------------------------

    async def _access_token(self) -> str:
        """Return a valid token, fetching/refreshing it under a lock."""
        async with self._token_lock:
            if self._token and time.monotonic() < self._token_expires_at:
                return self._token

            await self._limiter.acquire()
            started = time.perf_counter()
            try:
                response = await self._http.post(
                    TOKEN_URL,
                    data={"grant_type": "client_credentials"},
                    auth=httpx.BasicAuth(self.client_id, self.client_secret),
                )
            except httpx.HTTPError as exc:
                self._log_request(
                    "POST",
                    TOKEN_URL,
                    None,
                    (time.perf_counter() - started) * 1000,
                    error=str(exc),
                )
                raise RedditAuthError(f"token request failed: {exc}") from exc

            self._log_request(
                "POST", TOKEN_URL, response, (time.perf_counter() - started) * 1000
            )
            if response.status_code != 200:
                raise RedditAuthError(
                    f"token endpoint returned {response.status_code}: "
                    f"{response.text[:200]}"
                )
            payload = TokenResponse.model_validate(response.json())
            self._token = payload.access_token
            self._token_expires_at = time.monotonic() + max(
                payload.expires_in - TOKEN_REFRESH_MARGIN, 1.0
            )
            log.info("reddit_token_acquired", expires_in=payload.expires_in)
            return self._token

    async def _invalidate_token(self) -> None:
        async with self._token_lock:
            self._token = None
            self._token_expires_at = 0.0

    # -- requests ------------------------------------------------------------

    async def _request(
        self, path: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """GET ``OAUTH_BASE + path`` with token refresh + backoff handling."""
        url = f"{OAUTH_BASE}{path}"
        refreshed = False
        backoff_index = 0

        while True:
            token = await self._access_token()
            await self._limiter.acquire()
            started = time.perf_counter()
            try:
                response = await self._http.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as exc:
                self._log_request(
                    "GET", url, None, (time.perf_counter() - started) * 1000,
                    error=str(exc),
                )
                if backoff_index >= len(BACKOFF_DELAYS):
                    raise RedditUnavailableError(
                        f"request to {path} failed: {exc}"
                    ) from exc
                delay = BACKOFF_DELAYS[backoff_index]
                backoff_index += 1
                log.warning(
                    "reddit_request_error", path=path, error=str(exc), retry_in=delay
                )
                await self._sleep(delay)
                continue

            duration_ms = (time.perf_counter() - started) * 1000
            self._log_request("GET", url, response, duration_ms)
            status = response.status_code

            if status == 401 and not refreshed:
                refreshed = True
                log.info("reddit_token_refresh", path=path)
                await self._invalidate_token()
                continue

            if status == 429:
                if backoff_index >= len(BACKOFF_DELAYS):
                    raise RedditRateLimitError(
                        f"rate limited on {path} after "
                        f"{len(BACKOFF_DELAYS)} backoff attempts"
                    )
                delay = BACKOFF_DELAYS[backoff_index]
                backoff_index += 1
                log.warning(
                    "reddit_rate_limited",
                    path=path,
                    attempt=backoff_index,
                    retry_in=delay,
                )
                await self._sleep(delay)
                continue

            if status == 503:
                # Reddit down: log + let callers degrade to an empty list.
                log.warning(
                    "reddit_unavailable", path=path, status=status,
                    duration_ms=round(duration_ms, 2),
                )
                raise RedditUnavailableError(f"Reddit returned 503 for {path}")

            if status >= 500:
                if backoff_index >= len(BACKOFF_DELAYS):
                    raise RedditUnavailableError(
                        f"Reddit returned {status} for {path}"
                    )
                delay = BACKOFF_DELAYS[backoff_index]
                backoff_index += 1
                log.warning(
                    "reddit_server_error", path=path, status=status, retry_in=delay
                )
                await self._sleep(delay)
                continue

            if status >= 400:
                raise RedditApiError(
                    f"{status} from {path}: {response.text[:200]}"
                )

            try:
                payload = response.json()
            except ValueError as exc:
                raise RedditApiError(f"invalid JSON from {path}") from exc
            if not isinstance(payload, dict):
                raise RedditApiError(f"unexpected payload from {path}")
            return payload

    async def _listing(
        self, path: str, base_params: dict[str, Any], *, limit: int
    ) -> list[RedditPost]:
        """Paginate a listing endpoint (max ``max_pages`` pages of 100)."""
        target = max(0, min(int(limit), MAX_PAGE_SIZE * self._max_pages))
        if target == 0:
            return []

        posts: list[RedditPost] = []
        after: str | None = None
        pages = 0

        while len(posts) < target and pages < self._max_pages:
            page_size = min(target - len(posts), MAX_PAGE_SIZE)
            params: dict[str, Any] = {**base_params, "limit": page_size, "raw_json": 1}
            if after:
                params["after"] = after

            try:
                payload = await self._request(path, params)
            except RedditUnavailableError:
                # 503 / Reddit down: log-and-degrade (partial results kept).
                return posts

            listing = Listing.model_validate(payload)
            for child in listing.data.children:
                if child.kind != "t3":
                    continue
                posts.append(RedditPost.from_child(child))

            pages += 1
            after = listing.data.after
            if not after or not listing.data.children:
                break

        return posts[:target]

    # -- public API ----------------------------------------------------------

    async def fetch_subreddit_posts(
        self,
        subreddit: str,
        sort: str = "hot",
        timeframe: str = "week",
        limit: int = 100,
    ) -> list[RedditPost]:
        """Fetch posts from a subreddit (``timeframe`` applies to ``top``)."""
        if sort not in VALID_SORTS:
            raise ValueError(f"sort must be one of {sorted(VALID_SORTS)}, got {sort!r}")
        if timeframe not in VALID_TIMEFRAMES:
            raise ValueError(
                f"timeframe must be one of {sorted(VALID_TIMEFRAMES)}, got {timeframe!r}"
            )
        params: dict[str, Any] = {}
        if sort == "top":
            params["t"] = timeframe
        name = _normalize_subreddit(subreddit)
        return await self._listing(f"/r/{name}/{sort}", params, limit=limit)

    async def search_subreddit(
        self,
        subreddit: str,
        query: str,
        sort: str = "relevance",
        timeframe: str = "week",
        limit: int = 50,
    ) -> list[RedditPost]:
        """Search within one subreddit (``restrict_sr=1``)."""
        name = _normalize_subreddit(subreddit)
        params: dict[str, Any] = {
            "q": query,
            "restrict_sr": 1,
            "sort": sort,
            "t": timeframe,
        }
        return await self._listing(f"/r/{name}/search", params, limit=limit)

    # -- logging -------------------------------------------------------------

    @staticmethod
    def _log_request(
        method: str,
        url: str,
        response: httpx.Response | None,
        duration_ms: float,
        *,
        error: str | None = None,
    ) -> None:
        """Log every request: {method, url, status, remaining_quota, duration_ms}."""
        if response is None:
            log.warning(
                "reddit_request",
                method=method,
                url=url,
                status=None,
                remaining_quota=None,
                duration_ms=round(duration_ms, 2),
                error=error,
            )
            return
        log.info(
            "reddit_request",
            method=method,
            url=url,
            status=response.status_code,
            remaining_quota=response.headers.get("x-ratelimit-remaining"),
            duration_ms=round(duration_ms, 2),
        )
