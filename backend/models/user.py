from sqlalchemy import Column, Integer, String, Enum
from sqlalchemy.orm import relationship
import enum
from database.database import Base

class UserRole(enum.Enum):
    PLAYER = "player"
    DM = "dm"

class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True, nullable=False)
    username = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(Enum(UserRole), default=UserRole.PLAYER, nullable=False)
    
    # Relationships
    characters = relationship("Character", back_populates="owner")
    campaigns_owned = relationship("Campaign", back_populates="dm")


