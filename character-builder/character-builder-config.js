// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

// Detect if running on GitHub Pages or locally
const isGitHubPages = window.location.hostname.includes('github.io');
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 30000, // 30 seconds
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Only try to connect to backend in local development
  BACKEND_URL: isLocalDevelopment ? 'http://localhost:8000' : null,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  API_KEY_STORAGE: 'dnd_openai_key', // DEPRECATED: Keys should be on backend
  AI_PORTRAITS_STORAGE: 'dnd_ai_portraits_enabled',
  DEMO_MODE_STORAGE: 'dnd_demo_mode_enabled',
  MAX_RETRIES: 2,
  // Disable AI features on GitHub Pages (no backend available)
  ENABLE_AI: isLocalDevelopment,
};


