from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from database.database import get_db
from models.user import User, UserRole
from schemas.user import UserCreate, UserResponse, UserUpdate, UserLookupResponse
from utils.auth import get_current_active_user, get_password_hash


router = APIRouter(prefix="/users", tags=["users"])


@router.get("/lookup", response_model=UserLookupResponse)
def lookup_user_by_username(
    username: str = Query(..., min_length=1, description="Username to look up"),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_active_user),
):
    """
    Look up a user by their username (case-insensitive).
    
    Used for invitation flows where users want to invite by username.
    Returns minimal info (id, username) to avoid leaking email addresses.
    """
    # Strip @ prefix if present (users might type @username)
    clean_username = username.lstrip('@').lower()
    
    user = db.query(User).filter(
        func.lower(User.username) == clean_username
    ).first()
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No user found with that username",
        )
    
    return user


def require_dm_or_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """
    Restrict access to Dungeon Masters (DMs) or Admins.

    This keeps user management actions limited to elevated accounts.
    """
    if current_user.role not in (UserRole.DM, UserRole.ADMIN):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage users.",
        )
    return current_user


@router.get("/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_dm_or_admin),
) -> List[User]:
    """
    List all users.

    Returns basic user info only (no passwords).
    """
    return db.query(User).order_by(User.id).all()


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    user_data: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_dm_or_admin),
) -> User:
    """
    Create a new user as an admin/DM.

    This mirrors registration but does not log the user in or return a token.
    """
    # Check for existing email
    existing_email = db.query(User).filter(User.email == user_data.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email already exists",
        )

    # Check for existing username (case-insensitive)
    existing_username = db.query(User).filter(
        func.lower(User.username) == user_data.username.lower()
    ).first()
    if existing_username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This username is already taken",
        )

    hashed_password = get_password_hash(user_data.password)
    new_user = User(
        username=user_data.username.lower(),
        email=user_data.email,
        hashed_password=hashed_password,
        role=user_data.role,
    )

    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return new_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_dm_or_admin),
) -> User:
    """
    Get a single user's details.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )
    return user


@router.patch("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    update_data: UserUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_dm_or_admin),
) -> User:
    """Update a user's basic information.

    - Username can be changed (with uniqueness checks).
    - Email can be changed (with uniqueness checks).
    - Role can be changed between player and DM.
    - Password can be reset by providing a new password.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Username uniqueness checks (if changed)
    if update_data.username and update_data.username.lower() != user.username:
        existing_username = db.query(User).filter(
            func.lower(User.username) == update_data.username.lower(),
            User.id != user.id
        ).first()
        if existing_username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This username is already taken",
            )
        user.username = update_data.username.lower()

    # Email uniqueness checks (if changed)
    if update_data.email and update_data.email != user.email:
        existing_email = db.query(User).filter(User.email == update_data.email).first()
        if existing_email and existing_email.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another user already uses this email",
            )
        user.email = update_data.email

    if update_data.role is not None:
        user.role = update_data.role

    if update_data.password:
        user.hashed_password = get_password_hash(update_data.password)

    db.add(user)
    db.commit()
    db.refresh(user)

    return user


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_dm_or_admin),
) -> None:
    """
    Delete a user.

    DMs cannot delete themselves via this endpoint as a safety guard.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account from the admin dashboard.",
        )

    db.delete(user)
    db.commit()

    return None


