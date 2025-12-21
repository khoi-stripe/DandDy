from sqlalchemy import Column, Integer, ForeignKey, Boolean, DateTime, Enum, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database.database import Base


class MemberStatus(enum.Enum):
    INVITED = "invited"  # User has been invited but hasn't accepted yet
    ACTIVE = "active"
    INACTIVE = "inactive"
    LEFT = "left"


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
    
    # Relationships
    campaign = relationship("Campaign", back_populates="members")
    user = relationship("User", back_populates="campaign_memberships")
    character = relationship("Character", back_populates="campaign_membership")

