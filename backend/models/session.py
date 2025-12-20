from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, Enum, Index, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from database.database import Base


class SessionStatus(enum.Enum):
    ACTIVE = "active"        # Currently in progress
    COMPLETED = "completed"  # Finished normally
    CANCELLED = "cancelled"  # Ended without completing


class Session(Base):
    """
    Represents a play session for a character. Sessions are per-character
    and self-directed (each player manages their own session state).
    """
    __tablename__ = "sessions"
    __table_args__ = (
        Index("idx_sessions_campaign_id", "campaign_id"),
        Index("idx_sessions_character_id", "character_id"),
        Index("idx_sessions_user_id", "user_id"),
        Index("idx_sessions_started_at", "started_at"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    
    # Campaign is optional - allows standalone session tracking for one-shots
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Session info
    session_number = Column(Integer, nullable=False)  # Auto-increment per character
    name = Column(String, nullable=True)  # Optional label, e.g., "The Amber Temple"
    
    # Timing
    started_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    ended_at = Column(DateTime, nullable=True)  # Null while session is active
    
    status = Column(Enum(SessionStatus), default=SessionStatus.ACTIVE, nullable=False)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="sessions")
    character = relationship("Character", back_populates="sessions")
    user = relationship("User", back_populates="sessions")
    log = relationship("SessionLog", back_populates="session", uselist=False, cascade="all, delete-orphan")


class SessionLog(Base):
    """
    Post-session character updates. Created when a session ends and the
    player fills out the check-in form.
    """
    __tablename__ = "session_logs"
    __table_args__ = (
        Index("idx_session_logs_session_id", "session_id"),
        Index("idx_session_logs_character_id", "character_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False, unique=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Character changes
    xp_gained = Column(Integer, default=0, nullable=False)
    gold_change = Column(Integer, default=0, nullable=False)  # Can be negative
    
    # HP snapshot
    hp_before = Column(Integer, nullable=True)
    hp_after = Column(Integer, nullable=True)
    
    # Items (stored as JSON arrays)
    items_acquired = Column(JSON, default=list, nullable=False)
    items_lost = Column(JSON, default=list, nullable=False)
    
    # Status conditions at end of session (persistent ones like exhaustion)
    conditions = Column(JSON, default=list, nullable=False)
    
    # Journal entry
    journal = Column(Text, nullable=True)
    
    submitted_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    session = relationship("Session", back_populates="log")
    character = relationship("Character", back_populates="session_logs")
    user = relationship("User", back_populates="session_logs")

