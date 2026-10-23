"""Typer CLI for manual runs (``uv run radar <command>``)."""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated

import structlog
import typer

from radar.config import get_settings
from radar.db.session import session_scope
from radar.export.evidence import export_evidence
from radar.jobs.fetch_job import build_report, collect_posts, extract_signals, run_fetch_job
from radar.jobs.scheduler import run_scheduler
from radar.logging import configure_logging
from radar.reddit.client import RedditClient

app = typer.Typer(
    help="Reddit Pain Radar worker: fetch, extract, score, report.",
    no_args_is_help=True,
    add_completion=False,
)

log = structlog.get_logger(__name__)


def main() -> None:
    """Console-script entry point (``radar``)."""
    app()


def _init_logging() -> None:
    configure_logging(get_settings().log_level)


EmailOption = Annotated[
    bool,
    typer.Option("--email/--no-email", help="Send the report by email when configured."),
]


@app.command("run")
def run_command(email: EmailOption = True) -> None:
    """Run the full pipeline once: fetch -> extract -> score -> report."""
    _init_logging()
    settings = get_settings()
    try:
        result = asyncio.run(run_fetch_job(settings=settings, send_email=email))
    except Exception as exc:
        log.exception("job_failed")
        typer.echo(f"job failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(
        f"report_id={result.report_id} posts={result.posts_fetched} "
        f"new={result.posts_new} signals={result.signals_kept} "
        f"themes={result.themes} emailed={result.emailed}"
    )


@app.command("fetch")
def fetch_command() -> None:
    """Fetch new posts and extract/score pain signals (no report)."""
    _init_logging()
    settings = get_settings()
    started = datetime.now(timezone.utc)

    async def _run() -> None:
        if not settings.reddit_client_id or not settings.reddit_client_secret:
            raise RuntimeError(
                "REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET are not configured."
            )
        with session_scope() as session:
            async with RedditClient(
                client_id=settings.reddit_client_id,
                client_secret=settings.reddit_client_secret,
                user_agent=settings.reddit_user_agent,
            ) as client:
                await collect_posts(client, session, settings, now=started)
            await extract_signals(session, settings)

    try:
        asyncio.run(_run())
    except Exception as exc:
        log.exception("fetch_failed")
        typer.echo(f"fetch failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo("fetch + extraction complete")


@app.command("report")
def report_command(
    since_hours: Annotated[
        int | None,
        typer.Option("--since-hours", help="Look back this many hours for signals."),
    ] = None,
    email: EmailOption = True,
) -> None:
    """Generate a report from signals already stored in the database."""
    _init_logging()
    settings = get_settings()
    hours = since_hours if since_hours is not None else settings.report_since_hours
    since = datetime.now(timezone.utc) - timedelta(hours=hours)

    async def _run():
        with session_scope() as session:
            return await build_report(
                session, settings, since=since, send_email=email
            )

    try:
        outcome = asyncio.run(_run())
    except Exception as exc:
        log.exception("report_failed")
        typer.echo(f"report failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc

    if outcome is None:
        typer.echo(f"No pain signals since {since.isoformat()}; nothing to report.")
        return
    typer.echo(
        f"report_id={outcome.report_id} themes={outcome.themes} "
        f"signals={outcome.signals} emailed={outcome.emailed}"
    )


@app.command("export")
def export_command(
    out: Annotated[
        Path,
        typer.Option("--out", help="JSONL file to write (one post per line)."),
    ] = Path("data/evidence.jsonl"),
    since_hours: Annotated[
        int | None,
        typer.Option("--since-hours", help="Only export posts from the last N hours."),
    ] = None,
) -> None:
    """Export stored posts + scored signals as JSONL for the app importer."""
    _init_logging()
    since = (
        datetime.now(timezone.utc) - timedelta(hours=since_hours)
        if since_hours is not None
        else None
    )
    try:
        with session_scope() as session:
            posts, signals = export_evidence(session, out, since=since)
    except Exception as exc:
        log.exception("export_failed")
        typer.echo(f"export failed: {exc}", err=True)
        raise typer.Exit(code=1) from exc
    typer.echo(f"posts={posts} signals={signals} out={out}")


@app.command("schedule")
def schedule_command(email: EmailOption = True) -> None:
    """Start the APScheduler loop (runs the job on the configured schedule)."""
    run_scheduler(send_email=email)


if __name__ == "__main__":
    main()
