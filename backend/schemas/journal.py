from pydantic import BaseModel, field_validator, model_validator
from typing import Optional, List
from datetime import date, datetime


# ============================================================================
# D&D 5e Validation Constants
# ============================================================================

# Standard D&D 5e conditions (PHB p.290-292)
VALID_DND_CONDITIONS = {
    "blinded",
    "charmed",
    "deafened",
    "exhaustion",  # Has levels 1-6, validated separately
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
    # Custom/extended conditions used in this app
    "exhausted",  # Alternative name for exhaustion
    "diseased",
    "cursed",
}

# Reasonable limits for single-session changes
MAX_XP_GAIN_PER_ENTRY = 100000  # Even a CR 30 creature is ~155k XP split among party
MAX_GOLD_CHANGE_PER_ENTRY = 1000000  # 1 million GP - for legendary treasure hoards
MAX_HP_CHANGE_PER_ENTRY = 500  # Even high-level characters rarely exceed this max HP

# Title and content limits
MAX_TITLE_LENGTH = 200
MAX_CONTENT_LENGTH = 50000  # ~10k words
MAX_ITEM_NAME_LENGTH = 200
MAX_ITEMS_PER_UPDATE = 50


# ============================================================================
# Journal Entry Schemas
# ============================================================================

class JournalEntryCreate(BaseModel):
    """Create a new journal entry"""
    character_id: int
    campaign_id: Optional[int] = None
    title: str
    content: Optional[str] = None
    entry_date: Optional[date] = None  # Defaults to today if not provided

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError('Title cannot be empty')
        if len(v) > MAX_TITLE_LENGTH:
            raise ValueError(f'Title cannot exceed {MAX_TITLE_LENGTH} characters')
        return v

    @field_validator('content')
    @classmethod
    def validate_content(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_CONTENT_LENGTH:
            raise ValueError(f'Content cannot exceed {MAX_CONTENT_LENGTH} characters')
        return v


class JournalEntryUpdate(BaseModel):
    """Update an existing journal entry"""
    title: Optional[str] = None
    content: Optional[str] = None
    entry_date: Optional[date] = None

    @field_validator('title')
    @classmethod
    def validate_title(cls, v: Optional[str]) -> Optional[str]:
        if v is not None:
            v = v.strip()
            if not v:
                raise ValueError('Title cannot be empty')
            if len(v) > MAX_TITLE_LENGTH:
                raise ValueError(f'Title cannot exceed {MAX_TITLE_LENGTH} characters')
        return v

    @field_validator('content')
    @classmethod
    def validate_content(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) > MAX_CONTENT_LENGTH:
            raise ValueError(f'Content cannot exceed {MAX_CONTENT_LENGTH} characters')
        return v


class CharacterUpdateCreate(BaseModel):
    """Create character stat updates for a journal entry"""
    xp_gained: int = 0
    gold_change: int = 0  # Can be negative
    hp_change: int = 0  # Delta (e.g., -5 for damage taken)
    items_acquired: List[str] = []
    items_lost: List[str] = []
    conditions: List[str] = []  # e.g., ["exhaustion:2", "poisoned"]

    @field_validator('xp_gained')
    @classmethod
    def validate_xp_gained(cls, v: int) -> int:
        if v < 0:
            raise ValueError('XP gained cannot be negative (characters cannot lose XP in D&D 5e)')
        if v > MAX_XP_GAIN_PER_ENTRY:
            raise ValueError(f'XP gained cannot exceed {MAX_XP_GAIN_PER_ENTRY:,} per journal entry')
        return v

    @field_validator('gold_change')
    @classmethod
    def validate_gold_change(cls, v: int) -> int:
        if abs(v) > MAX_GOLD_CHANGE_PER_ENTRY:
            raise ValueError(f'Gold change cannot exceed ±{MAX_GOLD_CHANGE_PER_ENTRY:,} per journal entry')
        return v

    @field_validator('hp_change')
    @classmethod
    def validate_hp_change(cls, v: int) -> int:
        if abs(v) > MAX_HP_CHANGE_PER_ENTRY:
            raise ValueError(f'HP change cannot exceed ±{MAX_HP_CHANGE_PER_ENTRY} per journal entry')
        return v

    @field_validator('items_acquired', 'items_lost')
    @classmethod
    def validate_items(cls, v: List[str]) -> List[str]:
        if len(v) > MAX_ITEMS_PER_UPDATE:
            raise ValueError(f'Cannot add more than {MAX_ITEMS_PER_UPDATE} items per update')
        validated = []
        for item in v:
            item = item.strip()
            if not item:
                continue  # Skip empty items
            if len(item) > MAX_ITEM_NAME_LENGTH:
                raise ValueError(f'Item name cannot exceed {MAX_ITEM_NAME_LENGTH} characters')
            validated.append(item)
        return validated

    @field_validator('conditions')
    @classmethod
    def validate_conditions(cls, v: List[str]) -> List[str]:
        validated = []
        for condition in v:
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


class CharacterUpdateResponse(BaseModel):
    id: int
    journal_entry_id: int
    character_id: int
    xp_gained: int
    gold_change: int
    hp_change: int
    items_acquired: List[str]
    items_lost: List[str]
    conditions: List[str]
    created_at: datetime
    
    class Config:
        from_attributes = True


class JournalEntryResponse(BaseModel):
    id: int
    character_id: int
    campaign_id: Optional[int]
    user_id: int
    title: str
    content: Optional[str]
    entry_date: date
    created_at: datetime
    updated_at: datetime
    character_update: Optional[CharacterUpdateResponse] = None
    # Optional fields for party view (populated when viewing campaign-wide entries)
    character_name: Optional[str] = None
    character_symbol: Optional[str] = None  # Party member symbol (e.g., ▣, ◆, ▲)
    user_email: Optional[str] = None
    
    class Config:
        from_attributes = True


class JournalEntryWithUpdate(JournalEntryCreate):
    """Create journal entry with optional character update in one call"""
    character_update: Optional[CharacterUpdateCreate] = None

