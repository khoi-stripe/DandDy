from typing import List, Tuple, Optional
from datetime import datetime
import random
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from database.database import get_db
from models.user import User
from models.campaign import Campaign, CampaignStatus, generate_invite_code
from models.campaign_member import CampaignMember, MemberStatus, PARTY_SYMBOLS
from models.character import Character
from models.character_collaborator import CharacterCollaborator, CollaboratorPermission
from sqlalchemy import or_
from schemas.campaign import (
    CampaignCreate, CampaignUpdate, CampaignResponse, CampaignWithCharacters,
    CampaignMemberResponse, CampaignMemberVisibilityUpdate, CampaignJoin, CampaignJoinResponse,
    CampaignInviteByEmail, CampaignInvitationResponse, AcceptInvitation,
    CampaignPendingInviteResponse, PastCampaignResponse, PastCampaignMemberInfo
)
from utils.auth import get_current_active_user

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


def _get_available_symbol(campaign_id: int, db: Session) -> Optional[str]:
    """Get a random unused symbol for a campaign."""
    used_symbols = db.query(CampaignMember.symbol).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.symbol.isnot(None)
    ).all()
    used = {s[0] for s in used_symbols}
    available = [s for s in PARTY_SYMBOLS if s not in used]
    return random.choice(available) if available else None


def _can_use_character_for_campaign(
    character_id: int,
    current_user: User,
    target_campaign_id: int,
    db: Session
) -> Tuple[Optional[Character], Optional[str]]:
    """
    Check if a user can assign a character to a campaign membership.
    
    A user can use a character if:
    1. They own it, OR they are a collaborator with edit permission
    2. The character is not already in use by another campaign membership
    
    Returns:
        Tuple of (Character, None) if allowed
        Tuple of (None, error_message) if not allowed
    """
    character = db.query(Character).filter(Character.id == character_id).first()
    
    if not character:
        return None, "Character not found"
    
    # Check access: owner or collaborator with edit permission
    is_owner = character.owner_id == current_user.id
    has_edit_access = False
    
    if not is_owner:
        # Check if user is a collaborator with edit permission
        collab = db.query(CharacterCollaborator).filter(
            CharacterCollaborator.character_id == character_id,
            CharacterCollaborator.user_id == current_user.id,
            CharacterCollaborator.permission == CollaboratorPermission.EDIT
        ).first()
        
        if collab:
            has_edit_access = True
    
    if not is_owner and not has_edit_access:
        return None, "Character not found or you don't have permission to use it"
    
    # Check if character is already in another campaign
    if character.campaign_id and character.campaign_id != target_campaign_id:
        return None, "This character is already in another campaign"
    
    # Check if character is already assigned to a different membership in an ACTIVE campaign
    # This prevents a shared character from being used by multiple people simultaneously
    # Note: We join with Campaign to verify the campaign is still active - completed campaigns
    # should not block character reuse
    existing_membership = db.query(CampaignMember).join(Campaign).filter(
        CampaignMember.character_id == character_id,
        CampaignMember.status == MemberStatus.ACTIVE,
        Campaign.status == CampaignStatus.ACTIVE  # Only check active campaigns
    ).first()
    
    if existing_membership:
        # If the character is already assigned to a membership, only allow if:
        # - It's the same user's membership in the target campaign
        if existing_membership.user_id != current_user.id:
            return None, "This character is already being used by another player"
        if existing_membership.campaign_id != target_campaign_id:
            return None, "This character is already in another campaign"
    
    return character, None


