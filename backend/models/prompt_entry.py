from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Index, Enum
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from database.database import Base


class EntryKind(enum.Enum):
    RACE = "race"
    CLASS = "class"
    POSE = "pose"
    CAMERA = "camera"
    SCENE = "scene"
    STYLE = "style"


class PromptEntry(Base):
    """
    User-defined portrait prompt entries (race descriptions, poses, camera angles, etc.)
    that sync across devices for authenticated users.
    """
    __tablename__ = "prompt_entries"
    __table_args__ = (
        Index("idx_prompt_entries_owner_id", "owner_id"),
        Index("idx_prompt_entries_kind", "kind"),
        Index("idx_prompt_entries_key", "key"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Entry type and key (e.g., kind="race", key="elf")
    kind = Column(Enum(EntryKind), nullable=False)
    key = Column(String, nullable=False)  # e.g., "elf", "fighter", "dramatic"

    # Description text used in prompts
    description = Column(String, nullable=False)

    # Optional style-specific description (for style entries)
    style_description = Column(String, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    # Relationships
    owner = relationship("User", back_populates="prompt_entries")

