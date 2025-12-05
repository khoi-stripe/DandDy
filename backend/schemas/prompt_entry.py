from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from enum import Enum


class EntryKind(str, Enum):
    RACE = "race"
    CLASS = "class"
    POSE = "pose"
    CAMERA = "camera"
    SCENE = "scene"
    STYLE = "style"


class PromptEntryBase(BaseModel):
    kind: EntryKind
    key: str
    description: str
    style_description: Optional[str] = None
    background_description: Optional[str] = None


class PromptEntryCreate(PromptEntryBase):
    # Only admins can set is_global=True (enforced in route)
    is_global: bool = False


class PromptEntryUpdate(BaseModel):
    kind: Optional[EntryKind] = None
    key: Optional[str] = None
    description: Optional[str] = None
    style_description: Optional[str] = None
    background_description: Optional[str] = None
    is_global: Optional[bool] = None  # Only admins can change this


class PromptEntryResponse(PromptEntryBase):
    id: int
    owner_id: int
    is_global: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PromptEntryBulkCreate(BaseModel):
    """For importing multiple entries at once."""
    entries: list[PromptEntryCreate]

