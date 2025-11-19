from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database.database import get_db
from models.user import User, UserRole
from models.character import Character
from schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse
from utils.auth import get_current_active_user

router = APIRouter(prefix="/characters", tags=["characters"])

@router.post("/", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
def create_character(
    character_data: CharacterCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    new_character = Character(
        owner_id=current_user.id,
        **character_data.model_dump()
    )
    
    db.add(new_character)
    db.commit()
    db.refresh(new_character)
    
    return new_character

@router.get("/", response_model=List[CharacterResponse])
def get_characters(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Players see only their characters
    characters = db.query(Character).filter(Character.owner_id == current_user.id).all()
    return characters

@router.get("/{character_id}", response_model=CharacterResponse)
def get_character(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Check access: owner can always access, DM can access if in their campaign
    if character.owner_id != current_user.id:
        if current_user.role != UserRole.DM or not character.campaign_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this character"
            )
        # Verify DM owns the campaign
        if character.campaign.dm_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this character"
            )
    
    return character

@router.put("/{character_id}", response_model=CharacterResponse)
def update_character(
    character_id: int,
    character_update: CharacterUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can update their character
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this character"
        )
    
    # Update only provided fields
    update_data = character_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(character, field, value)
    
    db.commit()
    db.refresh(character)
    
    return character

@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can delete their character
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this character"
        )
    
    db.delete(character)
    db.commit()
    
    return None

@router.post("/{character_id}/duplicate", response_model=CharacterResponse)
def duplicate_character(
    character_id: int,
    new_name: str = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Get original character
    original = db.query(Character).filter(Character.id == character_id).first()
    
    if not original:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can duplicate their character
    if original.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to duplicate this character"
        )
    
    # Create duplicate
    duplicate_data = {
        'owner_id': current_user.id,
        'name': new_name or f"{original.name} (Copy)",
        'race': original.race,
        'character_class': original.character_class,
        'level': original.level,
        'background': original.background,
        'alignment': original.alignment,
        'experience_points': original.experience_points,
        'strength': original.strength,
        'dexterity': original.dexterity,
        'constitution': original.constitution,
        'intelligence': original.intelligence,
        'wisdom': original.wisdom,
        'charisma': original.charisma,
        'hit_points_max': original.hit_points_max,
        'hit_points_current': original.hit_points_max,  # Full HP for duplicate
        'hit_points_temp': 0,
        'armor_class': original.armor_class,
        'initiative': original.initiative,
        'speed': original.speed,
        'death_save_successes': 0,
        'death_save_failures': 0,
        'saving_throw_proficiencies': original.saving_throw_proficiencies,
        'skill_proficiencies': original.skill_proficiencies,
        'skill_expertises': original.skill_expertises,
        'tool_proficiencies': original.tool_proficiencies,
        'languages': original.languages,
        'racial_traits': original.racial_traits,
        'class_features': original.class_features,
        'feats': original.feats,
        'background_feature': original.background_feature,
        'personality_traits': original.personality_traits,
        'ideals': original.ideals,
        'bonds': original.bonds,
        'flaws': original.flaws,
        'appearance': original.appearance,
        'backstory': original.backstory,
        'inventory': original.inventory,
        'spellcasting_ability': original.spellcasting_ability,
        'spell_save_dc': original.spell_save_dc,
        'spell_attack_bonus': original.spell_attack_bonus,
        'spell_slots': original.spell_slots,
        'spell_slots_used': {},
        'spells_known': original.spells_known,
        'spells_prepared': original.spells_prepared,
        'conditions': [],
        'attacks': original.attacks,
        'copper_pieces': original.copper_pieces,
        'silver_pieces': original.silver_pieces,
        'electrum_pieces': original.electrum_pieces,
        'gold_pieces': original.gold_pieces,
        'platinum_pieces': original.platinum_pieces,
        'campaign_id': None  # Don't copy campaign assignment
    }
    
    duplicate = Character(**duplicate_data)
    db.add(duplicate)
    db.commit()
    db.refresh(duplicate)
    
    return duplicate

@router.get("/{character_id}/export")
def export_character(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can export their character
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to export this character"
        )
    
    # Return character data as JSON
    from schemas.character import CharacterResponse
    return CharacterResponse.from_orm(character)

@router.post("/import", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
def import_character(
    character_data: CharacterCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Create character from imported data
    new_character = Character(
        owner_id=current_user.id,
        **character_data.model_dump()
    )
    
    db.add(new_character)
    db.commit()
    db.refresh(new_character)
    
    return new_character


