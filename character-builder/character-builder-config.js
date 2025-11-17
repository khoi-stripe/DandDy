// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

// Detect if running locally or on GitHub Pages
const isLocalDevelopment = window.location.hostname === 'localhost' || 
                          window.location.hostname === '127.0.0.1' ||
                          window.location.protocol === 'file:';

// Production backend URL (deployed on Render)
const PRODUCTION_BACKEND_URL = 'https://danddy-api.onrender.com';

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 30000, // 30 seconds
  
  // AI Feature Toggle
  // Set to false to disable AI features (will use fallback text instead)
  // Set to true to enable AI features (requires backend server to be running)
  ENABLE_AI: true, // ✅ Backend is deployed and ready!
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Local dev: localhost:8000, Production: Render URL
  BACKEND_URL: isLocalDevelopment ? 'http://localhost:8000' : PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  MAX_RETRIES: 2,
};


