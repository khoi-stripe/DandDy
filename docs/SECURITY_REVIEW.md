## DandDy Security Review – 2025-11-26

This document tracks known security issues identified during a review of the DandDy app (backend API + classic web frontends).

### Summary of Findings

| ID       | Title                                                | Area        | Severity | Status   |
|----------|------------------------------------------------------|------------|----------|----------|
| SEC-001  | Password reset token returned to client              | Backend    | Critical | Resolved |
| SEC-002  | Stored XSS via unescaped character data              | Frontend   | High     | Mitigated|
| SEC-003  | Auth tokens stored in `localStorage`                 | Frontend   | Medium   | Accepted |
| SEC-004  | IP-based AI rate limiting (not per-user)             | Backend    | Low      | Accepted |
| SEC-005  | Long dev default for access token lifetime           | Backend    | Low      | Mitigated|

---

### SEC-001 – Password reset token returned to client

- **Area**: `backend/routes/auth.py`
- **Severity**: **Critical**
- **Status**: **Resolved**
- **Description**:
  - The `POST /api/auth/password/forgot` endpoint always returns a `debug_reset_token` in the JSON response when a user with that email exists.
  - An attacker who knows a victim's email can request a token and then call `POST /api/auth/password/reset` to take over the account, without access to the victim's inbox.
  - The presence/absence of `debug_reset_token` also leaks whether an email exists, even though the human-readable message is generic.
- **Recommended Fix**:
  - In production, **never** include any reset token in the HTTP response.
  - Guard all debug behavior with the `PRODUCTION` env var (or similar):
    - In non-production: returning `debug_reset_token` is acceptable for local testing only.
    - In production: generate the token and send it via email or another out-of-band channel.
  - Ensure the JSON response shape is identical regardless of whether the email exists and whether you're in prod or dev (e.g. omit `debug_reset_token` entirely in prod).
- **Implementation Notes**:
  - `backend/routes/auth.py` was updated so that:
    - When `PRODUCTION` is set, `/auth/password/forgot` always returns only a generic `"message"` field and never includes a reset token.
    - When `PRODUCTION` is not set (local/dev), a `debug_reset_token` is still returned for existing accounts to simplify testing.

---

### SEC-002 – Stored XSS via unescaped character data

- **Area**: `shared-character-sheet.js`, `character-manager.js`, and other HTML/JS that renders character fields
- **Severity**: **High**
- **Status**: **Mitigated**
- **Description**:
  - Character fields such as `name`, `backstory`, equipment, languages, traits, etc. are interpolated directly into HTML using template literals and assigned via `innerHTML` (for example in `CharacterSheet.render` and the character grid card renderer).
  - If a character is created or imported with values containing HTML (e.g. `<img onerror=...>` or `<script>...</script>`), that markup will be rendered and executed, leading to stored XSS.
  - Because auth tokens are stored in `localStorage`, a successful XSS payload can read and exfiltrate tokens and act as the user.
- **Recommended Fix**:
  - Treat all character data as untrusted.
  - Replace string-based HTML building for user-controlled fields with safer patterns:
    - Prefer DOM APIs (`document.createElement`, `textContent`) instead of concatenating HTML strings.
    - If you must keep template literals, pass all dynamic text through a small HTML-escaping helper before interpolation.
  - Audit all usages of `innerHTML` across the classic web frontends and ensure only trusted, static content is ever inserted unescaped.
- **Implementation Notes**:
  - Added `escapeHtml` helper to `shared-character-sheet.js` and applied it to character-derived text fields: name, race, class, background, alignment, traits, equipment, skills, languages, background feature, backstory, and export metadata.
  - Added `escapeHtml` helper to `character-manager.js` and applied it to:
    - Character card titles and info text (name, race, class).
    - The rename modal input's initial value.
    - Alert/confirm modal messages (including those that interpolate `character.name`), with newlines rendered as `<br>`.
  - Remaining uses of `innerHTML` are now limited to static or internally generated markup (e.g. loading messages), which do not include user-controlled content; further audits can tighten this if needed.

---

### SEC-003 – Auth tokens stored in `localStorage`

- **Area**: `danddy-auth.js`
- **Severity**: **Medium**
- **Status**: **Accepted (risk mostly driven by XSS)**
- **Description**:
  - Access tokens and user info are stored in `localStorage` (`dnd_auth_token`, `dnd_user_info`).
  - This is common in SPAs but makes tokens accessible to any JavaScript that runs on the page.
  - The main practical risk comes from XSS (see SEC-002); if XSS is possible, an attacker can steal tokens.
- **Recommended Fix / Mitigation**:
  - After XSS vectors are closed, this becomes a reasonable tradeoff for a static frontend.
  - Defense-in-depth options:
    - Shorten access token lifetimes and require more frequent re-authentication.
    - If you later move to a server-rendered or proxy-based frontend, consider `HttpOnly` cookies instead of `localStorage`.
  - Consider adding a strict Content Security Policy (CSP) on the static hosting layer to make script injection harder.

---

### SEC-004 – IP-based AI rate limiting (not per-user)

- **Area**: `backend/routes/ai.py`
- **Severity**: **Low**
- **Status**: **Accepted**
- **Description**:
  - AI routes use an in-memory `_rate_limit_store` keyed by `request.client.host` to enforce per-minute and per-day limits.
  - Behind a reverse proxy (Render), many end users may share the same apparent IP, so limits are effectively per-proxy-IP, not per account.
  - This is adequate as a coarse DoS protection but not a precise "per-user" quota.
- **Recommended Fix**:
  - When an authenticated user context is available, key limits on the authenticated user ID instead of (or in addition to) IP.
  - If AI usage or abuse risk increases, move rate limiting state to a durable store (e.g. Redis) rather than in-memory.

---

### SEC-005 – Long dev default for access token lifetime

- **Area**: `backend/database/database.py`, `render.yaml`
- **Severity**: **Low**
- **Status**: **Mitigated**
- **Description**:
  - `Settings.access_token_expire_minutes` defaults to a very long lifetime (30 days) in code, but production overrides this to 30 minutes via `ACCESS_TOKEN_EXPIRE_MINUTES` in `render.yaml`.
  - If production config is ever misapplied or copied elsewhere without the override, tokens may remain valid for longer than intended.
- **Recommended Fix**:
  - Flip the defaults so that code has a safer short lifetime (e.g. 30–60 minutes) and only lengthens via explicit environment configuration.
  - Document expected token lifetimes in backend `README.md` so deploys to new environments can be checked against it.
- **Implementation Notes**:
  - `Settings.access_token_expire_minutes` in `backend/database/database.py` now defaults to `60` minutes instead of 30 days.
  - Production `render.yaml` already overrides this via `ACCESS_TOKEN_EXPIRE_MINUTES=30`, so prod behavior remains a 30-minute lifetime, and any new environment that forgets to set the env var will still get a short-lived token by default.

