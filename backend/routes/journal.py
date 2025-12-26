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
from models.character_collaborator import CharacterCollaborator
from schemas.journal import (
    JournalEntryCreate, JournalEntryUpdate, JournalEntryResponse,
    CharacterUpdateCreate, CharacterUpdateResponse, JournalEntryWithUpdate
)
from utils.auth import get_current_active_user
from datetime import date
from routes.campaigns import check_campaign_access

router = APIRouter(prefix="/journal", tags=["journal"])


def validate_character_update_against_character(
    update_data: CharacterUpdateCreate,
    character: Character,
    is_edit: bool = False,
    old_update: Optional[CharacterUpdate] = None
) -> List[str]:
    """
    Validate character update against actual character stats.
    Returns list of validation error messages (empty if valid).
    
    Args:
        update_data: The proposed changes
        character: The character to validate against
        is_edit: True if editing an existing update (need to consider reverting old values)
        old_update: The existing update being edited (if is_edit=True)
    """
    errors = []
    
    # Calculate effective current values (accounting for edit reversion)
    current_gold = character.gold_pieces
    current_hp = character.hit_points_current
    max_hp = character.hit_points_max
    
    if is_edit and old_update:
        # When editing, first revert the old changes to get the "base" state
        current_gold -= old_update.gold_change
        current_hp -= old_update.hp_change
    
    # === Gold Validation ===
    # Check if gold change would result in negative gold
    new_gold = current_gold + update_data.gold_change
    if new_gold < 0:
        errors.append(
            f"Gold change of {update_data.gold_change:+d} GP would result in negative gold "
            f"(current: {current_gold} GP, would become: {new_gold} GP)"
        )
    
    # === HP Validation ===
    # Calculate what the new HP would be
    new_hp = current_hp + update_data.hp_change
    
    # HP gain that would exceed max HP
    if update_data.hp_change > 0:
        hp_over_max = new_hp - max_hp
        if hp_over_max > 0:
            errors.append(
                f"HP change of +{update_data.hp_change} would exceed max HP "
                f"(current: {current_hp}/{max_hp}, would heal to: {new_hp}). "
                f"Maximum healing possible: +{max_hp - current_hp}"
            )
    
    # HP loss that would go below 0 - this is actually allowed in D&D (unconscious/death)
    # but we should warn if it's excessive (more than current HP + max HP for massive damage)
    if update_data.hp_change < 0:
        if abs(update_data.hp_change) > current_hp + max_hp:
            errors.append(
                f"HP change of {update_data.hp_change} is excessive "
                f"(current HP: {current_hp}, max HP: {max_hp}). "
                f"This exceeds instant death threshold."
            )
    
    return errors


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
    
    # Require character to be in a campaign
    if not campaign_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Journal entries can only be created for characters in a campaign"
        )
    
    # Verify user has campaign access (direct member, DM, or collaborator on a character in the campaign)
    if not check_campaign_access(campaign_id, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have access to the campaign to create journal entries"
        )
    
    # Validate character update if provided
    if entry_data.character_update:
        validation_errors = validate_character_update_against_character(
            entry_data.character_update, character
        )
        if validation_errors:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": "Invalid character update", "errors": validation_errors}
            )
    
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
        
        # Apply HP change (clamped to 0-max for safety, though validation should prevent issues)
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
    
    # Check access: owner, collaborator, or has campaign access
    is_owner = character.owner_id == current_user.id
    is_collaborator = db.query(CharacterCollaborator).filter(
        CharacterCollaborator.character_id == character_id,
        CharacterCollaborator.user_id == current_user.id
    ).first() is not None
    has_campaign_access = character.campaign_id and check_campaign_access(character.campaign_id, current_user, db)
    
    if not is_owner and not is_collaborator and not has_campaign_access:
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
    # Verify campaign exists
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access (creator, direct member, or collaborator on a character in the campaign)
    if not check_campaign_access(campaign_id, current_user, db):
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
    
    # Build visibility mapping: character_id -> (user_id, is_public, symbol)
    # journal_visibility is now a String column with values "private" or "public"
    visibility_map = {
        m.character_id: (m.user_id, str(m.journal_visibility or "private").lower() == "public", m.symbol)
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
                char_id for char_id, (uid, is_public, _) in visibility_map.items()
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
            char_id for char_id, (uid, is_public, _) in visibility_map.items()
            if is_public and uid != current_user.id
        ]
        
        # Own character IDs (all entries visible)
        own_char_ids = [
            char_id for char_id, (uid, _, __) in visibility_map.items()
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
    
    # Build response with character_name, character_symbol, and user_email
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
            character_symbol=visibility_map.get(e.character_id, (None, None, None))[2] if e.character_id else None,
            user_email=e.user.email if e.user else None
        )
        for e in entries
    ]


