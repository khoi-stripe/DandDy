from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from database.database import get_db
from models.user import User, UserRole
from models.campaign import Campaign
from models.character import Character
from schemas.campaign import CampaignCreate, CampaignUpdate, CampaignResponse, CampaignWithCharacters
from utils.auth import get_current_active_user

router = APIRouter(prefix="/campaigns", tags=["campaigns"])

@router.post("/", response_model=CampaignResponse, status_code=status.HTTP_201_CREATED)
def create_campaign(
    campaign_data: CampaignCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    # Only DMs can create campaigns
    if current_user.role != UserRole.DM:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only DMs can create campaigns"
        )
    
    new_campaign = Campaign(
        dm_id=current_user.id,
        **campaign_data.model_dump()
    )
    
    db.add(new_campaign)
    db.commit()
    db.refresh(new_campaign)
    
    return new_campaign

@router.get("/", response_model=List[CampaignResponse])
def get_campaigns(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    if current_user.role == UserRole.DM:
        # DMs see campaigns they own
        campaigns = db.query(Campaign).filter(Campaign.dm_id == current_user.id).all()
    else:
        # Players see campaigns they have characters in
        campaigns = db.query(Campaign).join(Character).filter(
            Character.owner_id == current_user.id
        ).distinct().all()
    
    return campaigns

@router.get("/{campaign_id}", response_model=CampaignWithCharacters)
def get_campaign(
    campaign_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Check access: DM owner can always access, players can access if they have a character
    if campaign.dm_id != current_user.id:
        has_character = db.query(Character).filter(
            Character.campaign_id == campaign_id,
            Character.owner_id == current_user.id
        ).first()
        
        if not has_character:
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only the DM owner can update
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this campaign"
        )
    
    update_data = campaign_update.model_dump(exclude_unset=True)
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
    campaign = db.query(Campaign).filter(Campaign.id == campaign_id).first()
    
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    # Only the DM owner can delete
    if campaign.dm_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this campaign"
        )
    
    db.delete(campaign)
    db.commit()
    
    return None


