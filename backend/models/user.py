from sqlalchemy import Column, Integer, String, Enum, Text
from sqlalchemy.orm import relationship
import enum
from database.database import Base

class UserRole(enum.Enum):
    PLAYER = "PLAYER"
    DM = "DM"
    ADMIN = "ADMIN"  # Can publish global prompt styles


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    # Email is a unique identifier for accounts (used for login)
    email = Column(String, unique=True, index=True, nullable=False)
    # Username is required and unique - displayed in UI and used for invitations
    # Rules: 3-30 chars, alphanumeric + underscore only
    username = Column(String(30), unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.PLAYER, nullable=False)
    # Pinned character IDs stored as JSON array string, e.g. '["1", "5", "3"]'
    # Order in array = pin order (first pinned appears first)
    pinned_character_ids = Column(Text, nullable=True, default="[]")
    # User preferences stored as JSON string
    # Contains: colorTheme, narratorId, textSpeedMultiplier, imageModel, 
    # imageQuality, portraitViewMode, portraitPromptTheme, showDescriptions
    preferences = Column(Text, nullable=True, default="{}")

    # Relationships
    characters = relationship("Character", back_populates="owner", foreign_keys="[Character.owner_id]")
    campaigns_owned = relationship("Campaign", back_populates="dm")
    prompt_entries = relationship("PromptEntry", back_populates="owner")
    shared_characters = relationship("CharacterCollaborator", back_populates="user")
    
    # Campaign tracking relationships
    campaign_memberships = relationship("CampaignMember", back_populates="user", foreign_keys="[CampaignMember.user_id]")
    sessions = relationship("Session", back_populates="user")
    session_logs = relationship("SessionLog", back_populates="user")
    journal_entries = relationship("JournalEntry", back_populates="user")


