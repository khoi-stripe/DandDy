from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database.database import engine, Base
from routes import auth, characters, campaigns

# Create database tables
Base.metadata.create_all(bind=engine)

app = FastAPI(
    title="DandDy API",
    description="D&D 5e Character Management API",
    version="1.0.0"
)

# CORS middleware for iOS app
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify your iOS app's domain
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(auth.router)
app.include_router(characters.router)
app.include_router(campaigns.router)

@app.get("/")
def root():
    return {"message": "Welcome to DandDy API"}

@app.get("/health")
def health_check():
    return {"status": "healthy"}