@router.post("/", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    campaign_data: CampaignCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Create a new campaign. Any user can create campaigns."""
    new_campaign = Campaign(
        dm_id=current_user.id,  # Creator
        **campaign_data.model_dump()
    )
    
    db.add(new_campaign)
    db.flush()  # Get the campaign ID
    
    # Add creator as a member with assigned symbol
    creator_member = CampaignMember(
        campaign_id=new_campaign.id,
        user_id=current_user.id,
        is_creator=True,
        status=MemberStatus.ACTIVE,
        symbol=_get_available_symbol(new_campaign.id, db)
    )
    db.add(creator_member)
    
    db.commit()
    db.refresh(new_campaign)
    
    return new_campaign


@router.get("/", response_model=List[CampaignResponse])
def get_campaigns(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all active campaigns the user is a member of (excludes completed/archived)."""
    # Get campaigns where user is a member (via CampaignMember)
    # Only include campaigns that are active or paused (not completed/archived)
    campaigns = db.query(Campaign).join(CampaignMember).filter(
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE,
        Campaign.status.in_([CampaignStatus.ACTIVE, CampaignStatus.PAUSED])
    ).all()
    
    # Also include campaigns user created (backward compat - they should also be members)
    # But still filter out completed/archived
    created_campaigns = db.query(Campaign).filter(
        Campaign.dm_id == current_user.id,
        Campaign.status.in_([CampaignStatus.ACTIVE, CampaignStatus.PAUSED])
    ).all()
    
    # Merge and deduplicate
    campaign_ids = {c.id for c in campaigns}
    for c in created_campaigns:
        if c.id not in campaign_ids:
            campaigns.append(c)
    
    return campaigns


@router.get("/past", response_model=List[PastCampaignResponse])
def get_past_campaigns(
    character_id: Optional[int] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get past campaigns for the current user.
    
    If character_id is provided, returns only past campaigns where that character
    was a member. Otherwise returns all past campaigns for the user.
    
    Returns campaigns where:
    - User left the campaign (membership status = LEFT), OR
    - Campaign is completed/archived and user was a member
    """
    # #region agent log
    import traceback
    import sys
    try:
        # #endregion
        # Base filters for membership queries
        base_left_filter = [
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.LEFT
        ]
        base_completed_filter = [
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE,
            Campaign.status.in_([CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED])
        ]
        
        # If character_id is provided, add it to the filters
        # Include memberships where character_id matches OR is NULL (user joined without a character)
        if character_id is not None:
            # Verify the character belongs to the user
            character = db.query(Character).filter(
                Character.id == character_id,
                Character.owner_id == current_user.id
            ).first()
            if not character:
                raise HTTPException(status_code=404, detail="Character not found")
            
            # Include campaigns where this character was used OR no character was assigned
            base_left_filter.append(or_(CampaignMember.character_id == character_id, CampaignMember.character_id == None))
            base_completed_filter.append(or_(CampaignMember.character_id == character_id, CampaignMember.character_id == None))
        
        # Find all memberships where user left
        left_memberships = db.query(CampaignMember).filter(*base_left_filter).all()
        
        # Find campaigns that are completed/archived where user was active member
        completed_memberships = db.query(CampaignMember).join(Campaign).filter(
            *base_completed_filter
        ).all()
        
        # Combine membership IDs, avoiding duplicates
        membership_campaign_ids = set()
        all_memberships = []
        
        for m in left_memberships + completed_memberships:
            if m.campaign_id not in membership_campaign_ids:
                membership_campaign_ids.add(m.campaign_id)
                all_memberships.append(m)
        
        if not all_memberships:
            return []
        
        # Get full campaign data with all members
        campaign_ids = list(membership_campaign_ids)
        campaigns = db.query(Campaign).filter(
            Campaign.id.in_(campaign_ids)
        ).all()
        
        # Get all members for these campaigns (including those who left)
        all_members = db.query(CampaignMember).options(
            joinedload(CampaignMember.character)
        ).filter(
            CampaignMember.campaign_id.in_(campaign_ids),
            CampaignMember.status.in_([MemberStatus.ACTIVE, MemberStatus.LEFT])
        ).all()
        
        # Build campaign_id -> members mapping
        members_by_campaign = {}
        for m in all_members:
            if m.campaign_id not in members_by_campaign:
                members_by_campaign[m.campaign_id] = []
            members_by_campaign[m.campaign_id].append(m)
        
        # Build user's membership mapping for quick lookup
        user_memberships = {m.campaign_id: m for m in all_memberships}
        
        # Build response
        result = []
        for campaign in campaigns:
            user_membership = user_memberships.get(campaign.id)
            campaign_members = members_by_campaign.get(campaign.id, [])
            
            # Build member info list
            member_infos = []
            for m in campaign_members:
                char = m.character
                member_infos.append(PastCampaignMemberInfo(
                    user_id=m.user_id,
                    character_id=m.character_id,
                    character_name=char.name if char else None,
                    character_class=char.character_class if char else None,
                    character_level=char.level if char else None,
                    symbol=m.symbol,
                    is_creator=bool(m.is_creator) if m.is_creator is not None else False,
                    status=m.status.value if m.status and hasattr(m.status, 'value') else str(m.status) if m.status else "unknown",
                    joined_at=m.joined_at,
                    left_at=m.left_at
                ))
            
            result.append(PastCampaignResponse(
                id=campaign.id,
                name=campaign.name,
                description=campaign.description,
                status=campaign.status.value if campaign.status and hasattr(campaign.status, 'value') else str(campaign.status) if campaign.status else "unknown",
                created_at=campaign.created_at,
                ended_at=campaign.ended_at,
                user_left_at=user_membership.left_at if user_membership else None,
                user_status=user_membership.status.value if user_membership and user_membership.status and hasattr(user_membership.status, 'value') else str(user_membership.status) if user_membership and user_membership.status else "unknown",
                party_count=len(campaign_members),
                members=member_infos
            ))
        
        # Sort by most recent first (by ended_at or left_at or created_at)
        # Use a very old date as fallback if all are None
        from datetime import datetime as dt
        fallback_date = dt(1970, 1, 1)
        result.sort(key=lambda c: c.ended_at or c.user_left_at or c.created_at or fallback_date, reverse=True)
        
        return result
    # #region agent log
    except Exception as e:
        print(f"[PAST_CAMPAIGNS_ERROR] user_id={current_user.id}, character_id={character_id}, error={str(e)}", file=sys.stderr)
        print(f"[PAST_CAMPAIGNS_TRACEBACK] {traceback.format_exc()}", file=sys.stderr)
        raise
    # #endregion


@router.get("/{campaign_id}", response_model=CampaignWithCharacters)
def get_campaign(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a campaign with its characters. User must be a member."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access: must be creator or member
    is_member = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if campaign.dm_id != current_user.id and not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this campaign"
        )
    
    return campaign


@router.put("/{campaign_id}", response_model=CampaignResponse)
def update_campaign(
    campaign_id: int,
    campaign_update: CampaignUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update a campaign. Only the creator can update."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only the creator can update
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this campaign"
        )
    
    update_data = campaign_update.model_dump(exclude_unset=True)
    
    # Handle status enum conversion
    if "status" in update_data and update_data["status"]:
        try:
            new_status = CampaignStatus(update_data["status"])
            update_data["status"] = new_status
            
            # Set ended_at timestamp when campaign is completed or archived
            if new_status in [CampaignStatus.COMPLETED, CampaignStatus.ARCHIVED]:
                if campaign.ended_at is None:
                    campaign.ended_at = datetime.utcnow()
                
                # Clear campaign_id from all characters that were in this campaign
                # This allows them to join new campaigns
                db.query(Character).filter(
                    Character.campaign_id == campaign_id
                ).update({Character.campaign_id: None})
                
            elif new_status == CampaignStatus.ACTIVE:
                # Clear ended_at if campaign is reactivated
                campaign.ended_at = None
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid status. Must be one of: {[s.value for s in CampaignStatus]}"
            )
    
    for field, value in update_data.items():
        setattr(campaign, field, value)
    
    db.commit()
    db.refresh(campaign)
    
    return campaign


@router.delete("/{campaign_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_campaign(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Delete a campaign. Only the creator can delete."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only the creator can delete
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this campaign"
        )
    
    # Clear campaign_id from all characters that were in this campaign
    # This removes the "IN CAMPAIGN" tag from character sheets
    db.query(Character).filter(
        Character.campaign_id == campaign_id
    ).update({Character.campaign_id: None})
    
    db.delete(campaign)
    db.commit()
    
    return None


# ============ Invite Code Flow ============

@router.post("/join", response_model=CampaignJoinResponse)
def join_campaign(
    join_data: CampaignJoin,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Join a campaign using an invite code.
    
    Users can optionally assign a character when joining. The character can be:
    - A character they own
    - A shared character they have edit access to (as long as it's not already in use)
    """
    campaign = db.query(Campaign).filter(
        Campaign.invite_code == join_data.invite_code
    ).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid invite code"
        )
    
    if campaign.status == CampaignStatus.ARCHIVED:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This campaign is archived and not accepting new members"
        )
    
    # Check if already a member
    existing_member = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign.id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if existing_member:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You are already a member of this campaign"
        )
    
    # Validate character if provided (supports owned AND shared characters)
    character = None
    if join_data.character_id:
        character, error = _can_use_character_for_campaign(
            join_data.character_id, current_user, campaign.id, db
        )
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
    
    # Create membership with assigned symbol
    new_member = CampaignMember(
        campaign_id=campaign.id,
        user_id=current_user.id,
        character_id=join_data.character_id,
        is_creator=False,
        status=MemberStatus.ACTIVE,
        symbol=_get_available_symbol(campaign.id, db)
    )
    db.add(new_member)
    
    # Update character's campaign_id if provided
    if character:
        character.campaign_id = campaign.id
    
    db.commit()
    db.refresh(new_member)
    db.refresh(campaign)
    
    return CampaignJoinResponse(campaign=campaign, membership=new_member)


