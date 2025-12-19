from sqlalchemy import Column, Integer, ForeignKey, Enum, DateTime, Index, UniqueConstraint
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from database.database import Base


class CollaboratorPermission(enum.Enum):
    VIEW = "view"
    EDIT = "edit"


class CharacterCollaborator(Base):
    """
    Tracks shared access to characters.
    
    When a user accepts a character share, they become a collaborator
    with access to view/edit the original character (not a copy).
    The owner retains full control and can remove collaborators.
    """
    __tablename__ = "character_collaborators"
    __table_args__ = (
        # Ensure a user can only be a collaborator once per character
        UniqueConstraint("character_id", "user_id", name="uq_character_collaborator"),
        # Index for finding all characters a user has access to
        Index("idx_collaborators_user_id", "user_id"),
        # Index for finding all collaborators of a character
        Index("idx_collaborators_character_id", "character_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    permission = Column(Enum(CollaboratorPermission), default=CollaboratorPermission.EDIT, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    character = relationship("Character", back_populates="collaborators")
    user = relationship("User", back_populates="shared_characters")

