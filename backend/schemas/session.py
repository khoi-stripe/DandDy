from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# Session schemas
class SessionStart(BaseModel):
    """Start a new session for a character"""
    character_id: int
    campaign_id: Optional[int] = None  # Optional - allows standalone sessions
    name: Optional[str] = None  # Optional session label


class SessionEnd(BaseModel):
    """End an active session"""
    pass  # Session ID comes from path parameter


class SessionResponse(BaseModel):
    id: int
    campaign_id: Optional[int]
    character_id: int
    user_id: int
    session_number: int
    name: Optional[str]
    started_at: datetime
    ended_at: Optional[datetime]
    status: str
    
    class Config:
        from_attributes = True


# Session Log schemas (post-session check-in)
class SessionLogCreate(BaseModel):
    """Post-session character update form"""
    session_name: Optional[str] = None  # Can update session name here too
    xp_gained: int = 0
    gold_change: int = 0  # Can be negative
    hp_after: Optional[int] = None  # New HP value
    items_acquired: List[str] = []
    items_lost: List[str] = []
    conditions: List[str] = []  # e.g., ["exhaustion:2", "poisoned"]
    journal: Optional[str] = None


class SessionLogResponse(BaseModel):
    id: int
    session_id: int
    character_id: int
    user_id: int
    xp_gained: int
    gold_change: int
    hp_before: Optional[int]
    hp_after: Optional[int]
    items_acquired: List[str]
    items_lost: List[str]
    conditions: List[str]
    journal: Optional[str]
    submitted_at: datetime
    
    class Config:
        from_attributes = True


class SessionWithLog(SessionResponse):
    """Session with its log entry (if completed)"""
    log: Optional[SessionLogResponse] = None
    
    class Config:
        from_attributes = True

