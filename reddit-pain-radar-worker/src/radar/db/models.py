"""SQLAlchemy 2.0 models (declarative base with ``Mapped`` types)."""

from __future__ import annotations

import enum
from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    Uuid,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    """Declarative base for every worker table."""


class ReportStatus(str, enum.Enum):
    """Lifecycle of a generated report."""

    pending = "pending"
    generating = "generating"
    complete = "complete"
    failed = "failed"


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Subreddit(Base):
    __tablename__ = "subreddits"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(60), nullable=False)
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        server_default=func.now(),
    )
    last_fetched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    posts: Mapped[list[RawPost]] = relationship(back_populates="subreddit")


class KeywordSet(Base):
    __tablename__ = "keyword_sets"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    keywords: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    active: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True, server_default=text("true")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=_now,
        server_default=func.now(),
    )


class RawPost(Base):
    __tablename__ = "raw_posts"
    __table_args__ = (
        # spec-mandated indexes (reddit_id is unique)
        Index("ix_raw_posts_reddit_id", "reddit_id", unique=True),
        Index("ix_raw_posts_subreddit_id", "subreddit_id"),
        Index("ix_raw_posts_created_utc", "created_utc"),
        Index("ix_raw_posts_processed", "processed"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    reddit_id: Mapped[str] = mapped_column(String(30), nullable=False)
    subreddit_id: Mapped[UUID] = mapped_column(
        ForeignKey("subreddits.id", ondelete="CASCADE"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    body: Mapped[str] = mapped_column(
        Text, nullable=False, default="", server_default=text("''")
    )
    author: Mapped[str] = mapped_column(
        String(80), nullable=False, default="", server_default=text("''")
    )
    score: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    num_comments: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default=text("0")
    )
    # when the post was posted on Reddit
    created_utc: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    permalink: Mapped[str] = mapped_column(
        String(500), nullable=False, default="", server_default=text("''")
    )
    # when *we* fetched it
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, server_default=func.now()
    )
    # full Reddit response, kept for audit
    raw_json: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
    processed: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )

    subreddit: Mapped[Subreddit] = relationship(back_populates="posts")
    signals: Mapped[list[PainSignal]] = relationship(
        back_populates="post", cascade="all, delete-orphan"
    )


class PainSignal(Base):
    __tablename__ = "pain_signals"
    __table_args__ = (
        Index("ix_pain_signals_raw_post_id", "raw_post_id"),
        Index("ix_pain_signals_composite_score", "composite_score"),
    )

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    raw_post_id: Mapped[UUID] = mapped_column(
        ForeignKey("raw_posts.id", ondelete="CASCADE"), nullable=False
    )
    # which regex pattern matched
    matched_phrase: Mapped[str] = mapped_column(String(200), nullable=False)
    # surrounding ±1 sentences around the match
    verbatim_quote: Mapped[str] = mapped_column(Text, nullable=False)
    llm_theme: Mapped[str | None] = mapped_column(String(200), nullable=True)
    llm_reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    urgency_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    wtp_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    composite_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    extracted_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_now, server_default=func.now()
    )

    post: Mapped[RawPost] = relationship(back_populates="signals")


class Report(Base):
    __tablename__ = "reports"

    id: Mapped[UUID] = mapped_column(Uuid, primary_key=True, default=uuid4)
    # list of UUIDs, stored as strings (JSON has no native UUID type)
    subreddit_ids: Mapped[list[str]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    keyword_set_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("keyword_sets.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[ReportStatus] = mapped_column(
        Enum(
            ReportStatus,
            name="report_status",
            values_callable=lambda members: [member.value for member in members],
        ),
        nullable=False,
        default=ReportStatus.pending,
        server_default=text("'pending'"),
    )
    markdown_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    json_content: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    generated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    keyword_set: Mapped[KeywordSet | None] = relationship()
