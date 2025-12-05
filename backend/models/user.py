from sqlalchemy import Column, Integer, String, Enum
from sqlalchemy.orm import relationship
import enum
from database.database import Base

class UserRole(enum.Enum):
    PLAYER = "player"
    DM = "dm"
    ADMIN = "admin"  # Can publish global prompt styles


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

    # Relationships
    characters = relationship("Character", back_populates="owner")
    campaigns_owned = relationship("Campaign", back_populates="dm")
    prompt_entries = relationship("PromptEntry", back_populates="owner")


