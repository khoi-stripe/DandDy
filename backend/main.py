from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from database.database import (
    engine,
    Base,
    ensure_timestamp_columns,
    ensure_prompt_entry_columns,
    ensure_sex_column,
    ensure_ai_image_usage_table,
    ensure_ai_character_creation_usage_table,
    ensure_is_demo_column,
)
from routes import auth, characters, campaigns, ai, users, prompt_entries, shares
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Create database tables and run lightweight migrations
Base.metadata.create_all(bind=engine)
ensure_timestamp_columns()
ensure_prompt_entry_columns()
ensure_sex_column()
ensure_ai_image_usage_table()
ensure_ai_character_creation_usage_table()
ensure_is_demo_column()

app = FastAPI(
    title="DandDy API",
    description="D&D 5e Character Management API",
    version="1.0.0"
)

# Get allowed origins from environment or use defaults
# HARDENED: Only allow specific ports for security
if os.getenv("PRODUCTION"):
    # Production: Allow configured origins + localhost:8080 for testing
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
    # Strip whitespace from each origin
    allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()] if allowed_origins_str else []
    
    # Also allow localhost:8080 (standard frontend port) if not already included
    localhost_origins = ["http://localhost:8080", "http://127.0.0.1:8080"]
    for origin in localhost_origins:
        if origin not in allowed_origins:
            allowed_origins.append(origin)
    
    allow_origin_regex = None
    
    # Debug logging for production CORS
    print(f"🌐 PRODUCTION MODE - Allowed CORS origins: {allowed_origins}")
else:
    # Local development: ONLY allow frontend on port 8080
    # This is more secure than allowing all origins (["*"])
    allowed_origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ]
    allow_origin_regex = None
    print(f"🔧 DEVELOPMENT MODE - Allowed CORS origins: {allowed_origins}")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enable gzip compression for larger responses to reduce bandwidth and improve
# perceived latency, especially for character payloads and AI responses.
app.add_middleware(GZipMiddleware, minimum_size=1000)

# Include routers with /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(characters.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(ai.router, prefix="/api/ai")
app.include_router(prompt_entries.router, prefix="/api")
app.include_router(shares.router, prefix="/api")

@app.get("/")
def root():
    return {"message": "Welcome to DandDy API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


