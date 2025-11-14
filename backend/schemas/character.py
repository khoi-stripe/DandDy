from pydantic import BaseModel
from typing import List, Dict, Optional
from models.character import Alignment

class CharacterBase(BaseModel):
    name: str
    race: str
    character_class: str
    level: int = 1
    background: Optional[str] = None
    alignment: Optional[Alignment] = None
    experience_points: int = 0
    
    # Ability Scores
    strength: int
    dexterity: int
    constitution: int
    intelligence: int
    wisdom: int
    charisma: int
    
    # Combat Stats
    hit_points_max: int
    hit_points_current: int
    hit_points_temp: int = 0
    armor_class: int
    initiative: int = 0
    speed: int = 30
    
    # Death Saves
    death_save_successes: int = 0
    death_save_failures: int = 0
    
    # Proficiencies
    saving_throw_proficiencies: List[str] = []
    skill_proficiencies: List[str] = []
    skill_expertises: List[str] = []
    
    # Features
    racial_traits: List[Dict] = []
    class_features: List[Dict] = []
    feats: List[Dict] = []
    
    # Personality
    personality_traits: Optional[str] = None
    ideals: Optional[str] = None
    bonds: Optional[str] = None
    flaws: Optional[str] = None
    
    # Appearance
    appearance: Optional[str] = None
    backstory: Optional[str] = None
    
    # Inventory
    inventory: List[Dict] = []
    
    # Spellcasting
    spellcasting_ability: Optional[str] = None
    spell_save_dc: Optional[int] = None
    spell_attack_bonus: Optional[int] = None
    spell_slots: Dict[str, int] = {}
    spell_slots_used: Dict[str, int] = {}
    spells_known: List[Dict] = []
    spells_prepared: List[str] = []
    
    # Combat
    conditions: List[str] = []
    attacks: List[Dict] = []
    
    # Currency
    copper_pieces: int = 0
    silver_pieces: int = 0
    electrum_pieces: int = 0
    gold_pieces: int = 0
    platinum_pieces: int = 0

class CharacterCreate(CharacterBase):
    campaign_id: Optional[int] = None

class CharacterUpdate(BaseModel):
    name: Optional[str] = None
    level: Optional[int] = None
    experience_points: Optional[int] = None
    hit_points_current: Optional[int] = None
    hit_points_temp: Optional[int] = None
    death_save_successes: Optional[int] = None
    death_save_failures: Optional[int] = None
    conditions: Optional[List[str]] = None
    inventory: Optional[List[Dict]] = None
    spell_slots_used: Optional[Dict[str, int]] = None
    spells_prepared: Optional[List[str]] = None
    copper_pieces: Optional[int] = None
    silver_pieces: Optional[int] = None
    electrum_pieces: Optional[int] = None
    gold_pieces: Optional[int] = None
    platinum_pieces: Optional[int] = None
    campaign_id: Optional[int] = None

class CharacterResponse(CharacterBase):
    id: int
    owner_id: int
    campaign_id: Optional[int] = None
    
    class Config:
        from_attributes = True


