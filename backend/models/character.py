from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Enum, DateTime, Index, Boolean
from sqlalchemy.orm import relationship
import enum
from datetime import datetime
from database.database import Base

class Alignment(enum.Enum):
    LAWFUL_GOOD = "lawful_good"
    NEUTRAL_GOOD = "neutral_good"
    CHAOTIC_GOOD = "chaotic_good"
    LAWFUL_NEUTRAL = "lawful_neutral"
    TRUE_NEUTRAL = "true_neutral"
    CHAOTIC_NEUTRAL = "chaotic_neutral"
    LAWFUL_EVIL = "lawful_evil"
    NEUTRAL_EVIL = "neutral_evil"
    CHAOTIC_EVIL = "chaotic_evil"

class Sex(enum.Enum):
    MALE = "male"
    FEMALE = "female"

class Character(Base):
    __tablename__ = "characters"
    __table_args__ = (
        # Indexes to speed up common queries:
        # - owner_id: listing a user's characters
        # - campaign_id: loading characters in a campaign
        # - updated_at: sorting/filtering by last modified
        Index("idx_characters_owner_id", "owner_id"),
        Index("idx_characters_campaign_id", "campaign_id"),
        Index("idx_characters_updated_at", "updated_at"),
    )
    
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    campaign_id = Column(Integer, ForeignKey("campaigns.id"), nullable=True)
    
    # Basic Info
    name = Column(String, nullable=False)
    race = Column(String, nullable=False)
    character_class = Column(String, nullable=False)
    level = Column(Integer, default=1, nullable=False)
    background = Column(String, nullable=True)
    alignment = Column(Enum(Alignment), nullable=True)
    sex = Column(Enum(Sex), nullable=True)
    experience_points = Column(Integer, default=0, nullable=False)
    
    # Ability Scores
    strength = Column(Integer, nullable=False)
    dexterity = Column(Integer, nullable=False)
    constitution = Column(Integer, nullable=False)
    intelligence = Column(Integer, nullable=False)
    wisdom = Column(Integer, nullable=False)
    charisma = Column(Integer, nullable=False)
    
    # Combat Stats
    hit_points_max = Column(Integer, nullable=False)
    hit_points_current = Column(Integer, nullable=False)
    hit_points_temp = Column(Integer, default=0, nullable=False)
    armor_class = Column(Integer, nullable=False)
    initiative = Column(Integer, default=0, nullable=False)
    speed = Column(Integer, default=30, nullable=False)
    
    # NOTE: hit_dice_current and class_resources columns planned but not yet migrated.
    # Uncomment when database migration completes:
    # hit_dice_current = Column(Integer, nullable=True)  # None means full (equals level)
    # class_resources = Column(JSON, default=dict, nullable=False)  # Ki, Rage, etc.

    # Death Saves
    death_save_successes = Column(Integer, default=0, nullable=False)
    death_save_failures = Column(Integer, default=0, nullable=False)
    
    # Proficiencies (stored as JSON arrays)
    saving_throw_proficiencies = Column(JSON, default=list, nullable=False)  # ["str", "con"]
    skill_proficiencies = Column(JSON, default=list, nullable=False)  # ["athletics", "perception"]
    skill_expertises = Column(JSON, default=list, nullable=False)  # ["stealth"]
    tool_proficiencies = Column(JSON, default=list, nullable=False)  # ["thieves-tools", "gaming-set"]
    languages = Column(JSON, default=list, nullable=False)  # ["Common", "Elvish", "Dwarvish"]
    
    # Features and Traits
    racial_traits = Column(JSON, default=list, nullable=False)
    class_features = Column(JSON, default=list, nullable=False)
    feats = Column(JSON, default=list, nullable=False)
    background_feature = Column(JSON, default=dict, nullable=False)  # {"name": "...", "description": "..."}
    
    # Personality
    personality_traits = Column(String, nullable=True)
    ideals = Column(String, nullable=True)
    bonds = Column(String, nullable=True)
    flaws = Column(String, nullable=True)
    
    # Appearance
    appearance = Column(String, nullable=True)
    backstory = Column(String, nullable=True)
    
    # Portrait Data
    ascii_portrait = Column(String, nullable=True)  # ASCII art portrait (text)
    original_portrait_url = Column(String, nullable=True)  # URL to generated image
    custom_portrait_ascii = Column(String, nullable=True)  # Custom AI-generated ASCII
    custom_portrait_count = Column(Integer, default=0, nullable=False)  # Number of custom portraits generated
    portrait_metadata = Column(JSON, default=dict, nullable=False)  # Additional portrait info (key, source, etc)
    
    # Inventory (JSON array of items)
    inventory = Column(JSON, default=list, nullable=False)
    
    # Spellcasting
    spellcasting_ability = Column(String, nullable=True)  # "int", "wis", "cha"
    spell_save_dc = Column(Integer, nullable=True)
    spell_attack_bonus = Column(Integer, nullable=True)
    spell_slots = Column(JSON, default=dict, nullable=False)  # {"1": 4, "2": 3, "3": 2}
    spell_slots_used = Column(JSON, default=dict, nullable=False)  # {"1": 2, "2": 1, "3": 0}
    cantrips = Column(JSON, default=list, nullable=False)  # ["Fire Bolt", "Mage Hand", ...]
    spells_known = Column(JSON, default=list, nullable=False)  # ["Fireball", "Shield", ...]
    spells_prepared = Column(JSON, default=list, nullable=False)  # ["Fireball", "Shield", ...]
    
    # Combat Conditions
    conditions = Column(JSON, default=list, nullable=False)  # ["prone", "blinded"]
    
    # Attacks and Actions
    attacks = Column(JSON, default=list, nullable=False)  # [{"name": "Longsword", "bonus": 5, "damage": "1d8+3"}]
    
    # Currency
    copper_pieces = Column(Integer, default=0, nullable=False)
    silver_pieces = Column(Integer, default=0, nullable=False)
    electrum_pieces = Column(Integer, default=0, nullable=False)
    gold_pieces = Column(Integer, default=0, nullable=False)
    platinum_pieces = Column(Integer, default=0, nullable=False)

    # Demo Mode
    is_demo = Column(Boolean, default=False, nullable=False)  # If true, shown in demo mode to non-logged-in users

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    
    # Track who last updated (for shared characters)
    last_updated_by_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    
    # Relationships
    owner = relationship("User", back_populates="characters", foreign_keys=[owner_id])
    last_updated_by = relationship("User", foreign_keys=[last_updated_by_id])
    campaign = relationship("Campaign", back_populates="characters")
    collaborators = relationship("CharacterCollaborator", back_populates="character", cascade="all, delete-orphan")
    
    # Campaign tracking relationships
    campaign_membership = relationship("CampaignMember", back_populates="character", uselist=False)
    sessions = relationship("Session", back_populates="character", cascade="all, delete-orphan")
    session_logs = relationship("SessionLog", back_populates="character", cascade="all, delete-orphan")
    
    # Journal relationships
    journal_entries = relationship("JournalEntry", back_populates="character", cascade="all, delete-orphan")
    character_updates = relationship("CharacterUpdate", back_populates="character", cascade="all, delete-orphan")


