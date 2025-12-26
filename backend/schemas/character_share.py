from pydantic import BaseModel, EmailStr, field_validator, model_validator
from typing import Optional
from datetime import datetime
from models.character_share import ShareStatus


class CharacterShareCreate(BaseModel):
    """
    Request body for creating a character share.
    Supports username (primary) or email (for non-users).
    """
    to_username: Optional[str] = None  # Primary: share with existing user by username
    to_email: Optional[EmailStr] = None  # Fallback: share by email (acquisition funnel)
    
    @field_validator('to_email')
    @classmethod
    def lowercase_email(cls, v: Optional[str]) -> Optional[str]:
        return v.lower() if v else v
    
    @field_validator('to_username')
    @classmethod
    def clean_username(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return v.lstrip('@').lower()
        return v
    
    @model_validator(mode='after')
    def check_at_least_one(self):
        if not self.to_username and not self.to_email:
            raise ValueError('Must provide either to_username or to_email')
        return self


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
    """Character info for share preview card."""
    id: int
    name: str
    race: str
    character_class: str
    level: int
    background: Optional[str] = None
    alignment: Optional[str] = None
    sex: Optional[str] = None
    ascii_portrait: Optional[str] = None
    original_portrait_url: Optional[str] = None
    
    class Config:
        from_attributes = True


class PendingShareResponse(BaseModel):
    """Response for pending shares with character preview and sender info."""
    id: int
    character: CharacterPreview
    from_username: Optional[str] = None  # Sender's username for display
    from_email: str  # Sender's email for attribution (kept for compatibility)
    created_at: datetime
    
    class Config:
        from_attributes = True


class CollaboratorResponse(BaseModel):
    """Response for character collaborators."""
    id: int
    user_id: int
    username: str  # Collaborator's username for display
    user_email: str  # Kept for backward compatibility
    permission: str
    created_at: datetime
    
    class Config:
        from_attributes = True

