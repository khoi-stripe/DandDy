"""
AI Service Routes - Secure proxy for OpenAI API calls
This prevents exposing API keys to the frontend
"""
from fastapi import APIRouter, HTTPException, Depends, Request
from pydantic import BaseModel, Field
from typing import Optional, List
import os
import time
from collections import defaultdict
from datetime import datetime, timedelta
import uuid
import json
import base64

import httpx
import boto3
import openai
from database.database import get_settings

router = APIRouter(tags=["AI"])

# Rate limiting in-memory storage (use Redis in production)
_rate_limit_store = defaultdict(list)

# Additional, feature-specific cooldowns (in-memory; use Redis in production)
_character_summary_last_request: dict[str, datetime] = {}


# Load configuration from settings
settings = get_settings()
OPENAI_API_KEY = settings.openai_api_key
MAX_REQUESTS_PER_MINUTE = settings.max_requests_per_user_per_minute
MAX_REQUESTS_PER_DAY = settings.max_requests_per_user_per_day

# Optional: Grafana Loki config for centralized logging
GRAFANA_LOKI_URL = os.getenv("GRAFANA_LOKI_URL")
GRAFANA_LOKI_TOKEN = os.getenv("GRAFANA_LOKI_TOKEN")

# Cloudflare R2 configuration (optional)
R2_ACCOUNT_ID = settings.r2_account_id
R2_ACCESS_KEY_ID = settings.r2_access_key_id
R2_SECRET_ACCESS_KEY = settings.r2_secret_access_key
R2_BUCKET_NAME = settings.r2_bucket_name
R2_PUBLIC_BASE_URL = settings.r2_public_base_url

# Light debug to confirm whether R2 looks configured (does NOT print secrets).
print(
    "☁️  R2 config summary:",
    {
        "has_account_id": bool(R2_ACCOUNT_ID),
        "has_access_key": bool(R2_ACCESS_KEY_ID),
        "has_secret_key": bool(R2_SECRET_ACCESS_KEY),
        "bucket_name": R2_BUCKET_NAME or "(empty)",
        "public_base_url": R2_PUBLIC_BASE_URL or "(empty)",
    },
)

if not OPENAI_API_KEY:
    print("⚠️  WARNING: OPENAI_API_KEY not set. AI features will be disabled.")

# Initialize OpenAI client
openai.api_key = OPENAI_API_KEY


def _push_log_to_loki(labels: dict, log: dict):
    """
    Best-effort push of a single structured log line to Grafana Loki.
    Fails silently so it never breaks the main request path.
    
    For Grafana Cloud, set:
      GRAFANA_LOKI_URL = https://logs-prod-XXX.grafana.net/loki/api/v1/push
      GRAFANA_LOKI_TOKEN = <user_id>:<api_key>  (Basic Auth format)
    """
    if not (GRAFANA_LOKI_URL and GRAFANA_LOKI_TOKEN):
        return

    try:
        ts_ns = str(int(time.time() * 1_000_000_000))
        payload = {
            "streams": [
                {
                    "stream": labels,
                    "values": [[ts_ns, json.dumps(log, default=str)]],
                }
            ]
        }
        
        # Grafana Cloud uses Basic Auth: base64(user_id:api_key)
        # Token format should be "user_id:api_key"
        auth_bytes = base64.b64encode(GRAFANA_LOKI_TOKEN.encode("utf-8")).decode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_bytes}",
        }
        # Fire-and-forget; short timeout so we don't block user requests
        resp = httpx.post(GRAFANA_LOKI_URL, headers=headers, json=payload, timeout=2.0)
        if resp.status_code >= 400:
            print(f"[LOKI ERROR] HTTP {resp.status_code}: {resp.text[:200]}")
    except Exception as e:
        # Keep this minimal to avoid log loops
        print("[LOKI ERROR]", str(e))


def _extract_openai_headers(response) -> dict:
    """
    Best-effort extraction of HTTP headers from OpenAI responses.

    Different OpenAI client versions expose headers differently. We try a few
    common patterns but always fail safe with an empty dict.
    """
    headers = {}
    try:
        # Newer clients may expose `response.response_headers`
        raw = getattr(response, "response_headers", None)
        if raw:
            headers = dict(raw)
        else:
            # Some internal response objects keep a `_response` with `headers`
            internal = getattr(response, "_response", None)
            if internal is not None:
                raw_headers = getattr(internal, "headers", None)
                if raw_headers:
                    headers = dict(raw_headers)
    except Exception:
        headers = {}

    # Normalize keys to lowercase for easier lookups
    return {str(k).lower(): v for k, v in headers.items()}


