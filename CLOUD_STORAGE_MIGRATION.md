# Cloud Storage Migration Guide

## Overview

The DandDy Character Manager has been upgraded to support **cloud storage** via the backend API. Characters can now be stored in a PostgreSQL database and accessed across devices, while maintaining full backward compatibility with localStorage.

## What's New

### ✅ Features Implemented

1. **Cloud Authentication System**
   - User registration and login
   - JWT token-based authentication
   - Session persistence
   - Secure logout

2. **Hybrid Storage Architecture**
   - Automatic cloud storage when authenticated
   - Seamless fallback to localStorage when offline or logged out
   - No loss of functionality in either mode

3. **Data Migration Tools**
   - One-click migration from localStorage to cloud
   - Automatic backup before migration
   - Migration status tracking with error handling

4. **Full CRUD Operations in Cloud**
   - Create, Read, Update, Delete characters
   - Character duplication
   - Import/Export functionality
   - Portrait generation and storage

5. **Enhanced UI**
   - Login/Register modal
   - User status display in header
   - Migration prompt for existing users
   - Cloud sync indicators

## Architecture

### File Structure

```
character-manager-api.js          # New cloud API service
├── AuthService                   # Authentication management
├── CharacterCloudStorage         # Cloud CRUD operations
└── MigrationService             # localStorage → Cloud migration

character-manager.js              # Updated with hybrid storage
├── CharacterStorage (Hybrid)    # Intelligent routing between cloud/local
├── AppState (Async)             # Now handles async operations
└── Auth UI Handlers             # Login, register, logout, migration
```

### Storage Flow

```
┌─────────────────────┐
│  User Action        │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│ CharacterStorage    │──── Is user authenticated?
│  (Hybrid Layer)     │
└──────────┬──────────┘
           │
           ├─── YES ──▶ CharacterCloudStorage ──▶ API ──▶ PostgreSQL
           │
           └─── NO  ──▶ localStorage (Fallback)
```

## How to Use

### For Users (Character Manager)

#### First Time Setup

1. **Open Character Manager** (`character-manager.html`)
2. **Click "LOGIN"** button in the header
3. **Register a new account:**
   - Enter username, email, and password
   - Click "REGISTER"
4. **Migration Prompt** (if you have existing characters):
   - A modal will appear asking to migrate local characters
   - Click "MIGRATE NOW" to upload them to the cloud
   - A backup JSON file will be downloaded automatically
5. **Start using cloud storage!**
   - All operations now sync to the cloud
   - Characters are accessible from any device

#### Switching Between Local and Cloud

**Cloud Mode (Authenticated):**
- Header shows: `☁️ [username]`
- All characters stored in cloud database
- Sync across devices
- Click "LOGOUT" to switch to local mode

**Local Mode (Guest):**
- Header shows: `💾 Local Storage`
- Characters stored in browser localStorage
- Device-specific storage
- Click "LOGIN" to switch to cloud mode

### For Developers (Backend Setup)

#### Prerequisites

```bash
# Install backend dependencies
cd backend
pip install -r requirements.txt
```

#### Environment Variables

Create `backend/.env`:

```bash
DATABASE_URL=postgresql://user:password@localhost:5432/danddy
SECRET_KEY=your-secret-key-here
OPENAI_API_KEY=your-openai-key  # For AI portrait generation
```

#### Start Backend Server

```bash
cd backend
python main.py
# Server runs on http://localhost:8000
```

#### Database Setup

The backend automatically creates tables on first run using SQLAlchemy models:

- `users` - User accounts and authentication
- `characters` - Character data with full D&D attributes
- `campaigns` - Campaign management (future feature)

## API Endpoints

### Authentication

```
POST   /api/auth/register      # Create new user
POST   /api/auth/token         # Login (OAuth2 password flow)
GET    /api/auth/me            # Get current user profile
```

### Characters

```
GET    /api/characters/        # List all user's characters
POST   /api/characters/        # Create new character
GET    /api/characters/{id}    # Get specific character
PUT    /api/characters/{id}    # Update character
DELETE /api/characters/{id}    # Delete character
POST   /api/characters/{id}/duplicate  # Duplicate character
GET    /api/characters/{id}/export     # Export character JSON
POST   /api/characters/import          # Import character
```

### AI Features

```
GET    /api/ai/status          # Check AI availability
POST   /api/ai/portrait        # Generate AI portrait
POST   /api/ai/backstory       # Generate backstory (from builder)
```

## Data Format Mapping

The system intelligently maps between frontend character format and backend API schema:

### Frontend → Backend Mapping

| Frontend Field | Backend Field | Notes |
|---------------|---------------|-------|
| `character.class` | `character_class` | Class name |
| `character.abilities` | `strength`, `dexterity`, etc. | Split into individual fields |
| `character.hitPoints` | `hit_points_max`, `hit_points_current` | Object → separate fields |
| `character.equipment` | `inventory` | Array of strings → Array of objects |
| `character.languages` | `languages` | Direct mapping |
| `character.backstory` | `backstory` | Direct mapping |

