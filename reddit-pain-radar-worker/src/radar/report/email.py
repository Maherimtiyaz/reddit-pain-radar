"""Report email delivery via the Resend SDK."""

from __future__ import annotations

from typing import Any

import structlog

from radar.config import Settings, get_settings
from radar.report.render import markdown_to_html

log = structlog.get_logger(__name__)


def email_configured(settings: Settings | None = None) -> bool:
    """True when both an API key and a recipient are present."""
    settings = settings or get_settings()
    return bool(settings.resend_api_key and settings.report_to_email)


def build_email_payload(
    *,
    subject: str,
    markdown_body: str,
    from_email: str,
    to: str | list[str],
) -> dict[str, Any]:
    """Build the Resend ``Emails.send`` payload (text + generated HTML)."""
    recipients = [to] if isinstance(to, str) else list(to)
    return {
        "from": from_email,
        "to": recipients,
        "subject": subject,
        "text": markdown_body,
        "html": markdown_to_html(markdown_body),
    }


def send_report_email(
    *,
    subject: str,
    markdown_body: str,
    settings: Settings | None = None,
) -> str | None:
    """Send a report by email; returns the email id, or ``None`` if skipped."""
    settings = settings or get_settings()
    if not email_configured(settings):
        log.info("email_skipped", reason="RESEND_API_KEY or REPORT_TO_EMAIL missing")
        return None

    import resend  # local import: the worker runs fine without Resend configured

    resend.api_key = settings.resend_api_key
    payload = build_email_payload(
        subject=subject,
        markdown_body=markdown_body,
        from_email=settings.report_from_email,
        to=settings.report_to_email,
    )
    response = resend.Emails.send(payload)
    if isinstance(response, dict):
        email_id = response.get("id")
    else:
        email_id = getattr(response, "id", None)
    log.info("report_email_sent", email_id=email_id, to=payload["to"])
    return str(email_id) if email_id else None
