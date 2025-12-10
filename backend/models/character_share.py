from sqlalchemy import Column, Integer, String, ForeignKey, Enum, DateTime, Index
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from database.database import Base


class ShareStatus(enum.Enum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DISMISSED = "dismissed"


class CharacterShare(Base):
    """
    Tracks character sharing between users.
    
    When a user shares a character with an email address, a pending share is created.
    When the recipient logs in, they can accept (copies the character) or dismiss
    (ignores forever) the share.
    """
    __tablename__ = "character_shares"
    __table_args__ = (
        # Index for looking up pending shares by recipient email
        Index("idx_character_shares_to_email", "to_email"),
        # Index for looking up shares by status
        Index("idx_character_shares_status", "status"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    from_user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    to_email = Column(String, nullable=False)  # Stored lowercase for case-insensitive matching
    status = Column(Enum(ShareStatus), default=ShareStatus.PENDING, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    character = relationship("Character", foreign_keys=[character_id])
    from_user = relationship("User", foreign_keys=[from_user_id])

