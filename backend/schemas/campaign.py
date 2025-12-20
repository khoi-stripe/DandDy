from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from .character import CharacterResponse


class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None


class CampaignCreate(CampaignBase):
    pass


class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None  # "active", "paused", "completed", "archived"


class CampaignResponse(CampaignBase):
    id: int
    dm_id: int  # Kept for backward compatibility (= created_by)
    invite_code: Optional[str] = None
    status: str = "active"
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class CampaignWithCharacters(CampaignResponse):
    characters: List[CharacterResponse] = []
    
    class Config:
        from_attributes = True


# Campaign Member schemas
class CampaignMemberBase(BaseModel):
    character_id: Optional[int] = None


class CampaignMemberCreate(CampaignMemberBase):
    pass


class CampaignMemberResponse(CampaignMemberBase):
    id: int
    campaign_id: int
    user_id: int
    is_creator: bool
    status: str
    joined_at: datetime
    
    class Config:
        from_attributes = True


# Join campaign via invite code
class CampaignJoin(BaseModel):
    invite_code: str
    character_id: Optional[int] = None  # Optional - can join without character


class CampaignJoinResponse(BaseModel):
    campaign: CampaignResponse
    membership: CampaignMemberResponse


