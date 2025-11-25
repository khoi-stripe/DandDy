## ⚠️ Status: React Web App Archived (Do Not Use Right Now)

The `web/` directory contains a full React/Vite frontend that is **currently archived/disabled** on this machine.
Your laptop’s security setup is blocking key pieces of the React toolchain (Node/npm), so this path is **on ice for now**.

**All React/Vite work is officially tabled for now.** Please do not add new React features or spend time on the `web/` app until we explicitly revive this path.

**Use these instead for day-to-day work:**

- **Backend API**: `./start-backend.sh`
- **Classic frontends (no React required)**: `./start-frontend.sh`
  - Serves `character-manager.html`, `character-builder/index.html`, etc. on `http://localhost:8080`
- **Simple static viewer**: `web-simple/index.html` (pure HTML/JS)

**React launcher behavior:**

- `./start-react-app.sh` no longer starts any React or Node processes.
- It just prints a message pointing you to the non-React flows above.

If/when security is cleared and you want to revive the React app, you can restore the old
`start-react-app.sh` from git history and follow the archived docs below.

---

## DandDy Web App (React) - Archived Guide

A modern, responsive web application for managing D&D 5e characters. Works on any device with a browser!

## 🌐 What You Get

- **Universal Access** - Works on desktop, tablet, and mobile browsers
- **Modern UI** - Built with React, TypeScript, and Tailwind CSS
- **Real-time Sync** - All data syncs through the backend API
- **Responsive Design** - Optimized for all screen sizes
- **Fast Performance** - Built with Vite for instant dev server

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd web
npm install
```

### 2. Start Backend (in separate terminal)

```bash
cd backend
source venv/bin/activate
uvicorn main:app --reload
```

Backend runs on `http://localhost:8000`

### 3. Start Frontend

```bash
cd web
npm run dev
```

Frontend runs on `http://localhost:3000`

### 4. Open in Browser

Visit: **http://localhost:3000**

## 📁 Project Structure

```
web/
├── src/
│   ├── components/        # Reusable UI components
│   │   └── Layout.tsx     # Main layout with navigation
│   ├── pages/             # Page components
│   │   ├── AuthPage.tsx           # Login/Register
│   │   ├── Dashboard.tsx          # Home dashboard
│   │   ├── CharacterList.tsx      # List all characters
│   │   ├── CharacterCreation.tsx  # Create new character
│   │   ├── CharacterSheet.tsx     # View/edit character
│   │   ├── CampaignList.tsx       # Campaign list
│   │   └── Profile.tsx            # User profile
│   ├── stores/            # State management (Zustand)
│   │   ├── authStore.ts           # Authentication state
│   │   └── characterStore.ts      # Character state
│   ├── lib/              # Utilities
│   │   └── api.ts         # Axios API client
│   ├── types/            # TypeScript types
│   │   └── index.ts       # Type definitions
│   ├── config.ts          # App configuration
│   ├── App.tsx            # Main app component
│   ├── main.tsx           # Entry point
│   └── index.css          # Global styles
├── package.json           # Dependencies
├── vite.config.ts         # Vite configuration
├── tailwind.config.js     # Tailwind CSS config
└── tsconfig.json          # TypeScript config
```

## 🛠️ Technology Stack

- **React 18** - UI library
- **TypeScript** - Type safety
- **Vite** - Build tool & dev server
- **Tailwind CSS** - Styling
- **React Router** - Navigation
- **Zustand** - State management
- **Axios** - HTTP client
- **Lucide React** - Icons

## ✨ Features

### Authentication
- ✅ Login/Register with email
- ✅ JWT token authentication
- ✅ Auto-login on return
- ✅ Secure token storage (localStorage)
- ✅ Role-based access (Player/DM)

### Dashboard
- ✅ Quick stats overview
- ✅ Recent characters
- ✅ Quick actions
- ✅ Character count
- ✅ Total levels

### Character Management
- ✅ Create characters (simplified wizard)
- ✅ View all characters
- ✅ Character cards with HP bars
- ✅ Delete characters
- ✅ Full character sheet
- ✅ Tabs: Stats, Combat, Inventory
- ✅ Real-time HP management
- ✅ Death saving throws
- ✅ Conditions tracking
- ✅ Currency display

### Responsive Design
- ✅ Mobile-first approach
- ✅ Tablet optimized
- ✅ Desktop enhanced
- ✅ Touch-friendly buttons
- ✅ Mobile navigation menu

## 📱 Responsive Breakpoints

- **Mobile**: < 640px
- **Tablet**: 640px - 1024px  
- **Desktop**: > 1024px

