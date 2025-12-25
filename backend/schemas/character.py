from pydantic import BaseModel, field_validator, model_validator
from typing import List, Dict, Optional, Any
from models.character import Alignment, Sex
from datetime import datetime


# ============================================================================
# D&D 5e Validation Constants
# ============================================================================

# Standard D&D 5e conditions (PHB p.290-292)
VALID_DND_CONDITIONS = {
    "blinded",
    "charmed",
    "deafened",
    "exhaustion",  # Has levels 1-6
    "frightened",
    "grappled",
    "incapacitated",
    "invisible",
    "paralyzed",
    "petrified",
    "poisoned",
    "prone",
    "restrained",
    "stunned",
    "unconscious",
    # Custom/extended conditions
    "exhausted",
    "diseased",
    "cursed",
}

# D&D 5e standard ranges
MIN_ABILITY_SCORE = 1
MAX_ABILITY_SCORE = 30  # Monsters/epic can go to 30
MIN_LEVEL = 1
MAX_LEVEL = 20
MIN_AC = 1
MAX_AC = 30
MAX_DEATH_SAVES = 3

# Text field limits
MAX_NAME_LENGTH = 100
MAX_BACKSTORY_LENGTH = 50000
MAX_PERSONALITY_LENGTH = 5000


# ============================================================================
# Validation Helper Functions
# ============================================================================

def validate_ability_score(v: int, field_name: str) -> int:
    """Validate an ability score is within D&D 5e range."""
    if v < MIN_ABILITY_SCORE or v > MAX_ABILITY_SCORE:
        raise ValueError(f'{field_name} must be between {MIN_ABILITY_SCORE} and {MAX_ABILITY_SCORE}')
    return v


def validate_ability_score_optional(v: Optional[int], field_name: str) -> Optional[int]:
    """Validate an optional ability score."""
    if v is not None:
        return validate_ability_score(v, field_name)
    return v


def validate_conditions_list(conditions: List[str]) -> List[str]:
    """Validate a list of D&D conditions."""
    validated = []
    for condition in conditions:
        condition = condition.strip().lower()
        if not condition:
            continue
        
        # Handle exhaustion levels (e.g., "exhaustion:3")
        if ':' in condition:
            base_condition, level_str = condition.split(':', 1)
            base_condition = base_condition.strip()
            
            if base_condition in ('exhaustion', 'exhausted'):
                try:
                    level = int(level_str.strip())
                    if level < 1 or level > 6:
                        raise ValueError('Exhaustion level must be between 1 and 6')
                    validated.append(f'exhaustion:{level}')
                    continue
                except ValueError as e:
                    if 'Exhaustion level' in str(e):
                        raise
                    raise ValueError(f'Invalid exhaustion level: {level_str}')
            else:
                raise ValueError(f'Unknown condition format: {condition}')
        
        # Validate standard conditions
        if condition not in VALID_DND_CONDITIONS:
            valid_list = ', '.join(sorted(VALID_DND_CONDITIONS))
            raise ValueError(f'Invalid condition "{condition}". Valid conditions: {valid_list}')
        
        validated.append(condition)
    
    return validated


# ============================================================================
# Character Schemas
# ============================================================================

