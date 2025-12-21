from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime


# Journal Entry schemas
class JournalEntryCreate(BaseModel):
    """Create a new journal entry"""
    character_id: int
    campaign_id: Optional[int] = None
    title: str
    content: Optional[str] = None
    entry_date: Optional[date] = None  # Defaults to today if not provided


class JournalEntryUpdate(BaseModel):
    """Update an existing journal entry"""
    title: Optional[str] = None
    content: Optional[str] = None
    entry_date: Optional[date] = None


class CharacterUpdateCreate(BaseModel):
    """Create character stat updates for a journal entry"""
    xp_gained: int = 0
    gold_change: int = 0  # Can be negative
    hp_change: int = 0  # Delta (e.g., -5 for damage taken)
    items_acquired: List[str] = []
    items_lost: List[str] = []
    conditions: List[str] = []  # e.g., ["exhaustion:2", "poisoned"]


class CharacterUpdateResponse(BaseModel):
    id: int
    journal_entry_id: int
    character_id: int
    xp_gained: int
    gold_change: int
    hp_change: int
    items_acquired: List[str]
    items_lost: List[str]
    conditions: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class JournalEntryResponse(BaseModel):
    id: int
    character_id: int
    campaign_id: Optional[int]
    user_id: int
    title: str
    content: Optional[str]
    entry_date: date
    created_at: datetime
    updated_at: datetime
    character_update: Optional[CharacterUpdateResponse] = None
    
    class Config:
        from_attributes = True


class JournalEntryWithUpdate(JournalEntryCreate):
    """Create journal entry with optional character update in one call"""
    character_update: Optional[CharacterUpdateCreate] = None

