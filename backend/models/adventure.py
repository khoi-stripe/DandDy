from __future__ import annotations

from datetime import datetime

from sqlalchemy import Column, DateTime, ForeignKey, Index, Integer, Text
from sqlalchemy.orm import relationship

from database.database import Base


class AdventureRun(Base):
    __tablename__ = "adventure_runs"
    __table_args__ = (
        Index("idx_adventure_runs_owner_id", "owner_id"),
        Index("idx_adventure_runs_campaign_id", "campaign_id"),
        Index("idx_adventure_runs_character_id", "character_id"),
        Index("idx_adventure_runs_updated_at", "updated_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True)
    character_id = Column(Integer, ForeignKey("characters.id", ondelete="CASCADE"), nullable=False)

    seed = Column(Text, nullable=False)
    # Portable JSON storage (SQLite + Postgres). We validate/shape it in code.
    state_json = Column(Text, nullable=False, default="{}")

    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)

    owner = relationship("User")
    campaign = relationship("Campaign")
    character = relationship("Character")
    turns = relationship("AdventureTurn", back_populates="adventure", cascade="all, delete-orphan")


class AdventureTurn(Base):
    __tablename__ = "adventure_turns"
    __table_args__ = (
        Index("idx_adventure_turns_adventure_id", "adventure_id"),
        Index("idx_adventure_turns_created_at", "created_at"),
    )

    id = Column(Integer, primary_key=True, index=True)
    adventure_id = Column(Integer, ForeignKey("adventure_runs.id", ondelete="CASCADE"), nullable=False)
    turn_index = Column(Integer, nullable=False)
    player_action = Column(Text, nullable=False)
    dm_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    adventure = relationship("AdventureRun", back_populates="turns")


