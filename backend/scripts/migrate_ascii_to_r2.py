#!/usr/bin/env python3
"""
Migration script: Upload existing ASCII portraits to Cloudflare R2.

This reduces database egress from Supabase by storing ASCII portraits
(~12KB each) in R2, which has a more generous free tier (10GB vs 5GB).

Usage:
    cd backend
    python scripts/migrate_ascii_to_r2.py

Requirements:
    - R2 environment variables must be set (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, etc.)
    - Can be run multiple times safely (skips characters already migrated)

How it works:
    1. Finds all characters with ascii_portrait that's NOT a URL
    2. Uploads each ASCII to R2
    3. Updates the character's ascii_portrait field with the R2 URL
    4. Also handles custom_portrait_ascii if present
"""

import os
import sys
import time
import uuid

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from database.database import engine, get_settings

settings = get_settings()

# R2 configuration
R2_ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", settings.r2_account_id)
R2_ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", settings.r2_access_key_id)
R2_SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", settings.r2_secret_access_key)
R2_BUCKET_NAME = os.getenv("R2_BUCKET_NAME", settings.r2_bucket_name)
R2_PUBLIC_BASE_URL = os.getenv("R2_PUBLIC_BASE_URL", settings.r2_public_base_url)


def get_r2_client():
    """Build S3-compatible client for Cloudflare R2."""
    if not (R2_ACCOUNT_ID and R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_BUCKET_NAME):
        return None
    
    import boto3
    endpoint_url = f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
    
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        region_name="auto",
    )


def upload_ascii_to_r2(r2_client, ascii_text: str, prefix: str = "ascii") -> str | None:
    """Upload ASCII text to R2 and return the public URL."""
    try:
        timestamp = int(time.time())
        key = f"{prefix}/{timestamp}_{uuid.uuid4().hex}.txt"
        
        r2_client.put_object(
            Bucket=R2_BUCKET_NAME,
            Key=key,
            Body=ascii_text.encode('utf-8'),
            ContentType="text/plain; charset=utf-8",
        )
        
        if R2_PUBLIC_BASE_URL:
            base = R2_PUBLIC_BASE_URL.rstrip("/")
            return f"{base}/{key}"
        else:
            return f"https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com/{R2_BUCKET_NAME}/{key}"
    
    except Exception as e:
        print(f"  ❌ Upload failed: {e}")
        return None


def is_url(value: str) -> bool:
    """Check if a string looks like a URL (already migrated)."""
    return value.startswith("http://") or value.startswith("https://")


def migrate_ascii_portraits():
    """Migrate all ASCII portraits from database to R2."""
    r2_client = get_r2_client()
    
    if not r2_client:
        print("❌ R2 not configured. Set these environment variables:")
        print("   R2_ACCOUNT_ID")
        print("   R2_ACCESS_KEY_ID")
        print("   R2_SECRET_ACCESS_KEY")
        print("   R2_BUCKET_NAME")
        print("   R2_PUBLIC_BASE_URL (optional but recommended)")
        return False
    
    print(f"☁️  R2 configured: bucket={R2_BUCKET_NAME}")
    print()
    
    with engine.connect() as conn:
        # Find characters with ASCII portraits that need migration
        result = conn.execute(text("""
            SELECT id, name, ascii_portrait, custom_portrait_ascii
            FROM characters
            WHERE (ascii_portrait IS NOT NULL AND ascii_portrait != '')
               OR (custom_portrait_ascii IS NOT NULL AND custom_portrait_ascii != '')
        """))
        
        characters = result.fetchall()
        print(f"📋 Found {len(characters)} characters with portrait data")
        print()
        
        migrated = 0
        skipped = 0
        failed = 0
        
        for char_id, name, ascii_portrait, custom_ascii in characters:
            print(f"Character #{char_id}: {name}")
            
            updates = {}
            
            # Handle ascii_portrait
            if ascii_portrait and not is_url(ascii_portrait):
                print(f"  📤 Uploading ascii_portrait ({len(ascii_portrait)} bytes)...")
                url = upload_ascii_to_r2(r2_client, ascii_portrait, "ascii")
                if url:
                    updates["ascii_portrait"] = url
                    print(f"  ✅ Uploaded to {url[:60]}...")
                else:
                    failed += 1
            elif ascii_portrait and is_url(ascii_portrait):
                print(f"  ⏭️  ascii_portrait already migrated")
                skipped += 1
            
            # Handle custom_portrait_ascii
            if custom_ascii and not is_url(custom_ascii):
                print(f"  📤 Uploading custom_portrait_ascii ({len(custom_ascii)} bytes)...")
                url = upload_ascii_to_r2(r2_client, custom_ascii, "ascii-custom")
                if url:
                    updates["custom_portrait_ascii"] = url
                    print(f"  ✅ Uploaded to {url[:60]}...")
                else:
                    failed += 1
            elif custom_ascii and is_url(custom_ascii):
                print(f"  ⏭️  custom_portrait_ascii already migrated")
                skipped += 1
            
            # Update database
            if updates:
                set_clauses = ", ".join(f"{k} = :{k}" for k in updates)
                updates["id"] = char_id
                conn.execute(
                    text(f"UPDATE characters SET {set_clauses} WHERE id = :id"),
                    updates
                )
                migrated += 1
            
            print()
        
        conn.commit()
    
    print("=" * 50)
    print(f"✅ Migration complete!")
    print(f"   Migrated: {migrated}")
    print(f"   Skipped (already migrated): {skipped}")
    print(f"   Failed: {failed}")
    
    return failed == 0


if __name__ == "__main__":
    print("=" * 50)
    print("ASCII Portrait Migration: Database → Cloudflare R2")
    print("=" * 50)
    print()
    
    success = migrate_ascii_portraits()
    sys.exit(0 if success else 1)

