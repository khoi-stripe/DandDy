from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    database_url: str = "sqlite:///./danddy.db"  # Default for local dev; production uses Supabase PostgreSQL
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    # Default token lifetime (in minutes). Override with ACCESS_TOKEN_EXPIRE_MINUTES in env for flexibility.
    # Use a short, safer default (60 minutes) and lengthen only via explicit env configuration.
    access_token_expire_minutes: int = 60
    
    # AI API settings (optional, used by AI routes)
    openai_api_key: str = ""
    max_requests_per_user_per_minute: int = 10
    max_requests_per_user_per_day: int = 100
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # Email / Postmark + frontend reset URL
    postmark_server_token: str = ""
    email_from: str = "no-reply@example.com"
    email_reply_to: str | None = None
    # Base URL used to build password reset links sent via email.
    # For local dev this can point at the dev server; in production it should
    # be overridden to the deployed character manager URL.
    frontend_reset_base: str = "http://localhost:8080/index.html"

    # Cloudflare R2 (optional, used for storing generated images)
    # These map from env vars like R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, etc.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # Optional: public base URL for your bucket, e.g. https://<id>.r2.dev/danddy-portraits
    r2_public_base_url: str = ""

    # Replicate API (optional, for Flux image generation)
    replicate_api_token: str = ""
    
    class Config:
        env_file = ".env"
        extra = "ignore"  # Ignore extra fields in .env

@lru_cache()
def get_settings():
    return Settings()

settings = get_settings()


def _build_engine(database_url: str):
    """
    Create a SQLAlchemy engine with sensible defaults for both SQLite and PostgreSQL.
    - Enables `check_same_thread=False` for SQLite so it works cleanly with FastAPI.
    - Turns on `pool_pre_ping` to avoid stale connections in long‑running deployments.
    - Uses psycopg (v3) driver for PostgreSQL for better Supabase pooler compatibility.
    """
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}
    elif database_url.startswith("postgresql://"):
        # Convert to use psycopg v3 driver for better Supabase compatibility
        database_url = database_url.replace("postgresql://", "postgresql+psycopg://", 1)

    return create_engine(
        database_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def ensure_timestamp_columns():
    """
    Lightweight migration helper:
    - Ensures the `characters` table has created_at / updated_at columns.
    - Backfills missing values so existing rows get sane timestamps.
    This is intentionally simple so it works for both SQLite and Postgres
    without introducing a full migration framework.
    """
    inspector = inspect(engine)
    if not inspector.has_table("characters"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("characters")}

    with engine.connect() as conn:
        altered = False

        if "created_at" not in existing_cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN created_at TIMESTAMP"))
            altered = True

        if "updated_at" not in existing_cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN updated_at TIMESTAMP"))
            altered = True

        # If we added columns or they existed but were null, backfill them.
        if altered or "created_at" in existing_cols or "updated_at" in existing_cols:
            conn.execute(
                text(
                    """
                    UPDATE characters
                    SET created_at = COALESCE(created_at, CURRENT_TIMESTAMP),
                        updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
                    """
                )
            )

        conn.commit()


def ensure_prompt_entry_columns():
    """
    Lightweight migration helper for prompt_entries table:
    - Adds background_description column for style entries (scene description)
    - Adds is_global column for admin-published entries
    - Adds is_archived column for archived entries
    """
    inspector = inspect(engine)
    if not inspector.has_table("prompt_entries"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("prompt_entries")}

    with engine.connect() as conn:
        if "background_description" not in existing_cols:
            conn.execute(text("ALTER TABLE prompt_entries ADD COLUMN background_description VARCHAR"))

        if "is_global" not in existing_cols:
            conn.execute(text("ALTER TABLE prompt_entries ADD COLUMN is_global BOOLEAN DEFAULT FALSE"))
            # Backfill existing rows to have is_global = false
            conn.execute(text("UPDATE prompt_entries SET is_global = FALSE WHERE is_global IS NULL"))

        if "is_archived" not in existing_cols:
            conn.execute(text("ALTER TABLE prompt_entries ADD COLUMN is_archived BOOLEAN DEFAULT FALSE"))
            # Backfill existing rows to have is_archived = false
            conn.execute(text("UPDATE prompt_entries SET is_archived = FALSE WHERE is_archived IS NULL"))

        conn.commit()


def ensure_sex_column():
    """
    Lightweight migration helper for characters table:
    - Adds sex column for character biological sex (male/female)
    """
    inspector = inspect(engine)
    if not inspector.has_table("characters"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("characters")}

    with engine.connect() as conn:
        if "sex" not in existing_cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN sex VARCHAR"))

        conn.commit()


def ensure_ai_image_usage_table():
    """
    Lightweight migration helper for AI image quota tracking.

    Creates a small table that stores per-day usage counts keyed by:
      - day_utc (DATE)
      - subject_key (TEXT): "user:{id}" or "ip:{addr}"

    This table is intentionally minimal and created via raw SQL so it works for
    both SQLite (local dev) and Postgres (Supabase).
    """
    inspector = inspect(engine)
    if inspector.has_table("ai_image_usage"):
        return

    with engine.connect() as conn:
        # A simple, portable schema.
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ai_image_usage (
                    day_utc DATE NOT NULL,
                    subject_key TEXT NOT NULL,
                    image_count INTEGER NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (day_utc, subject_key)
                )
                """
            )
        )
        # Helpful index for debugging/queries (no-op if unsupported).
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_image_usage_subject_day ON ai_image_usage (subject_key, day_utc)"
                )
            )
        except Exception:
            # Some engines/versions may not support IF NOT EXISTS for indexes; safe to ignore.
            pass

        conn.commit()


def ensure_ai_character_creation_usage_table():
    """
    Lightweight migration helper for AI character creation quota tracking.

    Creates a table that stores per-day character creation counts keyed by:
      - day_utc (DATE)
      - subject_key (TEXT): "user:{id}" or "ip:{addr}"

    This is separate from image quota - character creation includes one portrait,
    but custom portraits use the image quota.
    """
    inspector = inspect(engine)
    if inspector.has_table("ai_character_creation_usage"):
        return

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ai_character_creation_usage (
                    day_utc DATE NOT NULL,
                    subject_key TEXT NOT NULL,
                    creation_count INTEGER NOT NULL DEFAULT 0,
                    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    PRIMARY KEY (day_utc, subject_key)
                )
                """
            )
        )
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_character_creation_usage_subject_day ON ai_character_creation_usage (subject_key, day_utc)"
                )
            )
        except Exception:
            pass

        conn.commit()


