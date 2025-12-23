from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel
from database.database import get_db
from models.user import User, UserRole
from models.character import Character
from models.character_collaborator import CharacterCollaborator, CollaboratorPermission
from models.campaign_member import CampaignMember, MemberStatus
from schemas.character import CharacterCreate, CharacterUpdate, CharacterResponse
from utils.auth import get_current_active_user, get_current_user_optional

router = APIRouter(prefix="/characters", tags=["characters"])


class DemoToggleRequest(BaseModel):
    is_demo: bool

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
    """
    Get all characters the user has access to:
    - Characters they own
    - Characters shared with them (as collaborator)
    """
    # Get owned characters
    owned = db.query(Character).filter(Character.owner_id == current_user.id).all()
    
    # Get shared characters (where user is a collaborator)
    shared_collabs = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.user_id == current_user.id
    ).all()
    
    # Build response with sharing metadata
    result = []
    
    # Add owned characters (include collaborator count so owner knows it's shared)
    for char in owned:
        char_dict = CharacterResponse.model_validate(char).model_dump()
        char_dict['is_shared'] = False
        # Count how many collaborators this character has
        collab_count = db.query(CharacterCollaborator).filter(
            CharacterCollaborator.character_id == char.id
        ).count()
        char_dict['collaborator_count'] = collab_count
        # Include who last updated (if tracked)
        char_dict['last_updated_by_email'] = char.last_updated_by.email if char.last_updated_by else None
        result.append(char_dict)
    
    # Add shared characters with metadata
    for collab in shared_collabs:
        if collab.character:  # Character might have been deleted
            char_dict = CharacterResponse.model_validate(collab.character).model_dump()
            char_dict['is_shared'] = True
            char_dict['owner_email'] = collab.character.owner.email if collab.character.owner else None
            char_dict['permission'] = collab.permission.value
            char_dict['collaborator_count'] = 0  # Not relevant for collaborators
            # Include who last updated (if tracked)
            char_dict['last_updated_by_email'] = collab.character.last_updated_by.email if collab.character.last_updated_by else None
            result.append(char_dict)
    
    return result