### Portrait Data

Portrait data (ASCII art, URLs) is preserved in frontend format and not mapped to the backend schema, allowing for flexible client-side rendering.

## Error Handling & Fallbacks

### Automatic Fallback

If cloud operations fail, the system automatically falls back to localStorage:

```javascript
async getAll() {
    if (this.useCloud()) {
        try {
            return await CharacterCloudStorage.getAll();
        } catch (error) {
            console.error('☁️ Cloud fetch failed, falling back to local');
            showNotification('⚠️ Cloud sync failed. Showing local data.');
            return this._getLocalAll();  // ← Automatic fallback
        }
    }
    return this._getLocalAll();
}
```

### User Notifications

The system provides clear feedback for all operations:
- ✓ Success notifications (green)
- ⚠️ Warning notifications (yellow)  
- ❌ Error notifications (red)

### Offline Support

The hybrid architecture ensures the app works offline:
1. If not authenticated → use localStorage (always works offline)
2. If authenticated but offline → error with fallback suggestion
3. User can logout to work in local mode while offline

## Migration Safety

### Backup Creation

Before migration, a backup JSON file is automatically downloaded:
```
dnd-characters-backup-[timestamp].json
```

This file contains all characters and can be imported later if needed.

### Migration Process

1. **Backup** - Download backup JSON
2. **Upload** - Create characters in cloud one by one
3. **Verify** - Check success/failure count
4. **Clear** - Only clear localStorage if all succeeded
5. **Reload** - Load characters from cloud

### Migration Errors

If any character fails to migrate:
- Migration continues with others
- Failed characters remain in localStorage
- Detailed error report in console
- User can retry migration later

## Testing

### Manual Testing Checklist

#### Authentication Flow
- [ ] Register new account
- [ ] Login with credentials
- [ ] View user info in header
- [ ] Logout successfully

#### Character Operations (Cloud)
- [ ] Create new character (via import)
- [ ] View character details
- [ ] Edit character details
- [ ] Rename character
- [ ] Duplicate character
- [ ] Delete character
- [ ] Export character

#### Migration
- [ ] Migration prompt appears for local users
- [ ] Backup file downloads
- [ ] Characters migrate to cloud
- [ ] localStorage cleared after success
- [ ] Characters load from cloud

#### Portrait Generation
- [ ] Generate AI portrait (logged in)
- [ ] Portrait saves to cloud
- [ ] Portrait persists across sessions

#### Offline/Fallback
- [ ] Works without authentication
- [ ] Fallback to local on API errors
- [ ] Graceful error messages

### Backend Testing

Test the backend API directly:

```bash
# Register user
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "email": "test@example.com", "password": "testpass123"}'

# Login
curl -X POST http://localhost:8000/api/auth/token \
  -F "username=testuser" \
  -F "password=testpass123"

# Get characters (use token from login)
curl -X GET http://localhost:8000/api/characters/ \
  -H "Authorization: Bearer [your-token-here]"
```

## Troubleshooting

### "Not authenticated" errors
**Solution:** User needs to login. Check that JWT token is stored in localStorage.

### "Failed to save to cloud"
**Possible causes:**
- Backend server not running
- Database connection issues
- Token expired

**Solution:** Check backend logs, verify server is running on port 8000.

### Characters not loading
**Check:**
1. Is user authenticated? (Header should show username)
2. Are there errors in browser console?
3. Is backend server responding? (Check `/api/characters/`)

### Migration fails
**Solution:**
1. Backup was already created (check Downloads)
2. Characters remain in localStorage (safe)
3. Try migrating again after fixing backend issues
4. Can import characters manually if needed

## Security Considerations

### Authentication
- Passwords hashed with bcrypt
- JWT tokens with expiration
- Tokens stored in localStorage (client-side)
- HTTPS recommended for production

### API Security
- All character endpoints require authentication
- Users can only access their own characters
- DM permissions for campaign management

### Data Privacy
- Characters linked to user accounts
- No cross-user data access
- Portraits stored as URLs (external storage)

## Future Enhancements

### Planned Features
- [ ] Campaign sharing between users
- [ ] Real-time sync notifications
- [ ] Conflict resolution for offline edits
- [ ] Image upload to cloud storage
- [ ] Character versioning/history

### Performance Optimizations
- [ ] Client-side caching with Service Workers
- [ ] Optimistic UI updates
- [ ] Batch operations for sync
- [ ] Lazy loading of character details

## Conclusion

The cloud storage migration provides a robust, user-friendly way to sync D&D characters across devices while maintaining full backward compatibility with localStorage. The hybrid architecture ensures the app works in all scenarios: authenticated, unauthenticated, online, and offline.

**Key Benefits:**
✅ No data loss during migration
✅ Seamless fallback to local storage
✅ Cross-device character sync
✅ Production-ready authentication
✅ Full backward compatibility

---

**Branch:** `feature/cloud-storage`
**Status:** ✅ Complete and ready for testing
**Last Updated:** 2025-11-20

