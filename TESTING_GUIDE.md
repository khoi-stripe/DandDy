# DandDy Testing Guide

Complete guide to testing the backend API, iOS app, and macOS app.

## Table of Contents
1. [Backend API Testing](#backend-api-testing)
2. [iOS App Testing](#ios-app-testing)
3. [macOS App Testing](#macos-app-testing)
4. [Integration Testing](#integration-testing)
5. [Manual Testing Scenarios](#manual-testing-scenarios)

---

## Backend API Testing

### 1. Start the Backend

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

**Expected Output:**
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process
INFO:     Started server process
INFO:     Waiting for application startup.
INFO:     Application startup complete.
```

### 2. Health Check

**Test 1: Basic Health Check**
```bash
curl http://localhost:8000/health
```

**Expected Response:**
```json
{"status":"healthy"}
```

**Test 2: API Root**
```bash
curl http://localhost:8000/
```

**Expected Response:**
```json
{"message":"Welcome to DandDy API"}
```

### 3. Test API Documentation

Open in browser:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc

**What to Check:**
✅ All endpoints are listed
✅ Auth, characters, and campaigns sections exist
✅ Can expand and see request/response schemas

### 4. Test Authentication Endpoints

**Test 3: Register a User**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "username": "testuser",
    "password": "password123",
    "role": "player"
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "email": "testuser@example.com",
  "username": "testuser",
  "role": "player"
}
```

**Test 4: Login**
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@example.com",
    "password": "password123"
  }'
```

**Expected Response:**
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer"
}
```

**Save the token for next tests:**
```bash
export TOKEN="your-token-here"
```

**Test 5: Get Current User**
```bash
curl http://localhost:8000/auth/me \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
{
  "id": 1,
  "email": "testuser@example.com",
  "username": "testuser",
  "role": "player"
}
```

### 5. Test Character Endpoints

**Test 6: Create a Character**
```bash
curl -X POST http://localhost:8000/characters/ \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Thorin Ironshield",
    "race": "Dwarf",
    "character_class": "Fighter",
    "level": 1,
    "background": "Soldier",
    "alignment": "lawful_good",
    "strength": 16,
    "dexterity": 12,
    "constitution": 15,
    "intelligence": 10,
    "wisdom": 13,
    "charisma": 8,
    "hit_points_max": 12,
    "hit_points_current": 12,
    "armor_class": 16,
    "speed": 25,
    "saving_throw_proficiencies": ["strength", "constitution"],
    "skill_proficiencies": ["Athletics", "Intimidation"]
  }'
```

**Expected Response:**
```json
{
  "id": 1,
  "owner_id": 1,
  "name": "Thorin Ironshield",
  "race": "Dwarf",
  "character_class": "Fighter",
  "level": 1,
  ...
}
```

**Test 7: Get All Characters**
```bash
curl http://localhost:8000/characters/ \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:**
```json
[
  {
    "id": 1,
    "name": "Thorin Ironshield",
    ...
  }
]
```

**Test 8: Get Single Character**
```bash
curl http://localhost:8000/characters/1 \
  -H "Authorization: Bearer $TOKEN"
```

**Test 9: Update Character (Take Damage)**
```bash
curl -X PUT http://localhost:8000/characters/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "hit_points_current": 8
  }'
```

**Test 10: Delete Character**
```bash
curl -X DELETE http://localhost:8000/characters/1 \
  -H "Authorization: Bearer $TOKEN"
```

### 6. Test Campaign Endpoints (DM Only)

**Register a DM:**
```bash
curl -X POST http://localhost:8000/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dm@example.com",
    "username": "dungeonmaster",
    "password": "password123",
    "role": "dm"
  }'
```

**Login as DM and get token:**
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "dm@example.com",
    "password": "password123"
  }'

export DM_TOKEN="dm-token-here"
```

**Test 11: Create Campaign**
```bash
curl -X POST http://localhost:8000/campaigns/ \
  -H "Authorization: Bearer $DM_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Lost Mine of Phandelver",
    "description": "A classic D&D adventure"
  }'
```

**Test 12: Get Campaign with Characters**
```bash
curl http://localhost:8000/campaigns/1 \
  -H "Authorization: Bearer $DM_TOKEN"
```

### 7. Test Error Cases

**Test 13: Invalid Credentials**
```bash
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "wrong@example.com",
    "password": "wrongpassword"
  }'
```

**Expected Response:** 401 Unauthorized

**Test 14: Missing Authentication**
```bash
curl http://localhost:8000/characters/
```

**Expected Response:** 401 Unauthorized

**Test 15: Non-existent Character**
```bash
curl http://localhost:8000/characters/9999 \
  -H "Authorization: Bearer $TOKEN"
```

**Expected Response:** 404 Not Found

### 8. Database Verification

**Check database directly:**
```bash
psql dandy_db

-- View users
SELECT id, username, email, role FROM users;

-- View characters
SELECT id, name, race, character_class, level, owner_id FROM characters;

-- View campaigns
SELECT id, name, dm_id FROM campaigns;

-- Exit
\q
```

---

## iOS App Testing

### 1. Setup iOS Simulator

1. Open Xcode
2. Select **Product → Destination → iPhone 15 Pro** (or any simulator)
3. Build and Run (**Cmd+R**)

### 2. Test Authentication Flow

**Test 1: Registration**
1. Launch app
2. Tap **"Don't have an account? Register"**
3. Fill in:
   - Email: `ios-test@example.com`
   - Username: `iostester`
   - Password: `password123`
   - Confirm Password: `password123`
   - Role: **Player**
4. Tap **Register**

**Expected:**
✅ User is registered
✅ Automatically logged in
✅ Redirected to main app (Characters tab)

**Test 2: Logout and Login**
1. Go to **Profile** tab
2. Tap **Logout**
3. Should see login screen
4. Enter credentials
5. Tap **Login**

**Expected:**
✅ Successfully logged in
✅ Back to Characters tab
✅ Profile shows correct user

### 3. Test Character Creation

**Test 3: Create Character**
1. Go to **Characters** tab
2. Tap **+** button
3. Follow wizard:

**Step 1 - Basic Info:**
- Name: `Legolas`
- Race: `Elf`
- Class: `Ranger`
- Background: `Outlander`
- Alignment: `Chaotic Good`
- Tap **Next**

**Step 2 - Ability Scores:**
- Tap **"Roll All"** button OR
- Manually set scores
- Tap **Next**

**Step 3 - Skills:**
- Select 3 skills (Ranger gets 3)
- Tap **Next**

**Step 4 - Personality:**
- Add backstory (optional)
- Tap **Next**

**Step 5 - Review:**
- Verify all info
- Tap **Create Character**

**Expected:**
✅ Character appears in list
✅ Shows correct race/class/level
✅ HP bar visible
✅ Can tap to view details

### 4. Test Character Sheet

**Test 4: View Character**
1. Tap on created character
2. Navigate through tabs:

**Stats Tab:**
✅ Ability scores show correct modifiers
✅ Saving throws display
✅ Skills list with proficiency markers
✅ Proficiency bonus correct for level

**Combat Tab:**
✅ HP displays correctly
✅ Can take damage
✅ Can heal
✅ Can add temp HP
✅ Death saves appear when HP = 0
✅ Can add/remove conditions

**Inventory Tab:**
✅ Currency displays
✅ Items list (if any)
✅ Weight calculation

**Spells Tab:**
✅ Shows spellcasting info (if applicable)
✅ Spell slots display
✅ Known spells list

**Notes Tab:**
✅ Backstory displays
✅ Personality traits show

### 5. Test Combat Tracking

**Test 5: HP Management**
1. Open character sheet → **Combat** tab
2. Enter `5` in damage field
3. Tap **Take Damage**
4. **Expected:** HP reduces by 5

5. Enter `3` in heal field
6. Tap **Heal**
7. **Expected:** HP increases by 3 (max = max HP)

8. Enter `10` in temp HP field
9. Tap **Set Temp HP**
10. **Expected:** Shield icon shows temp HP

**Test 6: Death Saves**
1. Take enough damage to reach 0 HP
2. **Expected:** Death save section appears
3. Tap circles to toggle successes/failures
4. Tap **Roll Death Save**
5. **Expected:** 
   - Roll d20
   - On 1: +2 failures
   - On 20: regain 1 HP
   - On 10+: +1 success
   - On <10: +1 failure

**Test 7: Conditions**
1. Tap **+** in Conditions section
2. Select a condition (e.g., "Prone")
3. **Expected:** Condition badge appears
4. Tap **X** on badge
5. **Expected:** Condition removed

### 6. Test Campaign Features

**Test 8: Create Campaign (DM only)**
1. Register/login as DM
2. Go to **Campaigns** tab
3. Tap **+** button
4. Enter name and description
5. Tap **Create**
6. **Expected:** Campaign appears in list

**Test 9: View Campaign**
1. Tap on campaign
2. **Expected:**
   - Shows campaign details
   - Shows characters in campaign
   - Each character has card with stats

### 7. Test Data Persistence

**Test 10: App Restart**
1. Force quit app (swipe up in app switcher)
2. Relaunch app
3. **Expected:**
   - Still logged in (token in Keychain)
   - Characters still visible
   - Character data unchanged

**Test 11: Logout and Data**
1. Logout
2. Login with different account
3. **Expected:**
   - Different user's characters show
   - Previous user's data not visible

### 8. Test Error Handling

**Test 12: Network Error**
1. Stop backend server
2. Try to create character
3. **Expected:** Error alert shows

**Test 13: Invalid Login**
1. Logout
2. Try to login with wrong credentials
3. **Expected:** Error message displays

---

## macOS App Testing

### 1. Setup macOS Build

1. Open Xcode
2. Select **My Mac** as destination
3. Build and Run (**Cmd+R**)

### 2. Test Desktop UI

**Test 1: Three-Pane Layout**
1. Launch app
2. Login
3. **Expected:**
   - Left: Sidebar visible
   - Middle: Character list
   - Right: Empty state or character detail

**Test 2: Sidebar Navigation**
1. Click **Characters** in sidebar
2. **Expected:** Character list shows
3. Click **Campaigns**
4. **Expected:** Campaign list shows
5. Click **Profile**
6. **Expected:** Profile info shows

**Test 3: Window Resizing**
1. Resize window smaller
2. **Expected:** Minimum size enforced (900x600)
3. Resize larger
4. **Expected:** Layout adapts

### 3. Test Keyboard Shortcuts

**Test 4: New Character Shortcut**
1. Press **Cmd+N**
2. **Expected:** Character creation sheet opens

**Test 5: New Campaign Shortcut (DM only)**
1. Login as DM
2. Go to Campaigns
3. Press **Cmd+Shift+N**
4. **Expected:** Campaign creation sheet opens

**Test 6: Other Shortcuts**
- **Cmd+,** → Settings window opens
- **Cmd+W** → Window closes
- **Cmd+Q** → App quits

### 4. Test Menu Bar

**Test 7: File Menu**
1. Click **File** → **New Character**
2. **Expected:** Character creation opens

**Test 8: Character Menu**
1. Open a character
2. Click **Character** → **Roll Dice**
3. **Expected:** Dice roll action (check notifications)

### 5. Test Settings Window

**Test 9: Preferences**
1. Press **Cmd+,** or **DandDy → Preferences**
2. Change API URL
3. Click **Save**
4. **Expected:** Setting persists
5. Click **Reset to Default**
6. **Expected:** URL resets to localhost:8000

### 6. Test Context Menus

**Test 10: Right-Click Character**
1. Right-click on character in list
2. **Expected:** Context menu appears
3. Click **Delete**
4. **Expected:** Character deleted

### 7. Test Desktop-Specific Features

**Test 11: Multiple Windows**
1. Open character sheet
2. Try to open another window
3. **Expected:** macOS handles multiple windows

**Test 12: Sidebar Toggle**
1. Click sidebar toggle button (top-left)
2. **Expected:** Sidebar hides/shows

---

## Integration Testing

### Full Workflow Test

**Scenario: Complete D&D Session Prep**

1. **Backend Setup** (1 min)
   ```bash
   # Start backend
   cd backend && source venv/bin/activate
   uvicorn main:app --reload
   ```

2. **Create DM Account** (iOS or macOS)
   - Register as DM
   - Create campaign "Test Adventure"

3. **Create Player Accounts** (iOS or macOS)
   - Register 3 players
   - Each creates 1 character
   - Join campaign

4. **DM Views Campaign** (macOS recommended)
   - Login as DM
   - Open campaign
   - See all 3 characters

5. **Simulate Combat** (iOS or macOS)
   - Player 1: Take 10 damage
   - Player 2: Heal 5 HP
   - Player 3: Add "Prone" condition

6. **Verify Sync**
   - DM refreshes campaign view
   - Should see updated HP/conditions

**Expected Results:**
✅ All accounts work independently
✅ Changes sync through backend
✅ DM can see all characters
✅ Players only see their own

---

## Manual Testing Scenarios

### Scenario 1: Character Leveling Up

1. Create level 1 character
2. Test updating level to 2
3. Verify HP maximum can increase
4. Add new class features
5. Select new skills (if applicable)

### Scenario 2: Full Combat Encounter

1. Start with full HP character
2. Take damage from "enemy attack"
3. Use healing potion
4. Add temporary HP from spell
5. Take massive damage → 0 HP
6. Roll death saves
7. Stabilize (3 successes)
8. Heal back to consciousness

### Scenario 3: Spellcaster Management

1. Create spellcaster (Wizard, level 3)
2. Add spell slots (level 1: 4, level 2: 2)
3. Add known spells
4. Mark some as prepared
5. Use spell slot (mark as used)
6. Long rest → reset slots

### Scenario 4: Inventory Tracking

1. Add starting equipment
2. Add gold from quest
3. Buy items (reduce gold)
4. Track weight
5. Sell items (increase gold)

### Scenario 5: Campaign Management (DM)

1. Create campaign
2. Invite players (share campaign ID)
3. Players add characters to campaign
4. View all characters in campaign
5. Track party resources
6. Remove character from campaign

---

## Automated Testing (Future)

### Backend Unit Tests (Recommended)

Create `backend/tests/test_api.py`:

```python
import pytest
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def test_health_check():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}

def test_register_user():
    response = client.post(
        "/auth/register",
        json={
            "email": "test@example.com",
            "username": "testuser",
            "password": "password123",
            "role": "player"
        }
    )
    assert response.status_code == 201
    assert "id" in response.json()

# Add more tests...
```

**Run tests:**
```bash
cd backend
pip install pytest
pytest
```

### iOS UI Tests (Recommended)

Create `DandDyUITests.swift`:

```swift
import XCTest

class DandDyUITests: XCTestCase {
    func testLoginFlow() {
        let app = XCUIApplication()
        app.launch()
        
        // Test login screen appears
        XCTAssertTrue(app.staticTexts["DandDy"].exists)
        
        // Fill in credentials
        app.textFields["Email"].tap()
        app.textFields["Email"].typeText("test@example.com")
        
        app.secureTextFields["Password"].tap()
        app.secureTextFields["Password"].typeText("password123")
        
        // Tap login
        app.buttons["Login"].tap()
        
        // Verify main screen
        XCTAssertTrue(app.tabBars.buttons["Characters"].exists)
    }
}
```

---

## Troubleshooting Tests

### Backend Issues

**Problem: Tests fail with "Connection refused"**
```bash
# Check if backend is running
curl http://localhost:8000/health

# Check PostgreSQL
psql -l | grep dandy_db

# Restart backend
uvicorn main:app --reload
```

**Problem: "Database does not exist"**
```bash
createdb dandy_db
```

**Problem: "Token invalid"**
```bash
# Get fresh token
curl -X POST http://localhost:8000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### iOS/macOS Issues

**Problem: "Cannot connect to backend"**
1. Check backend is running
2. Check `Config.swift` URL
3. For physical device, use Mac's IP not localhost
4. Check firewall settings

**Problem: "Character won't create"**
1. Check Xcode console for errors
2. Verify backend is receiving request
3. Check backend logs for errors
4. Verify all required fields filled

**Problem: "App crashes"**
1. Check Xcode console
2. Enable breakpoints
3. Check memory warnings
4. Verify API responses are valid

---

## Testing Checklist

### Before Release

**Backend:**
- [ ] All endpoints return correct status codes
- [ ] Authentication works
- [ ] Authorization prevents unauthorized access
- [ ] Data validation works
- [ ] Error messages are helpful
- [ ] Database constraints enforced

**iOS:**
- [ ] Runs on multiple iOS versions (16+)
- [ ] Works on different device sizes
- [ ] Handles offline gracefully
- [ ] No memory leaks
- [ ] Smooth animations
- [ ] Accessibility features work

**macOS:**
- [ ] Runs on macOS 13+
- [ ] Window resizing works
- [ ] Keyboard shortcuts work
- [ ] Menu items functional
- [ ] Settings persist
- [ ] Multiple windows work

**Integration:**
- [ ] Data syncs correctly
- [ ] Multiple users can coexist
- [ ] DM can see player characters
- [ ] Changes reflect in real-time
- [ ] No data loss on network errors

---

## Performance Testing

### Backend Load Test

```bash
# Install Apache Bench
brew install apache-bench

# Test API endpoint
ab -n 1000 -c 10 http://localhost:8000/health

# Test with authentication
ab -n 100 -c 5 -H "Authorization: Bearer $TOKEN" \
   http://localhost:8000/characters/
```

**Expected:**
- 200+ requests per second
- < 100ms average response time

### iOS Performance

1. Run app with Instruments
2. Check for:
   - Memory leaks
   - CPU usage spikes
   - Network efficiency
   - Battery usage

---

## Questions?

If tests fail:
1. Check error messages carefully
2. Verify all services running
3. Check logs (backend terminal, Xcode console)
4. Try restarting services
5. Clear data and try fresh

Happy testing! 🧪🎲


