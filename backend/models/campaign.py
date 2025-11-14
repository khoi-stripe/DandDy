from sqlalchemy import Column, Integer, String, ForeignKey, Text
from sqlalchemy.orm import relationship
from database.database import Base

class Campaign(Base):
    __tablename__ = "campaigns"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    dm_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    
    # Relationships
    dm = relationship("User", back_populates="campaigns_owned")
    characters = relationship("Character", back_populates="campaign")