@router.post("/{campaign_id}/regenerate-code", response_model=CampaignResponse)
def regenerate_invite_code(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Regenerate the invite code. Only the creator can do this."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign creator can regenerate the invite code"
        )
    
    campaign.invite_code = generate_invite_code()
    db.commit()
    db.refresh(campaign)
    
    return campaign


# ============ Member Management ============

@router.get("/{campaign_id}/members", response_model=List[CampaignMemberResponse])
def get_campaign_members(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all members of a campaign. User must be a member."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access
    is_member = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if campaign.dm_id != current_user.id and not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this campaign's members"
        )
    
    members = db.query(CampaignMember).options(
        joinedload(CampaignMember.character),
        joinedload(CampaignMember.user)
    ).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).all()
    
    # Build response with user email, journal visibility, and symbol
    # journal_visibility is now a String column
    return [
        CampaignMemberResponse(
            id=m.id,
            campaign_id=m.campaign_id,
            user_id=m.user_id,
            user_email=m.user.email if m.user else None,
            is_creator=m.is_creator,
            status=m.status.value if hasattr(m.status, 'value') else str(m.status),
            joined_at=m.joined_at,
            journal_visibility=str(m.journal_visibility or "private").lower(),
            symbol=m.symbol,
            character_id=m.character_id,
            character=m.character
        )
        for m in members
    ]


