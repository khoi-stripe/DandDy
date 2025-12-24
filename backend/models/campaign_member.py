from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Enum, String, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database.database import Base


# Available symbols for party members - assigned randomly when joining a campaign
PARTY_SYMBOLS = [
    '▣', '▱', '▲', '△', '▶', '▷', '▼', '▽', '◈', '◉', '◎', '◐', '◑', '◒', '◓',
    '◧', '◨', '◩', '◪', '◫', '◯', '◆', '◇'
]


class MemberStatus(enum.Enum):
    INVITED = "invited"  # User has been invited but hasn't accepted yet
    ACTIVE = "active"
    INACTIVE = "inactive"
    LEFT = "left"


class JournalVisibility(enum.Enum):
    PRIVATE = "private"  # Only owner can see their journal entries
    PUBLIC = "public"    # All party members can see journal entries


class CampaignMember(Base):
    """
    Links users to campaigns. Users can join campaigns without a character,
    and assign a character later. A user can have multiple characters in
    the same campaign.
    """
    __tablename__ = "campaign_members"
    __table_args__ = (
        Index("idx_campaign_members_campaign_id", "campaign_id"),
        Index("idx_campaign_members_user_id", "user_id"),
        Index("idx_campaign_members_character_id", "character_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Character is optional - user can join campaign without assigning a character yet
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="SET NULL"), nullable=True)
    
    # True if this user created the campaign
    is_creator = Column(Boolean, default=False, nullable=False)
    
    status = Column(Enum(MemberStatus), default=MemberStatus.ACTIVE, nullable=False)
    joined_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Journal visibility - controls whether party members can see this character's journal entries
    # Using String instead of Enum to avoid migration complexity with existing data
    journal_visibility = Column(String(20), default="private", nullable=False)
    
    # Unique symbol for this member within the campaign (e.g., ▣, ◆, ▲)
    # Randomly assigned from PARTY_SYMBOLS when joining, unique per campaign
    symbol = Column(String(4), nullable=True)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="members")
    user = relationship("User", back_populates="campaign_memberships")
    character = relationship("Character", back_populates="campaign_membership")

