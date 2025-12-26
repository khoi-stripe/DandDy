import re
from pydantic import BaseModel, EmailStr, field_validator

from models.user import UserRole


# Username validation regex: 3-30 chars, alphanumeric + underscore
USERNAME_PATTERN = re.compile(r'^[a-zA-Z0-9_]{3,30}$')


class UserBase(BaseModel):
    """Shared user fields returned to clients."""

    username: str
    email: EmailStr
    role: UserRole = UserRole.PLAYER


class UserCreate(UserBase):
    """Payload for creating a new user (registration or via admin)."""

    password: str
    # Optional second password entry for flows that collect "confirm password".
    # Older clients that only send `password` remain compatible.
    confirm_password: str | None = None

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                'Username must be 3-30 characters, using only letters, numbers, and underscores'
            )
        return v.lower()  # Store usernames lowercase for case-insensitive uniqueness


class UserUpdate(BaseModel):
    """Partial update payload for admin user management."""

    username: str | None = None
    email: EmailStr | None = None
    role: UserRole | None = None
    password: str | None = None

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str | None) -> str | None:
        if v is not None and not USERNAME_PATTERN.match(v):
            raise ValueError(
                'Username must be 3-30 characters, using only letters, numbers, and underscores'
            )
        return v.lower() if v else v


class UsernameUpdate(BaseModel):
    """Payload for user to update their own username."""

    username: str

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not USERNAME_PATTERN.match(v):
            raise ValueError(
                'Username must be 3-30 characters, using only letters, numbers, and underscores'
            )
        return v.lower()


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(UserBase):
    id: int

    class Config:
        from_attributes = True


class UserLookupResponse(BaseModel):
    """Response for username lookup (minimal info for invitations)."""
    id: int
    username: str

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


