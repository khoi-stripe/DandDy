// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

// Detect if running locally or on GitHub Pages
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';

// IMPORTANT: Update this with your Render app URL after deployment
const PRODUCTION_BACKEND_URL = 'https://your-render-app-name.onrender.com'; // ⚠️ Update this!

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 30000, // 30 seconds
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Local dev: localhost:8000, Production: Render URL
  BACKEND_URL: isLocalDevelopment ? 'http://localhost:8000' : PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  API_KEY_STORAGE: 'dnd_openai_key', // DEPRECATED: Keys should be on backend
  AI_PORTRAITS_STORAGE: 'dnd_ai_portraits_enabled',
  DEMO_MODE_STORAGE: 'dnd_demo_mode_enabled',
  MAX_RETRIES: 2,
};


