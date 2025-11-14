# macOS Desktop App Setup

This guide explains how to set up and run the **DandDy macOS desktop application**.

## Overview

The macOS app is a native desktop application built with SwiftUI that shares most of its code with the iOS app. It provides:

- **Three-pane layout**: Sidebar navigation, content list, and detail view
- **Keyboard shortcuts**: `Cmd+N` for new character, `Cmd+Shift+N` for new campaign, and more
- **Menu bar integration**: Custom menus for character actions
- **Settings window**: Configure API endpoint
- **Larger screen support**: Optimized for desktop use

## Creating the Xcode Project

### 1. Create New macOS Project

1. Open **Xcode**
2. **File → New → Project**
3. Select **macOS** → **App**
4. Configure:
   - **Product Name**: `DandDy-macOS`
   - **Team**: Your Apple ID (or None for local development)
   - **Organization Identifier**: `com.yourname.dandy-macos`
   - **Interface**: **SwiftUI**
   - **Language**: **Swift**
   - **Storage**: **None**
   - **Include Tests**: Unchecked
5. Save in the workspace folder

### 2. Add macOS-Specific Files

Add all files from `DandDy-macOS/` folder:
1. Right-click on project in Xcode
2. **Add Files to "DandDy-macOS"...**
3. Select all files in `DandDy-macOS/` folder
4. Make sure **"Copy items if needed"** is checked
5. **Target**: Check `DandDy-macOS`

### 3. Add Shared Code

The macOS app shares most code with the iOS app:

1. Right-click on project
2. **Add Files to "DandDy-macOS"...**
3. Select these folders from `DandDy/`:
   - `Models/`
   - `Services/`
   - `Utilities/`
   - `ViewModels/`
   - `Config.swift`
4. **Important**: Do NOT check "Copy items if needed" (share the files)
5. **Target**: Check both `DandDy` (iOS) and `DandDy-macOS` targets

### 4. Configure Project Settings

#### Deployment Target
- Select project in Xcode
- **General** tab
- Set **Minimum Deployments**: macOS 13.0 or later

#### App Icon (Optional)
- Assets.xcassets → AppIcon
- Add icon images for macOS (16x16 to 512x512)

#### Entitlements
- **Signing & Capabilities** tab
- Add capability: **Outgoing Connections (Client)** if needed

## Running the App

### 1. Start Backend

Make sure your backend is running:

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

### 2. Build and Run

1. In Xcode, select **My Mac** as the run destination
2. Press **Cmd+R** or click the Play button
3. The app will build and launch

### 3. First Launch

1. The auth screen will appear
2. Register or login with your credentials
3. Start creating characters!

