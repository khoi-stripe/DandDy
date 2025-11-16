// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.

window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 30000, // 30 seconds
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  STORAGE_KEY: 'dnd_characters',
  API_KEY_STORAGE: 'dnd_openai_key',
  AI_PORTRAITS_STORAGE: 'dnd_ai_portraits_enabled',
  DEMO_MODE_STORAGE: 'dnd_demo_mode_enabled',
  MAX_RETRIES: 2,
  ENABLE_AI: true, // Set to false to disable all AI features
};


