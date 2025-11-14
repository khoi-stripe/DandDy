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


