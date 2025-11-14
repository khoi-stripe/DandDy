from pydantic import BaseModel
from typing import Optional, List
from .character import CharacterResponse

class CampaignBase(BaseModel):
    name: str
    description: Optional[str] = None

class CampaignCreate(CampaignBase):
    pass

class CampaignUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

class CampaignResponse(CampaignBase):
    id: int
    dm_id: int
    
    class Config:
        from_attributes = True

class CampaignWithCharacters(CampaignResponse):
    characters: List[CharacterResponse] = []
    
    class Config:
        from_attributes = True


