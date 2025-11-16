from sqlalchemy import Column, Integer, String, ForeignKey, JSON, Enum
from sqlalchemy.orm import relationship
import enum
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

class Character(Base):
    __tablename__ = "characters"
    
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
    
    # Inventory (JSON array of items)
    inventory = Column(JSON, default=list, nullable=False)
    
    # Spellcasting
    spellcasting_ability = Column(String, nullable=True)  # "int", "wis", "cha"
    spell_save_dc = Column(Integer, nullable=True)
    spell_attack_bonus = Column(Integer, nullable=True)
    spell_slots = Column(JSON, default=dict, nullable=False)  # {"1": 4, "2": 3, "3": 2}
    spell_slots_used = Column(JSON, default=dict, nullable=False)  # {"1": 2, "2": 1, "3": 0}
    spells_known = Column(JSON, default=list, nullable=False)  # [{"name": "Fireball", "level": 3, ...}]
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
    
    # Relationships
    owner = relationship("User", back_populates="characters")
    campaign = relationship("Campaign", back_populates="characters")


