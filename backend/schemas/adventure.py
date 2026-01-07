from __future__ import annotations

from datetime import datetime
from typing import Any, Optional

from pydantic import BaseModel, Field


class AdventureStartRequest(BaseModel):
    campaign_id: Optional[int] = None
    character_id: int
    seed: Optional[str] = None
    theme: Optional[str] = Field(None, max_length=100)


class AdventureStepRequest(BaseModel):
    action_text: str = Field(..., min_length=1, max_length=500)


class AdventureStateSummary(BaseModel):
    adventure_id: int
    character_id: int
    campaign_id: Optional[int] = None
    seed: str
    position: str
    hp: int
    hp_max: int
    xp: int
    level: int
    inventory: list[str] = []


class AdventureEvent(BaseModel):
    kind: str
    data: dict[str, Any] = {}


class AdventureStartResponse(BaseModel):
    adventure_id: int
    state_summary: AdventureStateSummary
    narration: str
    suggested_actions: list[str] = []


class AdventureStepResponse(BaseModel):
    adventure_id: int
    state_summary: AdventureStateSummary
    narration: str
    suggested_actions: list[str] = []
    events: list[AdventureEvent] = []


class AdventureTurnResponse(BaseModel):
    turn_index: int
    player_action: str
    dm_text: str
    created_at: datetime


class AdventureGetResponse(BaseModel):
    adventure_id: int
    state_summary: AdventureStateSummary
    turns: list[AdventureTurnResponse] = []


