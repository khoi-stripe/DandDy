// Storage, AI, and portrait services for the DandDy terminal character builder.
// Exposes services as globals on window for use by inline handlers and other modules.

const CONFIG = window.CONFIG;
const DEBUG_BUILDER = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);
const DND_DATA = window.DND_DATA;
// Utils is defined globally in character-builder-utils.js as window.Utils.

// Image-to-ASCII converter (Enhanced with Floyd-Steinberg dithering)
const ImageToAsciiService = (window.ImageToAsciiService = {
  // Extended ASCII character set from lightest to darkest (reversed for correct mapping)
  // Black pixels (0) → light chars (spaces), White pixels (255) → dense chars ($@#)
  ASCII_CHARS:
    '  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$',

  // Convert image URL to ASCII art with Floyd-Steinberg dithering
  async convertToAscii(imageUrl, width = 160, height = 80) {
    try {
      // Load image
      const img = await this.loadImage(imageUrl);

      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw image scaled to canvas size
      ctx.drawImage(img, 0, 0, width, height);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;

      // Create grayscale array for Floyd-Steinberg dithering
      const grayscale = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        // Use proper luminance calculation (better than simple average)
        grayscale[i] =
          0.299 * pixels[idx] +
          0.587 * pixels[idx + 1] +
          0.114 * pixels[idx + 2];
      }

      // Apply Floyd-Steinberg dithering
      const dithered = this.floydSteinbergDither(grayscale, width, height);

      // Convert to ASCII
      let ascii = '';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const brightness = dithered[y * width + x];

          // Map brightness to ASCII character
          const charIndex = Math.floor(
            (brightness / 255) * (this.ASCII_CHARS.length - 1),
          );
          const clampedIndex = Math.max(
            0,
            Math.min(this.ASCII_CHARS.length - 1, charIndex),
          );
          ascii += this.ASCII_CHARS[clampedIndex];
        }
        ascii += '\n';
      }

      return ascii;
    } catch (error) {
      console.error('Image to ASCII conversion error:', error);
      return null;
    }
  },

  // Floyd-Steinberg dithering algorithm
  // Distributes quantization error to neighboring pixels for better detail
  floydSteinbergDither(grayscale, width, height) {
    const output = new Float32Array(grayscale);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = output[idx];

        // Quantize to ASCII character levels
        const newPixel =
          Math.round(
            (oldPixel / 255) * (this.ASCII_CHARS.length - 1),
          ) *
          (255 / (this.ASCII_CHARS.length - 1));
        output[idx] = newPixel;

        // Calculate quantization error
        const error = oldPixel - newPixel;

        // Distribute error to neighboring pixels
        // Floyd-Steinberg matrix:
        //         X   7/16
        // 3/16  5/16  1/16

        if (x + 1 < width) {
          output[idx + 1] += (error * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            output[idx + width - 1] += (error * 3) / 16;
          }
          output[idx + width] += (error * 5) / 16;
          if (x + 1 < width) {
            output[idx + width + 1] += error / 16;
          }
        }
      }
    }

    return output;
  },

  // Load image from URL (handles CORS intelligently)
  async loadImage(url) {
    // Helper to check if URL needs CORS proxy
    const needsProxy = (imageUrl) => {
      // Data URLs don't need proxy
      if (imageUrl.startsWith('data:')) return false;
      // Same-origin URLs don't need proxy
      try {
        const urlObj = new URL(imageUrl, window.location.origin);
        if (urlObj.origin === window.location.origin) return false;
      } catch (e) {
        // If URL parsing fails, assume it needs proxy
      }
      // R2 URLs (Cloudflare) have CORS enabled - don't proxy
      if (imageUrl.includes('.r2.cloudflarestorage.com') || 
          imageUrl.includes('danddy-portraits.') ||
          imageUrl.includes('pub-')) return false;
      // Azure blob storage URLs need proxy (DALL-E temporary URLs)
      if (imageUrl.includes('blob.core.windows.net') ||
          imageUrl.includes('oaidalleapiprodscus')) return true;
      // Default: try without proxy first
      return false;
    };

    // Helper to fetch and load image as blob
    const fetchAsBlob = async (fetchUrl) => {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image from blob'));
        };
        img.src = objectUrl;
      });
    };

    try {
      // For data URLs, load directly without fetch
      if (url.startsWith('data:')) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load data URL image'));
          img.src = url;
        });
      }

      // Try direct fetch first if proxy not needed
      if (!needsProxy(url)) {
        try {
          return await fetchAsBlob(url);
        } catch (directError) {
          console.warn('Direct fetch failed, trying CORS proxy:', directError.message);
          // Fall through to proxy attempt
        }
      }

      // Use CORS proxy for Azure blob storage URLs or as fallback
      // Try multiple proxies in case one is down/blocking
      const proxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      ];
      
      let lastError;
      for (const makeProxyUrl of proxies) {
        try {
          const proxiedUrl = makeProxyUrl(url);
          return await fetchAsBlob(proxiedUrl);
        } catch (proxyError) {
          console.warn('Proxy failed:', proxyError.message);
          lastError = proxyError;
        }
      }
      throw lastError || new Error('All CORS proxies failed');
    } catch (error) {
      console.error('Error loading image:', error);
      throw new Error(`Image loading failed: ${error.message}`);
    }
  },
});

// Authentication service is now defined centrally in `danddy-auth.js` as
// `window.AuthService`. This file now only *uses* that shared service.