def _call_openai_with_logging(kind: str, fn, *, model: str | None = None, context: dict | None = None, **kwargs):
    """
    Thin wrapper around OpenAI SDK calls that logs timing, usage, and
    (when available) rate-limit headers.

    - `kind` is a short string like "chat.completion" or "images.generate"
    - `fn` is the OpenAI function to call, e.g. `openai.chat.completions.create`
    - `model` is logged for observability
    - `context` can include feature/user identifiers for debugging

    NOTE: This function intentionally re-raises OpenAI errors so callers
    can convert them into appropriate HTTP responses.
    """
    start = time.time()
    try:
        # IMPORTANT: `model` is used both for logging and for the actual OpenAI
        # call. Because it's a named parameter on this wrapper (for logging),
        # it does *not* automatically flow through `**kwargs`, so we must pass
        # it explicitly when present. Otherwise OpenAI will raise
        # "Missing required arguments; Expected either ('messages' and 'model')..."
        if model is not None:
            response = fn(model=model, **kwargs)
        else:
            response = fn(**kwargs)
        duration_ms = int((time.time() - start) * 1000)

        headers = _extract_openai_headers(response)
        usage = getattr(response, "usage", None)

        prompt_tokens = getattr(usage, "prompt_tokens", None) if usage else None
        completion_tokens = getattr(usage, "completion_tokens", None) if usage else None
        total_tokens = getattr(usage, "total_tokens", None) if usage else None

        log = {
            "event": "openai.rate_debug",
            "at": datetime.utcnow().isoformat() + "Z",
            "kind": kind,
            "model": model,
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
            "remaining_requests": headers.get("x-ratelimit-remaining-requests"),
            "remaining_tokens": headers.get("x-ratelimit-remaining-tokens"),
            "reset_requests": headers.get("x-ratelimit-reset-requests"),
            "reset_tokens": headers.get("x-ratelimit-reset-tokens"),
            "limit_requests": headers.get("x-ratelimit-limit-requests"),
            "limit_tokens": headers.get("x-ratelimit-limit-tokens"),
            "duration_ms": duration_ms,
        }

        if context:
            log["context"] = context

        # Console logging as JSON; easy for log aggregators to parse
        print("[OPENAI RATE DEBUG]", json.dumps(log, default=str))

        # Ship to Grafana Loki if configured
        _push_log_to_loki(
            {
                "app": "danddy-api",
                "source": "openai",
                "event": "openai.rate_debug",
                "kind": kind,
                "model": model or "",
            },
            log,
        )
        return response

    except openai.RateLimitError as e:
        duration_ms = int((time.time() - start) * 1000)
        headers = {}
        try:
            headers = _extract_openai_headers(getattr(e, "response", None)) if getattr(e, "response", None) else {}
        except Exception:
            headers = {}

        rate_log = {
            "event": "openai.rate_limit_hit",
            "at": datetime.utcnow().isoformat() + "Z",
            "kind": kind,
            "model": model,
            "message": str(e),
            "duration_ms": duration_ms,
            "remaining_requests": headers.get("x-ratelimit-remaining-requests"),
            "remaining_tokens": headers.get("x-ratelimit-remaining-tokens"),
            "reset_requests": headers.get("x-ratelimit-reset-requests"),
            "reset_tokens": headers.get("x-ratelimit-reset-tokens"),
        }

        if context:
            rate_log["context"] = context

        print("[OPENAI RATE LIMIT HIT]", json.dumps(rate_log, default=str))

        _push_log_to_loki(
            {
                "app": "danddy-api",
                "source": "openai",
                "event": "openai.rate_limit_hit",
                "kind": kind,
                "model": model or "",
            },
            rate_log,
        )
        raise

    except Exception:
        # Let callers handle non-rate-limit errors; this wrapper is observability-focused.
        raise


def _get_r2_client():
    """
    Build an S3-compatible client for Cloudflare R2 if configuration is present.
    Returns None when R2 is not configured so callers can gracefully fall back.
    """
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME):
        return None

    endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


# Request/Response models
class ChatCompletionRequest(BaseModel):
    """Request for chat completion (narrator, names, backstory)"""
    prompt: str = Field(..., min_length=1, max_length=2000)
    system_prompt: Optional[str] = Field(None, max_length=2000)
    max_tokens: int = Field(300, ge=50, le=1000)
    temperature: float = Field(0.8, ge=0.0, le=2.0)


