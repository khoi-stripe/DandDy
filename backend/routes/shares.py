from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from database.database import get_db
from models.user import User
from models.character import Character
from models.character_share import CharacterShare, ShareStatus
from models.character_collaborator import CharacterCollaborator, CollaboratorPermission
from schemas.character_share import (
    CharacterShareCreate,
    CharacterShareResponse,
    PendingShareResponse,
    CharacterPreview,
    CollaboratorResponse,
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
    Share a character with another user by username (primary) or email (fallback).
    
    The recipient will see a pending share notification when they next log in.
    They can choose to accept (becomes collaborator) or dismiss (ignores forever).
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
    
    # Find recipient by username (primary) or email (fallback)
    recipient_email = None
    
    if share_data.to_username:
        # Lookup user by username
        recipient_user = db.query(User).filter(
            func.lower(User.username) == share_data.to_username.lower()
        ).first()
        
        if not recipient_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No user found with username @{share_data.to_username}"
            )
        
        recipient_email = recipient_user.email.lower()
    elif share_data.to_email:
        recipient_email = share_data.to_email.lower()
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide either to_username or to_email"
        )
    
    # Prevent sharing with yourself
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
            detail="A pending share already exists for this character and user"
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
                ascii_portrait=share.character.ascii_portrait,
                original_portrait_url=share.character.original_portrait_url
            ),
            from_username=share.from_user.username if share.from_user else None,
            from_email=share.from_user.email if share.from_user else "Unknown",
            created_at=share.created_at
        ))
    
    return result


@router.get("/character/{character_id}/pending", response_model=List[dict])
def get_character_pending_shares(
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get all pending shares for a specific character (owner only).
    
    Returns list of pending invitations with recipient email.
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can see pending shares
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can view pending shares"
        )
    
    pending_shares = db.query(CharacterShare).filter(
        CharacterShare.character_id == character_id,
        CharacterShare.status == ShareStatus.PENDING
    ).all()
    
    return [
        {
            "id": share.id,
            "to_email": share.to_email,
            "created_at": share.created_at.isoformat() if share.created_at else None
        }
        for share in pending_shares
    ]


@router.delete("/character/{character_id}/pending/{share_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_pending_share(
    character_id: int,
    share_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Cancel a pending share invitation (owner only).
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Only owner can cancel pending shares
    if character.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can cancel pending shares"
        )
    
    share = db.query(CharacterShare).filter(
        CharacterShare.id == share_id,
        CharacterShare.character_id == character_id,
        CharacterShare.status == ShareStatus.PENDING
    ).first()
    
    if not share:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pending share not found"
        )
    
    # Delete the share record entirely
    db.delete(share)
    db.commit()
    
    return None


@router.post("/{share_id}/accept", response_model=dict)
def accept_share(
    share_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Accept a pending character share.
    
    Adds the current user as a collaborator on the original character.
    The character remains owned by the original owner but the collaborator
    can view and edit it (synced, not a copy).
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
    
    # Check if user is already a collaborator
    existing_collab = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == original.id,
        CharacterCollaborator.user_id == current_user.id
    ).first()
    
    if existing_collab:
        # Already a collaborator, just mark share as accepted
        share.status = ShareStatus.ACCEPTED
        db.commit()
        return {
            "message": "You already have access to this character",
            "character_id": original.id,
            "is_synced": True
        }
    
    # Add user as collaborator with edit permission
    collaborator = CharacterCollaborator(
        character_id=original.id,
        user_id=current_user.id,
        permission=CollaboratorPermission.EDIT
    )
    db.add(collaborator)
    
    # Mark share as accepted
    share.status = ShareStatus.ACCEPTED
    
    db.commit()
    
    return {
        "message": "Character shared with you - changes will sync automatically",
        "character_id": original.id,
        "is_synced": True
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

