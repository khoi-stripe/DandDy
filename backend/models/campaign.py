from sqlalchemy import Column, Integer, String, ForeignKey, Text, Enum, DateTime, Index
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
import secrets
import string
from database.database import Base


class CampaignStatus(enum.Enum):
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    ARCHIVED = "archived"


def generate_invite_code():
    """Generate a random invite code like 'DRAGON-7X2K'"""
    # Random word-like prefix (just use random letters for now)
    prefix = ''.join(secrets.choice(string.ascii_uppercase) for _ in range(5))
    suffix = ''.join(secrets.choice(string.ascii_uppercase + string.digits) for _ in range(4))
    return f"{prefix}-{suffix}"


class Campaign(Base):
    __tablename__ = "campaigns"
    __table_args__ = (
        Index("idx_campaigns_invite_code", "invite_code"),
        Index("idx_campaigns_dm_id", "dm_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    
    # Creator (was dm_id - keeping for backward compatibility, conceptually = created_by)
    # Note: dm_id is kept as alias, created_by is the new preferred name
    dm_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # New fields for campaign tracking
    invite_code = Column(String, unique=True, nullable=True, default=generate_invite_code)
    status = Column(Enum(CampaignStatus), default=CampaignStatus.ACTIVE, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Alias for clearer semantics (created_by = dm_id)
    @property
    def created_by(self):
        return self.dm_id
    
    # Relationships
    dm = relationship("User", back_populates="campaigns_owned")
    characters = relationship("Character", back_populates="campaign")
    members = relationship("CampaignMember", back_populates="campaign", cascade="all, delete-orphan")
    sessions = relationship("Session", back_populates="campaign", cascade="all, delete-orphan")