Layout adapts automatically:
- Mobile: Single column, hamburger menu
- Tablet: 2-column grids
- Desktop: 3-column grids, persistent nav

## 🎨 Customization

### Change Colors

Edit `tailwind.config.js`:

```javascript
theme: {
  extend: {
    colors: {
      primary: {
        500: '#your-color',
        // ...
      }
    }
  }
}
```

### Change API URL

Edit `web/src/config.ts`:

```typescript
export const API_BASE_URL = 'http://your-backend-url:8000'
```

Or set environment variable:

```bash
VITE_API_URL=http://your-backend:8000 npm run dev
```

## 🚢 Deployment

### Build for Production

```bash
npm run build
```

Creates optimized build in `dist/` folder.

### Deploy Options

**1. Vercel (Recommended)**
```bash
npm install -g vercel
vercel
```

**2. Netlify**
```bash
npm install -g netlify-cli
netlify deploy
```

**3. Static Server**
```bash
npm run build
# Upload dist/ folder to any web server
```

**4. Docker**
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "preview"]
```

### Environment Variables

Create `.env` file:

```env
VITE_API_URL=https://your-backend-api.com
```

## 🔧 Development

### Run Dev Server
```bash
npm run dev
```

### Build for Production
```bash
npm run build
```

### Preview Production Build
```bash
npm run preview
```

### Lint Code
```bash
npm run lint
```

## 🧪 Testing

### Manual Testing

1. **Auth Flow**
   - Register new account
   - Logout
   - Login again
   - Verify persistence

2. **Character Creation**
   - Create character
   - Fill all fields
   - Roll stats
   - Submit

3. **Character Management**
   - View character sheet
   - Take damage
   - Heal
   - Check HP bar updates

4. **Responsive**
   - Resize browser
   - Test on mobile device
   - Check navigation menu

### Browser Testing

Test in:
- ✅ Chrome/Edge (Chromium)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile Safari (iOS)
- ✅ Chrome Mobile (Android)

## 🐛 Troubleshooting

### Backend Connection Issues

**Problem**: "Network Error" or "Cannot connect"

```bash
# Check backend is running
curl http://localhost:8000/health

# Check CORS is enabled
# Verify backend/main.py has:
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    ...
)
```

### Build Errors

**Problem**: TypeScript errors

```bash
# Clear node_modules and reinstall
rm -rf node_modules
npm install
```

**Problem**: Tailwind not working

```bash
# Verify tailwind.config.js content paths
content: [
  "./index.html",
  "./src/**/*.{js,ts,jsx,tsx}",
],
```

### Development Server Issues

**Problem**: Port 3000 already in use

```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9

# Or use different port
vite --port 3001
```

## 📊 Performance

- **First Load**: ~500ms (gzipped)
- **Page Transitions**: Instant (client-side routing)
- **API Calls**: < 100ms (local backend)
- **Bundle Size**: ~200KB (optimized)

## 🔐 Security

- ✅ JWT tokens in localStorage
- ✅ HTTPS in production (recommended)
- ✅ XSS protection (React default)
- ✅ CSRF protection (stateless API)
- ✅ Input validation
- ✅ Secure password handling (backend)

## 🌟 Features vs Native Apps

| Feature | Web App | iOS/macOS |
|---------|---------|-----------|
| **Access** | Any browser | Apple devices only |
| **Install** | No install needed | App Store / Xcode |
| **Updates** | Instant | Re-download app |
| **Offline** | Limited (PWA) | Full offline |
| **Performance** | Fast | Native speed |
| **Platform** | Universal | Platform-specific |
| **Development** | Single codebase | Separate codebases |

## 🎯 Roadmap

- [ ] Campaign management UI
- [ ] Spell list and tracking
- [ ] Inventory management
- [ ] Character leveling
- [ ] Export character to PDF
- [ ] Dark mode
- [ ] PWA (offline support)
- [ ] Real-time multiplayer
- [ ] Dice roller with animations

## 📚 Resources

- [React Docs](https://react.dev)
- [Vite Guide](https://vitejs.dev/guide/)
- [Tailwind CSS](https://tailwindcss.com/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)

## 💡 Tips

1. **Use Browser Dev Tools** - F12 to debug
2. **React DevTools** - Install browser extension
3. **Hot Reload** - Saves automatically refresh
4. **TypeScript** - Hover for type hints
5. **Tailwind** - Use IntelliSense extension

## 🤝 Contributing

The web app is built for easy customization:

1. Fork the project
2. Create feature branch
3. Make changes
4. Test thoroughly
5. Submit pull request

## 📄 License

Same as main DandDy project.

---

**Enjoy your D&D web app!** 🎲🌐

Need help? Check the main README or create an issue!

