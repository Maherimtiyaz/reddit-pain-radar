"""Reddit API client for the Reddit Pain Radar ingestion worker.

Implements the OAuth **app-only** (client credentials) flow — no username or
password is required. Requests are rate-limited to 60/minute by default, 429
responses are retried with exponential backoff, every request is logged with a
timestamp and the remaining quota, and raw JSON payloads are persisted under
``data/raw/`` before any parsing happens.

Environment variables:
    REDDIT_CLIENT_ID       Reddit app client id (required)
    REDDIT_CLIENT_SECRET   Reddit app client secret (required)
    REDDIT_USER_AGENT      Descriptive UA sent to Reddit (recommended)
    REDDIT_RAW_DATA_DIR    Where raw JSON is stored (default: <repo>/data/raw)

Usage:
    from workers.reddit_client import RedditClient

    with RedditClient() as client:
        posts = client.fetch_posts("saas", limit=100, timeframe="week")
        hits = client.search_posts("too expensive", subreddit="SaaS", limit=50)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import threading
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests

logger = logging.getLogger("reddit_pain_radar.reddit_client")

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
OAUTH_BASE = "https://oauth.reddit.com"
POST_URL_BASE = "https://www.reddit.com"

DEFAULT_USER_AGENT = "reddit-pain-radar/0.1 (by /u/reddit-pain-radar)"
DEFAULT_RATE_LIMIT = 60  # requests ...
DEFAULT_RATE_WINDOW = 60.0  # ... per this many seconds
DEFAULT_MAX_RETRIES = 5
DEFAULT_TIMEOUT = 30.0
MAX_PAGE_SIZE = 100  # Reddit hard cap per listing request
VALID_TIMEFRAMES = {"hour", "day", "week", "month", "year", "all"}

_REPO_ROOT = Path(__file__).resolve().parents[1]
_DEFAULT_DATA_DIR = _REPO_ROOT / "data" / "raw"


class RedditClientError(RuntimeError):
    """Base error for the Reddit client."""


class RedditAuthError(RedditClientError):
    """Raised when app-only authentication fails."""


class RedditRateLimitError(RedditClientError):
    """Raised when a request keeps hitting 429 past the retry budget."""


@dataclass(slots=True)
class Post:
    """A single Reddit submission, normalized for downstream processing."""

    reddit_id: str
    title: str
    body: str
    author: str
    score: int
    num_comments: int
    created_utc: float
    url: str
    subreddit: str

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> "Post":
        permalink = data.get("permalink") or ""
        url = f"{POST_URL_BASE}{permalink}" if permalink else (data.get("url") or "")
        return cls(
            reddit_id=str(data.get("id") or ""),
            title=data.get("title") or "",
            body=data.get("selftext") or "",
            author=data.get("author") or "",
            score=int(data.get("score") or 0),
            num_comments=int(data.get("num_comments") or 0),
            created_utc=float(data.get("created_utc") or 0.0),
            url=url,
            subreddit=data.get("subreddit") or "",
        )

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class _TokenBucket:
    """Thread-safe token bucket enforcing ``capacity`` requests per ``window``.

    Allows an initial burst of ``capacity`` requests, then sustains an average
    of ``capacity / window`` requests per second.
    """

    def __init__(self, capacity: int, window: float) -> None:
        if capacity <= 0 or window <= 0:
            raise ValueError("capacity and window must be positive")
        self.capacity = float(capacity)
        self.rate = capacity / window
        self._tokens = float(capacity)
        self._updated = time.monotonic()
        self._lock = threading.Lock()

    def _refill(self) -> None:
        now = time.monotonic()
        elapsed = now - self._updated
        if elapsed > 0:
            self._tokens = min(self.capacity, self._tokens + elapsed * self.rate)
            self._updated = now

    def acquire(self) -> None:
        """Block until one token is available, then consume it."""
        while True:
            with self._lock:
                self._refill()
                if self._tokens >= 1.0:
                    self._tokens -= 1.0
                    return
                wait = (1.0 - self._tokens) / self.rate
            logger.debug("Local rate limit hit; sleeping %.3fs", wait)
            time.sleep(wait)


class RedditClient:
    """App-only Reddit API client with rate limiting, retries, and raw storage."""

    def __init__(
        self,
        client_id: str | None = None,
        client_secret: str | None = None,
        user_agent: str | None = None,
        data_dir: str | os.PathLike[str] | None = None,
        rate_limit: int = DEFAULT_RATE_LIMIT,
        rate_window: float = DEFAULT_RATE_WINDOW,
        max_retries: int = DEFAULT_MAX_RETRIES,
        timeout: float = DEFAULT_TIMEOUT,
        session: requests.Session | None = None,
    ) -> None:
        self.client_id = client_id or _require_env("REDDIT_CLIENT_ID")
        self.client_secret = client_secret or _require_env("REDDIT_CLIENT_SECRET")
        self.user_agent = user_agent or os.environ.get(
            "REDDIT_USER_AGENT", DEFAULT_USER_AGENT
        )
        self.data_dir = Path(
            data_dir or os.environ.get("REDDIT_RAW_DATA_DIR") or _DEFAULT_DATA_DIR
        )
        self.max_retries = max(1, int(max_retries))
        self.timeout = float(timeout)

        self._bucket = _TokenBucket(rate_limit, rate_window)
        self._session = session or requests.Session()
        self._session.headers.update({"User-Agent": self.user_agent})
        self._access_token: str | None = None
        self._token_expires_at = 0.0
        self._auth_lock = threading.Lock()

    # -- context management -------------------------------------------------

    def __enter__(self) -> "RedditClient":
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def close(self) -> None:
        self._session.close()

    # -- auth ---------------------------------------------------------------

    def _authenticate(self) -> None:
        logger.info("Requesting app-only access token from %s", TOKEN_URL)
        try:
            resp = self._session.post(
                TOKEN_URL,
                data={"grant_type": "client_credentials"},
                auth=(self.client_id, self.client_secret),
                headers={"User-Agent": self.user_agent},
                timeout=self.timeout,
            )
        except requests.RequestException as exc:
            raise RedditAuthError(f"token request failed: {exc}") from exc
        if resp.status_code != 200:
            raise RedditAuthError(
                f"token request returned {resp.status_code}: {resp.text[:200]}"
            )
        payload = resp.json()
        token = payload.get("access_token")
        if not token:
            raise RedditAuthError("token response did not contain an access_token")
        expires_in = float(payload.get("expires_in") or 3600)
        self._access_token = token
        # Refresh a minute before expiry to avoid races.
        self._token_expires_at = time.monotonic() + max(expires_in - 60.0, 0.0)
        logger.info("Obtained app-only token (expires_in=%ss)", int(expires_in))

    def _ensure_token(self) -> None:
        with self._auth_lock:
            if self._access_token is None or time.monotonic() >= self._token_expires_at:
                self._authenticate()

    # -- requests -----------------------------------------------------------

    def _request(
        self, path: str, params: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        self._ensure_token()
        url = f"{OAUTH_BASE}{path}"
        backoff = 2.0

        for attempt in range(1, self.max_retries + 1):
            self._bucket.acquire()
            started = time.time()
            try:
                resp = self._session.get(
                    url,
                    params=params,
                    headers={"Authorization": f"Bearer {self._access_token}"},
                    timeout=self.timeout,
                )
            except requests.RequestException as exc:
                self._log_request(url, None, time.time() - started, error=str(exc))
                if attempt == self.max_retries:
                    raise RedditClientError(f"request to {url} failed: {exc}") from exc
                sleep_for = backoff + random.uniform(0, 0.5)
                logger.warning(
                    "Network error on %s (attempt %d/%d); retrying in %.1fs",
                    url,
                    attempt,
                    self.max_retries,
                    sleep_for,
                )
                time.sleep(sleep_for)
                backoff = min(backoff * 2, 60.0)
                continue

            self._log_request(url, resp, time.time() - started)

            if resp.status_code == 429:
                sleep_for = self._retry_after(resp, backoff)
                logger.warning(
                    "429 Too Many Requests for %s (attempt %d/%d); backing off %.1fs",
                    url,
                    attempt,
                    self.max_retries,
                    sleep_for,
                )
                time.sleep(sleep_for)
                backoff = min(backoff * 2, 60.0)
                continue

            if resp.status_code == 401 and attempt < self.max_retries:
                logger.info("401 Unauthorized; refreshing access token")
                with self._auth_lock:
                    self._access_token = None
                self._ensure_token()
                continue

            if 500 <= resp.status_code < 600 and attempt < self.max_retries:
                sleep_for = backoff + random.uniform(0, 0.5)
                logger.warning(
                    "Server error %s for %s (attempt %d/%d); retrying in %.1fs",
                    resp.status_code,
                    url,
                    attempt,
                    self.max_retries,
                    sleep_for,
                )
                time.sleep(sleep_for)
                backoff = min(backoff * 2, 60.0)
                continue

            if resp.status_code >= 400:
                raise RedditClientError(
                    f"{resp.status_code} from {url}: {resp.text[:200]}"
                )
            return resp.json()

        raise RedditRateLimitError(
            f"exhausted {self.max_retries} retries for {url} (rate limited)"
        )

    @staticmethod
    def _retry_after(resp: requests.Response, fallback: float) -> float:
        """Best-effort delay before retrying a 429."""
        retry_after = resp.headers.get("retry-after")
        if retry_after:
            try:
                return max(float(retry_after), 1.0)
            except ValueError:
                pass
        reset = resp.headers.get("x-ratelimit-reset")
        if reset:
            try:
                return max(float(reset), 1.0)
            except ValueError:
                pass
        return fallback + random.uniform(0, 0.5)

    def _log_request(
        self,
        url: str,
        resp: requests.Response | None,
        elapsed: float,
        error: str | None = None,
    ) -> None:
        timestamp = datetime.now(timezone.utc).isoformat(timespec="seconds")
        if resp is None:
            logger.warning(
                "%s request=%s elapsed=%.3fs error=%s",
                timestamp,
                url,
                elapsed,
                error,
            )
            return
        remaining = resp.headers.get("x-ratelimit-remaining", "unknown")
        used = resp.headers.get("x-ratelimit-used", "unknown")
        reset = resp.headers.get("x-ratelimit-reset", "unknown")
        logger.info(
            "%s request=%s status=%s remaining=%s used=%s reset=%ss elapsed=%.3fs",
            timestamp,
            url,
            resp.status_code,
            remaining,
            used,
            reset,
            elapsed,
        )

    # -- raw storage --------------------------------------------------------

    def _store_raw(self, payload: dict[str, Any], kind: str, identifier: str) -> Path:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
        safe = re.sub(r"[^A-Za-z0-9_.-]+", "_", identifier).strip("_") or "response"
        path = self.data_dir / f"{stamp}_{kind}_{safe}.json"
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
        tmp.replace(path)
        logger.debug("Stored raw response -> %s", path)
        return path

    # -- public API ---------------------------------------------------------

    def fetch_posts(
        self, subreddit: str, limit: int = 100, timeframe: str = "week"
    ) -> list[Post]:
        """Fetch top posts from ``subreddit`` within ``timeframe``."""
        if timeframe not in VALID_TIMEFRAMES:
            raise ValueError(
                f"timeframe must be one of {sorted(VALID_TIMEFRAMES)}, got {timeframe!r}"
            )
        return self._paginate(
            path=f"/r/{subreddit}/top",
            base_params={"t": timeframe},
            kind="listing",
            identifier=f"{subreddit}_{timeframe}",
            limit=limit,
        )

    def search_posts(
        self, query: str, subreddit: str, limit: int = 50
    ) -> list[Post]:
        """Search ``subreddit`` for ``query``, restricted to that subreddit."""
        return self._paginate(
            path=f"/r/{subreddit}/search",
            base_params={"q": query, "restrict_sr": 1, "sort": "relevance", "t": "all"},
            kind="search",
            identifier=f"{subreddit}_{query}",
            limit=limit,
        )

    def _paginate(
        self,
        path: str,
        base_params: dict[str, Any],
        kind: str,
        identifier: str,
        limit: int,
    ) -> list[Post]:
        target = max(0, int(limit))
        if target == 0:
            return []

        posts: list[Post] = []
        after: str | None = None

        while len(posts) < target:
            page_size = min(target - len(posts), MAX_PAGE_SIZE)
            params: dict[str, Any] = {**base_params, "limit": page_size, "raw_json": 1}
            if after:
                params["after"] = after

            payload = self._request(path, params)
            self._store_raw(payload, kind, identifier)

            data = payload.get("data") or {}
            children = data.get("children") or []
            for child in children:
                if child.get("kind") != "t3":
                    continue
                posts.append(Post.from_json(child.get("data") or {}))

            after = data.get("after")
            if not after or not children:
                break

        return posts[:target]


def _require_env(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RedditAuthError(
            f"{name} is not set. Provide it via the environment or pass it to RedditClient()."
        )
    return value


def _build_arg_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Reddit Pain Radar Reddit client")
    sub = parser.add_subparsers(dest="command", required=True)

    fetch = sub.add_parser("fetch", help="Fetch top posts from a subreddit")
    fetch.add_argument("subreddit")
    fetch.add_argument("--limit", type=int, default=100)
    fetch.add_argument(
        "--timeframe", default="week", choices=sorted(VALID_TIMEFRAMES)
    )

    search = sub.add_parser("search", help="Search within a subreddit")
    search.add_argument("query")
    search.add_argument("subreddit")
    search.add_argument("--limit", type=int, default=50)

    return parser


def main(argv: list[str] | None = None) -> int:
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )
    args = _build_arg_parser().parse_args(argv)

    with RedditClient() as client:
        if args.command == "fetch":
            posts = client.fetch_posts(
                args.subreddit, limit=args.limit, timeframe=args.timeframe
            )
        else:
            posts = client.search_posts(
                args.query, subreddit=args.subreddit, limit=args.limit
            )

    for post in posts:
        print(f"{post.score:>6}  r/{post.subreddit:<20}  {post.title}")
    logger.info("Fetched %d posts", len(posts))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
