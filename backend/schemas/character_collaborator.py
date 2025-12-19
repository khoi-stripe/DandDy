from pydantic import BaseModel
from datetime import datetime
from typing import Optional
from enum import Enum


class CollaboratorPermission(str, Enum):
    VIEW = "view"
    EDIT = "edit"


class CollaboratorCreate(BaseModel):
    """Used when adding a collaborator directly (not through share accept)."""
    user_email: str
    permission: CollaboratorPermission = CollaboratorPermission.EDIT


class CollaboratorResponse(BaseModel):
    """Response when listing collaborators of a character."""
    id: int
    user_id: int
    user_email: str
    user_username: Optional[str] = None
    permission: CollaboratorPermission
    created_at: datetime
    
    class Config:
        from_attributes = True


class CollaboratorUpdate(BaseModel):
    """Used to update a collaborator's permission."""
    permission: CollaboratorPermission


class SharedCharacterInfo(BaseModel):
    """Additional info returned with shared characters."""
    owner_email: str
    owner_username: Optional[str] = None
    is_owner: bool
    permission: Optional[CollaboratorPermission] = None