class ImageGenerationRequest(BaseModel):
    """Request for image generation"""
    prompt: str = Field(..., min_length=10, max_length=4000)
    size: str = Field("1024x1024", pattern="^(256x256|512x512|1024x1024|1792x1024|1024x1792)$")
    # OpenAI Images API currently documents: low, medium, high, auto.
    # We continue to tolerate legacy aliases "standard" and "hd" for callers
    # that haven't been updated yet, but they will be mapped server-side.
    quality: str = Field("medium", pattern="^(standard|hd|low|medium|high|auto)$")
    # Image model to use. We currently support:
    # - dall-e-3      (default)
    # - gpt-image-1   (GPT Image 1 image model)
    # Additional models can be added here later without breaking callers.
    model: str = Field(
        "dall-e-3",
        pattern="^(dall-e-3|gpt-image-1)$",
        description="OpenAI image model identifier (e.g., 'dall-e-3' or 'gpt-image-1')",
    )


class NamesGenerationRequest(BaseModel):
    """Request for character name generation"""
    race: str = Field(..., min_length=1, max_length=50)
    class_type: str = Field(..., min_length=1, max_length=50)
    count: int = Field(3, ge=1, le=10)


class BackstoryGenerationRequest(BaseModel):
    """Request for backstory generation"""
    name: str = Field(..., min_length=1, max_length=100)
    race: str = Field(..., min_length=1, max_length=50)
    class_type: str = Field(..., min_length=1, max_length=50)
    personality: Optional[str] = None
    background: Optional[str] = None


class CharacterSummaryRequest(BaseModel):
    """
    Combined request for name suggestions + backstory template in a single
    upstream OpenAI call. The backstory template uses a {{NAME}} placeholder
    instead of baking in any specific name so the frontend can substitute the
    final, player-chosen name later.
    """

    race: str = Field(..., min_length=1, max_length=50)
    class_type: str = Field(..., min_length=1, max_length=50)
    alignment: Optional[str] = Field(None, max_length=50)
    background: Optional[str] = Field(None, max_length=100)
    personality: Optional[str] = Field(None, max_length=200)
    # How many distinct name suggestions to return
    name_count: int = Field(3, ge=1, le=10)


class NarratorCommentRequest(BaseModel):
    """Request for narrator comment"""
    choice: str = Field(..., min_length=1, max_length=200)
    question: str = Field(..., min_length=1, max_length=500)
    character_so_far: dict
    narrator_id: str = Field(default='deadpan', max_length=50)


# Helper functions
def check_api_key():
    """Check if OpenAI API key is configured"""
    if not OPENAI_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="AI service is not configured. Please contact the administrator."
        )


def get_client_id(request: Request) -> str:
    """Get a unique identifier for the client (IP address or user ID)"""
    # In production, use authenticated user ID instead
    return request.client.host if request.client else "unknown"


def check_rate_limit(client_id: str):
    """Simple rate limiting (use Redis in production)"""
    now = datetime.now()
    
    # Clean old entries
    _rate_limit_store[client_id] = [
        timestamp for timestamp in _rate_limit_store[client_id]
        if now - timestamp < timedelta(days=1)
    ]
    
    # Check per-minute limit
    recent_requests = [
        timestamp for timestamp in _rate_limit_store[client_id]
        if now - timestamp < timedelta(minutes=1)
    ]
    if len(recent_requests) >= MAX_REQUESTS_PER_MINUTE:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {MAX_REQUESTS_PER_MINUTE} requests per minute."
        )
    
    # Check per-day limit
    if len(_rate_limit_store[client_id]) >= MAX_REQUESTS_PER_DAY:
        raise HTTPException(
            status_code=429,
            detail=f"Daily rate limit exceeded. Max {MAX_REQUESTS_PER_DAY} requests per day."
        )
    
    # Record this request
    _rate_limit_store[client_id].append(now)


def check_character_summary_cooldown(client_id: str, cooldown_seconds: int = 20):
    """
    Enforce a short cooldown between expensive character summary generations
    (names + backstory template) per client.

    This is in addition to the general per-minute/day rate limits and is
    specifically tuned to discourage rapid-fire "new character" spam while
    still allowing other lighter AI features to function.
    """
    if cooldown_seconds <= 0:
        return

    now = datetime.now()
    last = _character_summary_last_request.get(client_id)
    if last is not None:
        elapsed = (now - last).total_seconds()
        if elapsed < cooldown_seconds:
            remaining = int(cooldown_seconds - elapsed) + 1
            raise HTTPException(
                status_code=429,
                detail=(
                    "Character generation is cooling down. "
                    f"Please wait about {remaining} more seconds before starting a new AI-assisted character."
                ),
            )

    _character_summary_last_request[client_id] = now


