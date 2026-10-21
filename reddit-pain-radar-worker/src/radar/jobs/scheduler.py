"""APScheduler wiring: run the fetch job on a cron/interval trigger."""

from __future__ import annotations

import asyncio
import signal
from typing import Any

import structlog
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from radar.config import Settings, get_settings
from radar.jobs.fetch_job import run_fetch_job
from radar.logging import configure_logging

log = structlog.get_logger(__name__)

JOB_ID = "radar_fetch_job"


async def _run_once(*, settings: Settings, send_email: bool) -> None:
    """Scheduled callback: a failure must never kill the scheduler."""
    try:
        result = await run_fetch_job(settings=settings, send_email=send_email)
        log.info(
            "scheduled_run_complete",
            report_id=result.report_id,
            signals=result.signals_kept,
            themes=result.themes,
        )
    except Exception:
        log.exception("scheduled_run_failed")


def build_scheduler(
    settings: Settings | None = None, *, send_email: bool = True
) -> AsyncIOScheduler:
    """Create (but do not start) the scheduler with one job registered."""
    settings = settings or get_settings()
    scheduler = AsyncIOScheduler(timezone=settings.timezone)
    if settings.schedule_kind == "interval":
        trigger: Any = IntervalTrigger(
            minutes=settings.schedule_interval_minutes, timezone=settings.timezone
        )
    else:
        trigger = CronTrigger.from_crontab(
            settings.schedule_cron, timezone=settings.timezone
        )
    scheduler.add_job(
        _run_once,
        trigger=trigger,
        kwargs={"settings": settings, "send_email": send_email},
        id=JOB_ID,
        name="Reddit Pain Radar fetch job",
        max_instances=1,
        coalesce=True,
        misfire_grace_time=3600,
        replace_existing=True,
    )
    return scheduler


async def _serve(settings: Settings, send_email: bool) -> None:
    scheduler = build_scheduler(settings, send_email=send_email)
    scheduler.start()
    job = scheduler.get_job(JOB_ID)
    next_run = job.next_run_time if job else None
    log.info(
        "scheduler_started",
        kind=settings.schedule_kind,
        cron=settings.schedule_cron,
        next_run=str(next_run) if next_run else None,
    )

    stop = asyncio.Event()
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        try:
            loop.add_signal_handler(sig, stop.set)
        except (NotImplementedError, RuntimeError):
            # e.g. Windows event loop: KeyboardInterrupt still works
            pass

    try:
        await stop.wait()
    finally:
        scheduler.shutdown(wait=False)
        log.info("scheduler_stopped")


def run_scheduler(*, send_email: bool = True) -> None:
    """Blocking entry point: configure logging, then serve until interrupted."""
    settings = get_settings()
    configure_logging(settings.log_level)
    log.info(
        "scheduler_launching",
        kind=settings.schedule_kind,
        cron=settings.schedule_cron,
        interval_minutes=settings.schedule_interval_minutes,
    )
    try:
        asyncio.run(_serve(settings, send_email))
    except KeyboardInterrupt:
        log.info("scheduler_interrupted")
