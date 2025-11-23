from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.database import engine, Base
from routes import auth, characters, campaigns, ai, users
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# Create database tables
Base.metadata.create_all(bind=engine)

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
    allowed_origins = allowed_origins_str.split(",") if allowed_origins_str else []
    
    # Also allow localhost:8080 (standard frontend port)
    allowed_origins.extend([
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ])
    allow_origin_regex = None
else:
    # Local development: ONLY allow frontend on port 8080
    # This is more secure than allowing all origins (["*"])
    allowed_origins = [
        "http://localhost:8080",
        "http://127.0.0.1:8080"
    ]
    allow_origin_regex = None

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers with /api prefix
app.include_router(auth.router, prefix="/api")
app.include_router(characters.router, prefix="/api")
app.include_router(campaigns.router, prefix="/api")
app.include_router(users.router, prefix="/api")
app.include_router(ai.router, prefix="/api/ai")

@app.get("/")
def root():
    return {"message": "Welcome to DandDy API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


