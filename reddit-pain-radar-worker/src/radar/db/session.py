"""Engine + session factory (created lazily so imports never touch the DB)."""

from __future__ import annotations

from contextlib import contextmanager
from typing import Iterator

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker

from radar.config import get_settings

_engine: Engine | None = None
_session_factory: sessionmaker[Session] | None = None


def get_engine(url: str | None = None) -> Engine:
    """Return the process-wide engine, creating it on first use."""
    global _engine
    if _engine is None:
        database_url = url or get_settings().database_url
        _engine = create_engine(database_url, pool_pre_ping=True)
    return _engine


def get_session_factory(engine: Engine | None = None) -> sessionmaker[Session]:
    """Return the process-wide session factory (bound to ``engine`` if given)."""
    global _session_factory
    if _session_factory is None or engine is not None:
        _session_factory = sessionmaker(
            bind=engine or get_engine(), expire_on_commit=False
        )
    return _session_factory


@contextmanager
def session_scope() -> Iterator[Session]:
    """Provide a transactional session; commit on success, roll back on error."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def reset_engine() -> None:
    """Dispose and forget the engine/factory (used by tests)."""
    global _engine, _session_factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _session_factory = None
