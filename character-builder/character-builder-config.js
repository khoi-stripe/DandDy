// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

// Detect if running on GitHub Pages or locally
const isGitHubPages = window.location.hostname.includes('github.io');
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';

// IMPORTANT: Update this with your Heroku app URL after deployment
const PRODUCTION_BACKEND_URL = 'https://your-heroku-app-name.herokuapp.com';

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 30000, // 30 seconds
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Local dev: localhost:8000, Production: Heroku URL
  BACKEND_URL: isLocalDevelopment ? 'http://localhost:8000' : PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  API_KEY_STORAGE: 'dnd_openai_key', // DEPRECATED: Keys should be on backend
  AI_PORTRAITS_STORAGE: 'dnd_ai_portraits_enabled',
  DEMO_MODE_STORAGE: 'dnd_demo_mode_enabled',
  MAX_RETRIES: 2,
  // AI features available in both local and production (with backend)
  ENABLE_AI: true,
};


