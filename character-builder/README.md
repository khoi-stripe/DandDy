# DandDy Character Builder

A retro terminal-styled D&D 5e character creation tool with AI-powered personality.

## Features

- 🎮 **Retro Terminal Aesthetic** - Green-on-black interface with classic monospace styling
- 🤖 **AI-Powered Narrator** - Deadpan, cheeky commentary using OpenAI API
- ⌨️ **Keyboard Navigation** - Full keyboard support (Arrow keys + Enter)
- 📜 **Step-by-Step Creation** - Conversational flow that guides you through character building
- 🎨 **ASCII Art Portraits** - Character portraits that build progressively
- 💾 **Local Storage** - Characters saved in your browser
- 📤 **Export** - Download characters as JSON

## How to Use

1. **Open `index.html`** in a modern web browser
2. **Optional:** Add your OpenAI API key in Settings for AI-generated content
3. **Navigate** using arrow keys (↑↓) or mouse
4. **Select** options with Enter or click
5. **Build** your D&D character step by step

## Technology

- **Single HTML File** - No build tools or npm required
- **Vanilla JavaScript** - Clean, modular architecture ready for React migration
- **OpenAI API** - For dynamic dialogue, names, and backstories
- **localStorage** - Client-side data persistence
- **CSS Variables** - Easy theme customization

## Future Upgrades

- React/TypeScript migration
- Backend integration (FastAPI)
- AI-generated character portraits
- Campaign management
- Multiplayer support

## Development

The codebase is architected for easy migration:
- Component-like functions → React components
- Centralized state → Redux/Zustand
- Service abstractions → API clients
- Clean separation of concerns

---

**Version:** 1.0  
**Just for fun** - A personal project for D&D enthusiasts

