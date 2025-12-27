from datetime import timedelta
import os

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from sqlalchemy import func
from database.database import get_db, get_settings
from models.user import User
from schemas.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    PasswordResetRequest,
    PasswordResetConfirm,
    PinnedCharactersUpdate,
    UsernameUpdate,
    UserPreferences,
)
import json
from utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_active_user,
    create_password_reset_token,
    verify_password_reset_token,
)
from utils.email import send_password_reset_email

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # If a confirm_password was provided by the client, enforce that it matches.
    # Older clients that only send `password` will have confirm_password = None
    # and will skip this check, preserving backwards compatibility.
    if user_data.confirm_password is not None and user_data.password != user_data.confirm_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Passwords do not match",
        )

    # Basic password strength check – enforce a minimum length for all new accounts.
    if len(user_data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters long",
        )

    # Debug: Log password info (not the actual password!)
    password_bytes = len(user_data.password.encode('utf-8'))
    password_chars = len(user_data.password)
    print(f"🔐 Registration attempt - Password length: {password_chars} chars, {password_bytes} bytes")
    
    # Validate password length (bcrypt has 72 byte limit)
    if password_bytes > 72:
        print(f"❌ Password too long: {password_bytes} bytes")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password cannot exceed 72 bytes",
        )
    
    # Check if a user with this email already exists
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Check if username is already taken (case-insensitive)
    existing_username = db.query(User).filter(
        func.lower(User.username) == user_data.username.lower()
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already taken",
        )

    # Create new user with username and email
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username.lower(),  # Store lowercase for consistency
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Return token so user is automatically logged in after registration
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(new_user.id), "role": new_user.role.value}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """
    OAuth2 password flow login.

    The standard form field is called `username` but accepts either an email
    address or a username. We detect which by checking for '@' in the value.
    """
    identifier = form_data.username.strip()
    
    # Detect if identifier is email or username
    if "@" in identifier:
        user = db.query(User).filter(User.email == identifier).first()
    else:
        user = db.query(User).filter(
            func.lower(User.username) == identifier.lower()
        ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    identifier = user_credentials.identifier.strip()
    
    # Detect if identifier is email or username
    if "@" in identifier:
        user = db.query(User).filter(User.email == identifier).first()
    else:
        user = db.query(User).filter(
            func.lower(User.username) == identifier.lower()
        ).first()

    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username/email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/password/forgot")
def forgot_password(
    request: PasswordResetRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Request a password reset.

    Always returns a generic success message to avoid leaking which emails exist.
    In development (when PRODUCTION env var is not set), the reset token may be
    included in the response for convenience. In production, the token must be
    delivered via an out‑of‑band channel (e.g., email) and is never returned to
    the client.
    """
    user = db.query(User).filter(User.email == request.email).first()

    # Generic response message regardless of whether the user exists
    message = "If an account with that email exists, a password reset link has been sent."

    if not user:
        return {"message": message}

    reset_token = create_password_reset_token(user.id)
    base = settings.frontend_reset_base
    reset_url = f"{base}#reset-token={reset_token}"

    # In production, never return the reset token in the HTTP response.
    # Instead, send an email containing a reset link.
    if os.getenv("PRODUCTION"):
        background_tasks.add_task(send_password_reset_email, user.email, reset_url)
        return {"message": message}

    # In non‑production environments, expose a debug token and URL to simplify
    # local testing of the reset flow. This should never be enabled in prod.
    return {
        "message": message,
        "debug_reset_token": reset_token,
        "reset_url": reset_url,
    }


@router.post("/password/reset", response_model=Token)
def reset_password(data: PasswordResetConfirm, db: Session = Depends(get_db)):
    """
    Reset a user's password using a valid password reset token.
    Returns a fresh access token so the user is immediately logged in.
    """
    user_id = verify_password_reset_token(data.token)
    user = db.query(User).filter(User.id == user_id).first()

    if not user:
        # This should be rare because the token was valid, but guard anyway.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid password reset token",
        )

    # Update the user's password
    user.hashed_password = get_password_hash(data.new_password)
    db.add(user)
    db.commit()

    # Issue a new access token
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id), "role": user.role.value}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return current_user


@router.put("/username", response_model=UserResponse)
def update_username(
    data: UsernameUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the current user's username.
    Username must be unique (case-insensitive) and follow validation rules.
    """
    new_username = data.username.lower()
    
    # Check if new username is same as current (no-op)
    if current_user.username == new_username:
        return current_user
    
    # Check if username is already taken by another user
    existing = db.query(User).filter(
        func.lower(User.username) == new_username,
        User.id != current_user.id
    ).first()
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already taken",
        )
    
    current_user.username = new_username
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    
    return current_user


@router.get("/pinned")
def get_pinned_characters(
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the current user's pinned character IDs.
    Returns an array of character ID strings in pin order.
    """
    try:
        pinned = json.loads(current_user.pinned_character_ids or "[]")
        return {"pinned_character_ids": pinned}
    except (json.JSONDecodeError, TypeError):
        return {"pinned_character_ids": []}


@router.put("/pinned")
def update_pinned_characters(
    data: PinnedCharactersUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the current user's pinned character IDs.
    Accepts an array of character ID strings in desired pin order.
    """
    # Validate: ensure all IDs are strings
    pinned_ids = [str(id) for id in data.pinned_character_ids]
    
    # Store as JSON string
    current_user.pinned_character_ids = json.dumps(pinned_ids)
    db.add(current_user)
    db.commit()
    
    return {"pinned_character_ids": pinned_ids}


@router.get("/preferences")
def get_user_preferences(
    current_user: User = Depends(get_current_active_user),
):
    """
    Get the current user's preferences.
    Returns all stored settings (colorTheme, narratorId, textSpeedMultiplier, etc.)
    """
    try:
        prefs = json.loads(current_user.preferences or "{}")
        return {"preferences": prefs}
    except (json.JSONDecodeError, TypeError):
        return {"preferences": {}}


@router.put("/preferences")
def update_user_preferences(
    data: UserPreferences,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Update the current user's preferences.
    Merges the provided preferences with existing ones (partial update).
    """
    try:
        existing = json.loads(current_user.preferences or "{}")
    except (json.JSONDecodeError, TypeError):
        existing = {}
    
    # Merge new preferences with existing (only non-None values)
    updates = data.model_dump(exclude_none=True)
    merged = {**existing, **updates}
    
    # Store as JSON string
    current_user.preferences = json.dumps(merged)
    db.add(current_user)
    db.commit()
    
    return {"preferences": merged}