def handle_openai_error(
    e: Exception,
    feature_name: str = "request",
    safety_message: str | None = None,
) -> None:
    """
    Unified error handler for OpenAI API errors.
    
    Converts OpenAI exceptions to appropriate HTTPExceptions with user-friendly messages.
    
    Args:
        e: The exception from OpenAI
        feature_name: Name of the feature for error messages (e.g., "completion", "image", "names")
        safety_message: Custom message for safety system rejections (uses default if None)
    
    Raises:
        HTTPException with appropriate status code and detail
    """
    if isinstance(e, openai.RateLimitError):
        # Check for Cloudflare-specific rate limiting
        message = str(e) if e else ""
        lower_msg = message.lower()
        
        if (
            "error 1015" in lower_msg
            or "you are being rate limited" in lower_msg
            or "access denied | api.openai.com used cloudflare" in lower_msg
        ):
            raise HTTPException(
                status_code=429,
                detail="Service is temporarily rate limited by OpenAI/Cloudflare (Error 1015). Please try again in a few minutes.",
            )
        
        raise HTTPException(
            status_code=429,
            detail="OpenAI rate limit exceeded. Please try again later.",
        )
    
    if isinstance(e, openai.BadRequestError):
        error_message = str(e)
        if "safety system" in error_message.lower():
            detail = safety_message or (
                f"Your {feature_name} was flagged by OpenAI's safety system. "
                "Please try modifying your request."
            )
            raise HTTPException(status_code=400, detail=detail)
        raise HTTPException(status_code=400, detail=f"Invalid request: {error_message}")
    
    if isinstance(e, openai.APIError):
        raise HTTPException(status_code=502, detail=f"OpenAI API error: {str(e)}")
    
    # Generic fallback for unknown exceptions
    raise HTTPException(status_code=500, detail=f"Failed to generate {feature_name}: {str(e)}")


# Routes
@router.get("/status")
async def get_ai_status():
    """Check if AI service is available"""
    return {
        "available": OPENAI_API_KEY is not None,
        "provider": "openai",
        "features": {
            "chat": OPENAI_API_KEY is not None,
            "images": OPENAI_API_KEY is not None
        },
        "observability": {
            "loki_configured": bool(GRAFANA_LOKI_URL and GRAFANA_LOKI_TOKEN),
        }
    }


@router.post("/observability/test")
async def test_loki_connection():
    """
    Send a test log to Grafana Loki to verify configuration.
    Returns success/failure status.
    """
    if not (GRAFANA_LOKI_URL and GRAFANA_LOKI_TOKEN):
        return {
            "success": False,
            "error": "GRAFANA_LOKI_URL and GRAFANA_LOKI_TOKEN not configured",
            "hint": "Set these in your .env file. Token format: user_id:api_key"
        }
    
    try:
        ts_ns = str(int(time.time() * 1_000_000_000))
        test_log = {
            "event": "loki.test",
            "at": datetime.utcnow().isoformat() + "Z",
            "message": "Test log from DandDy API",
        }
        payload = {
            "streams": [
                {
                    "stream": {
                        "app": "danddy-api",
                        "source": "test",
                        "event": "loki.test",
                    },
                    "values": [[ts_ns, json.dumps(test_log)]],
                }
            ]
        }
        
        auth_bytes = base64.b64encode(GRAFANA_LOKI_TOKEN.encode("utf-8")).decode("utf-8")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Basic {auth_bytes}",
        }
        
        resp = httpx.post(GRAFANA_LOKI_URL, headers=headers, json=payload, timeout=5.0)
        
        if resp.status_code < 300:
            return {
                "success": True,
                "message": "Test log sent to Loki successfully!",
                "loki_url": GRAFANA_LOKI_URL,
                "hint": "Check Grafana Explore with query: {app=\"danddy-api\"}"
            }
        else:
            return {
                "success": False,
                "error": f"Loki returned HTTP {resp.status_code}",
                "response": resp.text[:500],
                "hint": "Check your GRAFANA_LOKI_URL and GRAFANA_LOKI_TOKEN"
            }
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "hint": "Check network connectivity and credentials"
        }


