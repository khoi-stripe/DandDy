// Global configuration and shared utilities for the DandDy app (builder + manager).
// Exposes `window.DanddyConfig` (env + URLs) for all frontends to consume.

(function (global) {
  const location = global.location || {};

  const isLocalEnvironment =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.protocol === 'file:';

  // Single source of truth for backend origin & API base URL.
  // Local frontends (localhost / file://) talk to the local backend so you can
  // develop against your own API + Supabase DB. Everything else uses the
  // production Render backend.
  const BACKEND_ORIGIN = isLocalEnvironment
    ? 'http://localhost:8000'
    : 'https://danddy-api.onrender.com';

  // Many callers use either "<origin>/api" or "<origin>/api/..." directly.
  const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

  // Shared storage keys and flags
  const TOKEN_STORAGE_KEY = 'dnd_auth_token';
  const USER_STORAGE_KEY = 'dnd_user_info';
  const CHARACTER_STORAGE_KEY = 'dnd_characters';
  const DEBUG = false; // flip to true locally for verbose logging

  global.DanddyConfig = {
    isLocalEnvironment,
    BACKEND_ORIGIN,
    API_BASE_URL,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    CHARACTER_STORAGE_KEY,
    DEBUG,
  };
})(window);


