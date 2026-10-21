"""structlog configuration: JSON logs to stdout."""

from __future__ import annotations

import logging
import sys

import structlog


def _level_from_name(level: str) -> int:
    return getattr(logging, level.upper(), logging.INFO)


def configure_logging(level: str = "INFO") -> None:
    """Configure stdlib logging + structlog for JSON output.

    Idempotent: calling it again simply reconfigures both libraries.
    """
    logging.basicConfig(
        level=_level_from_name(level),
        format="%(message)s",
        stream=sys.stdout,
        force=True,
    )
    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            # default=str keeps datetimes/UUIDs from breaking the encoder
            structlog.processors.JSONRenderer(default=str),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(_level_from_name(level)),
        logger_factory=structlog.PrintLoggerFactory(sys.stdout),
        cache_logger_on_first_use=True,
    )