@router.post("/chat/completion")
async def chat_completion(
    request: ChatCompletionRequest,
    http_request: Request
):
    """Generate chat completion (for narrator, names, backstory)"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    try:
        messages = []
        if request.system_prompt:
            messages.append({"role": "system", "content": request.system_prompt})
        messages.append({"role": "user", "content": request.prompt})
        
        response = _call_openai_with_logging(
            kind="chat.completion",
            fn=openai.chat.completions.create,
            model="gpt-3.5-turbo",
            messages=messages,
            max_tokens=request.max_tokens,
            temperature=request.temperature,
            context={
                "feature": "chat_completion",
                "client_id": client_id,
            },
        )
        
        content = response.choices[0].message.content.strip()
        
        return {
            "success": True,
            "content": content,
            "usage": {
                "prompt_tokens": response.usage.prompt_tokens,
                "completion_tokens": response.usage.completion_tokens,
                "total_tokens": response.usage.total_tokens
            }
        }
    
    except Exception as e:
        handle_openai_error(
            e,
            feature_name="completion",
            safety_message="Your request was flagged by OpenAI's safety system. Please try rephrasing your prompt or selecting different options.",
        )


@router.post("/images/generate")
async def generate_image(
    request: ImageGenerationRequest,
    http_request: Request
):
    """Generate image using OpenAI image models (DALL-E 3, GPT Image 1, etc.)"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    try:
        # Step 1: Generate image with OpenAI's image model
        # Default defensively to DALL-E 3 if the requested model is missing/invalid.
        model = request.model or "dall-e-3"
        if model not in ("dall-e-3", "gpt-image-1"):
            model = "dall-e-3"

        # Normalize quality for the current Images API:
        # - Official values: low, medium, high, auto
        # - Legacy aliases: standard → medium, hd → high
        raw_quality = (request.quality or "medium").lower()
        if raw_quality == "standard":
            normalized_quality = "medium"
        elif raw_quality == "hd":
            normalized_quality = "high"
        elif raw_quality in ("low", "medium", "high", "auto"):
            normalized_quality = raw_quality
        else:
            normalized_quality = "medium"

        try:
            response = _call_openai_with_logging(
                kind="images.generate",
                fn=openai.images.generate,
                model=model,
                prompt=request.prompt,
                n=1,
                size=request.size,
                quality=normalized_quality,
                # Likewise, older image endpoints may not support `response_format`.
                # We rely on the default behavior (URL) and continue to read
                # `response.data[0].url` below.
                context={
                    "feature": "image_generation",
                    "client_id": client_id,
                    "quality": normalized_quality,
                },
            )
        except openai.BadRequestError as e:
            # Some older or custom deployments still reject the `quality` param
            # entirely. If we detect that specific error, retry without quality
            # so callers don't have to care about backend version details.
            msg = str(e).lower()
            if "unknown parameter" in msg and "quality" in msg:
                response = _call_openai_with_logging(
                    kind="images.generate",
                    fn=openai.images.generate,
                    model=model,
                    prompt=request.prompt,
                    n=1,
                    size=request.size,
                    context={
                        "feature": "image_generation",
                        "client_id": client_id,
                        "quality": "omitted_due_to_backend",
                    },
                )
            else:
                raise

        # Defensive handling in case the SDK or response shape changes.
        data = getattr(response, "data", None)
        if not data:
            # Log the raw response type for debugging
            try:
                print(
                    "⚠️  DALL-E response had no data field or was empty.",
                    "type=",
                    type(response),
                )
            except Exception:
                pass
            raise Exception("OpenAI did not return any image data")

        first_image = data[0]

        # Support both object-style and dict-style access just in case.
        openai_url = getattr(first_image, "url", None)
        if openai_url is None and isinstance(first_image, dict):
            openai_url = first_image.get("url")

        # Some deployments return base64 instead of a URL.
        image_b64 = getattr(first_image, "b64_json", None)
        if image_b64 is None and isinstance(first_image, dict):
            image_b64 = first_image.get("b64_json")

        revised_prompt = getattr(first_image, "revised_prompt", None)
        if revised_prompt is None and isinstance(first_image, dict):
            revised_prompt = first_image.get("revised_prompt")

        # Debug logging for DALL-E response
        print("🎨 DALL-E image generated.")
        print(f"   Prompt (truncated): {request.prompt[:120]}...")
        if openai_url:
            print(f"   OpenAI URL (truncated): {openai_url[:80]}...")
        elif image_b64:
            print("   OpenAI response provided base64 image data (no URL).")
        else:
            print("   OpenAI image response had neither URL nor base64 data.")

        # Default to OpenAI's temporary URL when present; we'll overwrite if
        # R2 upload succeeds. If only base64 is available, we'll synthesize a
        # URL (either via R2 upload or a data: URL as a last resort).
        final_url = openai_url if openai_url else None

        # Step 2: If Cloudflare R2 is configured, download or decode the image
        # and upload it to R2
        r2_client = _get_r2_client()
        if r2_client and (openai_url or image_b64):
            try:
                # Obtain raw bytes for the image, preferring the direct URL
                # when available, otherwise decoding base64.
                if openai_url:
                    async with httpx.AsyncClient(timeout=60.0) as client:
                        img_resp = await client.get(openai_url)
                        img_resp.raise_for_status()

                        content_type = img_resp.headers.get(
                            "content-type", "image/png"
                        )
                        body_bytes = img_resp.content
                elif image_b64:
                    # Decode base64 data. We default to PNG when the source
                    # format is unknown.
                    body_bytes = base64.b64decode(image_b64)
                    content_type = "image/png"
                else:
                    raise Exception("OpenAI did not return image bytes for upload")

                # Basic extension detection; defaults to .png
                ext = (
                    "jpg"
                    if "jpeg" in content_type or "jpg" in content_type
                    else "png"
                )

                # Use a reasonably unique key for the portrait
                timestamp = int(time.time())
                key = f"portraits/{timestamp}_{uuid.uuid4().hex}.{ext}"

                print("☁️  Uploading portrait to Cloudflare R2...")
                print(f"   Bucket: {R2_BUCKET_NAME}")
                print(f"   Key: {key}")
                print(f"   Content-Type: {content_type}")

                r2_client.put_object(
                    Bucket=R2_BUCKET_NAME,
                    Key=key,
                    Body=body_bytes,
                    ContentType=content_type,
                )

                # Prefer explicit public base URL when provided (recommended for R2 dev/public buckets),
                # otherwise fall back to the S3-style endpoint.
                if R2_PUBLIC_BASE_URL:
                    base = R2_PUBLIC_BASE_URL.rstrip("/")
                    final_url = f"{base}/{key}"
                else:
                    final_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{key}"

                print("✅ Cloudflare R2 upload complete.")
                print(f"   Final image URL: {final_url}")
            except Exception as r2_error:
                # Non-fatal: log and fall back to the original OpenAI URL
                print(f"⚠️  Failed to upload image to Cloudflare R2: {r2_error}")

        # If we still have no URL at this point but we do have base64 data,
        # fall back to a data: URL so the frontend can at least render it
        # without needing another network hop. (CORS proxies are not needed
        # for data URLs.)
        if not final_url and image_b64:
            final_url = f"data:image/png;base64,{image_b64}"

        if not final_url:
            raise Exception("OpenAI did not return an image URL or image data")

        return {
            "success": True,
            "url": final_url,
            "revised_prompt": revised_prompt,
        }
    
    except Exception as e:
        handle_openai_error(
            e,
            feature_name="image",
            safety_message="Your image request was flagged by OpenAI's safety system. Please try modifying your character description or portrait prompt.",
        )


