from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from database.database import get_db
from models.user import User
from models.prompt_entry import PromptEntry, EntryKind
from schemas.prompt_entry import (
    PromptEntryCreate,
    PromptEntryUpdate,
    PromptEntryResponse,
    PromptEntryBulkCreate,
)
from utils.auth import get_current_active_user

router = APIRouter(prefix="/prompt-entries", tags=["prompt-entries"])


@router.post("/", response_model=PromptEntryResponse, status_code=status.HTTP_201_CREATED)
def create_prompt_entry(
    entry_data: PromptEntryCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create a new prompt entry."""
    new_entry = PromptEntry(
        owner_id=current_user.id,
        kind=EntryKind(entry_data.kind.value),
        key=entry_data.key,
        description=entry_data.description,
        style_description=entry_data.style_description,
    )

    db.add(new_entry)
    db.commit()
    db.refresh(new_entry)

    return new_entry


@router.post("/bulk", response_model=List[PromptEntryResponse], status_code=status.HTTP_201_CREATED)
def bulk_create_prompt_entries(
    bulk_data: PromptEntryBulkCreate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Create multiple prompt entries at once (for import)."""
    created_entries = []

    for entry_data in bulk_data.entries:
        new_entry = PromptEntry(
            owner_id=current_user.id,
            kind=EntryKind(entry_data.kind.value),
            key=entry_data.key,
            description=entry_data.description,
            style_description=entry_data.style_description,
        )
        db.add(new_entry)
        created_entries.append(new_entry)

    db.commit()

    # Refresh all entries to get their IDs
    for entry in created_entries:
        db.refresh(entry)

    return created_entries


@router.get("/", response_model=List[PromptEntryResponse])
def get_prompt_entries(
    kind: Optional[str] = Query(None, description="Filter by entry kind (race, class, pose, camera, scene, style)"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get all prompt entries for the current user, optionally filtered by kind."""
    query = db.query(PromptEntry).filter(PromptEntry.owner_id == current_user.id)

    if kind:
        try:
            kind_enum = EntryKind(kind)
            query = query.filter(PromptEntry.kind == kind_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid kind: {kind}. Must be one of: race, class, pose, camera, scene, style",
            )

    return query.order_by(PromptEntry.kind, PromptEntry.key).all()


@router.get("/{entry_id}", response_model=PromptEntryResponse)
def get_prompt_entry(
    entry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Get a specific prompt entry."""
    entry = db.query(PromptEntry).filter(PromptEntry.id == entry_id).first()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt entry not found",
        )

    if entry.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to access this entry",
        )

    return entry


@router.put("/{entry_id}", response_model=PromptEntryResponse)
def update_prompt_entry(
    entry_id: int,
    entry_update: PromptEntryUpdate,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Update a prompt entry."""
    entry = db.query(PromptEntry).filter(PromptEntry.id == entry_id).first()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt entry not found",
        )

    if entry.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this entry",
        )

    # Update only provided fields
    update_data = entry_update.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field == "kind" and value is not None:
            value = EntryKind(value.value)
        setattr(entry, field, value)

    db.commit()
    db.refresh(entry)

    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_prompt_entry(
    entry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete a prompt entry."""
    entry = db.query(PromptEntry).filter(PromptEntry.id == entry_id).first()

    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Prompt entry not found",
        )

    if entry.owner_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this entry",
        )

    db.delete(entry)
    db.commit()

    return None


@router.delete("/", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_prompt_entries(
    kind: Optional[str] = Query(None, description="Delete only entries of this kind"),
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db),
):
    """Delete all prompt entries for the current user (optionally filtered by kind)."""
    query = db.query(PromptEntry).filter(PromptEntry.owner_id == current_user.id)

    if kind:
        try:
            kind_enum = EntryKind(kind)
            query = query.filter(PromptEntry.kind == kind_enum)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Invalid kind: {kind}",
            )

    query.delete()
    db.commit()

    return None

