from typing import List, Tuple, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from database.database import get_db
from models.user import User
from models.campaign import Campaign, CampaignStatus, generate_invite_code
from models.campaign_member import CampaignMember, MemberStatus
from models.character import Character
from models.character_collaborator import CharacterCollaborator, CollaboratorPermission
from schemas.campaign import (
    CampaignCreate, CampaignUpdate, CampaignResponse, CampaignWithCharacters,
    CampaignMemberResponse, CampaignJoin, CampaignJoinResponse,
    CampaignInviteByEmail, CampaignInvitationResponse, AcceptInvitation,
    CampaignPendingInviteResponse
)
from utils.auth import get_current_active_user

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


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
    
    # Check if character is already assigned to a different membership in ANY campaign
    # This prevents a shared character from being used by multiple people simultaneously
    existing_membership = db.query(CampaignMember).filter(
        CampaignMember.character_id == character_id,
        CampaignMember.status == MemberStatus.ACTIVE
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
    
    # Add creator as a member
    creator_member = CampaignMember(
        campaign_id=new_campaign.id,
        user_id=current_user.id,
        is_creator=True,
        status=MemberStatus.ACTIVE
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
    """Get all campaigns the user is a member of."""
    # Get campaigns where user is a member (via CampaignMember)
    campaigns = db.query(Campaign).join(CampaignMember).filter(
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).all()
    
    # Also include campaigns user created (backward compat - they should also be members)
    created_campaigns = db.query(Campaign).filter(
        Campaign.dm_id == current_user.id
    ).all()
    
    # Merge and deduplicate
    campaign_ids = {c.id for c in campaigns}
    for c in created_campaigns:
        if c.id not in campaign_ids:
            campaigns.append(c)
    
    return campaigns


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
            update_data["status"] = CampaignStatus(update_data["status"])
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
    
    # Create membership
    new_member = CampaignMember(
        campaign_id=campaign.id,
        user_id=current_user.id,
        character_id=join_data.character_id,
        is_creator=False,
        status=MemberStatus.ACTIVE
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
        joinedload(CampaignMember.character)
    ).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).all()
    
    return members


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
    
    # Mark as left (preserve history)
    membership.status = MemberStatus.LEFT
    
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
        joinedload(CampaignMember.campaign)
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
            invited_at=inv.joined_at
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
            status=MemberStatus.INVITED
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
    """Get all pending invitations sent from this campaign. Only the creator can view."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only creator can view pending invitations
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign creator can view pending invitations"
        )
    
    # Get all pending invitations with user email
    invitations = db.query(CampaignMember).options(
        joinedload(CampaignMember.user)
    ).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status == MemberStatus.INVITED
    ).all()
    
    return [
        CampaignPendingInviteResponse(
            id=inv.id,
            user_id=inv.user_id,
            email=inv.user.email,
            invited_at=inv.joined_at
        )
        for inv in invitations
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
    
    # Update invitation to active membership
    invitation.status = MemberStatus.ACTIVE
    
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
    """Revoke a campaign invitation. Only the campaign creator can revoke."""
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only creator can revoke
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign creator can revoke invitations"
        )
    
    invitation = db.query(CampaignMember).filter(
        CampaignMember.id == invitation_id,
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.status == MemberStatus.INVITED
    ).first()
    
    if not invitation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invitation not found"
        )
    
    db.delete(invitation)
    db.commit()
    
    return None
