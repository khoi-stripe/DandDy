from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import or_
from database.database import get_db
from models.user import User
from models.character import Character
from models.campaign import Campaign
from models.campaign_member import CampaignMember, MemberStatus
from models.journal import JournalEntry, CharacterUpdate
from schemas.journal import (
    JournalEntryCreate, JournalEntryUpdate, JournalEntryResponse,
    CharacterUpdateCreate, CharacterUpdateResponse, JournalEntryWithUpdate
)
from utils.auth import get_current_active_user
from datetime import date

router = APIRouter(prefix="/journal", tags=["journal"])


@router.post("/", response_model=JournalEntryResponse, status_code=status.HTTP_201_CREATED)
def create_journal_entry(
    entry_data: JournalEntryWithUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new journal entry with optional character update."""
    # Validate character ownership
    character = db.query(Character).filter(
        Character.id == entry_data.character_id,
        Character.owner_id == current_user.id
    ).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found or not owned by you"
        )
    
    # Validate campaign if provided
    campaign_id = entry_data.campaign_id
    if campaign_id:
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )
    else:
        # Use character's campaign if any
        campaign_id = character.campaign_id
    
    # Create journal entry
    new_entry = JournalEntry(
        character_id=entry_data.character_id,
        campaign_id=campaign_id,
        user_id=current_user.id,
        title=entry_data.title,
        content=entry_data.content,
        entry_date=entry_data.entry_date or date.today()
    )
    
    db.add(new_entry)
    db.flush()  # Get the entry ID
    
    # Create character update if provided
    if entry_data.character_update:
        update_data = entry_data.character_update
        char_update = CharacterUpdate(
            journal_entry_id=new_entry.id,
            character_id=entry_data.character_id,
            xp_gained=update_data.xp_gained,
            gold_change=update_data.gold_change,
            hp_change=update_data.hp_change,
            items_acquired=update_data.items_acquired,
            items_lost=update_data.items_lost,
            conditions=update_data.conditions
        )
        db.add(char_update)
        
        # Apply changes to character
        character.experience_points += update_data.xp_gained
        character.gold_pieces += update_data.gold_change
        
        # Apply HP change (clamped to 0-max)
        new_hp = character.hit_points_current + update_data.hp_change
        character.hit_points_current = max(0, min(new_hp, character.hit_points_max))
        
        # Update conditions if provided
        if update_data.conditions:
            character.conditions = update_data.conditions
    
    db.commit()
    db.refresh(new_entry)
    
    return new_entry


@router.get("/character/{character_id}", response_model=List[JournalEntryResponse])
def get_character_journal_entries(
    character_id: int,
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get journal entries for a character (newest first)."""
    # Verify character access (owner or campaign member)
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found"
        )
    
    # Check access: owner or in same campaign
    is_owner = character.owner_id == current_user.id
    is_campaign_member = False
    
    if character.campaign_id:
        is_campaign_member = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == character.campaign_id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE
        ).first() is not None
    
    if not is_owner and not is_campaign_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this character's journal"
        )
    
    entries = db.query(JournalEntry).filter(
        JournalEntry.character_id == character_id
    ).order_by(JournalEntry.entry_date.desc(), JournalEntry.created_at.desc()).limit(limit).all()
    
    return entries