## Features

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+N` | New Character |
| `Cmd+Shift+N` | New Campaign (DM only) |
| `Cmd+D` | Roll Dice |
| `Cmd+H` | Heal Character |
| `Cmd+Shift+H` | Take Damage |
| `Cmd+,` | Preferences |
| `Cmd+W` | Close Window |
| `Cmd+Q` | Quit App |

### Menu Bar

The app adds custom menu items:

- **File Menu**
  - New Character
  - New Campaign (DM only)

- **Character Menu**
  - Roll Dice
  - Take Damage
  - Heal

### Three-Pane Layout

1. **Sidebar** (Left): Navigation
   - Characters
   - Campaigns
   - Profile

2. **Content List** (Middle): Items in selected section
   - Character list with HP and level
   - Campaign list with descriptions
   - Profile information

3. **Detail View** (Right): Selected item details
   - Full character sheet with tabs
   - Campaign details with character cards
   - Empty state when nothing selected

### Settings

Access via **Cmd+,** or **DandDy → Preferences**:

- **API Configuration**: Change backend URL
- **Account Info**: View logged-in user details
- **About**: App version and information

## Shared vs macOS-Specific Code

### Shared Code (iOS + macOS)
Located in `DandDy/`:
- ✅ Models (User, Character, Campaign)
- ✅ Services (API Client, Auth, Character, Campaign)
- ✅ Utilities (Keychain, DiceRoller, D5eData)
- ✅ ViewModels (Auth, Character, Campaign)
- ✅ Config.swift

### macOS-Only Code
Located in `DandDy-macOS/`:
- 🖥️ DandDy_macOSApp.swift (App entry + menus)
- 🖥️ MacContentView.swift (Three-pane layout)
- 🖥️ MacAuthView.swift (Desktop auth UI)
- 🖥️ All Mac*View.swift files (Desktop-optimized UIs)
- 🖥️ SettingsView.swift (Preferences window)

### iOS-Only Code
Located in `DandDy/Views/`:
- 📱 TabView-based navigation
- 📱 Mobile-optimized layouts
- 📱 Touch-first interactions

## Configuration

### Change API Endpoint

**Method 1: Settings Window**
1. Open **Preferences** (`Cmd+,`)
2. Edit **API Base URL**
3. Click **Save**

**Method 2: UserDefaults**
```swift
// In code
UserDefaults.standard.set("http://192.168.1.100:8000", forKey: "apiBaseURL")
```

**Method 3: Edit Config.swift**
```swift
// DandDy/Config.swift
static let baseURL = "http://your-server:8000"
```

### Change App Bundle ID

1. Select project in Xcode
2. Select **DandDy-macOS** target
3. **Signing & Capabilities** tab
4. Change **Bundle Identifier**

## Building for Distribution

### Create App Bundle

1. In Xcode: **Product → Archive**
2. Wait for archive to complete
3. **Distribute App**
4. Choose **Copy App**
5. Select destination folder

The .app bundle can be shared with others (macOS 13.0+).

### Code Signing

For distribution outside the Mac App Store:
1. Get a **Developer ID Application** certificate
2. Xcode → **Signing & Capabilities**
3. Select your certificate
4. Archive and **Distribute** → **Developer ID**

## Troubleshooting

### "Can't connect to backend"
- Make sure backend is running: `curl http://localhost:8000/health`
- Check Settings → API Base URL
- Check firewall settings

### "Build failed - Duplicate symbol"
- Make sure shared files are not copied, just referenced
- Clean build folder: `Cmd+Shift+K`
- Rebuild: `Cmd+B`

### "App crashes on launch"
- Check Console app for crash logs
- Verify all files are added to the correct target
- Ensure Info.plist is properly configured

### "Menu shortcuts not working"
- Make sure app is in focus
- Check keyboard shortcuts don't conflict with system shortcuts

### "Settings window won't open"
- Verify SettingsView.swift is added to target
- Check project settings for Settings capability

## Differences from iOS App

| Feature | iOS | macOS |
|---------|-----|-------|
| Navigation | TabView | Three-pane NavigationSplitView |
| Layout | Single column | Multi-column with sidebar |
| Input | Touch | Mouse + Keyboard |
| Menus | Tab bar | Menu bar + context menus |
| Settings | In-app tab | Separate window (Cmd+,) |
| Windows | Single | Multiple windows supported |
| Size | Fixed by device | Resizable (min 900x600) |

## Development Tips

### Debug on macOS
- Use **Console.app** to view logs
- Set breakpoints in Xcode
- Use `print()` statements
- Check **Debug Navigator** in Xcode

### Hot Reload
- SwiftUI previews work for individual views
- Full app requires rebuild (Cmd+R)

### Testing
1. Test on different macOS versions (13.0+)
2. Test with different window sizes
3. Test keyboard shortcuts
4. Test menu items
5. Test with backend offline

## Performance

The macOS app is optimized for desktop use:
- **Efficient rendering**: Only visible content is rendered
- **Lazy loading**: Lists and grids load on-demand
- **Shared state**: ViewModels prevent duplicate API calls
- **Caching**: Character data cached during session

## Next Steps

1. **Customize UI**: Modify views to match your preferences
2. **Add features**: Dice roller, initiative tracker, etc.
3. **Improve UX**: Add animations, better error handling
4. **Distribute**: Share with your D&D group!

## Resources

- [SwiftUI Documentation](https://developer.apple.com/documentation/swiftui/)
- [macOS Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/macos)
- [D&D 5e SRD](https://dnd.wizards.com/resources/systems-reference-document)

Enjoy your desktop D&D character manager! 🎲🖥️


