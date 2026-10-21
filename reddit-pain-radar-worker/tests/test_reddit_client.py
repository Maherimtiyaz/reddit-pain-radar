"""HTTP-level tests for the async Reddit client (mocked with respx)."""

from __future__ import annotations

from typing import Any

import pytest
import respx
from httpx import Response

from radar.reddit.client import (
    OAUTH_BASE,
    RedditAuthError,
    RedditClient,
    RedditRateLimitError,
)
from radar.reddit.rate_limit import build_limiter

TOKEN_URL = "https://www.reddit.com/api/v1/access_token"


def _token(access_token: str = "token-1") -> Response:
    return Response(
        200,
        json={"access_token": access_token, "token_type": "bearer", "expires_in": 3600},
    )


def _child(index: int, subreddit: str = "SaaS") -> dict[str, Any]:
    return {
        "kind": "t3",
        "data": {
            "id": f"{index:03d}",
            "name": f"t3_{index:03d}",
            "title": f"Post {index}",
            "selftext": "Body text",
            "author": "someone",
            "score": 10,
            "num_comments": 2,
            "created_utc": 1_759_459_200,
            "permalink": f"/r/{subreddit}/comments/{index:03d}/post/",
            "subreddit": subreddit,
        },
    }


def _listing(children: list[dict[str, Any]], after: str | None = None) -> Response:
    return Response(200, json={"kind": "Listing", "data": {"after": after, "children": children}})


def _client(**kwargs: Any) -> RedditClient:
    kwargs.setdefault("client_id", "cid")
    kwargs.setdefault("client_secret", "csecret")
    kwargs.setdefault("user_agent", "RedditPainRadar/1.0 by tests")
    # generous limiter so tests never wait on the 60/min budget
    kwargs.setdefault("limiter", build_limiter(1000, 60.0))
    return RedditClient(**kwargs)


def test_rate_limiter_defaults_to_60_per_minute() -> None:
    limiter = build_limiter()
    assert limiter.max_rate == 60
    assert limiter.time_period == 60.0


def test_client_requires_credentials() -> None:
    with pytest.raises(RedditAuthError):
        RedditClient(client_id="", client_secret="")


@respx.mock
async def test_fetch_subreddit_posts_parses_listing() -> None:
    respx.post(TOKEN_URL).mock(return_value=_token())
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(
        return_value=_listing([_child(1), _child(2)])
    )

    async with _client() as client:
        posts = await client.fetch_subreddit_posts("SaaS", limit=100)

    assert [post.reddit_id for post in posts] == ["t3_001", "t3_002"]
    post = posts[0]
    assert post.title == "Post 1"
    assert post.body == "Body text"
    assert post.subreddit == "SaaS"
    assert post.permalink.startswith("https://www.reddit.com/r/SaaS/")
    assert post.raw_json["kind"] == "t3"  # full raw response kept for audit
    assert post.created_utc.tzinfo is not None


@respx.mock
async def test_fetch_paginates_with_after_cursor() -> None:
    respx.post(TOKEN_URL).mock(return_value=_token())
    page_one = _listing([_child(i) for i in range(1, 101)], after="t3_100")
    page_two = _listing([_child(i) for i in range(101, 151)], after=None)
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(side_effect=[page_one, page_two])

    async with _client() as client:
        posts = await client.fetch_subreddit_posts("SaaS", limit=150)

    assert len(posts) == 150
    assert posts[-1].reddit_id == "t3_150"


@respx.mock
async def test_fetch_caps_at_three_pages() -> None:
    respx.post(TOKEN_URL).mock(return_value=_token())
    page = _listing([_child(i) for i in range(1, 101)], after="t3_100")
    respx.get(f"{OAUTH_BASE}/r/SaaS/top").mock(return_value=page)

    async with _client() as client:
        posts = await client.fetch_subreddit_posts(
            "SaaS", sort="top", timeframe="week", limit=300
        )

    # 3 pages x 100 posts = the hard cap, even though the loop wanted more
    assert len(posts) == 300


@respx.mock
async def test_rate_limit_backs_off_then_succeeds() -> None:
    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    respx.post(TOKEN_URL).mock(return_value=_token())
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(
        side_effect=[Response(429), _listing([_child(1)])]
    )

    async with _client(sleep=fake_sleep) as client:
        posts = await client.fetch_subreddit_posts("SaaS")

    assert len(posts) == 1
    assert sleeps == [1.0]


@respx.mock
async def test_rate_limit_raises_after_backoff_budget() -> None:
    sleeps: list[float] = []

    async def fake_sleep(delay: float) -> None:
        sleeps.append(delay)

    respx.post(TOKEN_URL).mock(return_value=_token())
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(return_value=Response(429))

    async with _client(sleep=fake_sleep) as client:
        with pytest.raises(RedditRateLimitError):
            await client.fetch_subreddit_posts("SaaS")

    assert sleeps == [1.0, 2.0, 4.0, 8.0]


@respx.mock
async def test_expired_token_refreshes_and_retries_once() -> None:
    token_route = respx.post(TOKEN_URL).mock(
        side_effect=[_token("t1"), _token("t2")]
    )
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(
        side_effect=[Response(401, json={"message": "Unauthorized"}), _listing([_child(1)])]
    )

    async with _client() as client:
        posts = await client.fetch_subreddit_posts("SaaS")

    assert len(posts) == 1
    assert token_route.call_count == 2  # initial token + refresh


@respx.mock
async def test_service_unavailable_returns_empty_list() -> None:
    respx.post(TOKEN_URL).mock(return_value=_token())
    respx.get(f"{OAUTH_BASE}/r/SaaS/hot").mock(return_value=Response(503))

    async with _client() as client:
        posts = await client.fetch_subreddit_posts("SaaS")

    assert posts == []


@respx.mock
async def test_search_subreddit_restricts_to_one_subreddit() -> None:
    respx.post(TOKEN_URL).mock(return_value=_token())
    search_route = respx.get(f"{OAUTH_BASE}/r/SaaS/search").mock(
        return_value=_listing([_child(9)])
    )

    async with _client() as client:
        posts = await client.search_subreddit("r/SaaS", "too expensive", limit=50)

    assert [post.reddit_id for post in posts] == ["t3_009"]
    request = search_route.calls.last.request
    assert "restrict_sr=1" in str(request.url)
    assert "q=too+expensive" in str(request.url)