@router.put("/{campaign_id}/members/journal-visibility", response_model=CampaignMemberResponse)
def update_journal_visibility(
    campaign_id: int,
    visibility_data: CampaignMemberVisibilityUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Update journal visibility setting for your campaign membership."""
    # Find membership
    membership = db.query(CampaignMember).options(
        joinedload(CampaignMember.character),
        joinedload(CampaignMember.user)
    ).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this campaign"
        )
    
    # Update visibility (now a simple string)
    membership.journal_visibility = visibility_data.visibility
    
    db.commit()
    db.refresh(membership)
    
    return CampaignMemberResponse(
        id=membership.id,
        campaign_id=membership.campaign_id,
        user_id=membership.user_id,
        user_email=membership.user.email if membership.user else None,
        is_creator=membership.is_creator,
        status=membership.status.value if hasattr(membership.status, 'value') else str(membership.status),
        joined_at=membership.joined_at,
        journal_visibility=str(membership.journal_visibility or "private").lower(),
        symbol=membership.symbol,
        character_id=membership.character_id,
        character=membership.character
    )


@router.put("/{campaign_id}/members/assign-character", response_model=CampaignMemberResponse)
def assign_character_to_campaign(
    campaign_id: int,
    character_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Assign a character to your campaign membership.
    
    You can assign:
    - A character you own
    - A shared character you have edit access to (as long as it's not already in use)
    """
    # Find membership
    membership = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this campaign"
        )
    
    # Validate character (supports owned AND shared characters)
    character, error = _can_use_character_for_campaign(
        character_id, current_user, campaign_id, db
    )
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    # Update membership and character
    membership.character_id = character_id
    character.campaign_id = campaign_id
    
    db.commit()
    db.refresh(membership)
    
    return membership


