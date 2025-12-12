#!/usr/bin/env python3
"""
Helper script to promote a user to admin role.
This allows bypassing rate limits for development and testing.

Usage:
    python make_admin.py your@email.com
"""

import sys
from database.database import SessionLocal
from models.user import User, UserRole


def make_admin(email: str):
    """Promote a user to admin role by email address."""
    db = SessionLocal()
    try:
        # Find user by email
        user = db.query(User).filter(User.email == email).first()
        
        if not user:
            print(f"❌ User not found with email: {email}")
            print("\nAvailable users:")
            all_users = db.query(User).all()
            if all_users:
                for u in all_users:
                    print(f"   - {u.email} (role: {u.role.value})")
            else:
                print("   (no users in database)")
            return False
        
        # Check if already admin
        if user.role == UserRole.ADMIN:
            print(f"ℹ️  {email} is already an admin!")
            return True
        
        # Promote to admin
        old_role = user.role.value
        user.role = UserRole.ADMIN
        db.commit()
        
        print(f"✅ Successfully promoted {email} from {old_role} to admin!")
        print(f"\n🎉 {email} can now bypass all rate limits!")
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False
    finally:
        db.close()


def list_users():
    """List all users in the database."""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        if not users:
            print("No users found in database.")
            return
        
        print("\n📋 All users:")
        print("-" * 60)
        for user in users:
            role_icon = "👑" if user.role == UserRole.ADMIN else "👤"
            print(f"{role_icon} {user.email:40} | {user.role.value}")
        print("-" * 60)
        print(f"Total: {len(users)} users")
        
    finally:
        db.close()


def main():
    if len(sys.argv) < 2:
        print("Usage: python make_admin.py <email>")
        print("       python make_admin.py --list")
        print("\nExamples:")
        print("  python make_admin.py admin@example.com")
        print("  python make_admin.py --list")
        sys.exit(1)
    
    if sys.argv[1] == "--list" or sys.argv[1] == "-l":
        list_users()
        return
    
    email = sys.argv[1]
    
    print(f"🔧 Promoting {email} to admin...")
    success = make_admin(email)
    
    if success:
        print("\n💡 Tip: Restart your backend if it's already running for changes to take effect.")
    
    sys.exit(0 if success else 1)


if __name__ == "__main__":
    main()

