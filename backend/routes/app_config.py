"""
Routes for application-wide configuration, including theme settings.

The theme config is a public endpoint (GET) so any user can fetch the current theme,
but only admins can modify it (PUT).
"""
import json
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from database.database import get_db
from models.app_config import AppConfig
from models.user import User, UserRole
from schemas.app_config import ThemeConfig, ThemeConfigResponse, ThemeSectionConfig
from utils.auth import get_current_active_user


router = APIRouter(prefix="/config", tags=["config"])

# Default theme configuration
DEFAULT_THEME_CONFIG = {
    "globalTheme": "green",
    "syncAllSections": True,
    "sections": {
        "terminal": "global",
        "narrator": "global",
        "sheet": "global",
        "grid": "global",
        "campaign": "global",
        "glow": "global"
    }
}

THEME_CONFIG_KEY = "theme_config"


def require_admin(current_user: User = Depends(get_current_active_user)) -> User:
    """
    Restrict access to admin users only.
    """
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can modify app configuration.",
        )
    return current_user


@router.get("/themes", response_model=ThemeConfigResponse)
def get_theme_config(
    db: Session = Depends(get_db),
) -> ThemeConfigResponse:
    """
    Get the current theme configuration.
    
    This is a public endpoint - anyone can fetch the theme config.
    Returns the default theme if none has been set.
    """
    config = db.query(AppConfig).filter(AppConfig.key == THEME_CONFIG_KEY).first()
    
    if not config or not config.value:
        # Return default config
        return ThemeConfigResponse(
            globalTheme=DEFAULT_THEME_CONFIG["globalTheme"],
            syncAllSections=DEFAULT_THEME_CONFIG["syncAllSections"],
            sections=ThemeSectionConfig(**DEFAULT_THEME_CONFIG["sections"]),
            updated_at=None,
            updated_by_id=None
        )
    
    try:
        theme_data = json.loads(config.value)
    except json.JSONDecodeError:
        # Return default if stored value is invalid
        return ThemeConfigResponse(
            globalTheme=DEFAULT_THEME_CONFIG["globalTheme"],
            syncAllSections=DEFAULT_THEME_CONFIG["syncAllSections"],
            sections=ThemeSectionConfig(**DEFAULT_THEME_CONFIG["sections"]),
            updated_at=config.updated_at,
            updated_by_id=config.updated_by_id
        )
    
    # Merge with defaults to ensure all fields exist
    sections_data = {**DEFAULT_THEME_CONFIG["sections"], **theme_data.get("sections", {})}
    
    return ThemeConfigResponse(
        globalTheme=theme_data.get("globalTheme", DEFAULT_THEME_CONFIG["globalTheme"]),
        syncAllSections=theme_data.get("syncAllSections", DEFAULT_THEME_CONFIG["syncAllSections"]),
        sections=ThemeSectionConfig(**sections_data),
        updated_at=config.updated_at,
        updated_by_id=config.updated_by_id
    )


@router.put("/themes", response_model=ThemeConfigResponse)
def update_theme_config(
    theme_config: ThemeConfig,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
) -> ThemeConfigResponse:
    """
    Update the theme configuration.
    
    Only admins can update the theme config.
    """
    config = db.query(AppConfig).filter(AppConfig.key == THEME_CONFIG_KEY).first()
    
    # Prepare the config data as JSON
    config_data = {
        "globalTheme": theme_config.globalTheme,
        "syncAllSections": theme_config.syncAllSections,
        "sections": theme_config.sections.model_dump() if theme_config.sections else DEFAULT_THEME_CONFIG["sections"]
    }
    config_json = json.dumps(config_data)
    
    if config:
        # Update existing config
        config.value = config_json
        config.updated_by_id = current_user.id
    else:
        # Create new config
        config = AppConfig(
            key=THEME_CONFIG_KEY,
            value=config_json,
            updated_by_id=current_user.id
        )
        db.add(config)
    
    db.commit()
    db.refresh(config)
    
    return ThemeConfigResponse(
        globalTheme=config_data["globalTheme"],
        syncAllSections=config_data["syncAllSections"],
        sections=ThemeSectionConfig(**config_data["sections"]),
        updated_at=config.updated_at,
        updated_by_id=config.updated_by_id
    )