@router.delete("/{campaign_id}/members/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_campaign(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Leave a campaign. Creator cannot leave (must delete campaign instead)."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if campaign.dm_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Campaign creator cannot leave. Delete the campaign instead."
        )
    
    membership = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if not membership:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You are not a member of this campaign"
        )
    
    # Mark as left (preserve history) and set left_at timestamp
    membership.status = MemberStatus.LEFT
    membership.left_at = datetime.utcnow()
    
    # Remove character from campaign (but keep session history)
    if membership.character_id:
        character = db.query(Character).filter(
            Character.id == membership.character_id
        ).first()
        if character:
            character.campaign_id = None
    
    db.commit()
    
    return None


# ============ Email Invitations ============

@router.get("/invitations/pending", response_model=List[CampaignInvitationResponse])
def get_pending_invitations(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all pending campaign invitations for the current user."""
    invitations = db.query(CampaignMember).options(
        joinedload(CampaignMember.campaign),
        joinedload(CampaignMember.invited_by)  # Load the inviter
    ).filter(
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.INVITED
    ).all()
    
    return [
        CampaignInvitationResponse(
            id=inv.id,
            campaign_id=inv.campaign_id,
            campaign_name=inv.campaign.name,
            campaign_description=inv.campaign.description,
            invited_at=inv.joined_at,
            invited_by_email=inv.invited_by.email if inv.invited_by else None
        )
        for inv in invitations
    ]


@router.post("/{campaign_id}/invite", status_code=status.HTTP_201_CREATED)
def invite_user_by_email(
    campaign_id: int,
    invite_data: CampaignInviteByEmail,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Invite a user to a campaign by email. Only the creator can invite."""
    # #region agent log - debug wrapper
    import traceback
    debug_step = "start"
    try:
        debug_step = "campaign_lookup"
        # #endregion
        campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
        
        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )
        
        # Only creator can invite
        # #region agent log
        debug_step = "permission_check"
        # #endregion
        if campaign.dm_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the campaign creator can invite users"
            )
        
        # Find user by email
        # #region agent log
        debug_step = "user_lookup"
        # #endregion
        invited_user = db.query(User).filter(User.email == invite_data.email).first()
        
        if not invited_user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="No user found with that email address"
            )
        
        if invited_user.id == current_user.id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="You cannot invite yourself"
            )
        
        # Check if already a member or invited
        # #region agent log
        debug_step = "existing_member_query"
        # #endregion
        existing = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == campaign_id,
            CampaignMember.user_id == invited_user.id,
            CampaignMember.status.in_([MemberStatus.ACTIVE, MemberStatus.INVITED])
        ).first()
        
        if existing:
            if existing.status == MemberStatus.ACTIVE:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This user is already a member of the campaign"
                )
            else:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="This user has already been invited"
                )
        
        # Create invitation (membership with INVITED status)
        # #region agent log
        debug_step = "create_invitation"
        # #endregion
        invitation = CampaignMember(
            campaign_id=campaign_id,
            user_id=invited_user.id,
            is_creator=False,
            status=MemberStatus.INVITED,
            invited_by_id=current_user.id  # Track who sent the invitation
        )
        # #region agent log
        debug_step = "db_add"
        # #endregion
        db.add(invitation)
        # #region agent log
        debug_step = "db_commit"
        # #endregion
        db.commit()
        
        return {"message": f"Invitation sent to {invite_data.email}"}
    # #region agent log - debug error handler
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        error_detail = f"[DEBUG] Failed at step '{debug_step}': {type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        print(error_detail)  # Log to Render console
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_detail
        )
    # #endregion