@router.get("/campaign/{campaign_id}", response_model=List[JournalEntryResponse])
def get_campaign_journal_entries(
    campaign_id: int,
    user_id: Optional[int] = Query(default=None, description="Filter by user ID"),
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get journal entries for a campaign with visibility filtering.
    
    - If no user_id filter: returns all public entries from party + all your own entries
    - If user_id filter: returns public entries from that user only (or all if filtering yourself)
    """
    # Verify campaign exists and user is a member
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check if user is a member
    my_membership = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if not my_membership and campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this campaign's journal entries"
        )
    
    # Get all memberships with their visibility settings
    memberships = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status == MemberStatus.ACTIVE,
        CampaignMember.character_id.isnot(None)  # Only members with assigned characters
    ).all()
    
    # Build visibility mapping: character_id -> (user_id, is_public)
    # journal_visibility is now a String column with values "private" or "public"
    visibility_map = {
        m.character_id: (m.user_id, str(m.journal_visibility or "private").lower() == "public")
        for m in memberships
    }
    
    # Build query based on filters
    if user_id is not None:
        # Filtering by specific user
        if user_id == current_user.id:
            # Filtering by self - show all own entries
            entries_query = db.query(JournalEntry).filter(
                JournalEntry.campaign_id == campaign_id,
                JournalEntry.user_id == current_user.id
            )
        else:
            # Filtering by other user - show only their public entries
            public_char_ids = [
                char_id for char_id, (uid, is_public) in visibility_map.items()
                if uid == user_id and is_public
            ]
            if not public_char_ids:
                return []  # No public entries from this user
            
            entries_query = db.query(JournalEntry).filter(
                JournalEntry.campaign_id == campaign_id,
                JournalEntry.character_id.in_(public_char_ids)
            )
    else:
        # No filter - show all public entries + own entries
        public_char_ids = [
            char_id for char_id, (uid, is_public) in visibility_map.items()
            if is_public and uid != current_user.id
        ]
        
        # Own character IDs (all entries visible)
        own_char_ids = [
            char_id for char_id, (uid, _) in visibility_map.items()
            if uid == current_user.id
        ]
        
        all_visible_char_ids = public_char_ids + own_char_ids
        
        if not all_visible_char_ids:
            return []
        
        entries_query = db.query(JournalEntry).filter(
            JournalEntry.campaign_id == campaign_id,
            JournalEntry.character_id.in_(all_visible_char_ids)
        )
    
    # Execute query with eager loading
    entries = entries_query.options(
        joinedload(JournalEntry.character),
        joinedload(JournalEntry.user),
        joinedload(JournalEntry.character_update)
    ).order_by(
        JournalEntry.entry_date.desc(),
        JournalEntry.created_at.desc()
    ).limit(limit).all()
    
    # Build response with character_name and user_email
    return [
        JournalEntryResponse(
            id=e.id,
            character_id=e.character_id,
            campaign_id=e.campaign_id,
            user_id=e.user_id,
            title=e.title,
            content=e.content,
            entry_date=e.entry_date,
            created_at=e.created_at,
            updated_at=e.updated_at,
            character_update=e.character_update,
            character_name=e.character.name if e.character else None,
            user_email=e.user.email if e.user else None
        )
        for e in entries
    ]


@router.get("/{entry_id}", response_model=JournalEntryResponse)
def get_journal_entry(
    entry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific journal entry."""
    entry = db.query(JournalEntry).filter(JournalEntry.id == entry_id).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found"
        )
    
    # Check access: owner or campaign member
    is_owner = entry.user_id == current_user.id
    is_campaign_member = False
    
    if entry.campaign_id:
        is_campaign_member = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == entry.campaign_id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE
        ).first() is not None
    
    if not is_owner and not is_campaign_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this journal entry"
        )
    
    return entry


@router.put("/{entry_id}", response_model=JournalEntryResponse)
def update_journal_entry(
    entry_id: int,
    update_data: JournalEntryUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a journal entry (owner only)."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found or not owned by you"
        )
    
    # Update fields if provided
    if update_data.title is not None:
        entry.title = update_data.title
    if update_data.content is not None:
        entry.content = update_data.content
    if update_data.entry_date is not None:
        entry.entry_date = update_data.entry_date
    
    db.commit()
    db.refresh(entry)
    
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_journal_entry(
    entry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a journal entry (owner only)."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found or not owned by you"
        )
    
    # Note: CharacterUpdate is deleted via cascade
    # Character stats are NOT reverted (that's by design - edits should be manual)
    
    db.delete(entry)
    db.commit()
    
    return None


@router.post("/{entry_id}/character-update", response_model=CharacterUpdateResponse, status_code=status.HTTP_201_CREATED)
def add_character_update(
    entry_id: int,
    update_data: CharacterUpdateCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add or update character stats for an existing journal entry."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found or not owned by you"
        )
    
    # Check if update already exists
    existing_update = db.query(CharacterUpdate).filter(
        CharacterUpdate.journal_entry_id == entry_id
    ).first()
    
    character = db.query(Character).filter(
        Character.id == entry.character_id
    ).first()
    
    if existing_update:
        # Revert old changes first
        character.experience_points -= existing_update.xp_gained
        character.gold_pieces -= existing_update.gold_change
        character.hit_points_current -= existing_update.hp_change
        
        # Apply new changes
        existing_update.xp_gained = update_data.xp_gained
        existing_update.gold_change = update_data.gold_change
        existing_update.hp_change = update_data.hp_change
        existing_update.items_acquired = update_data.items_acquired
        existing_update.items_lost = update_data.items_lost
        existing_update.conditions = update_data.conditions
        
        char_update = existing_update
    else:
        # Create new update
        char_update = CharacterUpdate(
            journal_entry_id=entry_id,
            character_id=entry.character_id,
            xp_gained=update_data.xp_gained,
            gold_change=update_data.gold_change,
            hp_change=update_data.hp_change,
            items_acquired=update_data.items_acquired,
            items_lost=update_data.items_lost,
            conditions=update_data.conditions
        )
        db.add(char_update)
    
    # Apply changes to character
    character.experience_points += update_data.xp_gained
    character.gold_pieces += update_data.gold_change
    
    # Apply HP change (clamped to 0-max)
    new_hp = character.hit_points_current + update_data.hp_change
    character.hit_points_current = max(0, min(new_hp, character.hit_points_max))
    
    # Update conditions if provided
    if update_data.conditions:
        character.conditions = update_data.conditions
    
    db.commit()
    db.refresh(char_update)
    
    return char_update

