"""
One-time migration script to generate usernames for existing users from email prefix.
Run this before making the username column NOT NULL.

Algorithm:
1. For each user without a username, extract the email prefix (before @)
2. Sanitize to only allow alphanumeric + underscore, 3-30 chars
3. If collision, append incrementing numbers (foo, foo1, foo2, etc.)
"""
import os
import sys
import re

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker


def sanitize_username(raw: str) -> str:
    """
    Convert a raw string (e.g., email prefix) into a valid username.
    Rules: 3-30 chars, alphanumeric + underscore only.
    """
    # Replace common separators with underscores
    sanitized = re.sub(r'[.\-+]', '_', raw.lower())
    # Remove anything not alphanumeric or underscore
    sanitized = re.sub(r'[^a-z0-9_]', '', sanitized)
    # Collapse multiple underscores
    sanitized = re.sub(r'_+', '_', sanitized)
    # Strip leading/trailing underscores
    sanitized = sanitized.strip('_')
    # Ensure minimum length
    if len(sanitized) < 3:
        sanitized = sanitized + '_user'
    # Truncate to max length (leaving room for collision suffix)
    if len(sanitized) > 25:
        sanitized = sanitized[:25]
    return sanitized


def migrate_usernames():
    # Get database URL from environment or use default
    database_url = os.getenv('DATABASE_URL', 'sqlite:///./danddy.db')
    
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Get all users without a username (or with empty username)
        users = session.execute(text("""
            SELECT id, email, username FROM users 
            WHERE username IS NULL OR username = ''
        """)).fetchall()
        
        if not users:
            print("No users need username migration.")
            return
        
        print(f"Found {len(users)} users to migrate...")
        
        # Get all existing usernames to check for collisions
        existing = session.execute(text("""
            SELECT LOWER(username) FROM users 
            WHERE username IS NOT NULL AND username != ''
        """)).fetchall()
        taken_usernames = {u[0] for u in existing}
        
        total_updated = 0
        
        for user_id, email, current_username in users:
            # Extract email prefix
            email_prefix = email.split('@')[0] if '@' in email else email
            base_username = sanitize_username(email_prefix)
            
            # Find unique username
            candidate = base_username
            suffix = 1
            while candidate.lower() in taken_usernames:
                candidate = f"{base_username}{suffix}"
                suffix += 1
                # Safety check to avoid infinite loop
                if suffix > 9999:
                    candidate = f"{base_username}_{user_id}"
                    break
            
            # Update the user
            session.execute(text("""
                UPDATE users SET username = :username WHERE id = :id
            """), {"username": candidate, "id": user_id})
            
            taken_usernames.add(candidate.lower())
            total_updated += 1
            print(f"  User {user_id}: {email} -> @{candidate}")
        
        session.commit()
        print(f"\nDone! Assigned usernames to {total_updated} users.")
        
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    migrate_usernames()

