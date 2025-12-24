"""
One-time script to assign symbols to existing campaign members.
Run this after the migration to give all existing members unique symbols.
"""
import os
import sys
import random

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Available symbols
PARTY_SYMBOLS = [
    '▣', '▱', '▲', '△', '▶', '▷', '▼', '▽', '◈', '◉', '◎', '◐', '◑', '◒', '◓',
    '◧', '◨', '◩', '◪', '◫', '◯', '◆', '◇'
]

def assign_symbols():
    # Get database URL from environment or use default
    database_url = os.getenv('DATABASE_URL', 'sqlite:///./danddy.db')
    
    engine = create_engine(database_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Get all unique campaign IDs
        campaigns = session.execute(text("SELECT DISTINCT campaign_id FROM campaign_members")).fetchall()
        
        total_updated = 0
        
        for (campaign_id,) in campaigns:
            # Get all members in this campaign without a symbol
            members = session.execute(text("""
                SELECT id FROM campaign_members 
                WHERE campaign_id = :campaign_id AND (symbol IS NULL OR symbol = '')
            """), {"campaign_id": campaign_id}).fetchall()
            
            if not members:
                continue
            
            # Get already used symbols in this campaign
            used = session.execute(text("""
                SELECT symbol FROM campaign_members 
                WHERE campaign_id = :campaign_id AND symbol IS NOT NULL AND symbol != ''
            """), {"campaign_id": campaign_id}).fetchall()
            used_symbols = {s[0] for s in used}
            
            # Get available symbols
            available = [s for s in PARTY_SYMBOLS if s not in used_symbols]
            random.shuffle(available)
            
            # Assign symbols to members
            for i, (member_id,) in enumerate(members):
                if i < len(available):
                    symbol = available[i]
                    session.execute(text("""
                        UPDATE campaign_members SET symbol = :symbol WHERE id = :id
                    """), {"symbol": symbol, "id": member_id})
                    total_updated += 1
                    print(f"  Assigned {symbol} to member {member_id} in campaign {campaign_id}")
                else:
                    print(f"  Warning: No more symbols available for member {member_id} in campaign {campaign_id}")
        
        session.commit()
        print(f"\nDone! Assigned symbols to {total_updated} members.")
        
    except Exception as e:
        session.rollback()
        print(f"Error: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    assign_symbols()

