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


def ensure_combat_tracking_columns():
    """
    Lightweight migration helper for characters table:
    - Adds hit_dice_current column for tracking spent hit dice during short rests
    - Adds class_resources column for tracking Ki, Rage, Sorcery Points, etc.
    
    NOTE: Currently disabled - columns commented out in model due to Supabase timeout issues.
    To re-enable, run this SQL manually in Supabase SQL Editor:
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS hit_dice_current INTEGER;
        ALTER TABLE characters ADD COLUMN IF NOT EXISTS class_resources JSONB DEFAULT '{}';
    Then uncomment the columns in models/character.py and schemas/character.py
    """
    # Migration disabled - columns not in model yet
    pass


def ensure_character_collaborators_table():
    """
    Lightweight migration helper for the character_collaborators table.
    
    This table enables synced character sharing - when a user accepts a share,
    they become a collaborator on the original character instead of getting a copy.
    """
    inspector = inspect(engine)
    if inspector.has_table("character_collaborators"):
        return

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS character_collaborators (
                    id INTEGER PRIMARY KEY,
                    character_id INTEGER NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                    permission VARCHAR(10) NOT NULL DEFAULT 'edit',
                    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE (character_id, user_id)
                )
                """
            )
        )
        # Create indexes for efficient lookups
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON character_collaborators (user_id)"
                )
            )
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_collaborators_character_id ON character_collaborators (character_id)"
                )
            )
        except Exception:
            pass

        conn.commit()


def ensure_last_updated_by_column():
    """
    Lightweight migration helper for tracking who last updated a character.
    Adds last_updated_by_id column to characters table.
    """
    inspector = inspect(engine)
    if not inspector.has_table("characters"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("characters")}

    with engine.connect() as conn:
        if "last_updated_by_id" not in existing_cols:
            conn.execute(text("ALTER TABLE characters ADD COLUMN last_updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL"))

        conn.commit()


def ensure_pinned_character_ids_column():
    """
    Lightweight migration helper for user preferences.
    Adds pinned_character_ids column to users table (stores JSON array of IDs).
    """
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("users")}

    with engine.connect() as conn:
        if "pinned_character_ids" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN pinned_character_ids TEXT DEFAULT '[]'"))

        conn.commit()


def ensure_user_preferences_column():
    """
    Lightweight migration helper for user preferences.
    Adds preferences column to users table (stores JSON object with settings).
    """
    inspector = inspect(engine)
    if not inspector.has_table("users"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("users")}

    with engine.connect() as conn:
        if "preferences" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN preferences TEXT DEFAULT '{}'"))

        conn.commit()


def ensure_campaign_tracking_columns():
    """
    Lightweight migration helper for campaign tracking feature.
    Adds new columns to the existing campaigns table:
    - invite_code: unique code for joining campaigns
    - status: campaign state (active, paused, completed, archived)
    - created_at, updated_at: timestamps
    """
    inspector = inspect(engine)
    if not inspector.has_table("campaigns"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("campaigns")}

    with engine.connect() as conn:
        if "invite_code" not in existing_cols:
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN invite_code VARCHAR UNIQUE"))
        
        if "status" not in existing_cols:
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN status VARCHAR DEFAULT 'active'"))
        
        if "created_at" not in existing_cols:
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))
        
        if "updated_at" not in existing_cols:
            conn.execute(text("ALTER TABLE campaigns ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP"))

        # Generate invite codes for existing campaigns that don't have one
        # Use SQLite-compatible syntax (SQLite doesn't have MD5 or RANDOM::TEXT)
        is_sqlite = settings.database_url.startswith("sqlite")
        if is_sqlite:
            # For SQLite, we'll use Python to generate codes for existing rows
            from models.campaign import generate_invite_code
            result = conn.execute(text("SELECT id FROM campaigns WHERE invite_code IS NULL"))
            for row in result.fetchall():
                code = generate_invite_code()
                conn.execute(text("UPDATE campaigns SET invite_code = :code WHERE id = :id"), {"code": code, "id": row[0]})
        else:
            # PostgreSQL version
            conn.execute(text("""
                UPDATE campaigns 
                SET invite_code = UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 5) || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4))
                WHERE invite_code IS NULL
            """))

        conn.commit()


def ensure_campaign_member_status_column():
    """
    Lightweight migration helper for campaign_members table.
    Adds the status column for tracking invitation state (invited, active, inactive, left).
    Also ensures the PostgreSQL enum type has all required values.
    """
    inspector = inspect(engine)
    if not inspector.has_table("campaign_members"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("campaign_members")}
    is_postgres = not settings.database_url.startswith("sqlite")

    with engine.connect() as conn:
        if "status" not in existing_cols:
            conn.execute(text("ALTER TABLE campaign_members ADD COLUMN status VARCHAR DEFAULT 'active'"))
            # Backfill existing members to have status = 'active'
            conn.execute(text("UPDATE campaign_members SET status = 'active' WHERE status IS NULL"))
        
        # For PostgreSQL, ensure the memberstatus enum type has all values
        # SQLAlchemy uses enum NAMES (uppercase) not values (lowercase) for native enums
        if is_postgres:
            try:
                # Add all required enum values (uppercase names, not lowercase values)
                for enum_name in ['INVITED', 'ACTIVE', 'INACTIVE', 'LEFT']:
                    try:
                        conn.execute(text(f"ALTER TYPE memberstatus ADD VALUE IF NOT EXISTS '{enum_name}'"))
                    except Exception:
                        pass  # Value already exists or other minor error
            except Exception as e:
                # If the enum type doesn't exist or other error, log and continue
                print(f"Note: Could not verify/add memberstatus enum values: {e}")

        conn.commit()


def ensure_journal_visibility_column():
    """
    Lightweight migration helper for campaign_members table.
    Adds the journal_visibility column for controlling whether journal entries are shared with party.
    Uses VARCHAR/String type for simplicity and compatibility.
    """
    inspector = inspect(engine)
    if not inspector.has_table("campaign_members"):
        return

    existing_cols = {col["name"] for col in inspector.get_columns("campaign_members")}

    with engine.connect() as conn:
        if "journal_visibility" not in existing_cols:
            # Add as VARCHAR with lowercase default for consistency
            conn.execute(text("ALTER TABLE campaign_members ADD COLUMN journal_visibility VARCHAR(20) DEFAULT 'public'"))
            # Backfill existing members
            conn.execute(text("UPDATE campaign_members SET journal_visibility = 'private' WHERE journal_visibility IS NULL"))
        else:
            # Normalize any existing values to lowercase
            conn.execute(text("UPDATE campaign_members SET journal_visibility = LOWER(journal_visibility) WHERE journal_visibility IS NOT NULL"))

        conn.commit()


def ensure_app_config_table():
    """
    Lightweight migration helper for the app_config table.
    
    This table stores application-wide configuration like theme settings.
    Uses a key-value pattern with JSON values.
    """
    inspector = inspect(engine)
    if inspector.has_table("app_config"):
        return

    with engine.connect() as conn:
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS app_config (
                    id INTEGER PRIMARY KEY,
                    key VARCHAR(100) NOT NULL UNIQUE,
                    value TEXT,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_by_id INTEGER REFERENCES users(id) ON DELETE SET NULL
                )
                """
            )
        )
        # Create index for efficient key lookups
        try:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_app_config_key ON app_config (key)"
                )
            )
        except Exception:
            pass

        conn.commit()