// Storage service - wraps shared CharacterStorage facade for character CRUD,
// plus a few builder-only settings (narrator, demo/AI flags, etc.).
const StorageService = (window.StorageService = {
  getNarratorId() {
    const value = localStorage.getItem('dnd_narrator_id');
    // Fall back to the global DEFAULT_NARRATOR_ID defined in
    // `character-builder-narrators.js` when available so we keep the default
    // in a single place. If it's not present for any reason, use "scholarly".
    if (!value) {
      if (typeof DEFAULT_NARRATOR_ID !== 'undefined') {
        return DEFAULT_NARRATOR_ID;
      }
      return 'scholarly';
    }
    return value;
  },

  setNarratorId(narratorId) {
    localStorage.setItem('dnd_narrator_id', narratorId);
  },

  // Text speed multiplier for the builder typewriter effect.
  // 1 = normal (CONFIG.TYPEWRITER_SPEED), 1.5 = 1.5x faster, 2 = 2x faster.
  getTextSpeedMultiplier() {
    const value = localStorage.getItem('dnd_text_speed_multiplier');
    if (!value) return 1;

    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) {
      return 1;
    }

    // Clamp to the supported range in case older values exist.
    if (num < 1) return 1;
    if (num > 2) return 2;
    return num;
  },

  setTextSpeedMultiplier(multiplier) {
    const num = parseFloat(multiplier);
    if (!Number.isFinite(num) || num <= 0) {
      localStorage.removeItem('dnd_text_speed_multiplier');
      return;
    }
    localStorage.setItem('dnd_text_speed_multiplier', String(num));
  },

  // Preferred AI image model for custom portraits.
  // Stored per-browser so builder + manager can share the same choice.
  // Supported models:
  // - dall-e-3      (OpenAI DALL-E 3)
  // - gpt-image-1   (OpenAI GPT Image 1)
  // - gpt-image-1.5 (OpenAI GPT Image 1.5 - faster, better text)
  // - flux-1.1-pro  (Replicate Flux Pro - high quality)
  // - flux-schnell  (Replicate Flux Schnell - fast & cheap)
  getImageModel() {
    try {
      const raw = localStorage.getItem('dnd_image_model');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) ||
        'dall-e-3';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'flux-1.1-pro', 'flux-schnell'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getImageModel failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
    }
  },

  setImageModel(model) {
    try {
      const value = String(model || '').trim();
      const allowed = ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'flux-1.1-pro', 'flux-schnell'];
      if (!allowed.includes(value)) {
        console.warn('StorageService.setImageModel: ignoring unsupported model', value);
        // Clear invalid values so we fall back cleanly next time.
        localStorage.removeItem('dnd_image_model');
        return;
      }
      localStorage.setItem('dnd_image_model', value);
    } catch (e) {
      console.warn('StorageService.setImageModel failed', e);
    }
  },

  // Global portrait view preference (ASCII vs Original).
  // Stored per-browser so builder + manager can share the same choice.
  getPortraitViewMode() {
    try {
      const raw = localStorage.getItem('dnd_portrait_view_mode');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
      if (!raw) return fallback;
      const value = String(raw).trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn(
        'StorageService.getPortraitViewMode failed, using fallback',
        e,
      );
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
    }
  },

  setPortraitViewMode(mode) {
    try {
      const value = String(mode || '').trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      if (!allowed.includes(value)) {
        console.warn(
          'StorageService.setPortraitViewMode: ignoring unsupported mode',
          value,
        );
        localStorage.removeItem('dnd_portrait_view_mode');
        return;
      }
      localStorage.setItem('dnd_portrait_view_mode', value);
    } catch (e) {
      console.warn('StorageService.setPortraitViewMode failed', e);
    }
  },

  // Character grid sort mode preference.
  // Stored per-browser so the sort selection persists across page refreshes.
  getSortMode() {
    try {
      const raw = localStorage.getItem('dnd_sort_mode');
      const fallback = 'dateModified';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['alphabetical', 'dateModified', 'inCampaign', 'pinned'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getSortMode failed, using fallback', e);
      return 'dateModified';
    }
  },

  setSortMode(mode) {
    try {
      const value = String(mode || '').trim();
      const allowed = ['alphabetical', 'dateModified', 'inCampaign', 'pinned'];
      if (!allowed.includes(value)) {
        console.warn(
          'StorageService.setSortMode: ignoring unsupported mode',
          value,
        );
        localStorage.removeItem('dnd_sort_mode');
        return;
      }
      localStorage.setItem('dnd_sort_mode', value);
    } catch (e) {
      console.warn('StorageService.setSortMode failed', e);
    }
  },

  // Preferred portrait prompt theme for AI portraits.
  // Stored per-browser so builder + manager can share the same choice.
  getPortraitPromptTheme() {
    try {
      const raw = localStorage.getItem('dnd_portrait_prompt_theme');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
      if (!raw) return fallback;
      const value = String(raw).trim();

      // If the shared PortraitPrompt helper is available, validate against it
      // so we gracefully fall back when themes change.
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getThemes === 'function'
      ) {
        try {
          const themes = window.PortraitPrompt.getThemes();
          const allowedIds = Array.isArray(themes)
            ? themes.map((t) => t.id)
            : [];
          if (allowedIds.includes(value)) {
            return value;
          }
          return fallback;
        } catch (e) {
          // Non-fatal – fall through to returning the raw value.
        }
      }

      return value || fallback;
    } catch (e) {
      console.warn('StorageService.getPortraitPromptTheme failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
    }
  },

  setPortraitPromptTheme(themeId) {
    try {
      const value = String(themeId || '').trim();
      if (!value) {
        localStorage.removeItem('dnd_portrait_prompt_theme');
        return;
      }

      // If the shared PortraitPrompt helper is available, validate against it.
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getThemes === 'function'
      ) {
        try {
          const themes = window.PortraitPrompt.getThemes();
          const allowedIds = Array.isArray(themes)
            ? themes.map((t) => t.id)
            : [];
          if (!allowedIds.includes(value)) {
            console.warn(
              'StorageService.setPortraitPromptTheme: ignoring unknown theme id',
              value,
            );
            localStorage.removeItem('dnd_portrait_prompt_theme');
            return;
          }
        } catch (e) {
          // Non-fatal – if validation fails, still store the value.
        }
      }

      localStorage.setItem('dnd_portrait_prompt_theme', value);
    } catch (e) {
      console.warn('StorageService.setPortraitPromptTheme failed', e);
    }
  },

  // Image quality setting per model.
  // Returns the stored quality for a given model, or null if not set.
  // Quality options vary by model:
  // - dall-e-3: 'standard', 'hd'
  // - gpt-image-1: 'medium', 'high'
  // - flux-1.1-pro, flux-schnell: no quality options (always use default)
  getImageQuality(model) {
    try {
      const raw = localStorage.getItem('dnd_image_quality');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data[model] || null;
    } catch (e) {
      console.warn('StorageService.getImageQuality failed', e);
      return null;
    }
  },

  setImageQuality(model, quality) {
    try {
      let data = {};
      const raw = localStorage.getItem('dnd_image_quality');
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (e) {
          data = {};
        }
      }
      if (quality) {
        data[model] = quality;
      } else {
        delete data[model];
      }
      localStorage.setItem('dnd_image_quality', JSON.stringify(data));
    } catch (e) {
      console.warn('StorageService.setImageQuality failed', e);
    }
  },

  // Legacy support: check for old high quality setting and migrate
  // Returns true if quality should be 'high' for gpt-image-1
  getHighQualityGPTImage() {
    try {
      // First check new system
      const quality = this.getImageQuality('gpt-image-1');
      if (quality) {
        return quality === 'high';
      }
      // Fall back to legacy setting
      const raw = localStorage.getItem('dnd_high_quality_gpt_image');
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getHighQualityGPTImage failed', e);
      return false;
    }
  },

  setHighQualityGPTImage(enabled) {
    // Migrate to new system
    this.setImageQuality('gpt-image-1', enabled ? 'high' : 'medium');
    // Also remove legacy setting
    try {
      localStorage.removeItem('dnd_high_quality_gpt_image');
    } catch (e) {
      // Ignore
    }
  },

  // Show Class Features toggle (display-only reference panel on character sheet).
  // When enabled, shows a collapsible panel listing class features up to current level.
  getShowClassFeatures() {
    try {
      const raw = localStorage.getItem('dnd_show_class_features');
      // Default to true (on) - show class features by default
      if (raw === null || raw === undefined) return true;
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getShowClassFeatures failed', e);
      return true;
    }
  },

  setShowClassFeatures(enabled) {
    try {
      localStorage.setItem('dnd_show_class_features', enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('StorageService.setShowClassFeatures failed', e);
    }
  },

  // Show Descriptions toggle (global setting for character sheet).
  // When enabled, descriptions are shown inline for skills, class resources, features, etc.
  // When disabled, descriptions are hidden and shown on hover via tooltips.
  getShowDescriptions() {
    try {
      const raw = localStorage.getItem('dnd_show_descriptions');
      // Default to true (on) - show descriptions by default
      if (raw === null || raw === undefined) return true;
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getShowDescriptions failed', e);
      return true;
    }
  },

  setShowDescriptions(enabled) {
    try {
      localStorage.setItem('dnd_show_descriptions', enabled ? 'true' : 'false');
      // Dispatch event so any open character sheet can react
      window.dispatchEvent(new CustomEvent('danddy:showDescriptionsChanged', {
        detail: { showDescriptions: enabled }
      }));
    } catch (e) {
      console.warn('StorageService.setShowDescriptions failed', e);
    }
  },

  // ==== ACCOUNT-LEVEL PREFERENCES SYNC ====
  // These functions sync settings to the server when logged in.

  /**
   * Gather all current settings into a single preferences object.
   * @returns {object} All current preferences
   */
  getAllPreferences() {
    const prefs = {};
    
    // Color theme from theme config
    try {
      const themeConfig = localStorage.getItem('danddy_theme_config');
      if (themeConfig) {
        const parsed = JSON.parse(themeConfig);
        prefs.colorTheme = parsed.global || 'yellow';
      }
    } catch (e) { /* ignore */ }
    
    // Narrator ID
    prefs.narratorId = this.getNarratorId();
    
    // Text speed
    prefs.textSpeedMultiplier = this.getTextSpeedMultiplier();
    
    // Image model
    prefs.imageModel = this.getImageModel();
    
    // Image quality (per-model)
    try {
      const raw = localStorage.getItem('dnd_image_quality');
      if (raw) {
        prefs.imageQuality = JSON.parse(raw);
      }
    } catch (e) { /* ignore */ }
    
    // Portrait view mode
    prefs.portraitViewMode = this.getPortraitViewMode();
    
    // Portrait prompt theme
    prefs.portraitPromptTheme = this.getPortraitPromptTheme();
    
    // Show descriptions
    prefs.showDescriptions = this.getShowDescriptions();
    
    return prefs;
  },

  /**
   * Apply preferences from server to local storage.
   * @param {object} prefs - Preferences object from server
   */
  applyPreferences(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    
    // Color theme
    if (prefs.colorTheme) {
      try {
        const THEME_CONFIG_KEY = 'danddy_theme_config';
        let config = {
          global: 'yellow',
          syncAll: true,
          sections: {
            terminal: null, narrator: null, sheet: null,
            grid: null, campaign: null, modal: null, glow: null,
          },
        };
        const stored = localStorage.getItem(THEME_CONFIG_KEY);
        if (stored) {
          config = { ...config, ...JSON.parse(stored) };
        }
        config.global = prefs.colorTheme;
        localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
        // Dispatch event for theme loader
        window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
      } catch (e) {
        console.warn('StorageService: failed to apply color theme', e);
      }
    }
    
    // Narrator ID
    if (prefs.narratorId) {
      this.setNarratorId(prefs.narratorId);
    }
    
    // Text speed
    if (prefs.textSpeedMultiplier != null) {
      this.setTextSpeedMultiplier(prefs.textSpeedMultiplier);
    }
    
    // Image model
    if (prefs.imageModel) {
      this.setImageModel(prefs.imageModel);
    }
    
    // Image quality
    if (prefs.imageQuality && typeof prefs.imageQuality === 'object') {
      try {
        localStorage.setItem('dnd_image_quality', JSON.stringify(prefs.imageQuality));
      } catch (e) { /* ignore */ }
    }
    
    // Portrait view mode
    if (prefs.portraitViewMode) {
      this.setPortraitViewMode(prefs.portraitViewMode);
    }
    
    // Portrait prompt theme
    if (prefs.portraitPromptTheme) {
      this.setPortraitPromptTheme(prefs.portraitPromptTheme);
    }
    
    // Show descriptions
    if (prefs.showDescriptions != null) {
      this.setShowDescriptions(prefs.showDescriptions);
    }
    
    console.log('[StorageService] Applied preferences from server:', prefs);
  },

  /**
   * Sync current preferences to the server.
   * Only works when user is logged in.
   * @returns {Promise<boolean>} True if sync succeeded
   */
  async syncPreferencesToServer() {
    if (!window.AuthService || !AuthService.isAuthenticated()) {
      return false;
    }
    
    const prefs = this.getAllPreferences();
    const token = AuthService.getToken();
    const cfg = window.DanddyConfig || window.AppConfig || {};
    const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
    
    try {
      const response = await fetch(`${API_BASE}/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(prefs),
      });
      
      if (response.ok) {
        console.log('[StorageService] Preferences synced to server');
        return true;
      } else {
        console.warn('[StorageService] Failed to sync preferences:', response.status);
        return false;
      }
    } catch (e) {
      console.warn('[StorageService] Error syncing preferences:', e);
      return false;
    }
  },

  /**
   * Load preferences from the server and apply locally.
   * Called on login to sync settings across devices.
   * @returns {Promise<object|null>} The loaded preferences, or null if failed
   */
  async loadPreferencesFromServer() {
    if (!window.AuthService || !AuthService.isAuthenticated()) {
      return null;
    }
    
    const token = AuthService.getToken();
    const cfg = window.DanddyConfig || window.AppConfig || {};
    const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
    
    try {
      const response = await fetch(`${API_BASE}/auth/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const prefs = data.preferences || {};
        // Only apply if there are actual preferences stored
        if (Object.keys(prefs).length > 0) {
          this.applyPreferences(prefs);
        }
        return prefs;
      } else {
        console.warn('[StorageService] Failed to load preferences:', response.status);
        return null;
      }
    } catch (e) {
      console.warn('[StorageService] Error loading preferences:', e);
      return null;
    }
  },

  // ==== CHARACTER STORAGE ====
  // Delegates to shared CharacterStorage facade (character-storage.js)
  // which handles cloud/local storage, fallbacks, and timestamp normalization.

  /**
   * Get all characters via shared CharacterStorage facade.
   */
  async getCharacters() {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return [];
    }
    return CharacterStorage.getAll();
  },
  
  /**
   * Save character via shared CharacterStorage facade.
   * Automatically creates or updates based on presence of character.id.
   */
  async saveCharacter(character) {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return character;
    }

      if (character.id) {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Updating character via CharacterStorage:', character.id);
        }
      return CharacterStorage.update(character.id, character);
      } else {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Creating character via CharacterStorage');
        }
      return CharacterStorage.add(character);
    }
  },
  
  /**
   * Delete character via shared CharacterStorage facade.
   */
  async deleteCharacter(id) {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return false;
    }
    return CharacterStorage.delete(id);
  },
});

