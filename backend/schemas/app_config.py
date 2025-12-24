"""
Pydantic schemas for app configuration API.
"""
from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class ThemeSectionConfig(BaseModel):
    """Configuration for a single theme section."""
    terminal: Optional[str] = "global"
    narrator: Optional[str] = "global"
    sheet: Optional[str] = "global"
    grid: Optional[str] = "global"
    campaign: Optional[str] = "global"
    glow: Optional[str] = "global"


class ThemeConfig(BaseModel):
    """Full theme configuration object."""
    globalTheme: str = "green"
    syncAllSections: bool = True
    sections: ThemeSectionConfig = ThemeSectionConfig()
    
    class Config:
        extra = "allow"  # Allow additional fields for forward compatibility


class ThemeConfigUpdate(BaseModel):
    """Payload for updating theme configuration."""
    globalTheme: Optional[str] = None
    syncAllSections: Optional[bool] = None
    sections: Optional[ThemeSectionConfig] = None


class ThemeConfigResponse(BaseModel):
    """Response for theme configuration."""
    globalTheme: str
    syncAllSections: bool
    sections: ThemeSectionConfig
    updated_at: Optional[datetime] = None
    updated_by_id: Optional[int] = None
    
    class Config:
        from_attributes = True


class AppConfigResponse(BaseModel):
    """Generic app config response."""
    key: str
    value: Any
    updated_at: Optional[datetime] = None
    updated_by_id: Optional[int] = None
    
    class Config:
        from_attributes = True


