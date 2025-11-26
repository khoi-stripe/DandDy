from typing import Optional

import httpx

from database.database import get_settings


settings = get_settings()

POSTMARK_EMAIL_URL = "https://api.postmarkapp.com/email"


def send_password_reset_email(to_email: str, reset_url: str) -> None:
    """
    Send a password reset email via Postmark.

    This is intended to be called from a FastAPI BackgroundTask so that
    network I/O does not block the main request handler.
    """
    if not settings.postmark_server_token or not settings.email_from:
        # Soft-fail: log and return; do not crash the request.
        print("⚠️  Email config missing; cannot send password reset email")
        return

    subject = "Reset your DandDy password"
    plain = (
        "Someone requested a password reset for your DandDy account.\n\n"
        f"If this was you, click the link below to set a new password:\n{reset_url}\n\n"
        "If you did not request this, you can safely ignore this email."
    )
    html = (
        "<p>Someone requested a password reset for your DandDy account.</p>"
        f"<p><a href=\"{reset_url}\">Click here to set a new password</a></p>"
        "<p>If you did not request this, you can safely ignore this email.</p>"
    )

    payload = {
        "From": settings.email_from,
        "To": to_email,
        "Subject": subject,
        "TextBody": plain,
        "HtmlBody": html,
        "MessageStream": "outbound",  # or a named transactional stream if configured
    }

    headers = {
        "X-Postmark-Server-Token": settings.postmark_server_token,
        "Content-Type": "application/json",
    }

    try:
        resp = httpx.post(POSTMARK_EMAIL_URL, json=payload, headers=headers, timeout=10.0)
        if resp.status_code >= 400:
            print(
                "❌ Failed to send password reset email via Postmark:",
                resp.status_code,
                resp.text,
            )
    except Exception as exc:
        # Swallow network errors so they don't break the main request path.
        print("❌ Exception while sending password reset email:", repr(exc))


