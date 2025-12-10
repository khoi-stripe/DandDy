from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional
from datetime import datetime
from models.character_share import ShareStatus


class CharacterShareCreate(BaseModel):
    """Request body for creating a character share."""
    to_email: EmailStr
    
    @field_validator('to_email')
    @classmethod
    def lowercase_email(cls, v: str) -> str:
        return v.lower()


class CharacterShareResponse(BaseModel):
    """Response for a character share record."""
    id: int
    character_id: int
    from_user_id: int
    to_email: str
    status: ShareStatus
    created_at: datetime
    
    class Config:
        from_attributes = True


class CharacterPreview(BaseModel):
    """Minimal character info for share preview."""
    id: int
    name: str
    race: str
    character_class: str
    level: int
    ascii_portrait: Optional[str] = None
    
    class Config:
        from_attributes = True


class PendingShareResponse(BaseModel):
    """Response for pending shares with character preview and sender info."""
    id: int
    character: CharacterPreview
    from_email: str  # Sender's email for attribution
    created_at: datetime
    
    class Config:
        from_attributes = True