def ensure_core_indexes():
    """
    Ensure high-value indexes exist for production databases that were created
    before model-level Index(...) declarations were added.
    
    SQLAlchemy's create_all() will not backfill indexes on existing tables.
    This function is safe to run on both SQLite and Postgres.
    """
    inspector = inspect(engine)
    with engine.connect() as conn:
        def _safe(sql: str):
            try:
                conn.execute(text(sql))
            except Exception as e:
                # Best-effort only; index creation should never block startup.
                print(f"Note: index creation skipped/failed: {e}")
        
        # Characters: common filters + sorting
        if inspector.has_table("characters"):
            _safe("CREATE INDEX IF NOT EXISTS idx_characters_owner_id ON characters (owner_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_characters_campaign_id ON characters (campaign_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_characters_updated_at ON characters (updated_at)")
            # Helpful composite for "my characters sorted by updated"
            _safe("CREATE INDEX IF NOT EXISTS idx_characters_owner_updated_at ON characters (owner_id, updated_at)")
        
        # Collaborators: shared character access
        if inspector.has_table("character_collaborators"):
            _safe("CREATE INDEX IF NOT EXISTS idx_collaborators_user_id ON character_collaborators (user_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_collaborators_character_id ON character_collaborators (character_id)")
            # Fast lookups for access checks (often WHERE character_id=? AND user_id=?)
            _safe("CREATE INDEX IF NOT EXISTS idx_collaborators_character_user ON character_collaborators (character_id, user_id)")
        
        # Campaigns / memberships
        if inspector.has_table("campaigns"):
            _safe("CREATE INDEX IF NOT EXISTS idx_campaigns_invite_code ON campaigns (invite_code)")
            _safe("CREATE INDEX IF NOT EXISTS idx_campaigns_dm_id ON campaigns (dm_id)")
        
        if inspector.has_table("campaign_members"):
            _safe("CREATE INDEX IF NOT EXISTS idx_campaign_members_campaign_id ON campaign_members (campaign_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_campaign_members_user_id ON campaign_members (user_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_campaign_members_character_id ON campaign_members (character_id)")
        
        # Shares (pending invitations)
        if inspector.has_table("character_shares"):
            _safe("CREATE INDEX IF NOT EXISTS idx_character_shares_to_email ON character_shares (to_email)")
            _safe("CREATE INDEX IF NOT EXISTS idx_character_shares_status ON character_shares (status)")
        
        # Prompt entries
        if inspector.has_table("prompt_entries"):
            _safe("CREATE INDEX IF NOT EXISTS idx_prompt_entries_owner_id ON prompt_entries (owner_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_prompt_entries_kind ON prompt_entries (kind)")
            _safe("CREATE INDEX IF NOT EXISTS idx_prompt_entries_key ON prompt_entries (key)")
            _safe("CREATE INDEX IF NOT EXISTS idx_prompt_entries_is_global ON prompt_entries (is_global)")
            _safe("CREATE INDEX IF NOT EXISTS idx_prompt_entries_is_archived ON prompt_entries (is_archived)")
        
        # Sessions / logs
        if inspector.has_table("sessions"):
            _safe("CREATE INDEX IF NOT EXISTS idx_sessions_campaign_id ON sessions (campaign_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_sessions_character_id ON sessions (character_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions (user_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions (started_at)")
        
        if inspector.has_table("session_logs"):
            _safe("CREATE INDEX IF NOT EXISTS idx_session_logs_session_id ON session_logs (session_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_session_logs_character_id ON session_logs (character_id)")
        
        # Journal
        if inspector.has_table("journal_entries"):
            _safe("CREATE INDEX IF NOT EXISTS idx_journal_entries_character_id ON journal_entries (character_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_journal_entries_campaign_id ON journal_entries (campaign_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries (entry_date)")
        
        if inspector.has_table("character_updates"):
            _safe("CREATE INDEX IF NOT EXISTS idx_character_updates_journal_entry_id ON character_updates (journal_entry_id)")
            _safe("CREATE INDEX IF NOT EXISTS idx_character_updates_character_id ON character_updates (character_id)")
        
        conn.commit()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


