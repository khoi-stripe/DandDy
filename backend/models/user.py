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
    # Email is now the single unique identifier for accounts
    email = Column(String, unique=True, index=True, nullable=False)
    # Username is deprecated – kept nullable for backward-compatibility with
    # existing databases, but no longer used for login or registration.
    username = Column(String, nullable=True)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.PLAYER, nullable=False)
    # Pinned character IDs stored as JSON array string, e.g. '["1", "5", "3"]'
    # Order in array = pin order (first pinned appears first)
    pinned_character_ids = Column(Text, nullable=True, default="[]")

    # Relationships
    characters = relationship("Character", back_populates="owner", foreign_keys="[Character.owner_id]")
    campaigns_owned = relationship("Campaign", back_populates="dm")
    prompt_entries = relationship("PromptEntry", back_populates="owner")
    shared_characters = relationship("CharacterCollaborator", back_populates="user")
    
    # Campaign tracking relationships
    campaign_memberships = relationship("CampaignMember", back_populates="user")
    sessions = relationship("Session", back_populates="user")
    session_logs = relationship("SessionLog", back_populates="user")


