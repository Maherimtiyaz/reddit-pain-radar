"""initial schema

Creates: subreddits, keyword_sets, raw_posts, pain_signals, reports
plus the report_status enum and the indexes required by the spec.

Revision ID: 0001
Revises:
Create Date: 2026-10-14
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subreddits",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=50), nullable=False),
        sa.Column("display_name", sa.String(length=60), nullable=False),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("last_fetched_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )

    op.create_table(
        "keyword_sets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column(
            "keywords",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "raw_posts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("reddit_id", sa.String(length=30), nullable=False),
        sa.Column("subreddit_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("body", sa.Text(), server_default=sa.text("''"), nullable=False),
        sa.Column(
            "author", sa.String(length=80), server_default=sa.text("''"), nullable=False
        ),
        sa.Column("score", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column(
            "num_comments", sa.Integer(), server_default=sa.text("0"), nullable=False
        ),
        sa.Column("created_utc", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "permalink", sa.String(length=500), server_default=sa.text("''"), nullable=False
        ),
        sa.Column(
            "fetched_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "raw_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column(
            "processed", sa.Boolean(), server_default=sa.text("false"), nullable=False
        ),
        sa.ForeignKeyConstraint(["subreddit_id"], ["subreddits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_raw_posts_reddit_id", "raw_posts", ["reddit_id"], unique=True)
    op.create_index("ix_raw_posts_subreddit_id", "raw_posts", ["subreddit_id"])
    op.create_index("ix_raw_posts_created_utc", "raw_posts", ["created_utc"])
    op.create_index("ix_raw_posts_processed", "raw_posts", ["processed"])

    op.create_table(
        "pain_signals",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("raw_post_id", sa.Uuid(), nullable=False),
        sa.Column("matched_phrase", sa.String(length=200), nullable=False),
        sa.Column("verbatim_quote", sa.Text(), nullable=False),
        sa.Column("llm_theme", sa.String(length=200), nullable=True),
        sa.Column("llm_reasoning", sa.Text(), nullable=True),
        sa.Column("urgency_score", sa.Float(), nullable=True),
        sa.Column("wtp_score", sa.Float(), nullable=True),
        sa.Column("composite_score", sa.Float(), nullable=True),
        sa.Column(
            "extracted_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["raw_post_id"], ["raw_posts.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_pain_signals_raw_post_id", "pain_signals", ["raw_post_id"]
    )
    op.create_index(
        "ix_pain_signals_composite_score", "pain_signals", ["composite_score"]
    )

    op.create_table(
        "reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column(
            "subreddit_ids",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
        sa.Column("keyword_set_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "generating",
                "complete",
                "failed",
                name="report_status",
            ),
            server_default=sa.text("'pending'"),
            nullable=False,
        ),
        sa.Column("markdown_content", sa.Text(), nullable=True),
        sa.Column(
            "json_content", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(
            ["keyword_set_id"], ["keyword_sets.id"], ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("reports")
    op.drop_table("pain_signals")
    op.drop_table("raw_posts")
    op.drop_table("keyword_sets")
    op.drop_table("subreddits")
    sa.Enum(
        "pending", "generating", "complete", "failed", name="report_status"
    ).drop(op.get_bind(), checkfirst=True)
