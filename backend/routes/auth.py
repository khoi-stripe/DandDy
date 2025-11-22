from datetime import timedelta
import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from database.database import get_db, get_settings
from models.user import User
from schemas.user import (
    UserCreate,
    UserLogin,
    UserResponse,
    Token,
    PasswordResetRequest,
    PasswordResetConfirm,
)
from utils.auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_active_user,
    create_password_reset_token,
    verify_password_reset_token,
)

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    existing_user = db.query(User).filter(
        (User.email == user_data.email) | (User.username == user_data.username)
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email or username already exists",
        )

    # Create new user
    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        email=user_data.email,
        username=user_data.username,
        hashed_password=hashed_password,
        role=user_data.role,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # Return token so user is automatically logged in after registration
    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(new_user.id)}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/token", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # OAuth2 uses username field, but we'll accept both username and email
    user = db.query(User).filter(
        (User.username == form_data.username) | (User.email == form_data.username)
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/login", response_model=Token)
def login(user_credentials: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_credentials.email).first()

    if not user or not verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=settings.access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.post("/password/forgot")
def forgot_password(request: PasswordResetRequest, db: Session = Depends(get_db)):
    """
    Request a password reset.

    Always returns a generic success message to avoid leaking which emails exist.
    In development (when PRODUCTION env var is not set), the reset token is included
    in the response for convenience. In production, you should email the token instead.
    """
    user = db.query(User).filter(User.email == request.email).first()

    # Generic response message regardless of whether the user exists
    message = "If an account with that email exists, a password reset link has been sent."

    if not user:
        return {"message": message}

    reset_token = create_password_reset_token(user.id)
    response = {"message": message}

    # In development, surface the token directly to simplify testing.
    if not os.getenv("PRODUCTION"):
        response["debug_reset_token"] = reset_token

    # In production, integrate your email provider here to send the token.
    return response


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
        data={"sub": str(user.id)}, expires_delta=access_token_expires
    )

    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/me", response_model=UserResponse)
def get_current_user_info(current_user: User = Depends(get_current_active_user)):
    return current_user


