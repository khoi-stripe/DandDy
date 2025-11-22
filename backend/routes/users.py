from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.user import User, UserRole
from schemas.user import UserCreate, UserResponse, UserUpdate
from utils.auth import get_current_active_user, get_password_hash


router = APIRouter(prefix="/users", tags=["users"])


def require_dm(current_user: User = Depends(get_current_active_user)) -> User:
    """
    Restrict access to Dungeon Masters (DMs).

    This keeps user management actions limited to elevated accounts.
    """
    if current_user.role != UserRole.DM:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to manage users.",
        )
    return current_user


@router.get("/", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_dm),
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
    _: User = Depends(require_dm),
) -> User:
    """
    Create a new user as an admin/DM.

    This mirrors registration but does not log the user in or return a token.
    """
    existing_user = (
        db.query(User)
        .filter((User.email == user_data.email) | (User.username == user_data.username))
        .first()
    )

    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User with this email or username already exists",
        )

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

    return new_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user_detail(
    user_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_dm),
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
    _: User = Depends(require_dm),
) -> User:
    """
    Update a user's basic information.

    - Email and username can be changed (with uniqueness checks).
    - Role can be changed between player and DM.
    - Password can be reset by providing a new password.
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Email / username uniqueness checks (if changed)
    if update_data.email and update_data.email != user.email:
        existing_email = db.query(User).filter(User.email == update_data.email).first()
        if existing_email and existing_email.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another user already uses this email",
            )
        user.email = update_data.email

    if update_data.username and update_data.username != user.username:
        existing_username = (
            db.query(User).filter(User.username == update_data.username).first()
        )
        if existing_username and existing_username.id != user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Another user already uses this username",
            )
        user.username = update_data.username

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
    current_dm: User = Depends(require_dm),
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

    if user.id == current_dm.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own account from the admin dashboard.",
        )

    db.delete(user)
    db.commit()

    return None


