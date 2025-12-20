from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from database.database import get_db
from models.user import User
from models.character import Character
from models.campaign import Campaign
from models.session import Session as GameSession, SessionStatus, SessionLog
from schemas.session import (
    SessionStart, SessionResponse, SessionWithLog,
    SessionLogCreate, SessionLogResponse
)
from utils.auth import get_current_active_user
from datetime import datetime

router = APIRouter(prefix="/sessions", tags=["sessions"])


@router.post("/start", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
def start_session(
    session_data: SessionStart,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Start a new play session for a character."""
    # Validate character ownership
    character = db.query(Character).filter(
        Character.id == session_data.character_id,
        Character.owner_id == current_user.id
    ).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found or not owned by you"
        )
    
    # Check for already active session
    active_session = db.query(GameSession).filter(
        GameSession.character_id == session_data.character_id,
        GameSession.status == SessionStatus.ACTIVE
    ).first()
    
    if active_session:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Character already has an active session. End it first."
        )
    
    # Validate campaign if provided
    campaign_id = session_data.campaign_id
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
    
    # Calculate session number for this character
    max_session_num = db.query(func.max(GameSession.session_number)).filter(
        GameSession.character_id == session_data.character_id
    ).scalar() or 0
    
    new_session = GameSession(
        campaign_id=campaign_id,
        character_id=session_data.character_id,
        user_id=current_user.id,
        session_number=max_session_num + 1,
        name=session_data.name,
        status=SessionStatus.ACTIVE
    )
    
    db.add(new_session)
    db.commit()
    db.refresh(new_session)
    
    return new_session


@router.post("/{session_id}/end", response_model=SessionWithLog)
def end_session(
    session_id: int,
    log_data: Optional[SessionLogCreate] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """End an active session and optionally submit post-session log."""
    session = db.query(GameSession).filter(
        GameSession.id == session_id,
        GameSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not owned by you"
        )
    
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not active"
        )
    
    # Update session
    session.status = SessionStatus.COMPLETED
    session.ended_at = datetime.utcnow()
    
    if log_data and log_data.session_name:
        session.name = log_data.session_name
    
    # Create session log if data provided
    if log_data:
        character = db.query(Character).filter(
            Character.id == session.character_id
        ).first()
        
        session_log = SessionLog(
            session_id=session.id,
            character_id=session.character_id,
            user_id=current_user.id,
            xp_gained=log_data.xp_gained,
            gold_change=log_data.gold_change,
            hp_before=character.hit_points_current if character else None,
            hp_after=log_data.hp_after,
            items_acquired=log_data.items_acquired,
            items_lost=log_data.items_lost,
            conditions=log_data.conditions,
            journal=log_data.journal
        )
        db.add(session_log)
        
        # Apply changes to character
        if character:
            # XP
            character.experience_points += log_data.xp_gained
            
            # Gold
            character.gold_pieces += log_data.gold_change
            
            # HP
            if log_data.hp_after is not None:
                character.hit_points_current = log_data.hp_after
            
            # Conditions
            if log_data.conditions:
                character.conditions = log_data.conditions
            
            # TODO: Handle level up detection based on XP thresholds
    
    db.commit()
    db.refresh(session)
    
    return session


@router.post("/{session_id}/cancel", response_model=SessionResponse)
def cancel_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Cancel an active session without logging."""
    session = db.query(GameSession).filter(
        GameSession.id == session_id,
        GameSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not owned by you"
        )
    
    if session.status != SessionStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Session is not active"
        )
    
    session.status = SessionStatus.CANCELLED
    session.ended_at = datetime.utcnow()
    
    db.commit()
    db.refresh(session)
    
    return session


@router.get("/active", response_model=Optional[SessionResponse])
def get_active_session(
    character_id: int = Query(..., description="Character ID to check"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get the active session for a character, if any."""
    # Verify character ownership
    character = db.query(Character).filter(
        Character.id == character_id,
        Character.owner_id == current_user.id
    ).first()
    
    if not character:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Character not found or not owned by you"
        )
    
    session = db.query(GameSession).filter(
        GameSession.character_id == character_id,
        GameSession.status == SessionStatus.ACTIVE
    ).first()
    
    return session


@router.get("/character/{character_id}", response_model=List[SessionWithLog])
def get_character_sessions(
    character_id: int,
    limit: int = Query(default=20, le=100),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get session history for a character."""
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
        from models.campaign_member import CampaignMember, MemberStatus
        is_campaign_member = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == character.campaign_id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE
        ).first() is not None
    
    if not is_owner and not is_campaign_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this character's sessions"
        )
    
    sessions = db.query(GameSession).filter(
        GameSession.character_id == character_id
    ).order_by(GameSession.started_at.desc()).limit(limit).all()
    
    return sessions


@router.get("/campaign/{campaign_id}", response_model=List[SessionWithLog])
def get_campaign_sessions(
    campaign_id: int,
    limit: int = Query(default=50, le=200),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get all sessions for a campaign."""
    # Verify campaign membership
    from models.campaign_member import CampaignMember, MemberStatus
    
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    is_member = db.query(CampaignMember).filter(
        CampaignMember.campaign_id == campaign_id,
        CampaignMember.user_id == current_user.id,
        CampaignMember.status == MemberStatus.ACTIVE
    ).first()
    
    if campaign.dm_id != current_user.id and not is_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this campaign's sessions"
        )
    
    sessions = db.query(GameSession).filter(
        GameSession.campaign_id == campaign_id
    ).order_by(GameSession.started_at.desc()).limit(limit).all()
    
    return sessions


@router.get("/{session_id}", response_model=SessionWithLog)
def get_session(
    session_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Get a specific session."""
    session = db.query(GameSession).filter(GameSession.id == session_id).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    # Check access: owner or campaign member
    is_owner = session.user_id == current_user.id
    is_campaign_member = False
    
    if session.campaign_id:
        from models.campaign_member import CampaignMember, MemberStatus
        is_campaign_member = db.query(CampaignMember).filter(
            CampaignMember.campaign_id == session.campaign_id,
            CampaignMember.user_id == current_user.id,
            CampaignMember.status == MemberStatus.ACTIVE
        ).first() is not None
    
    if not is_owner and not is_campaign_member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this session"
        )
    
    return session


@router.post("/{session_id}/log", response_model=SessionLogResponse)
def add_session_log(
    session_id: int,
    log_data: SessionLogCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """Add or update a session log (for backdated entries or updates)."""
    session = db.query(GameSession).filter(
        GameSession.id == session_id,
        GameSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found or not owned by you"
        )
    
    # Check if log already exists
    existing_log = db.query(SessionLog).filter(
        SessionLog.session_id == session_id
    ).first()
    
    character = db.query(Character).filter(
        Character.id == session.character_id
    ).first()
    
    if existing_log:
        # Update existing log
        existing_log.xp_gained = log_data.xp_gained
        existing_log.gold_change = log_data.gold_change
        existing_log.hp_after = log_data.hp_after
        existing_log.items_acquired = log_data.items_acquired
        existing_log.items_lost = log_data.items_lost
        existing_log.conditions = log_data.conditions
        existing_log.journal = log_data.journal
        existing_log.submitted_at = datetime.utcnow()
        
        db.commit()
        db.refresh(existing_log)
        return existing_log
    else:
        # Create new log
        new_log = SessionLog(
            session_id=session.id,
            character_id=session.character_id,
            user_id=current_user.id,
            xp_gained=log_data.xp_gained,
            gold_change=log_data.gold_change,
            hp_before=character.hit_points_current if character else None,
            hp_after=log_data.hp_after,
            items_acquired=log_data.items_acquired,
            items_lost=log_data.items_lost,
            conditions=log_data.conditions,
            journal=log_data.journal
        )
        db.add(new_log)
        
        # Update session name if provided
        if log_data.session_name:
            session.name = log_data.session_name
        
        db.commit()
        db.refresh(new_log)
        return new_log