# Narrator personality system prompts
# NOTE: These prompts must stay in sync with:
#   character-builder/character-builder-narrators.js (NARRATORS[id].systemPrompt)
# If you add/modify narrators here, update the frontend file too!
NARRATOR_PROMPTS = {
    'deadpan': 'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',
    
    'enthusiastic': 'You are an enthusiastic, energetic D&D narrator who loves every choice the player makes. You\'re supportive, use exclamation points, and celebrate creativity. Think of an excited bard hyping up their party. Keep responses under 50 words. Be positive, encouraging, and dramatic.',
    
    'mysterious': 'You are a mysterious, cryptic D&D narrator who speaks in riddles and hints at hidden meanings. You\'re enigmatic, slightly foreboding, and reference fate and destiny. Keep responses under 50 words. Be mystical, vague, and occasionally ominous. Use metaphors and speak of paths not taken.',
    
    'grumpy': 'You are a grumpy, world-weary D&D narrator who has seen too many adventurers fail. You\'re cranky, unimpressed, and think most choices are questionable at best. Keep responses under 50 words. Be curmudgeonly, skeptical, and frequently exasperated. Complain about "kids these days" and reference how things were better in the old days.',
    
    'chaotic': 'You are a chaotic, mischievous D&D narrator who delights in mayhem and unexpected outcomes. You\'re playful, slightly unhinged, and love when things go off the rails. Keep responses under 50 words. Be impish, unpredictable, and suggest the most entertaining (not safest) options. Cackle at good chaos.',
    
    'scholarly': 'You are a scholarly, well-read D&D narrator who references game rules, lore, and historical precedent. You\'re precise, informative, and occasionally go on brief tangents about interesting facts. Keep responses under 50 words. Be educational but not boring, cite mechanics when relevant, and provide context about the world.',
    
    'dude': 'You are an extremely laid-back, chill D&D narrator inspired by The Dude from The Big Lebowski. You\'re zen, use casual slang like "man" and "dude," and never stress about anything. Keep responses under 50 words. Be relaxed, philosophical in a lazy way, reference bowling or taking it easy, and always go with the flow. That\'s just like, your opinion, man.',
}

