from sqlalchemy import Column, Integer, String, ForeignKey, Text, DateTime, Date, Index, JSON
from sqlalchemy.orm import relationship
from datetime import datetime, date
from database.database import Base


class JournalEntry(Base):
    """
    Free-form journal entries for character adventures.
    Can be standalone or linked to a campaign.
    """
    __tablename__ = "journal_entries"
    __table_args__ = (
        Index("idx_journal_entries_character_id", "character_id"),
        Index("idx_journal_entries_campaign_id", "campaign_id"),
        Index("idx_journal_entries_entry_date", "entry_date"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Entry content
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    entry_date = Column(Date, default=date.today, nullable=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Relationships
    character = relationship("Character", back_populates="journal_entries")
    campaign = relationship("Campaign", back_populates="journal_entries")
    user = relationship("User", back_populates="journal_entries")
    character_update = relationship("CharacterUpdate", back_populates="journal_entry", uselist=False, cascade="all, delete-orphan")


class CharacterUpdate(Base):
    """
    Character stat changes linked to a journal entry.
    Optional - journal entries can exist without updates.
    """
    __tablename__ = "character_updates"
    __table_args__ = (
        Index("idx_character_updates_journal_entry_id", "journal_entry_id"),
        Index("idx_character_updates_character_id", "character_id"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    journal_entry_id = Column(Integer, ForeignKey("journal_entries.id", ondelete="CASCADE"), nullable=False, unique=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)
    
    # Character changes
    xp_gained = Column(Integer, default=0, nullable=False)
    gold_change = Column(Integer, default=0, nullable=False)  # Can be negative
    hp_change = Column(Integer, default=0, nullable=False)  # Delta from previous
    
    # Items (stored as JSON arrays)
    items_acquired = Column(JSON, default=list, nullable=False)
    items_lost = Column(JSON, default=list, nullable=False)
    
    # Status conditions (persistent ones like exhaustion)
    conditions = Column(JSON, default=list, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    
    # Relationships
    journal_entry = relationship("JournalEntry", back_populates="character_update")
    character = relationship("Character", back_populates="character_updates")

