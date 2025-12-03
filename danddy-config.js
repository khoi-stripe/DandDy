// Global configuration and shared utilities for the DandDy app (builder + manager).
// Exposes `window.DanddyConfig` (env + URLs) for all frontends to consume.

(function (global) {
  const location = global.location || {};

  const isLocalEnvironment =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.protocol === 'file:';

  // Single source of truth for backend origin & API base URL.
  //
  // IMPORTANT: Even when running the UI locally (localhost / file://), we now
  // ALWAYS talk to the production Render backend so that auth + cloud data are
  // consistent with the live site. If you ever need to point at a local
  // backend again, temporarily change BACKEND_ORIGIN below.
  const BACKEND_ORIGIN = 'https://danddy-api.onrender.com';

  // Many callers use either "<origin>/api" or "<origin>/api/..." directly.
  const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

  // Shared storage keys and flags
  const TOKEN_STORAGE_KEY = 'dnd_auth_token';
  const USER_STORAGE_KEY = 'dnd_user_info';
  const CHARACTER_STORAGE_KEY = 'dnd_characters';
  // Only treat local/file:// environments as "debug" to avoid noisy logs in production.
  const DEBUG = isLocalEnvironment;

  global.DanddyConfig = {
    isLocalEnvironment,
    BACKEND_ORIGIN,
    API_BASE_URL,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    CHARACTER_STORAGE_KEY,
    DEBUG,
  };

  // In non‑debug (production) environments, silence noisy console methods while
  // preserving errors and warnings. This lets us keep existing console.log calls
  // in the codebase without paying the runtime cost in production.
  if (!DEBUG && global.console) {
    try {
      ['log', 'info', 'debug'].forEach((method) => {
        if (typeof global.console[method] === 'function') {
          global.console[method] = () => {};
        }
      });
    } catch (e) {
      // Fail silently – logging should never break the app.
    }
  }
})(window);