class CharacterBase(BaseModel):
    name: str
    race: str
    character_class: str
    level: int = 1
    background: Optional[str] = None
    alignment: Optional[Alignment] = None
    sex: Optional[Sex] = None
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
    # NOTE: hit_dice_current and class_resources planned but not yet migrated
    # hit_dice_current: Optional[int] = None
    # class_resources: Dict = {}
    
    # Death Saves
    death_save_successes: int = 0
    death_save_failures: int = 0
    
    # Proficiencies
    saving_throw_proficiencies: List[str] = []
    skill_proficiencies: List[str] = []
    skill_expertises: List[str] = []
    tool_proficiencies: List[str] = []
    languages: List[str] = []
    
    # Features
    racial_traits: List[Dict] = []
    class_features: List[Dict] = []
    feats: List[Dict] = []
    background_feature: Dict = {}
    
    # Personality
    personality_traits: Optional[str] = None
    ideals: Optional[str] = None
    bonds: Optional[str] = None
    flaws: Optional[str] = None
    
    # Appearance
    appearance: Optional[str] = None
    backstory: Optional[str] = None
    
    # Portrait Data
    ascii_portrait: Optional[str] = None
    original_portrait_url: Optional[str] = None
    custom_portrait_ascii: Optional[str] = None
    custom_portrait_count: int = 0
    portrait_metadata: Dict = {}
    
    # Inventory
    inventory: List[Dict] = []
    
    # Spellcasting
    spellcasting_ability: Optional[str] = None
    spell_save_dc: Optional[int] = None
    spell_attack_bonus: Optional[int] = None
    spell_slots: Dict[str, int] = {}
    spell_slots_used: Dict[str, int] = {}
    cantrips: List[str] = []
    spells_known: List[str] = []
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
    
    # Demo Mode
    is_demo: bool = False

    # --- Field Validators ---
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Character name cannot be empty')
        if len(v) > MAX_NAME_LENGTH:
            raise ValueError(f'Character name cannot exceed {MAX_NAME_LENGTH} characters')
        return v

    @field_validator('level')
    @classmethod
    def validate_level(cls, v: int) -> int:
        if v < MIN_LEVEL or v > MAX_LEVEL:
            raise ValueError(f'Level must be between {MIN_LEVEL} and {MAX_LEVEL}')
        return v

    @field_validator('experience_points')
    @classmethod
    def validate_xp(cls, v: int) -> int:
        if v < 0:
            raise ValueError('Experience points cannot be negative')
        return v

    @field_validator('strength')
    @classmethod
    def validate_str(cls, v: int) -> int:
        return validate_ability_score(v, 'Strength')

    @field_validator('dexterity')
    @classmethod
    def validate_dex(cls, v: int) -> int:
        return validate_ability_score(v, 'Dexterity')

    @field_validator('constitution')
    @classmethod
    def validate_con(cls, v: int) -> int:
        return validate_ability_score(v, 'Constitution')

    @field_validator('intelligence')
    @classmethod
    def validate_int(cls, v: int) -> int:
        return validate_ability_score(v, 'Intelligence')

    @field_validator('wisdom')
    @classmethod
    def validate_wis(cls, v: int) -> int:
        return validate_ability_score(v, 'Wisdom')

    @field_validator('charisma')
    @classmethod
    def validate_cha(cls, v: int) -> int:
        return validate_ability_score(v, 'Charisma')

    @field_validator('hit_points_max')
    @classmethod
    def validate_hp_max(cls, v: int) -> int:
        if v < 1:
            raise ValueError('Maximum HP must be at least 1')
        return v

    @field_validator('hit_points_current')
    @classmethod
    def validate_hp_current(cls, v: int) -> int:
        if v < 0:
            raise ValueError('Current HP cannot be negative')
        return v

    @field_validator('hit_points_temp')
    @classmethod
    def validate_hp_temp(cls, v: int) -> int:
        if v < 0:
            raise ValueError('Temporary HP cannot be negative')
        return v

    @field_validator('armor_class')
    @classmethod
    def validate_ac(cls, v: int) -> int:
        if v < MIN_AC or v > MAX_AC:
            raise ValueError(f'Armor class must be between {MIN_AC} and {MAX_AC}')
        return v

    @field_validator('speed')
    @classmethod
    def validate_speed(cls, v: int) -> int:
        if v < 0:
            raise ValueError('Speed cannot be negative')
        return v

    @field_validator('death_save_successes', 'death_save_failures')
    @classmethod
    def validate_death_saves(cls, v: int) -> int:
        if v < 0 or v > MAX_DEATH_SAVES:
            raise ValueError(f'Death saves must be between 0 and {MAX_DEATH_SAVES}')
        return v

    @field_validator('copper_pieces', 'silver_pieces', 'electrum_pieces', 'gold_pieces', 'platinum_pieces')
    @classmethod
    def validate_currency(cls, v: int) -> int:
        if v < 0:
            raise ValueError('Currency cannot be negative')
        return v

    @field_validator('conditions')
    @classmethod
    def validate_conditions(cls, v: List[str]) -> List[str]:
        return validate_conditions_list(v)

    @field_validator('backstory')
    @classmethod
    def validate_backstory(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_BACKSTORY_LENGTH:
            raise ValueError(f'Backstory cannot exceed {MAX_BACKSTORY_LENGTH} characters')
        return v

    @field_validator('personality_traits', 'ideals', 'bonds', 'flaws')
    @classmethod
    def validate_personality_fields(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_PERSONALITY_LENGTH:
            raise ValueError(f'Personality field cannot exceed {MAX_PERSONALITY_LENGTH} characters')
        return v

    # --- Cross-field Validation ---
    
    @model_validator(mode='after')
    def validate_hp_relationship(self) -> 'CharacterBase':
        """Ensure current HP doesn't exceed max HP."""
        if self.hit_points_current > self.hit_points_max:
            raise ValueError(
                f'Current HP ({self.hit_points_current}) cannot exceed max HP ({self.hit_points_max})'
            )
        return self

class CharacterCreate(CharacterBase):
    campaign_id: Optional[int] = None

class CharacterUpdate(BaseModel):
    """
    Schema for updating character fields.
    All fields are optional - only provided fields will be updated.
    Validation ensures D&D 5e rules are respected.
    """
    # Basic Info (editable from manager)
    name: Optional[str] = None
    level: Optional[int] = None
    experience_points: Optional[int] = None
    alignment: Optional[Alignment] = None
    sex: Optional[Sex] = None
    # Ability Scores (editable from manager)
    strength: Optional[int] = None
    dexterity: Optional[int] = None
    constitution: Optional[int] = None
    intelligence: Optional[int] = None
    wisdom: Optional[int] = None
    charisma: Optional[int] = None
    # Combat Stats (editable from manager)
    hit_points_max: Optional[int] = None
    hit_points_current: Optional[int] = None
    hit_points_temp: Optional[int] = None
    armor_class: Optional[int] = None
    initiative: Optional[int] = None
    speed: Optional[int] = None
    # hit_dice_current: Optional[int] = None  # Not yet migrated
    # class_resources: Optional[Dict] = None  # Not yet migrated
    death_save_successes: Optional[int] = None
    death_save_failures: Optional[int] = None
    conditions: Optional[List[str]] = None
    inventory: Optional[List[Dict]] = None
    spell_slots: Optional[Dict[str, int]] = None
    spell_slots_used: Optional[Dict[str, int]] = None
    cantrips: Optional[List[str]] = None
    spells_known: Optional[List[str]] = None
    spells_prepared: Optional[List[str]] = None
    # Proficiencies and languages (editable from manager)
    skill_proficiencies: Optional[List[str]] = None
    tool_proficiencies: Optional[List[str]] = None
    languages: Optional[List[str]] = None
    # Narrative fields
    backstory: Optional[str] = None
    copper_pieces: Optional[int] = None
    silver_pieces: Optional[int] = None
    electrum_pieces: Optional[int] = None
    gold_pieces: Optional[int] = None
    platinum_pieces: Optional[int] = None
    campaign_id: Optional[int] = None
    # Portrait fields
    ascii_portrait: Optional[str] = None
    original_portrait_url: Optional[str] = None
    custom_portrait_ascii: Optional[str] = None
    custom_portrait_count: Optional[int] = None
    portrait_metadata: Optional[Dict] = None
    
    # Demo Mode (admin only)
    is_demo: Optional[bool] = None

    # --- Field Validators (all handle Optional) ---
    
    @field_validator('name')
    @classmethod
    def validate_name(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Character name cannot be empty')
            if len(v) > MAX_NAME_LENGTH:
                raise ValueError(f'Character name cannot exceed {MAX_NAME_LENGTH} characters')
        return v

    @field_validator('level')
    @classmethod
    def validate_level(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < MIN_LEVEL or v > MAX_LEVEL):
            raise ValueError(f'Level must be between {MIN_LEVEL} and {MAX_LEVEL}')
        return v

    @field_validator('experience_points')
    @classmethod
    def validate_xp(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Experience points cannot be negative')
        return v

    @field_validator('strength')
    @classmethod
    def validate_str(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Strength')

    @field_validator('dexterity')
    @classmethod
    def validate_dex(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Dexterity')

    @field_validator('constitution')
    @classmethod
    def validate_con(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Constitution')

    @field_validator('intelligence')
    @classmethod
    def validate_int(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Intelligence')

    @field_validator('wisdom')
    @classmethod
    def validate_wis(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Wisdom')

    @field_validator('charisma')
    @classmethod
    def validate_cha(cls, v: Optional[int]) -> Optional[int]:
        return validate_ability_score_optional(v, 'Charisma')

    @field_validator('hit_points_max')
    @classmethod
    def validate_hp_max(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 1:
            raise ValueError('Maximum HP must be at least 1')
        return v

    @field_validator('hit_points_current')
    @classmethod
    def validate_hp_current(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Current HP cannot be negative')
        return v

    @field_validator('hit_points_temp')
    @classmethod
    def validate_hp_temp(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Temporary HP cannot be negative')
        return v

    @field_validator('armor_class')
    @classmethod
    def validate_ac(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < MIN_AC or v > MAX_AC):
            raise ValueError(f'Armor class must be between {MIN_AC} and {MAX_AC}')
        return v

    @field_validator('speed')
    @classmethod
    def validate_speed(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Speed cannot be negative')
        return v

    @field_validator('death_save_successes', 'death_save_failures')
    @classmethod
    def validate_death_saves(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and (v < 0 or v > MAX_DEATH_SAVES):
            raise ValueError(f'Death saves must be between 0 and {MAX_DEATH_SAVES}')
        return v

    @field_validator('copper_pieces', 'silver_pieces', 'electrum_pieces', 'gold_pieces', 'platinum_pieces')
    @classmethod
    def validate_currency(cls, v: Optional[int]) -> Optional[int]:
        if v is not None and v < 0:
            raise ValueError('Currency cannot be negative')
        return v

    @field_validator('conditions')
    @classmethod
    def validate_conditions(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is not None:
            return validate_conditions_list(v)
        return v

    @field_validator('backstory')
    @classmethod
    def validate_backstory(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_BACKSTORY_LENGTH:
            raise ValueError(f'Backstory cannot exceed {MAX_BACKSTORY_LENGTH} characters')
        return v

class CharacterResponse(CharacterBase):
    id: int
    owner_id: int
    campaign_id: Optional[int] = None
    campaign_name: Optional[str] = None  # Name of campaign (if in one)
    created_at: datetime
    updated_at: datetime
    
    # Sharing info (optional, populated by routes when relevant)
    is_shared: Optional[bool] = None  # True if user is a collaborator (not owner)
    owner_email: Optional[str] = None  # Email of owner (for shared characters)
    permission: Optional[str] = None  # "edit" or "view" (for shared characters)
    collaborator_count: Optional[int] = None  # Number of people this character is shared with (for owners)
    last_updated_by_email: Optional[str] = None  # Email of user who last updated (for shared characters)
    
    class Config:
        from_attributes = True


class CharacterLiteResponse(BaseModel):
    """
    Lightweight character response for list views.
    
    Excludes heavy fields like ascii_portrait and custom_portrait_ascii
    to reduce database egress. Use this for character grids/lists where
    you only need basic info + portrait URL.
    
    Saves ~24KB per character in API responses.
    """
    id: int
    owner_id: int
    campaign_id: Optional[int] = None
    campaign_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    # Basic Info (for card display)
    name: str
    race: str
    character_class: str
    level: int
    background: Optional[str] = None
    
    # Portrait (URL only, no ASCII text)
    original_portrait_url: Optional[str] = None
    custom_portrait_count: int = 0
    portrait_metadata: Dict = {}
    
    # Demo Mode
    is_demo: bool = False
    
    # Sharing info
    is_shared: Optional[bool] = None
    owner_email: Optional[str] = None
    permission: Optional[str] = None
    collaborator_count: Optional[int] = None
    last_updated_by_email: Optional[str] = None
    
    class Config:
        from_attributes = True