@router.get("/campaign/{campaign_id}/history", response_model=List[JournalEntryResponse])
def get_campaign_journal_history(
    campaign_id: int,
    limit: int = Query(default=100, le=500),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get historical journal entries for a past campaign.
    
    For Past Adventures feature - allows viewing journals from campaigns the user
    has left or that have been completed/archived.
    
    Visibility rules:
    - User can always see their own entries (up to when they left or campaign ended)
    - User can see other members' entries if their journal_visibility was "public"
    - Entries are filtered by the appropriate end date (user's left_at or campaign's ended_at)
    """
    # Verify campaign exists
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check if user was a direct member (including LEFT status)
    my_membership = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status.in_([MemberStatus.ACTIVE, MemberStatus.LEFT])
    ).first()
    
    # If not a direct member, check if collaborator on a character that was in the campaign
    is_collaborator_access = False
    collaborator_character_membership = None
    if not my_membership:
        # Find if user is a collaborator on any character that was in this campaign
        campaign_character_ids = db.query(CampaignMember.character_id).filter(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.status.in_([MemberStatus.ACTIVE, MemberStatus.LEFT]),
            CampaignMember.character_id != None
        ).all()
        char_ids = [c[0] for c in campaign_character_ids]
        
        if char_ids:
            collab = db.query(CharacterCollaborator).filter(
                CharacterCollaborator.character_id.in_(char_ids),
                CharacterCollaborator.user_id == current_user.id
            ).first()
            if collab:
                is_collaborator_access = True
                # Get the membership for the character they're collaborating on
                collaborator_character_membership = db.query(CampaignMember).filter(
                    CampaignMember.campaign_id == campaign_id,
                    CampaignMember.character_id == collab.character_id
                ).first()
    
    if not my_membership and not is_collaborator_access:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this campaign's journal history"
        )
    
    # Determine the cutoff date for entries
    # Use direct membership if available, otherwise use collaborator's character's membership
    effective_membership = my_membership or collaborator_character_membership
    cutoff_date = None
    if effective_membership and effective_membership.status == MemberStatus.LEFT and effective_membership.left_at:
        cutoff_date = effective_membership.left_at
    if campaign.ended_at:
        if cutoff_date is None or campaign.ended_at < cutoff_date:
            cutoff_date = campaign.ended_at
    
    # Get all memberships for this campaign (including LEFT status) for visibility checking
    # This includes the preserved journal_visibility setting
    all_memberships = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status.in_([MemberStatus.ACTIVE, MemberStatus.LEFT]),
        CampaignMember.character_id.isnot(None)
    ).all()
    
    # Build visibility mapping: character_id -> (user_id, is_public, symbol, member_left_at)
    visibility_map = {
        m.character_id: (
            m.user_id, 
            str(m.journal_visibility or "private").lower() == "public", 
            m.symbol,
            m.left_at
        )
        for m in all_memberships
    }
    
    # Determine which character entries to show
    # Own entries: all (up to cutoff)
    # Other entries: only if public visibility
    own_char_ids = [
        char_id for char_id, (uid, _, __, ___) in visibility_map.items()
        if uid == current_user.id
    ]
    
    public_char_ids = [
        char_id for char_id, (uid, is_public, _, __) in visibility_map.items()
        if is_public and uid != current_user.id
    ]
    
    all_visible_char_ids = own_char_ids + public_char_ids
    
    if not all_visible_char_ids:
        return []
    
    # Build base query
    entries_query = db.query(JournalEntry).filter(
        JournalEntry.campaign_id == campaign_id,
        JournalEntry.character_id.in_(all_visible_char_ids)
    )
    
    # Apply cutoff date filter if applicable
    if cutoff_date:
        entries_query = entries_query.filter(
            JournalEntry.created_at <= cutoff_date
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
    
    # Build response
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
            character_symbol=visibility_map.get(e.character_id, (None, None, None, None))[2] if e.character_id else None,
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
    
    # Check access: entry owner or has campaign access
    is_owner = entry.user_id == current_user.id
    has_campaign_access = entry.campaign_id and check_campaign_access(entry.campaign_id, current_user, db)
    
    if not is_owner and not has_campaign_access:
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
    """Update a journal entry (owner only, must be in campaign)."""
    entry = db.query(JournalEntry).filter(
        JournalEntry.id == entry_id,
        JournalEntry.user_id == current_user.id
    ).first()
    
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Journal entry not found or not owned by you"
        )
    
    # Require the journal entry to be associated with a campaign
    if not entry.campaign_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Journal entries can only be updated for characters in a campaign"
        )
    
    # Verify user still has campaign access (direct member, DM, or collaborator)
    if not check_campaign_access(entry.campaign_id, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have access to the campaign to update journal entries"
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
    
    # Require the journal entry to be associated with a campaign
    if not entry.campaign_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Character updates can only be added for journal entries in a campaign"
        )
    
    # Verify user still has campaign access (direct member, DM, or collaborator)
    if not check_campaign_access(entry.campaign_id, current_user, db):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You must have access to the campaign to add character updates"
        )
    
    # Check if update already exists
    existing_update = db.query(CharacterUpdate).filter(
        CharacterUpdate.journal_entry_id == entry_id
    ).first()
    
    character = db.query(Character).filter(
        Character.id == entry.character_id
    ).first()
    
    # Validate the update against character stats
    validation_errors = validate_character_update_against_character(
        update_data, 
        character, 
        is_edit=existing_update is not None,
        old_update=existing_update
    )
    if validation_errors:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": "Invalid character update", "errors": validation_errors}
        )
    
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
    
    # Apply HP change (clamped to 0-max for safety, though validation should prevent issues)
    new_hp = character.hit_points_current + update_data.hp_change
    character.hit_points_current = max(0, min(new_hp, character.hit_points_max))
    
    # Update conditions if provided
    if update_data.conditions:
        character.conditions = update_data.conditions
    
    db.commit()
    db.refresh(char_update)
    
    return char_update