@router.post("/narrator/comment")
async def generate_narrator_comment(
    request: NarratorCommentRequest,
    http_request: Request
):
    """Generate narrator comment for character creation"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    # Get system prompt based on narrator personality
    system_prompt = NARRATOR_PROMPTS.get(request.narrator_id, NARRATOR_PROMPTS['deadpan'])
    
    user_prompt = (
        f"The player chose: {request.choice} for {request.question}. "
        f"Their character so far: {request.character_so_far}. "
        "Make a brief comment about their choice that fits your personality."
    )
    
    try:
        response = _call_openai_with_logging(
            kind="chat.completion",
            fn=openai.chat.completions.create,
            model="gpt-3.5-turbo",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            max_tokens=100,
            temperature=0.8,
            context={
                "feature": "narrator_comment",
                "client_id": client_id,
                "narrator_id": request.narrator_id,
            },
        )
        
        return {
            "success": True,
            "comment": response.choices[0].message.content.strip()
        }
    
    except openai.BadRequestError as e:
        # Check if this is a safety system rejection
        error_message = str(e)
        if "safety system" in error_message.lower():
            # Return a user-friendly fallback comment for safety rejections
            import random
            fallbacks = [
                'Interesting choice. ( ._. )',
                "Well, that tracks.",
                "Bold move. We'll see how that works out.",
                'Sure. Why not.',
            ]
            return {
                "success": False,
                "comment": random.choice(fallbacks),
                "error": "safety_system_rejection",
                "error_message": "Request was flagged by safety system"
            }
        raise HTTPException(status_code=400, detail=f"Invalid request: {error_message}")
    except Exception as e:
        # Return fallback on error (using deadpan fallbacks as default)
        fallbacks = [
            'Interesting choice. ( ._. )',
            "Well, that tracks.",
            "Bold move. We'll see how that works out.",
            'Sure. Why not.',
        ]
        import random
        return {
            "success": False,
            "comment": random.choice(fallbacks),
            "error": str(e)
        }


@router.post("/characters/names")
async def generate_character_names(
    request: NamesGenerationRequest,
    http_request: Request
):
    """Generate character names"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    prompt = (
        f"Generate {request.count} fantasy character names suitable for a "
        f"{request.race} {request.class_type} in D&D. "
        "Just list the names, one per line, nothing else."
    )
    
    try:
        response = _call_openai_with_logging(
            kind="chat.completion",
            fn=openai.chat.completions.create,
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=200,
            temperature=0.9,
            context={
                "feature": "character_names",
                "client_id": client_id,
            },
        )
        
        content = response.choices[0].message.content.strip()
        # Parse names from response
        names = [
            name.strip()
            for name in content.split('\n')
            if name.strip()
        ]
        # Remove leading numbers
        names = [name.split('. ', 1)[-1].split(') ', 1)[-1] for name in names]
        
        return {
            "success": True,
            "names": names[:request.count]
        }
    
    except Exception as e:
        handle_openai_error(
            e,
            feature_name="names",
            safety_message="Your name generation request was flagged by OpenAI's safety system. Please try different race/class combinations.",
        )


@router.post("/characters/backstory")
async def generate_character_backstory(
    request: BackstoryGenerationRequest,
    http_request: Request
):
    """Generate character backstory"""
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    
    prompt = (
        f"Create a brief (100 words max) backstory for: {request.name}, "
        f"a {request.race} {request.class_type}. "
    )
    if request.personality:
        prompt += f"Personality: {request.personality}. "
    if request.background:
        prompt += f"Background: {request.background}. "
    prompt += "Make it dramatic but deadpan in tone."
    
    try:
        response = _call_openai_with_logging(
            kind="chat.completion",
            fn=openai.chat.completions.create,
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=300,
            temperature=0.8,
            context={
                "feature": "character_backstory",
                "client_id": client_id,
            },
        )
        
        return {
            "success": True,
            "backstory": response.choices[0].message.content.strip()
        }
    
    except Exception as e:
        handle_openai_error(
            e,
            feature_name="backstory",
            safety_message="Your backstory request was flagged by OpenAI's safety system. Please try modifying your character details or personality traits.",
        )


