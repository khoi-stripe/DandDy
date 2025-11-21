from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    database_url: str = "sqlite:///./danddy.db"  # Default for local dev; Render overrides with PostgreSQL
    secret_key: str = "your-secret-key-here"
    algorithm: str = "HS256"
    # Default token lifetime (in minutes). Override with ACCESS_TOKEN_EXPIRE_MINUTES in env for flexibility.
    # 43200 minutes = 30 days, which effectively keeps users logged in unless they explicitly log out.
    access_token_expire_minutes: int = 43200
    
    # AI API settings (optional, used by AI routes)
    openai_api_key: str = ""
    max_requests_per_user_per_minute: int = 10
    max_requests_per_user_per_day: int = 100
    allowed_origins: str = "http://localhost:5173,http://localhost:3000"

    # Cloudflare R2 (optional, used for storing generated images)
    # These map from env vars like R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, etc.
    r2_account_id: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = ""
    # Optional: public base URL for your bucket, e.g. https://<id>.r2.dev/danddy-portraits
    r2_public_base_url: str = ""
    
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
    """
    connect_args = {}
    if database_url.startswith("sqlite"):
        connect_args = {"check_same_thread": False}

    return create_engine(
        database_url,
        connect_args=connect_args,
        pool_pre_ping=True,
    )


engine = _build_engine(settings.database_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


