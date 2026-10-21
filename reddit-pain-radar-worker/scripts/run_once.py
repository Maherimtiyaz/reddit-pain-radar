"""Manual one-shot trigger for the full pipeline (development/testing).

Usage:
    uv run python scripts/run_once.py [--no-email]
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from pathlib import Path

# Fallback so the script also works when the package is not installed.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from radar.jobs.fetch_job import run_fetch_job
from radar.logging import configure_logging


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the Reddit Pain Radar job once")
    parser.add_argument(
        "--no-email", action="store_true", help="Skip sending the report email"
    )
    args = parser.parse_args()

    configure_logging()
    result = asyncio.run(run_fetch_job(send_email=not args.no_email))
    print(
        f"report_id={result.report_id} posts={result.posts_fetched} "
        f"new={result.posts_new} signals={result.signals_kept} "
        f"themes={result.themes} emailed={result.emailed}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