@router.get("/{campaign_id}/pending-invitations", response_model=List[CampaignPendingInviteResponse])
def get_campaign_pending_invitations(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all invited and active members for this campaign. Only the creator can view."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only creator can view/manage invitations
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign creator can view pending invitations"
        )
    
    # Get all invited AND active members (excluding the creator themselves)
    members = db.query(CampaignMember).options(
        joinedload(CampaignMember.user)
    ).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status.in_([MemberStatus.INVITED, MemberStatus.ACTIVE]),
        CampaignMember.user_id != current_user.id  # Exclude creator from list
    ).all()
    
    return [
        CampaignPendingInviteResponse(
            id=m.id,
            user_id=m.user_id,
            email=m.user.email,
            status=m.status.value,
            invited_at=m.joined_at
        )
        for m in members
    ]


@router.post("/{campaign_id}/accept-invitation", response_model=CampaignJoinResponse)
def accept_invitation(
    campaign_id: int,
    accept_data: AcceptInvitation,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Accept a campaign invitation.
    
    You can optionally assign a character when accepting. The character can be:
    - A character you own
    - A shared character you have edit access to (as long as it's not already in use)
    """
    # Find the pending invitation
    invitation = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.INVITED
    ).first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending invitation found for this campaign"
        )
    
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    # Validate and assign character if provided (supports owned AND shared characters)
    if accept_data.character_id:
        character, error = _can_use_character_for_campaign(
            accept_data.character_id, current_user, campaign_id, db
        )
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=error
            )
        
        invitation.character_id = accept_data.character_id
        character.campaign_id = campaign_id
    
    # Update invitation to active membership and assign symbol
    invitation.status = MemberStatus.ACTIVE
    invitation.symbol = _get_available_symbol(campaign_id, db)
    
    db.commit()
    db.refresh(invitation)
    db.refresh(campaign)
    
    return CampaignJoinResponse(campaign=campaign, membership=invitation)


@router.delete("/{campaign_id}/decline-invitation", status_code=status.HTTP_204_NO_CONTENT)
def decline_invitation(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Decline a campaign invitation."""
    invitation = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.INVITED
    ).first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No pending invitation found for this campaign"
        )
    
    db.delete(invitation)
    db.commit()
    
    return None


@router.delete("/{campaign_id}/revoke-invitation/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_invitation(
    campaign_id: int,
    invitation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Remove a member or cancel an invitation. Only the campaign creator can do this."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only creator can remove members
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign creator can manage members"
        )
    
    # Find member (either invited or active)
    member = db.query(CampaignMember).filter(
        CampaignMember.id == invitation_id,
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status.in_([MemberStatus.INVITED, MemberStatus.ACTIVE])
    ).first()
    
    if not member:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found"
        )
    
    # Don't allow removing yourself (the creator)
    if member.user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot remove yourself from your own campaign"
        )
    
    db.delete(member)
    db.commit()
    
    return None
