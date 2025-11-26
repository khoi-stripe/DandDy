## Email + Password Reset Integration Plan (Postmark)

This document outlines how to add a proper email-based password reset flow to DandDy using **Postmark’s Developer plan** (100 emails/month).

### 1. Goals

- **Provider**: Use SendGrid’s free tier (up to 100 emails/day).
  - Pivot: now using **Postmark Developer plan** (100 emails/month, ongoing).
- **Flow**:
  - Backend generates a **short‑lived JWT reset token** (already implemented).
  - Backend builds a **reset link** that points to the web frontend.
  - Backend **sends an email** with that link via SendGrid in `/auth/password/forgot`.
  - Frontend reads the token from the URL and completes the reset via `/auth/password/reset`.
- **Security**:
  - Never return reset tokens in production responses.
  - Keep the public API behavior generic and non‑enumerating.

---

### 2. Postmark Setup

- **Create a Postmark account** and:
  - Create a **Server** (for example, a transactional “DandDy-dev” server).
  - Obtain the **Server API token** for that server.
- **Set up a sender signature**:
  - Add and verify a sender email (for example, a `no-reply` style address) or domain.
  - This address will be used in the `From:` header.

**Env vars to add (Render + `.env.example`):**

- `POSTMARK_SERVER_TOKEN`
- `EMAIL_FROM` – for example, a `no-reply` style address
- Optional: `EMAIL_REPLY_TO`

---

### 3. Backend Configuration Changes

**File**: `backend/database/database.py`

- Extend `Settings` to include email config:

```python
# Email / Postmark
postmark_server_token: str = ""
email_from: str = "no-reply@example.com"
email_reply_to: str | None = None
frontend_reset_base: str = "https://khoi-stripe.github.io/danddy/character-manager.html"
```

- Ensure `.env.example` documents these fields and defaults.
- In `render.yaml`, add:
  - `SENDGRID_API_KEY` (set via Render dashboard, `sync: false`).
  - `EMAIL_FROM`
  - Optionally `FRONTEND_RESET_BASE` if you want a different URL in prod.

---

### 4. Email Helper (SendGrid)

**New file**: `backend/utils/email.py`

Responsibilities:

- Wrap **Postmark’s Email API**.
- Use values from `Settings` (`postmark_server_token`, `email_from`, `email_reply_to`).

Pseudocode:

```python
from database.database import get_settings
import httpx

settings = get_settings()

POSTMARK_EMAIL_URL = "https://api.postmarkapp.com/email"

async def send_password_reset_email(to_email: str, reset_url: str) -> None:
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
        "MessageStream": "outbound",  # or "transactional" if you use named streams
    }

    headers = {
        "X-Postmark-Server-Token": settings.postmark_server_token,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(POSTMARK_EMAIL_URL, json=payload, headers=headers)
        if resp.status_code >= 400:
            print("❌ Failed to send password reset email:", resp.status_code, resp.text)
```

Implementation detail: we can keep this helper `async` and call it from a FastAPI background task.

---

### 5. Generating the Reset Link in `/auth/password/forgot`

**File**: `backend/routes/auth.py`

Current behavior (after previous hardening):

- Looks up user by email.
- Generates `reset_token` (JWT).
- In production: returns only a generic `"message"` JSON.
- In non‑production: also includes `debug_reset_token`.

**Planned behavior**:

- Compute a **reset URL** using a base configured in settings:

```python
from utils.email import send_password_reset_email
from fastapi import BackgroundTasks

@router.post("/password/forgot")
def forgot_password(
    request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.email == request.email).first()
    message = "If an account with that email exists, a password reset link has been sent."

    if not user:
        return {"message": message}

    reset_token = create_password_reset_token(user.id)
    base = settings.frontend_reset_base
    reset_url = f"{base}#reset-token={reset_token}"

    if os.getenv("PRODUCTION"):
        # Fire-and-forget SendGrid email
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
        return {"message": message}

    # Non-prod: also return debug token to simplify local testing
    return {"message": message, "debug_reset_token": reset_token, "reset_url": reset_url}
```

Notes:

- **Token lifetime**: keep as currently configured (e.g. 1 hour) for reset tokens.
- **URL shape**:
  - Use hash fragment (`#reset-token=...`) so static hosting does not need routing changes.

---

### 6. Frontend Handling of Reset Links

**File**: `character-manager.js` (and/or a small dedicated script)

Goal: When user clicks the email link:

- Browser opens `character-manager.html#reset-token=<JWT>`.
- On load:
  - Parse `window.location.hash` to extract `reset-token`.
  - If present:
    - Open the password reset modal.
    - Autofill the “Reset token” field.
    - Optionally clear the hash (so it’s not visible forever in the URL bar).

Pseudocode (within `DOMContentLoaded` handler):

```javascript
const hash = window.location.hash || "";
const tokenMatch = hash.match(/reset-token=([^&]+)/);
if (tokenMatch && tokenMatch[1]) {
  const token = decodeURIComponent(tokenMatch[1]);
  showPasswordResetModal();
  const tokenInput = document.getElementById('passwordResetToken');
  if (tokenInput) tokenInput.value = token;
  // Optional: remove the token from the URL bar
  history.replaceState(null, document.title, window.location.pathname + window.location.search);
}
```

The rest of your reset flow (`handlePasswordResetConfirm`, `/auth/password/reset`) stays unchanged.

---

### 7. Testing Checklist

1. **Config & secrets**
   - Set `SENDGRID_API_KEY` and `EMAIL_FROM` in Render.
   - Confirm `frontend_reset_base` points to your deployed character manager URL.

2. **Local (non‑prod)**
   - Call `POST /api/auth/password/forgot`:
     - Verify it returns `message`, `debug_reset_token`, and `reset_url`.
     - Visit `reset_url` in the browser; confirm the token is autofilled in the modal.
     - Complete `/auth/password/reset` and confirm you can log in with the new password.

3. **Production / staging**
   - Call `POST /api/auth/password/forgot` with a real email:
     - API response should only contain `{"message": ...}`.
     - You should receive an email from SendGrid with a valid link.
   - Click the link:
     - Ensure the reset modal appears with token filled in.
     - Reset password, then log in with the new password.

4. **Security checks**
   - Ensure no environment or code path returns the token to the client in production.
   - Verify that calling `/auth/password/forgot` with non‑existent emails always returns the same generic message and takes roughly the same time as those with real emails.

---

### 8. Future Enhancements (Optional)

- Add **rate limiting** to `/auth/password/forgot` (per-IP and/or per-email) to prevent abuse.
- Add a **“Password changed” notification email** to alert users of unexpected resets.
- Localize email content or make template-driven emails (instead of inline strings) if the app grows.


