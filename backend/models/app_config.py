"""
AppConfig model for storing application-wide settings like theme configuration.

This uses a simple key-value pattern where the 'key' column identifies the setting
and 'value' stores JSON-serializable data.
"""
from sqlalchemy import Column, Integer, String, Text, DateTime
from sqlalchemy.sql import func
from database.database import Base


class AppConfig(Base):
    """
    Stores application-wide configuration as key-value pairs.
    
    For theme configuration, we use key='theme_config' and store the full
    theme configuration object as JSON in the value column.
    """
    __tablename__ = "app_config"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, index=True, nullable=False)
    value = Column(Text, nullable=True)  # JSON-serializable string
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())
    updated_by_id = Column(Integer, nullable=True)  # User ID who last updated












