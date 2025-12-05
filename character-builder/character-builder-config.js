// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.
//
// Detect if running locally (localhost/127.0.0.1) or from file:// (static testing)
// Prefer the shared DanddyConfig when available so all frontends agree.
const isLocalDevelopment =
  (window.DanddyConfig && window.DanddyConfig.isLocalEnvironment) ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.protocol === 'file:';
//
// Backend origin (deployed on Render or local dev) – single source of truth
const PRODUCTION_BACKEND_URL =
  (window.DanddyConfig && window.DanddyConfig.BACKEND_ORIGIN) ||
  'https://danddy-api.onrender.com';
//
window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 40000, // 40 seconds - then fallback (but keep trying in background)
  
  // AI Feature Toggles
  //
  // - ENABLE_AI: master switch. When false, all AI calls are skipped and
  //   local fallback text/logic is used instead.
  // - ENABLE_AI_NARRATOR_COMMENTS: when false, narrator quips during the
  //   question flow never call the backend and always use local fallbacks.
  // - ENABLE_AI_OPTION_VARIATIONS: when false, option labels use their
  //   built‑in text instead of asking AI to rewrite them.
  // - NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER: hard cap on how many times
  //   the narrator will hit the backend per character creation run. After
  //   that, it automatically falls back to local lines.
  //
  // These defaults bias toward keeping the most impactful AI features
  // (names, backstory, portraits) while trimming narrator chatter and
  // cosmetic option-variation calls.
  ENABLE_AI: true,
  ENABLE_AI_NARRATOR_COMMENTS: false,
  ENABLE_AI_OPTION_VARIATIONS: false,
  NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER: 1,
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Use shared backend origin for all parts of the app
  BACKEND_URL: PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  MAX_RETRIES: 2,
  
  // DEV MODE: Auto-login for development when running locally
  DEV_AUTO_LOGIN: isLocalDevelopment,
  DEV_CREDENTIALS: {
    email: 'dev@test.com',
    password: 'dev12345',
    role: 'player', // lowercase - will be converted by backend
  },

  // Optional: public base URL for pre-generated portrait images stored in R2.
  // When set, pre-generated portraits will expose a usable original image URL
  // (used for "View Original Art" toggles in the builder/manager).
  //
  // Example:
  //   PREGENERATED_PORTRAIT_BASE_URL:
  //     'https://your-account-id.r2.dev/danddy-portraits/portraits/pregen'
  //
  // Leave as null to disable original image URLs for pre-generated portraits.
  PREGENERATED_PORTRAIT_BASE_URL: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/pregen',

  // Default image model for custom AI portraits.
  //
  // - "dall-e-3": current high-quality default
  // - "gpt-image-1": GPT Image 1 (new image model)
  //
  // The actual choice is stored per-browser via StorageService so both the
  // builder and manager stay in sync. This config value is only used as a
  // sane fallback when no explicit preference has been saved yet.
  DEFAULT_IMAGE_MODEL: 'gpt-image-1',

  // Default portrait view mode when no explicit preference has been saved yet.
  // - "ascii": show ASCII portraits by default
  // - "original": prefer original images when available
  DEFAULT_PORTRAIT_VIEW_MODE: 'original',

  // Default portrait prompt theme when no explicit preference has been saved yet.
  // This should match one of PortraitPrompt.getThemes().id values.
  DEFAULT_PORTRAIT_PROMPT_THEME: 'cinematic-inks',
};