// ASCII Art service
// Now relies primarily on pre-generated custom portraits.
const AsciiArtService = (window.AsciiArtService = {
  // Simple in-memory cache for portraits keyed by race|class.
  _portraitCache: {},
  // Legacy hardcoded ASCII templates have been removed now that
  // we rely on custom, pre-generated portraits under generated_portraits/.
  // These helpers remain so existing callers continue to work.
  getRaceArt(race) {
    return '';
  },

  addClassDecoration(baseArt, classType) {
    return baseArt;
  },

  getFullPortrait(character) {
    if (!character || !character.race) return '';
    const raceLabel = String(character.race).toUpperCase();
    const classLabel = character.class ? ` ${String(character.class).toUpperCase()}` : '';
    return `[ ${raceLabel}${classLabel} PORTRAIT ]`;
  },

  // Load pre-generated ASCII portrait from files
  async loadPreGeneratedPortrait(race, classType) {
    const raceLower = race.toLowerCase().replace(/ /g, '-');
    const classLower = classType ? classType.toLowerCase() : '';

    // Try race-class combo first
    if (classLower) {
      const path = `generated_portraits/ascii/${raceLower}-${classLower}.txt`;
      if (DEBUG_BUILDER) console.log(`📂 Trying to load: ${path}`);
      try {
        const response = await fetch(path);
        if (DEBUG_BUILDER) console.log(`📡 Response status: ${response.status}`);
        if (response.ok) {
          const text = await response.text();
          if (DEBUG_BUILDER) console.log(`✅ Loaded ${raceLower}-${classLower}, length: ${text.length}`);
          return text;
        }
      } catch (e) {
        if (DEBUG_BUILDER) console.log(`❌ Error loading ${raceLower}-${classLower}:`, e);
      }
    }

    // Fallback to race-only
    const path = `generated_portraits/ascii/${raceLower}.txt`;
    if (DEBUG_BUILDER) console.log(`📂 Trying fallback: ${path}`);
    try {
      const response = await fetch(path);
      if (DEBUG_BUILDER) console.log(`📡 Response status: ${response.status}`);
      if (response.ok) {
        const text = await response.text();
        if (DEBUG_BUILDER) console.log(`✅ Loaded ${raceLower}, length: ${text.length}`);
        return text;
      }
    } catch (e) {
      if (DEBUG_BUILDER) console.log(`❌ Error loading ${raceLower}:`, e);
    }

    if (DEBUG_BUILDER) console.log(`❌ No portrait found for ${raceLower}`);
    return null;
  },

  // Get the image URL for a pre-generated portrait
  getPreGeneratedImageUrl(race, classType) {
    // Pre-generated *image* URLs are intentionally disabled. We only support
    // user-generated portrait images (from AI generation) as "original art".
    return null;
  },

  // Load portrait (pre-generated or fallback to template)
  async generateAIPortrait(character) {
    try {
      if (!character) return '';

      // If there's custom AI-generated ASCII art, use that first
      if (character.customPortraitAscii) {
        console.log('✅ Using custom AI-generated portrait');
        return character.customPortraitAscii;
      }

      // Determine the current race/class key for this character
      const key = `${character.race || ''}|${character.class || ''}`;

      // If there's already ASCII art stored in character (from pre-generated or previous load)
      // and it matches the current race/class combination, reuse it.
      if (character.asciiPortrait && character.asciiPortraitKey === key) {
        console.log('✅ Using stored ASCII portrait for current race/class');
        return character.asciiPortrait;
      }

      // If we have a cached portrait for this race/class combo, use it.
      if (this._portraitCache[key]) {
        return this._portraitCache[key];
      }

      // Try loading pre-generated portrait from files
      console.log('Loading pre-generated portrait...');
      const preGenerated = await this.loadPreGeneratedPortrait(
        character.race,
        character.class,
      );
      if (preGenerated) {
        console.log(
          `✅ Found pre-generated portrait for ${character.race}-${character.class}`,
        );
        this._portraitCache[key] = preGenerated;

        // Store ASCII art in character for export
        if (window.CharacterState) {
          const updates = {
            asciiPortrait: preGenerated,
            asciiPortraitKey: key,
          };

          window.CharacterState.updateCharacter(updates);
        }

        return this._portraitCache[key];
      }

      // Fallback to template art
      console.log('No pre-generated portrait, using template');
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;

      // Store fallback ASCII art in character for export
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({
          asciiPortrait: fallback,
          asciiPortraitKey: key,
        });
      }
      
      return fallback;
    } catch (error) {
      console.error('Portrait loading error:', error);
      const key = `${character.race || ''}|${character.class || ''}`;
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;

      // Store fallback ASCII art in character for export
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({
          asciiPortrait: fallback,
          asciiPortraitKey: key,
        });
      }
      
      return fallback;
    }
  },

  // Generate CUSTOM AI portrait with DALL-E (user-initiated)
  async generateCustomAIPortrait(character, options = {}) {
    try {
      console.log('🎨 Generating custom AI portrait with DALL-E...');

      // Step 1: Generate image with DALL-E
      const imageUrl = await AIService.generatePortraitImage(character, options);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return { asciiArt, imageUrl };
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },

  // Generate CUSTOM AI portrait with custom prompt
  async generateCustomAIPortraitWithPrompt(customPrompt) {
    try {
      console.log('🎨 Generating custom AI portrait with custom prompt...');
      console.log('Prompt:', customPrompt);

      // Step 1: Generate image with DALL-E using custom prompt
      const imageUrl = await AIService.generateImageFromPrompt(customPrompt);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return { asciiArt, imageUrl };
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },
});

