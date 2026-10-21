"""Pydantic schemas for Reddit API responses."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

REDDIT_BASE_URL = "https://www.reddit.com"


class TokenResponse(BaseModel):
    """POST /api/v1/access_token response."""

    model_config = ConfigDict(extra="ignore")

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600


class ListingChild(BaseModel):
    """One entry of a listing (``kind`` is ``t3`` for submissions)."""

    model_config = ConfigDict(extra="ignore")

    kind: str
    data: dict[str, Any] = Field(default_factory=dict)


class ListingData(BaseModel):
    """The ``data`` envelope of a listing, with the pagination cursor."""

    model_config = ConfigDict(extra="ignore")

    after: str | None = None
    before: str | None = None
    children: list[ListingChild] = Field(default_factory=list)


class Listing(BaseModel):
    """A Reddit listing response."""

    model_config = ConfigDict(extra="ignore")

    kind: str = "Listing"
    data: ListingData = Field(default_factory=ListingData)


class RedditPost(BaseModel):
    """A single Reddit submission, normalized for downstream processing.

    ``raw_json`` keeps the full Reddit response for the post (audit trail),
    which is what lands in ``raw_posts.raw_json``.
    """

    model_config = ConfigDict(extra="ignore")

    reddit_id: str  # e.g. "t3_abc123"
    title: str
    body: str = ""  # selftext
    author: str = ""
    score: int = 0
    num_comments: int = 0
    created_utc: datetime
    permalink: str = ""
    subreddit: str = ""
    raw_json: dict[str, Any] = Field(default_factory=dict)

    @classmethod
    def from_child(
        cls, child: ListingChild | dict[str, Any]
    ) -> "RedditPost":
        """Build a post from a listing child (``{"kind": "t3", "data": {...}}``)."""
        payload = child.model_dump() if isinstance(child, ListingChild) else dict(child)
        data = payload.get("data") or {}
        reddit_id = str(data.get("name") or f"t3_{data.get('id') or ''}")
        created = float(data.get("created_utc") or 0.0)
        permalink = str(data.get("permalink") or "")
        if permalink.startswith("/"):
            permalink = f"{REDDIT_BASE_URL}{permalink}"
        return cls(
            reddit_id=reddit_id,
            title=str(data.get("title") or ""),
            body=str(data.get("selftext") or ""),
            author=str(data.get("author") or ""),
            score=int(data.get("score") or 0),
            num_comments=int(data.get("num_comments") or 0),
            created_utc=datetime.fromtimestamp(created, tz=timezone.utc),
            permalink=permalink,
            subreddit=str(data.get("subreddit") or ""),
            raw_json=payload,
        )