@router.get("/all", response_model=List[CharacterResponse])
def get_all_characters(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Admin-only endpoint to view all characters in the system."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    characters = db.query(Character).all()
    return characters


# ==========================================
# DEMO MODE ENDPOINTS
# ==========================================
# NOTE: These must be defined BEFORE /{character_id} routes to avoid
# FastAPI matching "demo" as a character_id

@router.get("/demo/list", response_model=List[CharacterResponse])
def get_demo_characters(
    db: Session = Depends(get_db)
):
    """
    Public endpoint to fetch all characters marked as demo.
    No authentication required - used for the demo/guest experience.
    """
    demo_characters = db.query(Character).filter(Character.is_demo == True).all()
    return demo_characters


@router.patch("/{character_id}/demo", response_model=CharacterResponse)
def toggle_demo_status(
    character_id: int,
    request: DemoToggleRequest,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Admin-only endpoint to toggle a character's demo status.
    When is_demo=True, the character will be shown to non-logged-in users.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    character.is_demo = request.is_demo
    db.commit()
    db.refresh(character)
    
    return character


def _check_character_access(character: Character, current_user: User, db: Session, require_edit: bool = False):
    """
    Helper to check if user has access to a character.
    Returns (has_access, is_owner, permission) tuple.
    """
    if character.owner_id == current_user.id:
        return True, True, "owner"
    
    # Check if user is a collaborator
    collab = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == character.id,
        CharacterCollaborator.user_id == current_user.id
    ).first()
    
    if collab:
        if require_edit and collab.permission == CollaboratorPermission.VIEW:
            return False, False, "view"
        return True, False, collab.permission.value
    
    # Check DM access for campaigns
    if current_user.role == UserRole.DM and character.campaign_id:
        if character.campaign and character.campaign.dm_id == current_user.id:
            return True, False, "dm"
    
    # Check if user is in the same campaign as this character (view-only access for party members)
    # Find which campaign this character belongs to via campaign_members table
    character_membership = db.query(CampaignMember).filter(
        CampaignMember.character_id == character.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if character_membership:
        # Check if current user is also a member of the same campaign
        user_membership = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == character_membership.campaign_id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE
        ).first()
        
        if user_membership:
            # Fellow campaign members get view-only access
            if require_edit:
                return False, False, "view"
            return True, False, "party_member"
    
    return False, False, None


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
    
    has_access, is_owner, permission = _check_character_access(character, current_user, db)
    
    if not has_access:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Not authorized to access this character"
            )
    
    # Build response with sharing metadata
    char_dict = CharacterResponse.model_validate(character).model_dump()
    char_dict['is_shared'] = not is_owner
    char_dict['last_updated_by_email'] = character.last_updated_by.email if character.last_updated_by else None
    if not is_owner:
        char_dict['owner_email'] = character.owner.email if character.owner else None
        char_dict['permission'] = permission
    
    return char_dict

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
    
    # Check access - owner or collaborator with edit permission
    has_access, is_owner, permission = _check_character_access(character, current_user, db, require_edit=True)
    
    if not has_access:
        if permission == "view":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You have view-only access to this character"
            )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this character"
        )
    
    # Update only provided fields
    update_data = character_update.model_dump(exclude_unset=True)
    
    # Owner-only fields - collaborators cannot change these
    owner_only_fields = {'name'}
    if not is_owner:
        restricted_fields = owner_only_fields & set(update_data.keys())
        if restricted_fields:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only the owner can change: {', '.join(restricted_fields)}"
            )
    
    for field, value in update_data.items():
        setattr(character, field, value)
    
    # Track who made this update
    character.last_updated_by_id = current_user.id
    
    db.commit()
    db.refresh(character)
    
    # Build response with sharing metadata
    char_dict = CharacterResponse.model_validate(character).model_dump()
    char_dict['is_shared'] = not is_owner
    char_dict['last_updated_by_email'] = current_user.email
    if not is_owner:
        char_dict['owner_email'] = character.owner.email if character.owner else None
        char_dict['permission'] = permission
    
    return char_dict

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
    
    # Only owner can delete (collaborators cannot), admin can delete any
    if character.owner_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can delete this character"
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
    
    # Owner or collaborator can duplicate (collaborator gets their own copy)
    has_access, is_owner, permission = _check_character_access(original, current_user, db)
    
    if not has_access:
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
    
    # Owner or collaborator can export
    has_access, _, _ = _check_character_access(character, current_user, db)
    
    if not has_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to export this character"
        )
    
    # Return character data as JSON
    return CharacterResponse.model_validate(character)

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


# ==========================================
# COLLABORATOR MANAGEMENT ENDPOINTS
# ==========================================

from schemas.character_collaborator import CollaboratorResponse


@router.get("/{character_id}/collaborators", response_model=List[CollaboratorResponse])
def get_collaborators(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all collaborators for a character.
    Only the owner can see the full list of collaborators.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can see collaborators
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can view collaborators"
        )
    
    collaborators = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == character_id
    ).all()
    
    result = []
    for collab in collaborators:
        result.append(CollaboratorResponse(
            id=collab.id,
            user_id=collab.user_id,
            user_email=collab.user.email if collab.user else "Unknown",
            user_username=collab.user.username if collab.user else None,
            permission=collab.permission.value,
            created_at=collab.created_at
        ))
    
    return result


@router.delete("/{character_id}/collaborators/{collaborator_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_collaborator(
    character_id: int,
    collaborator_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Remove a collaborator from a character.
    Only the owner can remove collaborators.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can remove collaborators
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can remove collaborators"
        )
    
    collab = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.id == collaborator_id,
        CharacterCollaborator.character_id == character_id
    ).first()
    
    if not collab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Collaborator not found"
        )
    
    db.delete(collab)
    db.commit()
    
    return None


@router.post("/{character_id}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_shared_character(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Leave a shared character (remove yourself as collaborator).
    Only works if you're a collaborator (not the owner).
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Owner cannot "leave" their own character
    if character.owner_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are the owner of this character. Use delete instead."
        )
    
    # Find and remove the collaborator record
    collab = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == character_id,
        CharacterCollaborator.user_id == current_user.id
    ).first()
    
    if not collab:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a collaborator on this character"
        )
    
    db.delete(collab)
    db.commit()
    
    return None