@router.post("/characters/summary")
async def generate_character_summary(
    request: CharacterSummaryRequest,
    http_request: Request
):
    """
    Generate BOTH:
      - a short list of candidate character names, and
      - a concise backstory template that uses the literal token {{NAME}}
        everywhere the character's name would normally appear.

    This lets the frontend:
      - pay for a single upstream OpenAI call, and
      - substitute the final player-chosen name client-side without
        needing another model call.
    """
    check_api_key()
    client_id = get_client_id(http_request)
    check_rate_limit(client_id)
    # Extra protection specifically for "new character" style operations: even
    # if the general per-minute/day rate limit is not hit, enforce a short
    # cooldown between summary generations for the same client.
    check_character_summary_cooldown(client_id, cooldown_seconds=20)

    # Build a single structured prompt for both names and backstory template
    prompt = (
        "You are helping create a Dungeons & Dragons character.\n\n"
        f"Details:\n"
        f"- Race: {request.race}\n"
        f"- Class: {request.class_type}\n"
        f"- Alignment: {request.alignment or 'unspecified'}\n"
        f"- Background: {request.background or 'unspecified'}\n"
        f"- Personality: {request.personality or 'unspecified'}\n\n"
        f"Task 1: Suggest {request.name_count} distinct, lore-friendly fantasy character "
        "names that fit this character. Include both given name and, where natural, a "
        "surname.\n\n"
        "Task 2: Write a dramatic but concise backstory for this character, 100 words "
        "maximum.\n\n"
        "IMPORTANT NAME RULE:\n"
        "- Do NOT pick a specific name for the character in the backstory.\n"
        "- Instead, use the exact placeholder token {{NAME}} everywhere the character's "
        "name would normally appear.\n"
        "- Example: \"{{NAME}} grew up in a small village...\".\n\n"
        "RESPONSE FORMAT (VERY IMPORTANT):\n"
        "Return ONLY valid JSON with this exact shape, no extra commentary:\n"
        '{\n'
        '  \"names\": [\"Name One\", \"Name Two\", \"Name Three\"],\n'
        '  \"backstory_template\": \"Backstory text with {{NAME}} placeholder\"\n'
        "}\n"
    )

    try:
        response = _call_openai_with_logging(
            kind="chat.completion",
            fn=openai.chat.completions.create,
            model="gpt-3.5-turbo",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600,
            temperature=0.8,
            context={
                "feature": "character_summary",
                "client_id": client_id,
            },
        )

        raw_content = response.choices[0].message.content.strip()

        # Best-effort JSON extraction: models occasionally wrap JSON in prose.
        parsed = None
        try:
            parsed = json.loads(raw_content)
        except json.JSONDecodeError:
            # Try to salvage the first {...} block if present
            start = raw_content.find("{")
            end = raw_content.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    parsed = json.loads(raw_content[start : end + 1])
                except json.JSONDecodeError:
                    parsed = None

        if not isinstance(parsed, dict):
            raise HTTPException(
                status_code=502,
                detail="AI response could not be parsed as JSON for character summary.",
            )

        names = parsed.get("names") or []
        backstory_template = parsed.get("backstory_template") or parsed.get(
            "backstory"
        )

        # Normalize names list
        if isinstance(names, str):
            # Support newline- or comma-separated strings as a fallback
            parts = [n.strip() for n in names.replace("\r", "").split("\n") if n.strip()]
            if not parts:
                parts = [n.strip() for n in names.split(",") if n.strip()]
            names = parts

        if not isinstance(names, list):
            names = []

        # Clean each name and trim to requested count
        clean_names = []
        for name in names:
            if not isinstance(name, str):
                continue
            text = name.strip()
            if not text:
                continue
            # Strip leading list markers like "1. " or "1) "
            text = text.split(". ", 1)[-1].split(") ", 1)[-1]
            if text:
                clean_names.append(text)

        clean_names = clean_names[: request.name_count]

        # Ensure we always return something non-empty if possible
        if not clean_names:
            # Fall back to a very simple synthetic name using race/class
            fallback_name = f"{request.race.title()} {request.class_type.title()}"
            clean_names = [fallback_name]

        if not isinstance(backstory_template, str) or not backstory_template.strip():
            backstory_template = (
                "{{NAME}} is a "
                f"{request.race} {request.class_type} with a mysterious past. "
                "They do not talk about it much. Probably for the best."
            )

        return {
            "success": True,
            "names": clean_names,
            "backstory_template": backstory_template.strip(),
        }

    except Exception as e:
        handle_openai_error(
            e,
            feature_name="character summary",
            safety_message=(
                    "Your character summary request was flagged by OpenAI's safety system. "
                    "Please try slightly different race/class/background details."
                ),
        )

