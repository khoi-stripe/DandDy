from pydantic import BaseModel
from typing import Optional, List, Literal
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
    ended_at: Optional[datetime] = None  # When campaign was completed/archived
    
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


class CampaignMemberCharacterInfo(BaseModel):
    """Minimal character info for member display"""
    id: int
    name: str
    character_class: Optional[str] = None
    level: int = 1
    original_portrait_url: Optional[str] = None  # Portrait URL for party grid cards
    
    class Config:
        from_attributes = True


class CampaignMemberResponse(CampaignMemberBase):
    id: int
    campaign_id: int
    user_id: int
    username: Optional[str] = None  # User's username for display
    user_email: Optional[str] = None  # Kept for backward compatibility
    is_creator: bool
    status: str
    joined_at: datetime
    left_at: Optional[datetime] = None  # When user left the campaign
    journal_visibility: str = "public"  # "private" or "public"
    symbol: Optional[str] = None  # Unique symbol for this member (e.g., ▣, ◆, ▲)
    character: Optional[CampaignMemberCharacterInfo] = None
    
    class Config:
        from_attributes = True


class CampaignMemberVisibilityUpdate(BaseModel):
    """Update journal visibility setting for a campaign membership"""
    visibility: Literal["private", "public"]


# Join campaign via invite code
class CampaignJoin(BaseModel):
    invite_code: str
    character_id: Optional[int] = None  # Optional - can join without character


class CampaignJoinResponse(BaseModel):
    campaign: CampaignResponse
    membership: CampaignMemberResponse


# Invitation schemas - supports username (primary) or email (for non-users)
class CampaignInvite(BaseModel):
    """Invite by username (for existing users) or email (for non-users)."""
    username: Optional[str] = None  # Primary: invite existing user by username
    email: Optional[str] = None  # Fallback: invite non-user by email (acquisition funnel)


# Backward compatibility alias
CampaignInviteByEmail = CampaignInvite


class CampaignInvitationResponse(BaseModel):
    """Pending invitation for a user"""
    id: int  # membership id
    campaign_id: int
    campaign_name: str
    campaign_description: Optional[str] = None
    invited_at: datetime
    invited_by_username: Optional[str] = None  # Username of user who sent the invitation
    invited_by_email: Optional[str] = None  # Kept for backward compatibility
    
    class Config:
        from_attributes = True


class AcceptInvitation(BaseModel):
    character_id: Optional[int] = None  # Optional - can accept without assigning character


class CampaignPendingInviteResponse(BaseModel):
    """Member/invitation for campaign management (for DM to see roster)"""
    id: int  # membership id
    user_id: int
    username: Optional[str] = None  # User's username for display
    email: str  # Kept for backward compatibility
    status: str  # "invited" or "active"
    invited_at: datetime
    symbol: Optional[str] = None  # Unique party symbol (e.g., ▣, ◆, ▲)
    
    class Config:
        from_attributes = True


# Past Adventures schemas
class PastCampaignMemberInfo(BaseModel):
    """Member info for past campaign display"""
    user_id: int
    character_id: Optional[int] = None
    character_name: Optional[str] = None
    character_class: Optional[str] = None
    character_level: Optional[int] = None
    original_portrait_url: Optional[str] = None
    symbol: Optional[str] = None
    is_creator: bool = False
    status: str  # "active", "left", etc.
    joined_at: Optional[datetime] = None  # Made optional to handle legacy data
    left_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


class PastCampaignResponse(BaseModel):
    """Response for past campaigns list"""
    id: int
    name: str
    description: Optional[str] = None
    status: str  # "completed", "archived", or "active" (if user left)
    created_at: Optional[datetime] = None  # Made optional to handle legacy data
    ended_at: Optional[datetime] = None
    # User's relationship to this campaign
    user_left_at: Optional[datetime] = None  # When user left (if they left)
    user_status: str  # User's membership status: "left" or "active" (for completed campaigns)
    # Party info
    party_count: int = 0
    members: List[PastCampaignMemberInfo] = []
    
    class Config:
        from_attributes = True

