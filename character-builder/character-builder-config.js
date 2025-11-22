// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

// Production backend URL (deployed on Render)
const PRODUCTION_BACKEND_URL = 'https://danddy-api.onrender.com';

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 10000, // 10 seconds - then fallback (but keep trying in background)
  
  // AI Feature Toggle
  // Set to false to disable AI features (will use fallback text instead)
  // Set to true to enable AI features (requires backend server to be running)
  ENABLE_AI: true, // ✅ Backend is deployed and ready!
  
  // SECURE: Always use the production backend proxy (Render)
  BACKEND_URL: PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  MAX_RETRIES: 2,
  
  // DEV MODE: Auto-login for development
  // When using the production backend from a local file server, we still
  // don't want auto-login; leave this disabled.
  DEV_AUTO_LOGIN: false,
  DEV_CREDENTIALS: {
    email: 'dev@test.com',
    password: 'dev123',
    role: 'player', // lowercase - will be converted by backend
  },
};