// External AI service integrations (Secure backend proxy)
const AIService = (window.AIService = {
  // Track the last narrator comment so we can avoid obvious repetition.
  _lastNarratorComment: null,
  // Track whether we've already allowed an "Ah, the classic..."-style line
  // for the current character generation run.
  _usedClassicThisRun: false,
  // Track how many AI narrator comments we've made for the current character.
  _narratorCommentCount: 0,
  // Track used names across this browser session to avoid repeats
  // and increase diversity of generated suggestions.
  _usedFirstNames: new Set(),
  _usedLastNames: new Set(),
  _usedFullNames: new Set(),
  
  // Backend availability tracking (for Render cold starts)
  _backendAvailable: null, // null = unknown, true = available, false = waking up
  _warmupInProgress: false,

  resetNarratorSession() {
    this._lastNarratorComment = null;
    this._usedClassicThisRun = false;
    this._narratorCommentCount = 0;
  },

  // Background warmup: Keep trying to wake up the backend
  async warmupBackend() {
    if (this._warmupInProgress || this._backendAvailable === true) {
      return;
    }
    
    this._warmupInProgress = true;
    console.log('%c🔄 WARMUP: Waking up backend server...', 'color: #fa0; font-weight: 500');
    
    while (this._backendAvailable !== true) {
      try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.available) {
            this._backendAvailable = true;
            console.log('%c✅ WARMUP: Backend is now ready!', 'color: #0f0; font-weight: 500');
            this._warmupInProgress = false;
            return;
          }
        }
      } catch (error) {
        // Keep trying
      }
      
      // Wait 5 seconds before trying again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    this._warmupInProgress = false;
  },

  // Helper to add timeout to fetch requests (for Render cold starts)
  async fetchWithTimeout(url, options, timeoutMs = CONFIG.AI_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Attach auth token when available so backend can apply per-user quotas
      // and admin bypass (instead of falling back to IP-based limits).
      let finalOptions = options || {};
      try {
        const token =
          window.AuthService && typeof AuthService.getToken === 'function'
            ? AuthService.getToken()
            : null;
        if (token) {
          const existingHeaders = (finalOptions && finalOptions.headers) || {};
          const mergedHeaders = { ...existingHeaders };
          if (!mergedHeaders.Authorization && !mergedHeaders.authorization) {
            mergedHeaders.Authorization = `Bearer ${token}`;
          }
          finalOptions = { ...finalOptions, headers: mergedHeaders };
        }
      } catch (e) {
        // Non-fatal: continue without auth header
      }

      const response = await fetch(url, {
        ...finalOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // Mark backend as available on successful response
      if (response.ok) {
        this._backendAvailable = true;
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        // Backend is waking up - start background warmup
        this._backendAvailable = false;
        this.warmupBackend(); // Don't await - let it run in background
        throw new Error('Request timed out - backend may be waking up');
      }
      throw error;
    }
  },

  async generateCompletion(prompt, systemPrompt = null) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled in config');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/chat/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          system_prompt: systemPrompt,
          max_tokens: 300,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        // Check for safety system rejection
        if (response.status === 400) {
          try {
            const errorData = await response.json();
            if (errorData.detail && errorData.detail.includes('safety system')) {
              console.warn('⚠️ OpenAI safety system rejection:', errorData.detail);
              // Show user-friendly notification
              if (window.UIService) {
                window.UIService.showNotification(
                  'OpenAI flagged this request. Using fallback response instead.',
                  'warning',
                  5000
                );
              }
            }
          } catch (e) {
            // Error parsing JSON, continue with fallback
          }
        }
        console.log(`Backend API error: ${response.status} - will use fallback`);
        return null;
      }

      const data = await response.json();
      return data.success ? data.content : null;
    } catch (error) {
      // Don't log scary errors - let the calling function handle fallback gracefully
      if (error.message.includes('timed out')) {
        console.log('⏰ AI request timed out - caller will use fallback mode');
      } else {
        console.log('AI service unavailable - caller will use fallback mode');
      }
      return null;
    }
  },

  async generateNarratorComment(context) {
    // Get current narrator and fallbacks
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const fallbacks = narrator.fallbacks;

    // Determine how many backend narrator calls we're allowed per character.
    const maxComments =
      typeof CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER === 'number'
        ? CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER
        : Infinity;

    const narratorAiDisabled =
      CONFIG.ENABLE_AI_NARRATOR_COMMENTS === false || !CONFIG.ENABLE_AI;

    // If narrator AI is disabled or we've hit the cap, immediately use a local line.
    if (narratorAiDisabled || this._narratorCommentCount >= maxComments) {
      console.log(
        '%c🤖 NARRATOR (Fallback - Disabled or limit reached)',
        'color: #ff0; font-weight: 500',
      );
      return Utils.randomChoice(fallbacks);
    }

    try {
      console.log('%c🤖 NARRATOR: Calling backend AI...', 'color: #0ff; font-weight: 500');
      console.log('  Request:', { choice: context.choice, question: context.question, narrator: narratorId });
      console.log(
        `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
      );
      
        const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/narrator/comment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            choice: context.choice,
            question: context.question,
            character_so_far: context.characterSoFar,
            narrator_id: narratorId,
          }),
        }); // Uses CONFIG.AI_TIMEOUT, then fallback + background warmup

      if (!response.ok) {
        console.log('%c🤖 NARRATOR (Fallback - API Error)', 'color: #f80; font-weight: 500');
        console.log('  Status:', response.status);
        return Utils.randomChoice(fallbacks);
      }

      const data = await response.json();
      let text = data.comment || Utils.randomChoice(fallbacks);
      
      console.log('%c🤖 NARRATOR (AI Generated) ✨', 'color: #0f0; font-weight: 500');
      console.log('  Response:', text);
    
      // Use the text from the response
      let responseText = text;

      // Light post-processing to avoid obvious repetition
    const normalize = (s) => (s || '').trim().toLowerCase();
    const startsWithClassic = (s) =>
      s.startsWith('ah, the classic') || s.startsWith('ah the classic');

    const last = this._lastNarratorComment;
    const lastNorm = normalize(last);
      let newNorm = normalize(responseText);

    if (last) {
      if (newNorm === lastNorm) {
          const alts = fallbacks.filter((f) => normalize(f) !== lastNorm);
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }

      if (startsWithClassic(newNorm) && startsWithClassic(lastNorm)) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }
    }

    if (startsWithClassic(newNorm)) {
      if (this._usedClassicThisRun) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
        }
      } else {
        this._usedClassicThisRun = true;
      }
    }

      this._lastNarratorComment = responseText;
      // Count this as one successful AI narrator comment for this character.
      this._narratorCommentCount += 1;
      return responseText;
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)', 'color: #f80; font-weight: 500');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c🤖 NARRATOR (Fallback - Connection Error)', 'color: #f00; font-weight: 500');
        console.error('  Error:', error);
      }
      return Utils.randomChoice(fallbacks);
    }
  },

  async generateNames(race, classType, count = 3) {
    const desiredCount = Math.max(1, count || 3);
    const candidates = [];

    // Helper: attempt AI generation when enabled
    const tryAiNames = async () => {
      if (!CONFIG.ENABLE_AI) {
        console.log(
          '%c📛 NAMES (Fallback - AI Disabled)',
          'color: #ff0; font-weight: 500',
        );
        return;
      }

      try {
        console.log(
          '%c📛 NAMES: Calling backend AI...',
          'color: #0ff; font-weight: 500',
        );
        console.log('  Request:', { race, classType, count: desiredCount });
        console.log(
          `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
        );

        const response = await this.fetchWithTimeout(
          `${CONFIG.BACKEND_URL}/api/ai/characters/names`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              race: race,
              class_type: classType,
              // Ask for extra so we have room to filter out repeats
              count: desiredCount * 2,
            }),
          },
        ); // Uses CONFIG.AI_TIMEOUT

        if (!response.ok) {
          console.log(
            '%c📛 NAMES (Fallback - API Error)',
            'color: #f80; font-weight: 500',
          );
          return;
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.names) && data.names.length > 0) {
          console.log(
            '%c📛 NAMES (AI Generated) ✨',
            'color: #0f0; font-weight: 500',
          );
          console.log('  Response:', data.names);
          candidates.push(...data.names);
        }
      } catch (error) {
        if (error.message && error.message.includes('timed out')) {
          console.log(
            '%c📛 NAMES (Fallback - Backend Waking Up)',
            'color: #f80; font-weight: 500',
          );
          console.log(
            `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
          );
          console.log(
            '  ✅ Once awake, subsequent requests will use AI!',
          );
        } else {
          console.log(
            '%c📛 NAMES (Fallback - Connection Error)',
            'color: #f00; font-weight: 500',
          );
          console.error('  Error:', error);
        }
      }
    };

    // Helper: always-available fallback candidates
    const addFallbackCandidates = (multiplier = 3) => {
      console.log(
        '%c📛 NAMES (Fallback)',
        'color: #f80; font-weight: 500',
      );
      const extra = this.generateFallbackNames(race, desiredCount * multiplier);
      candidates.push(...extra);
    };

    // 1) Try AI first (if enabled)
    await tryAiNames();

    // 2) If AI unavailable or produced too few unique-looking options, pad with fallback
    if (!candidates.length) {
      addFallbackCandidates(3);
    }

    // 3) Filter for uniqueness and register globally
    let unique = this._filterAndRegisterUniqueNames(candidates, desiredCount);

    // 4) If we still don't have enough, top up with more fallback variations
    if (unique.length < desiredCount) {
      addFallbackCandidates(5);
      const more = this._filterAndRegisterUniqueNames(
        candidates,
        desiredCount - unique.length,
      );
      unique = unique.concat(more);
    }

    // Return whatever we could gather (may be fewer than requested if pools are exhausted)
    return unique.slice(0, desiredCount);
  },

  /**
   * Combined helper: ask the backend once for BOTH
   *   - name suggestions, and
   *   - a backstory template that uses the literal token {{NAME}}
   *
   * This lets us front-load the "heavy" AI work earlier in the flow and
   * avoid a second OpenAI call when the user later reaches the backstory
   * step. The final, player-chosen name is substituted client-side.
   */
  async generateCharacterSummary(character, options = {}) {
    const nameCount =
      typeof options.nameCount === 'number' && options.nameCount > 0
        ? options.nameCount
        : 3;

    const race = character && character.race;
    const classType = character && character.class;

    // Local, always-available fallback for both names and template
    const buildLocalFallback = () => {
      const fallbackNames = this.generateFallbackNames(race || 'human', nameCount);
      const template =
        '{{NAME}} is a ' +
        `${race || 'mysterious'}\u0020${classType || 'adventurer'} with a mysterious past. ` +
        "They don't talk about it much. Probably for the best.";
      return {
        names: fallbackNames,
        backstoryTemplate: template,
      };
    };

    if (!CONFIG.ENABLE_AI) {
      console.log(
        '%c📦 SUMMARY (Fallback - AI Disabled)',
        'color: #ff0; font-weight: 500',
      );
      return buildLocalFallback();
    }

    try {
      console.log(
        '%c📦 SUMMARY: Calling backend AI for names + backstory template...',
        'color: #0ff; font-weight: 500',
      );

      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/characters/summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            race: race,
            class_type: classType,
            alignment: character && character.alignment,
            background: character && character.background,
            personality:
              character && (character.personalityTrait || character.personality),
            name_count: nameCount * 2, // ask for extra to allow uniqueness filtering
          }),
        },
      );

      if (!response.ok) {
        const status = response.status;
        let detail = null;
        try {
          const errBody = await response.json();
          if (errBody && errBody.detail) {
            detail = errBody.detail;
          }
        } catch {
          // ignore JSON parse errors; we'll fall back below
        }

        if (status === 429) {
          console.log(
            '%c📦 SUMMARY (Cooldown / Quota Limit)',
            'color: #ff0; font-weight: 500',
          );
          // Dispatch quota update event so UI can disable options
          try {
            window.dispatchEvent(
              new CustomEvent('danddy:creationQuotaUpdate', {
                detail: { remaining: 0 },
              }),
            );
          } catch (_) {}
        } else {
          console.log(
            '%c📦 SUMMARY (Fallback - API Error)',
            'color: #f80; font-weight: 500',
          );
          console.log('  Status:', status);
        }

        return buildLocalFallback();
      }

      const data = await response.json();
      if (!data || data.success !== true) {
        console.log(
          '%c📦 SUMMARY (Fallback - Bad Payload)',
          'color: #f80; font-weight: 500',
        );
        return buildLocalFallback();
      }

      let names = Array.isArray(data.names) ? data.names.slice() : [];
      const template =
        typeof data.backstory_template === 'string' && data.backstory_template.trim()
          ? data.backstory_template
          : null;

      // Run through our global uniqueness filter so we avoid repeating
      // first/last names across this browser session.
      if (names.length) {
        names = this._filterAndRegisterUniqueNames(names, nameCount);
      }

      if (!names.length) {
        console.log(
          '%c📦 SUMMARY (Fallback - No Names From Backend)',
          'color: #f80; font-weight: 500',
        );
        const fallback = buildLocalFallback();
        // Preserve backend-provided template if we got one.
        if (template) {
          fallback.backstoryTemplate = template;
        }
        return fallback;
      }

      console.log(
        '%c📦 SUMMARY (AI Generated) ✨',
        'color: #0f0; font-weight: 500',
      );
      console.log('  Names:', names);

      return {
        names,
        backstoryTemplate:
          template ||
          (character && character.backstory) ||
          buildLocalFallback().backstoryTemplate,
        portraitGrantId:
          (typeof data.portrait_grant_id === 'string' && data.portrait_grant_id) ||
          (typeof data.portraitGrantId === 'string' && data.portraitGrantId) ||
          null,
      };
    } catch (error) {
      if (error.message && error.message.includes('timed out')) {
        console.log(
          '%c📦 SUMMARY (Fallback - Backend Waking Up)',
          'color: #f80; font-weight: 500',
        );
        console.log(
          '  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',
        );
      } else {
        console.log(
          '%c📦 SUMMARY (Fallback - Connection Error)',
          'color: #f00; font-weight: 500',
        );
        console.error('  Error:', error);
      }
      return buildLocalFallback();
    }
  },

  generateFallbackNames(race, count) {
    // Use shared name data from CharacterNameData module
    const pattern = window.CharacterNameData
      ? CharacterNameData.getPattern(race)
      : { first: ['Hero'], last: ['Unknown'] };
    const result = [];
    const usedLocalCombos = new Set();

    // Generate name combinations with local (per-call) uniqueness.
    // Global uniqueness (across the entire session) is handled by
    // _filterAndRegisterUniqueNames so we only worry about producing
    // a rich pool of candidates here.
    let attempts = 0;
    const maxAttempts = count * 20;

    while (result.length < count && attempts < maxAttempts) {
      const firstName = Utils.randomChoice(pattern.first);
      const lastName = Utils.randomChoice(pattern.last);
      const fullName = `${firstName}\u0020${lastName}`;

      if (!usedLocalCombos.has(fullName)) {
        usedLocalCombos.add(fullName);
        result.push(fullName);
      }
      attempts++;
    }

    return result;
  },

  /**
   * Internal helper: normalize and register names so we:
   * - avoid duplicate first names (case-insensitive)
   * - avoid duplicate last names
   * - avoid duplicate full names
   * across the entire browser session.
   *
   * Accepts an array of full-name strings and returns a filtered array.
   */
  _filterAndRegisterUniqueNames(candidates, maxCount) {
    const result = [];
    const target = typeof maxCount === 'number' && maxCount > 0
      ? maxCount
      : Number.POSITIVE_INFINITY;

    for (const raw of candidates) {
      if (result.length >= target) break;
      if (!raw) continue;

      const trimmed = String(raw).trim();
      if (!trimmed) continue;

      // Split on whitespace, first token = first name, rest = last name
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) continue;

      const first = parts[0];
      const last = parts.slice(1).join(' ') || '';

      // Require at least a first name; allow missing last name but treat it as part of full key
      if (!first) continue;

      const firstKey = first.toLowerCase();
      const lastKey = last.toLowerCase();
      const fullKey = last ? `${firstKey}\u0020${lastKey}` : firstKey;

      // Enforce uniqueness across this browser session
      if (
        this._usedFullNames.has(fullKey) ||
        this._usedFirstNames.has(firstKey) ||
        (last && this._usedLastNames.has(lastKey))
      ) {
        continue;
      }

      this._usedFullNames.add(fullKey);
      this._usedFirstNames.add(firstKey);
      if (last) {
        this._usedLastNames.add(lastKey);
      }

      result.push(trimmed);
    }

    return result;
  },

  async generateBackstory(character) {
    const fallback = `${character.name} is a ${character.race}\u0020${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";

    if (!CONFIG.ENABLE_AI) {
      console.log('%c📖 BACKSTORY (Fallback - AI Disabled)', 'color: #ff0; font-weight: 500');
      return fallback;
    }

    try {
      console.log('%c📖 BACKSTORY: Calling backend AI...', 'color: #0ff; font-weight: 500');
      console.log('  Request:', { name: character.name, race: character.race, class: character.class });
      console.log(
        `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
      );
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/backstory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: character.name,
          race: character.race,
          class_type: character.class,
          personality: character.personalityTrait || 'mysterious',
          background: character.background,
        }),
      }); // Uses CONFIG.AI_TIMEOUT

      if (!response.ok) {
        console.log('%c📖 BACKSTORY (Fallback - API Error)', 'color: #f80; font-weight: 500');
        return fallback;
      }

      const data = await response.json();
      if (data.success && data.backstory) {
        console.log('%c📖 BACKSTORY (AI Generated) ✨', 'color: #0f0; font-weight: 500');
        console.log('  Response:', data.backstory.substring(0, 100) + '...');
        return data.backstory;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)', 'color: #f80; font-weight: 500');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📖 BACKSTORY (Fallback - Connection Error)', 'color: #f00; font-weight: 500');
        console.error('  Error:', error);
      }
    }

    console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80; font-weight: 500');
    return fallback;
  },

  async generateOptionVariations(questionText, options) {
    if (!CONFIG.ENABLE_AI || CONFIG.ENABLE_AI_OPTION_VARIATIONS === false) {
      console.log(
        '%c🎲 OPTIONS (Fallback - AI Disabled or variations off)',
        'color: #ff0; font-weight: 500',
      );
      return options.map((opt) => opt.text);
    }

    const optionDescriptions = options
      .map((opt) => `Value: "${opt.value}", Default text: "${opt.text}"`)
      .join('\n');

    const prompt = `For the question: "${questionText}"

Generate fresh, creative variations for these D&D character creation options. Keep each variation to 4-8 words, punchy and clear. Match the tone of each original but make them feel unique:

${optionDescriptions}

Format your response as JSON array of strings, one for each option in order. Example: ["text1", "text2", "text3", "text4"]`;

    const systemPrompt =
      'You are a creative D&D character creation assistant. Generate engaging option text that feels fresh but maintains the same meaning. ' +
      'Be concise and direct. Return ONLY valid JSON.';

    console.log('%c🎲 OPTIONS: Calling backend AI...', 'color: #0ff; font-weight: 500');
    console.log('  Note: Will fallback to original option texts if unavailable...');

    const response = await this.generateCompletion(prompt, systemPrompt);

    if (response) {
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const variations = JSON.parse(jsonMatch[0]);
          if (Array.isArray(variations) && variations.length === options.length) {
            console.log('%c🎲 OPTIONS (AI Generated) ✨', 'color: #0f0; font-weight: 500');
            return variations;
          }
        }
      } catch (error) {
        console.log('Failed to parse AI option variations:', error);
      }
    }

    // Fallback: return original texts
    console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅', 'color: #f80; font-weight: 500');
    console.log('  The original option texts will be used instead of AI variations');
    return options.map((opt) => opt.text);
  },

  // Generate character portrait image using DALL-E
  async generatePortraitImage(character, options = {}) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt, options);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt, options = {}) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c🎨 DALL-E (Unavailable - AI Disabled)', 'color: #ff0; font-weight: 500');
      return null;
    }

    // Allow forcing a specific model (used for fallback)
    const forceModel = options.forceModel || null;
    const isRetry = options._isRetry || false;

    try {
      // Resolve current image model preference (builder + manager share this).
      let model = forceModel || 'dall-e-3';
      if (!forceModel) {
        try {
          if (window.StorageService && typeof StorageService.getImageModel === 'function') {
            model = StorageService.getImageModel();
          } else if (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) {
            model = CONFIG.DEFAULT_IMAGE_MODEL;
          }
        } catch (e) {
          console.warn('AIService.generateImageFromPrompt: failed to read image model, using default', e);
        }
      }

      // Preflight quota so we can message the user before burning expensive calls.
      // Backend still enforces quota; this is just a nicer UX.
      try {
        if (typeof this.getImageQuotaStatus === 'function') {
          const quota = await this.getImageQuotaStatus();
          if (quota && quota.enforced && quota.remaining === 0) {
            const resetAt = quota.reset_at || quota.resetAt || null;
            const msg = resetAt
              ? `Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`
              : 'Daily image limit reached. Please try again tomorrow.';
            if (window.UIService) {
              window.UIService.showNotification(msg, 'warning', 8000);
            }
            const rateLimitError = new Error(msg);
            rateLimitError.isRateLimit = true;
            rateLimitError.limit = quota.limit;
            rateLimitError.remaining = quota.remaining;
            rateLimitError.resetAt = resetAt;
            throw rateLimitError;
          }
        }
      } catch (quotaErr) {
        // If quota endpoint fails, don't block generation; backend will enforce anyway.
      }

      console.log('%c🎨 IMAGE: Calling backend AI...', 'color: #0ff; font-weight: 500');
      // Log only a preview of the prompt so the console isn't flooded,
      // but make it clear that the full prompt (without truncation) is
      // sent to the backend.
      console.log('  Prompt (preview):', prompt.substring(0, 100) + (prompt.length > 100 ? '…' : ''));
      console.log('  Model:', model + (forceModel ? ' (fallback)' : ''));
      console.log('  Note: Image generation takes 20-30s (longer than text AI)...');
      
        // Quality setting differs by model:
        // - DALL-E 3: 'standard' or 'hd'
        // - GPT Image 1: 'medium', 'high'
        // - Flux models: no quality setting (use 'standard' as default)
        const defaultQuality = {
          'dall-e-3': 'standard',
          'gpt-image-1': 'medium',
          'gpt-image-1.5': 'medium',
          'flux-1.1-pro': 'standard',
          'flux-schnell': 'standard',
        };
        
        let quality = defaultQuality[model] || 'standard';
        
        // In demo mode, always use 'medium' quality for gpt-image-1 to manage costs
        const isDemoMode = window.DemoCharacters && typeof DemoCharacters.isDemoMode === 'function' && DemoCharacters.isDemoMode();
        if (isDemoMode && model === 'gpt-image-1') {
          quality = 'medium';
          console.log(`  Quality: MEDIUM (demo mode default)`);
        } else {
          // Check for user quality preference (logged-in users only)
          try {
            if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
              const savedQuality = StorageService.getImageQuality(model);
              if (savedQuality) {
                quality = savedQuality;
                console.log(`  Quality: ${quality.toUpperCase()} (user preference)`);
              }
            }
          } catch (e) {
            console.warn('AIService: failed to read quality setting', e);
          }
        }

        const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt,
            size: '1024x1024',
            quality: quality,
            model: model,
            // Optional one-time included portrait grant from /characters/summary.
            creation_grant_id:
              (options && options.creationGrantId) ||
              (options && options.creation_grant_id) ||
              null,
          }),
        }, 70000); // 70 seconds for image generation (DALL-E can be very slow, plus R2 upload)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 IMAGE (Error)', 'color: #f00; font-weight: 500');
        console.log('  Error:', errorData.detail);
        
        // Helper to extract error message from Pydantic validation errors or plain strings
        const extractErrorMessage = (detail) => {
          if (!detail) return null;
          // Pydantic returns validation errors as an array of objects
          if (Array.isArray(detail)) {
            return detail.map(err => {
              if (typeof err === 'string') return err;
              // Pydantic format: { loc: [...], msg: '...', type: '...' }
              const field = err.loc ? err.loc.slice(1).join('.') : 'unknown';
              return `${field}: ${err.msg || err.message || JSON.stringify(err)}`;
            }).join('; ');
          }
          if (typeof detail === 'object') {
            return detail.msg || detail.message || JSON.stringify(detail);
          }
          return String(detail);
        };
        
        const errorMessage = extractErrorMessage(errorData.detail);
        
        // Check for rate limiting
        if (response.status === 429) {
          const resetAt = (errorData && (errorData.reset_at || errorData.resetAt)) || null;
          const remaining =
            errorData && typeof errorData.remaining === 'number' ? errorData.remaining : null;
          const limit = errorData && typeof errorData.limit === 'number' ? errorData.limit : null;

          const msg =
            errorMessage ||
            (resetAt
              ? `Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`
              : 'Daily image limit reached.');

          if (window.UIService) {
            window.UIService.showNotification(msg, 'warning', 8000);
          }

          const rateLimitError = new Error(msg);
          rateLimitError.isRateLimit = true;
          rateLimitError.limit = limit;
          rateLimitError.remaining = remaining;
          rateLimitError.resetAt = resetAt;
          throw rateLimitError;
        }
        
        // Check for Replicate/Flux service errors (502 from backend)
        const detailStr = typeof errorData.detail === 'string' ? errorData.detail : errorMessage;
        if (response.status === 502 && detailStr && (
          detailStr.toLowerCase().includes('flux') ||
          detailStr.toLowerCase().includes('replicate')
        )) {
          console.warn('⚠️ Replicate/Flux service error:', detailStr);
          
          const fluxError = new Error('Flux image generation service is temporarily unavailable');
          fluxError.isFluxError = true;
          fluxError.originalMessage = detailStr;
          fluxError.suggestModelSwitch = true;
          throw fluxError;
        }
        
        // Check for safety system rejection (handle both string and array detail)
        if (response.status === 400 && detailStr && detailStr.toLowerCase().includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', detailStr);
          console.warn('📝 REJECTED PROMPT:', prompt);
          
          // Analyze the prompt to help identify problematic sections
          const analysis = this.analyzeRejectedPrompt(prompt);
          
          const safetyError = new Error('Portrait generation was flagged by OpenAI\'s content safety system');
          safetyError.isSafetyRejection = true;
          safetyError.originalMessage = detailStr;
          safetyError.rejectedPrompt = prompt; // Capture the prompt for debugging
          safetyError.promptAnalysis = analysis; // Include analysis results
          throw safetyError;
        }
        
        throw new Error(errorMessage || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        console.log('%c🎨 IMAGE (Generated) ✨', 'color: #0f0; font-weight: 500');
        console.log('  URL:', data.url.substring(0, 50) + '...');

        // Read quota headers when present and broadcast for UI updates.
        try {
          const limitStr = response.headers.get('x-danddy-image-limit');
          const remainingStr = response.headers.get('x-danddy-image-remaining');
          const resetStr = response.headers.get('x-danddy-image-reset');
          const quotaInfo = {
            limit: limitStr != null ? parseInt(limitStr, 10) : null,
            remaining: remainingStr != null ? parseInt(remainingStr, 10) : null,
            resetEpoch: resetStr != null ? parseInt(resetStr, 10) : null,
          };

          window.dispatchEvent(
            new CustomEvent('danddy:imageQuotaUpdate', { detail: quotaInfo }),
          );

          // Optional lightweight notification when enforced and low remaining.
          if (
            window.UIService &&
            typeof quotaInfo.remaining === 'number' &&
            quotaInfo.remaining >= 0 &&
            quotaInfo.remaining <= 2
          ) {
            window.UIService.showNotification(
              `Images left today: ${quotaInfo.remaining}`,
              'info',
              5000,
            );
          }
        } catch (e) {
          // Non-fatal
        }

        return data.url;
      }
      return null;
    } catch (error) {
      console.log('%c🎨 IMAGE (Failed)', 'color: #f00; font-weight: 500');
      console.error('  Error:', error);
      
      // Auto-fallback: If Flux failed and we haven't tried fallback yet, retry with GPT Image
      if (error.isFluxError && !isRetry) {
        console.log('%c🔄 AUTO-FALLBACK: Flux unavailable, trying GPT Image instead...', 'color: #fa0; font-weight: 500');
        
        if (window.UIService) {
          window.UIService.showNotification(
            'Flux unavailable, switching to GPT Image...',
            'info',
            4000
          );
        }
        
        // Retry with GPT Image as fallback
        return this.generateImageFromPrompt(prompt, { 
          forceModel: 'gpt-image-1', 
          _isRetry: true 
        });
      }
      
      throw error;
    }
  },

  /**
   * Fetch current daily image quota from backend.
   * Returns: { limit, used, remaining, reset_at, reset_epoch, enforced }
   * - remaining === -1 indicates "unlimited" (admin/dev bypass)
   */
  async getImageQuotaStatus() {
    try {
      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/images/quota`,
        { method: 'GET' },
        10000,
      );
      if (!response.ok) return null;
      const data = await response.json();

      // Normalize keys to camelCase for callers, but keep originals too.
      const normalized = {
        ...data,
        resetAt: data.reset_at || data.resetAt,
        resetEpoch: data.reset_epoch || data.resetEpoch,
      };

      // Broadcast so any open UI can update its quota label.
      try {
        window.dispatchEvent(
          new CustomEvent('danddy:imageQuotaUpdate', {
            detail: {
              limit: normalized.limit,
              remaining: normalized.remaining,
              resetAt: normalized.resetAt,
              resetEpoch: normalized.resetEpoch,
            },
          }),
        );
      } catch (_) {}

      return normalized;
    } catch (e) {
      return null;
    }
  },

  /**
   * Fetch current daily character creation quota from backend.
   * Returns: { limit, used, remaining, reset_at, reset_epoch, enforced }
   * - remaining === -1 indicates "unlimited" (admin/dev bypass)
   */
  async getCreationQuotaStatus() {
    try {
      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/characters/quota`,
        { method: 'GET' },
        10000,
      );
      if (!response.ok) return null;
      const data = await response.json();

      // Normalize keys to camelCase for callers, but keep originals too.
      const normalized = {
        ...data,
        resetAt: data.reset_at || data.resetAt,
        resetEpoch: data.reset_epoch || data.resetEpoch,
      };

      // Broadcast so any open UI can update its quota display.
      try {
        window.dispatchEvent(
          new CustomEvent('danddy:creationQuotaUpdate', {
            detail: {
              limit: normalized.limit,
              remaining: normalized.remaining,
              resetAt: normalized.resetAt,
              resetEpoch: normalized.resetEpoch,
            },
          }),
        );
      } catch (_) {}

      return normalized;
    } catch (e) {
      return null;
    }
  },

  // Build character description (shown to user in modal)
  buildCharacterDescription(character) {
    const parts = [];

    // Add D&D context header to help LLM understand class names like "Monk" are fantasy classes
    parts.push('Dungeons & Dragons fantasy character:');

    // Sex - include if set (important for portrait generation)
    if (character.sex) {
      parts.push(character.sex);
    }

    // Race - prefer admin-configured entries, fall back to shared description data
    if (character.race) {
      let raceDesc = null;
      // Try admin entries first
      try {
        if (window.PortraitPrompt && typeof PortraitPrompt.getVariableSnippet === 'function') {
          raceDesc = PortraitPrompt.getVariableSnippet('race', character.race);
        }
      } catch (e) {
        // Non-fatal
      }
      // Fall back to hardcoded descriptions
      if (!raceDesc) {
        raceDesc = window.PortraitPrompt
          ? PortraitPrompt.getRaceDescription(character.race)
          : character.race;
      }
      parts.push(raceDesc);
    }

    // Class - prefer admin-configured entries, fall back to shared description data
    if (character.class) {
      let classDesc = null;
      // Try admin entries first
      try {
        if (window.PortraitPrompt && typeof PortraitPrompt.getVariableSnippet === 'function') {
          classDesc = PortraitPrompt.getVariableSnippet('class', character.class);
        }
      } catch (e) {
        // Non-fatal
      }
      // Fall back to hardcoded descriptions
      if (!classDesc) {
        classDesc = window.PortraitPrompt
          ? PortraitPrompt.getClassDescription(character.class)
          : character.class;
      }
      parts.push(classDesc);
    }

    // Magic specialization (only for spellcasting classes)
    // Note: This is still from hardcoded data - could be moved to admin in future
    if (character.class && window.PortraitPrompt) {
      const magicText = PortraitPrompt.getMagicSpecialization(character.class);
      if (magicText) {
        parts.push(magicText);
      }
    }

    // Alignment
    if (character.alignment) {
      if (character.alignment.includes('good')) {
        parts.push('with noble bearing');
      } else if (character.alignment.includes('evil')) {
        parts.push('with a menacing aura');
      }
    }

    // Background + feature (when available)
    if (character.background) {
      try {
        let backgroundLabel = character.background;
        let backgroundFeature = character.backgroundFeature || null;

        if (typeof DND_DATA !== 'undefined' && Array.isArray(DND_DATA.backgrounds)) {
          const bgObj = DND_DATA.backgrounds.find(
            (b) => b.id === character.background,
          );
          if (bgObj) {
            backgroundLabel = bgObj.name || backgroundLabel;
            // bgObj.feature is an object { name, description } – extract a readable label
            if (!backgroundFeature && bgObj.feature) {
              if (typeof bgObj.feature === 'string') {
                backgroundFeature = bgObj.feature;
              } else if (typeof bgObj.feature.name === 'string') {
                backgroundFeature = bgObj.feature.name;
              } else if (typeof bgObj.feature.description === 'string') {
                backgroundFeature = bgObj.feature.description;
              }
            }
          }
        }

        let backgroundText = `${String(backgroundLabel).toLowerCase()} background`;
        if (backgroundFeature) {
          const featureText = String(backgroundFeature);
          // Avoid noisy [object Object] style strings
          if (!featureText.includes('[object Object]')) {
            backgroundText += ` with background feature "${featureText}"`;
          }
        }

        parts.push(backgroundText);
      } catch (e) {
        // Fallback to a simple tag if anything goes wrong with lookups
        parts.push(`background: ${character.background}`);
      }
    }

    // Backstory removed from portrait prompts to reduce OpenAI safety rejections
    // User-written text is unpredictable and frequently triggers content filters
    // if (character.backstory) {
    //   const raw = String(character.backstory).replace(/\s+/g, ' ').trim();
    //   if (raw) {
    //     parts.push(`backstory: ${raw}`);
    //   }
    // }
  
    return parts.join(', ');
  },

  // Build full DALL-E prompt with rendering instructions (not shown to user)
  buildPortraitPrompt(character) {
    // Normalize class key for lookups
    const classKey = (character.class || 'default').toLowerCase();

    // Use shared pose and camera data from PortraitPoseData module
    const { pose: posePrompt, camera: cameraPrompt } =
      window.PortraitPoseData && typeof PortraitPoseData.getRandomPoseAndCamera === 'function'
        ? PortraitPoseData.getRandomPoseAndCamera(classKey)
        : {
            pose: 'standing in a relaxed but heroic stance',
            camera: 'Camera angle: three-quarter view that clearly shows the full silhouette.',
          };

    // Resolve current portrait prompt theme (if any)
    let promptThemeId = null;
    try {
      if (
        typeof window !== 'undefined' &&
        window.StorageService &&
        typeof window.StorageService.getPortraitPromptTheme === 'function'
      ) {
        promptThemeId = window.StorageService.getPortraitPromptTheme();
      } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) {
        promptThemeId = CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME;
      }
    } catch (e) {
      // Non-fatal: fall back to default theme behavior below.
    }

    // Build compact STYLE / Background descriptions from theme (when available)
    let styleDescription = '';
    let backgroundDescription = '';
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.buildStyleAndBackgroundDescriptions ===
        'function'
    ) {
      try {
        const sections =
          window.PortraitPrompt.buildStyleAndBackgroundDescriptions({
            posePrompt,
            cameraPrompt,
            themeId: promptThemeId,
          }) || {};
        styleDescription = sections.styleDescription || '';
        backgroundDescription = sections.backgroundDescription || '';
      } catch (e) {
        // Non-fatal – fall through to simple defaults below.
      }
    }

    if (!styleDescription) {
      styleDescription =
        'High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';
    }
    if (!backgroundDescription) {
      backgroundDescription =
        'Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';
    }

    // Build simple header line: {CHARACTER_NAME}: {RACE}, {CLASS}, {BACKGROUND}
    const name = (character && character.name) || 'Unnamed character';

    const raceId = character && character.race ? String(character.race) : null;
    const classId =
      character && character.class ? String(character.class) : null;

    let raceLabel = raceId;
    let classLabel = classId;

    // Prefer admin-configured snippets for race/class when available.
    try {
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getVariableSnippet === 'function'
      ) {
        if (raceId) {
          const customRace =
            window.PortraitPrompt.getVariableSnippet('race', raceId);
          if (customRace) raceLabel = customRace;
        }
        if (classId) {
          const customClass =
            window.PortraitPrompt.getVariableSnippet('class', classId);
          if (customClass) classLabel = customClass;
        }
      }
    } catch (e) {
      // Non-fatal – fall back to simple labels.
    }

    let backgroundLabel = null;
    if (character && character.background) {
      backgroundLabel = String(character.background);
      try {
        if (
          typeof DND_DATA !== 'undefined' &&
          Array.isArray(DND_DATA.backgrounds)
        ) {
          const bgObj = DND_DATA.backgrounds.find(
            (b) => b.id === character.background,
          );
          if (bgObj && bgObj.name) {
            backgroundLabel = String(bgObj.name);
          }
        }
      } catch (e) {
        // Non-fatal – fall back to raw background value.
      }
    }

    const headerParts = [];
    // Sex - include for portrait generation (e.g., "male dwarf" or "female elf")
    if (character && character.sex) {
      headerParts.push(character.sex);
    }
    if (raceLabel) headerParts.push(raceLabel);
    if (classLabel) headerParts.push(classLabel);
    
    // Add magic specialization for spellcasting classes
    if (classId && window.PortraitPrompt && typeof PortraitPrompt.getMagicSpecialization === 'function') {
      const magicText = PortraitPrompt.getMagicSpecialization(classId);
      if (magicText) {
        headerParts.push(magicText);
      }
    }
    
    if (backgroundLabel) headerParts.push(backgroundLabel);

    const headerSuffix = headerParts.join(', ');
    const headerLine = headerSuffix
      ? `${name}: ${headerSuffix}`
      : `${name}`;

    // Final multi-line prompt template:
    // Dungeons & Dragons fantasy character portrait:
    // {CHARACTER_NAME}: {RACE}, {CLASS}, {BACKGROUND}
    //
    // Pose: {POSE_VARIANT}
    //
    // STYLE: {DESCRIPTION}
    //
    // Scene: {DESCRIPTION}
    // Note: Camera temporarily disabled - may interfere with pose
    let prompt = `Dungeons & Dragons fantasy character portrait:\n${headerLine}\n\nPose: ${posePrompt}`;
    if (styleDescription) {
      prompt += `\n\nSTYLE: ${styleDescription}`;
    }
    if (backgroundDescription) {
      prompt += `\n\nScene: ${backgroundDescription}`;
    }

    return prompt;
  },

  // Analyze a rejected prompt to help identify problematic sections
  analyzeRejectedPrompt(prompt) {
    console.log('%c🔍 Analyzing Rejected Prompt', 'color: #ff0; font-weight: 500; font-size: 14px;');
    console.log('─'.repeat(80));
    
    // Common problematic patterns that might trigger safety filters
    const potentialIssues = [];
    const warningPatterns = [
      { pattern: /\b(blood|gore|violence|death|kill|weapon|sword|axe|dagger|knife)\b/gi, category: 'Violence/Weapons' },
      { pattern: /\b(dark|evil|demon|devil|hell|sinister|menacing|malevolent)\b/gi, category: 'Dark Themes' },
      { pattern: /\b(naked|nude|exposed|bare|revealing|sensual|seductive)\b/gi, category: 'Adult Content' },
      { pattern: /\b(child|young|minor|kid|juvenile)\b/gi, category: 'Age-Related' },
      { pattern: /\b(slave|slavery|bound|chained|prisoner)\b/gi, category: 'Sensitive Topics' },
    ];

    // Check for each pattern
    warningPatterns.forEach(({ pattern, category }) => {
      const matches = prompt.match(pattern);
      if (matches && matches.length > 0) {
        potentialIssues.push({
          category,
          matches: [...new Set(matches.map(m => m.toLowerCase()))],
          count: matches.length
        });
      }
    });

    // Try to break down the prompt into sections
    const sections = prompt.split(', ').filter(s => s.trim());
    
    console.log('📋 PROMPT SECTIONS (%d total):', sections.length);
    sections.forEach((section, idx) => {
      const sectionLower = section.toLowerCase();
      let hasWarning = false;
      
      // Check if this section contains problematic terms
      for (const { pattern } of warningPatterns) {
        if (pattern.test(section)) {
          hasWarning = true;
          break;
        }
      }
      
      const marker = hasWarning ? '⚠️ ' : '   ';
      console.log(`${marker}${idx + 1}. ${section}`);
    });
    
    console.log('─'.repeat(80));
    
    if (potentialIssues.length > 0) {
      console.log('%c⚠️  POTENTIAL ISSUES DETECTED:', 'color: #f90; font-weight: 500;');
      potentialIssues.forEach(issue => {
        console.log(`  • ${issue.category}: ${issue.matches.join(', ')} (${issue.count}x)`);
      });
    } else {
      console.log('%c✓ No obvious problematic patterns detected', 'color: #0f0;');
      console.log('  The rejection may be due to:');
      console.log('  • Combination of terms that seem innocent individually');
      console.log('  • Character race/class combinations OpenAI finds problematic');
      console.log('  • Background story content or phrasing');
      console.log('  • OpenAI policy updates or temporary sensitivity changes');
    }
    
    console.log('─'.repeat(80));
    console.log('%c💡 DEBUGGING SUGGESTIONS:', 'color: #0ff; font-weight: 500;');
    console.log('  1. Try regenerating - sometimes the same prompt works on retry');
    console.log('  2. Simplify the backstory or character description');
    console.log('  3. Remove alignment-based descriptions (e.g., "menacing aura")');
    console.log('  4. Adjust weapon/equipment descriptions to be less specific');
    console.log('  5. Use the custom prompt modal to test simplified versions');
    console.log('─'.repeat(80));
    
    return {
      sections,
      potentialIssues,
      hasKnownProblematicTerms: potentialIssues.length > 0
    };
  },
});



