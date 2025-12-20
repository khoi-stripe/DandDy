from pydantic import BaseModel, EmailStr

from models.user import UserRole


class UserBase(BaseModel):
    """Shared user fields returned to clients.

    We now identify accounts by email only. Usernames are deprecated.
    """

    email: EmailStr
    role: UserRole = UserRole.PLAYER


class UserCreate(UserBase):
    """Payload for creating a new user (registration or via admin)."""

    password: str
    # Optional second password entry for flows that collect "confirm password".
    # Older clients that only send `password` remain compatible.
    confirm_password: str | None = None


class UserUpdate(BaseModel):
    """Partial update payload for admin user management."""

    email: EmailStr | None = None
    role: UserRole | None = None
    password: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    user_id: int | None = None


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: str


class PinnedCharactersUpdate(BaseModel):
    """Payload for updating user's pinned character IDs."""
    pinned_character_ids: list[str]


