from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database.database import get_db
from models.user import User
from models.character import Character
from models.character_share import CharacterShare, ShareStatus
from schemas.character_share import (
    CharacterShareCreate,
    CharacterShareResponse,
    PendingShareResponse,
    CharacterPreview,
)
from utils.auth import get_current_active_user

router = APIRouter(prefix="/shares", tags=["shares"])


@router.post("/character/{character_id}", response_model=CharacterShareResponse, status_code=status.HTTP_201_CREATED)
def share_character(
    character_id: int,
    share_data: CharacterShareCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Share a character with another user by email.
    
    The recipient will see a pending share notification when they next log in.
    They can choose to accept (copies the character) or dismiss (ignores forever).
    """
    # Verify the character exists and belongs to current user
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only share your own characters"
        )
    
    # Prevent sharing with yourself
    recipient_email = share_data.to_email.lower()
    if recipient_email == current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot share a character with yourself"
        )
    
    # Check if there's already a pending share for this character to this email
    existing_share = db.query(CharacterShare).filter(
        CharacterShare.character_id == character_id,
        CharacterShare.to_email == recipient_email,
        CharacterShare.status == ShareStatus.PENDING
    ).first()
    
    if existing_share:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A pending share already exists for this character and email"
        )
    
    # Create the share record
    new_share = CharacterShare(
        character_id=character_id,
        from_user_id=current_user.id,
        to_email=recipient_email,
        status=ShareStatus.PENDING
    )
    
    db.add(new_share)
    db.commit()
    db.refresh(new_share)
    
    return new_share


@router.get("/pending", response_model=List[PendingShareResponse])
def get_pending_shares(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all pending character shares for the current user.
    
    Matches shares by the user's email address (case-insensitive).
    Returns character preview info and sender email for display.
    """
    pending_shares = db.query(CharacterShare).filter(
        CharacterShare.to_email == current_user.email.lower(),
        CharacterShare.status == ShareStatus.PENDING
    ).all()
    
    result = []
    for share in pending_shares:
        # The character might have been deleted since the share was created
        if not share.character:
            # Clean up orphaned share
            share.status = ShareStatus.DISMISSED
            db.commit()
            continue
            
        # Get alignment value (it's an enum, so extract the value)
        alignment_value = None
        if share.character.alignment:
            alignment_value = share.character.alignment.value if hasattr(share.character.alignment, 'value') else str(share.character.alignment)
        
        # Get sex value (it's an enum)
        sex_value = None
        if share.character.sex:
            sex_value = share.character.sex.value if hasattr(share.character.sex, 'value') else str(share.character.sex)
        
        result.append(PendingShareResponse(
            id=share.id,
            character=CharacterPreview(
                id=share.character.id,
                name=share.character.name,
                race=share.character.race,
                character_class=share.character.character_class,
                level=share.character.level,
                background=share.character.background,
                alignment=alignment_value,
                sex=sex_value,
                ascii_portrait=share.character.ascii_portrait
            ),
            from_email=share.from_user.email if share.from_user else "Unknown",
            created_at=share.created_at
        ))
    
    return result


@router.post("/{share_id}/accept", response_model=dict)
def accept_share(
    share_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Accept a pending character share.
    
    Creates a copy of the shared character owned by the current user.
    The original character remains with the sender.
    """
    share = db.query(CharacterShare).filter(CharacterShare.id == share_id).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    
    # Verify this share is for the current user
    if share.to_email != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This share is not for you"
        )
    
    if share.status != ShareStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This share has already been processed"
        )
    
    # Get the original character
    original = share.character
    if not original:
        share.status = ShareStatus.DISMISSED
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="The shared character no longer exists"
        )
    
    # Create a copy of the character for the recipient
    duplicate_data = {
        'owner_id': current_user.id,
        'name': original.name,
        'race': original.race,
        'character_class': original.character_class,
        'level': original.level,
        'background': original.background,
        'alignment': original.alignment,
        'sex': original.sex,
        'experience_points': original.experience_points,
        'strength': original.strength,
        'dexterity': original.dexterity,
        'constitution': original.constitution,
        'intelligence': original.intelligence,
        'wisdom': original.wisdom,
        'charisma': original.charisma,
        'hit_points_max': original.hit_points_max,
        'hit_points_current': original.hit_points_max,  # Full HP for copy
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
        'ascii_portrait': original.ascii_portrait,
        'original_portrait_url': original.original_portrait_url,
        'custom_portrait_ascii': original.custom_portrait_ascii,
        'custom_portrait_count': original.custom_portrait_count,
        'portrait_metadata': original.portrait_metadata,
        'inventory': original.inventory,
        'spellcasting_ability': original.spellcasting_ability,
        'spell_save_dc': original.spell_save_dc,
        'spell_attack_bonus': original.spell_attack_bonus,
        'spell_slots': original.spell_slots,
        'spell_slots_used': {},  # Reset used slots
        'cantrips': original.cantrips,
        'spells_known': original.spells_known,
        'spells_prepared': original.spells_prepared,
        'conditions': [],  # Reset conditions
        'attacks': original.attacks,
        'copper_pieces': original.copper_pieces,
        'silver_pieces': original.silver_pieces,
        'electrum_pieces': original.electrum_pieces,
        'gold_pieces': original.gold_pieces,
        'platinum_pieces': original.platinum_pieces,
        'campaign_id': None  # Don't copy campaign assignment
    }
    
    new_character = Character(**duplicate_data)
    db.add(new_character)
    
    # Mark share as accepted
    share.status = ShareStatus.ACCEPTED
    
    db.commit()
    db.refresh(new_character)
    
    return {
        "message": "Character added to your collection",
        "character_id": new_character.id
    }


@router.post("/{share_id}/dismiss", status_code=status.HTTP_204_NO_CONTENT)
def dismiss_share(
    share_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Dismiss a pending character share.
    
    The share is permanently dismissed and won't appear again.
    """
    share = db.query(CharacterShare).filter(CharacterShare.id == share_id).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Share not found"
        )
    
    # Verify this share is for the current user
    if share.to_email != current_user.email.lower():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This share is not for you"
        )
    
    if share.status != ShareStatus.PENDING:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This share has already been processed"
        )
    
    # Mark as dismissed
    share.status = ShareStatus.DISMISSED
    db.commit()
    
    return None