def ensure_ai_creation_portrait_grants_table():
    """
    Lightweight migration helper for one-time portrait grants tied to character creation.

    Each successful character creation summary call issues a `grant_id` that can be
    redeemed exactly once to generate the *included* portrait image without
    consuming the separate custom image quota.

    This table is intentionally minimal and created via raw SQL so it works for
    both SQLite (local dev) and Postgres (Supabase).
    """
    inspector = inspect(engine)
    if inspector.has_table("ai_creation_portrait_grants"):
        return

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ai_creation_portrait_grants (
                    day_utc DATE NOT NULL,
                    subject_key TEXT NOT NULL,
                    grant_id TEXT NOT NULL,
                    used BOOLEAN NOT NULL DEFAULT FALSE,
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    used_at TIMESTAMP NULL,
                    PRIMARY KEY (day_utc, subject_key, grant_id)
                )
                """
            )
        )
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_ai_creation_portrait_grants_subject_day ON ai_creation_portrait_grants (subject_key, day_utc)"
                )
            )
        except Exception:
            pass

        conn.commit()


def ensure_is_demo_column():
    """
    Lightweight migration helper for characters table:
    - Adds is_demo column for marking characters as available in demo mode
    """
    inspector = inspect(engine)
    if not inspector.has_table("characters"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("characters")}

    with engine.connect() as conn:
        if "is_demo" not in existing_cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN is_demo BOOLEAN DEFAULT FALSE"))
            # Backfill existing rows to have is_demo = false
            conn.execute(text("UPDATE characters SET is_demo = FALSE WHERE is_demo IS NULL"))

        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


