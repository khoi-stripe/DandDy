from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.database import engine, Base
from routes import auth, characters, campaigns, ai
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
# For development, allow localhost. In production, specify exact origins.
if os.getenv("PRODUCTION"):
    allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "")
    allowed_origins = allowed_origins_str.split(",") if allowed_origins_str else []
else:
    # Development mode - allow localhost with various ports
    allowed_origins = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://localhost:8080",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8080",
    ]

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
app.include_router(ai.router, prefix="/api/ai")

@app.get("/")
def root():
    return {"message": "Welcome to DandDy API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


