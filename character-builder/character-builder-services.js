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

  // Load image from URL (handles CORS via proxy)
  async loadImage(url) {
    try {
      // Use CORS proxy for Azure blob storage URLs (DALL-E images)
      // Azure doesn't allow CORS from most origins, so we need a proxy
      const corsProxy = 'https://corsproxy.io/?';
      const proxiedUrl = corsProxy + encodeURIComponent(url);

      // Fetch the image as a blob to bypass CORS restrictions
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Create object URL from blob
      const objectUrl = URL.createObjectURL(blob);

      // Load image from object URL
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Clean up object URL
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = (error) => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image from blob'));
        };
        img.src = objectUrl;
      });
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
  getImageModel() {
    try {
      const raw = localStorage.getItem('dnd_image_model');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) ||
        'dall-e-3';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['dall-e-3', 'gpt-image-1'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getImageModel failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
    }
  },

  setImageModel(model) {
    try {
      const value = String(model || '').trim();
      const allowed = ['dall-e-3', 'gpt-image-1'];
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
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'ascii';
      if (!raw) return fallback;
      const value = String(raw).trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn(
        'StorageService.getPortraitViewMode failed, using fallback',
        e,
      );
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'ascii';
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

  // ==== CHARACTER STORAGE (via shared CharacterStorage facade) ====

  /**
   * Get all characters using the shared CharacterStorage facade.
   * This keeps builder + manager on the same storage rail.
   */
  async getCharacters() {
    if (!window.CharacterStorage || typeof window.CharacterStorage.getAll !== 'function') {
      console.warn(
        'StorageService.getCharacters: CharacterStorage facade not available. Falling back to local-only storage.',
      );
      return this._getCharactersFromLocalStorage();
    }

    try {
      const characters = await window.CharacterStorage.getAll();
      // Cache in localStorage for offline access (builder may still rely on this)
      this._cacheCharactersLocally(characters);
      return characters;
    } catch (error) {
      console.error(
        'StorageService.getCharacters: CharacterStorage.getAll failed, using local fallback:',
        error,
      );
      return this._getCharactersFromLocalStorage();
    }
  },
  
  /**
   * Save character through CharacterStorage facade.
   * Preserves existing builder expectations (returns saved character).
   */
  async saveCharacter(character) {
    if (!window.CharacterStorage) {
      console.warn(
        'StorageService.saveCharacter: CharacterStorage facade not available. Using legacy local-only save.',
      );
      return this._saveCharacterToLocalStorage(character);
    }

    try {
      let savedCharacter;

      if (character.id) {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Updating character via CharacterStorage:', character.id);
        }
        savedCharacter = await window.CharacterStorage.update(character.id, character);
      } else {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Creating character via CharacterStorage');
        }
        savedCharacter = await window.CharacterStorage.add(character);
      }

      // Keep local cache in sync for any builder flows that still read from it
      this._cacheCharacterLocally(savedCharacter);
      return savedCharacter;
    } catch (error) {
      console.error(
        'StorageService.saveCharacter: CharacterStorage operation failed, using legacy local-only save:',
        error,
      );
      return this._saveCharacterToLocalStorage(character);
    }
  },
  
  /**
   * Delete character via CharacterStorage facade.
   */
  async deleteCharacter(id) {
    if (!window.CharacterStorage) {
      console.warn(
        'StorageService.deleteCharacter: CharacterStorage facade not available. Using legacy local-only delete.',
      );
      this._deleteCharacterFromLocalStorage(id);
      return true;
    }

    try {
      await window.CharacterStorage.delete(id);
      this._deleteCharacterFromLocalStorage(id);
      return true;
    } catch (error) {
      console.error(
        'StorageService.deleteCharacter: CharacterStorage.delete failed, falling back to local-only delete:',
        error,
      );
      this._deleteCharacterFromLocalStorage(id);
      return true;
    }
  },
  
  // ==== LOCALSTORAGE HELPERS (private) ====
  
  _getCharactersFromLocalStorage() {
    return (window.DanddyStorage && window.DanddyStorage.readAll())
      || [];
  },

  _saveCharacterToLocalStorage(character) {
    const characters = this._getCharactersFromLocalStorage();
    
    // Assign a temporary ID if none exists (for guest mode)
    if (!character.id) {
      character.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Ensure characters have stable timestamps so "Date modified" sorting in
    // the manager can rely on the character data itself instead of separate
    // client-side caches.
    const nowIso = new Date().toISOString();
    if (!character.createdAt) {
      character.createdAt = nowIso;
    }
    character.updatedAt = nowIso;
    
    const index = characters.findIndex((c) => c.id === character.id);

    if (index >= 0) {
      characters[index] = character;
    } else {
      characters.push(character);
    }

    if (window.DanddyStorage) {
      window.DanddyStorage.writeAll(characters);
    } else {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
    }
    return character;
  },

  _deleteCharacterFromLocalStorage(id) {
    if (window.DanddyStorage) {
      window.DanddyStorage.deleteById(id);
    } else {
      const characters = this._getCharactersFromLocalStorage().filter((c) => c.id !== id);
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
    }
  },
  
  _cacheCharactersLocally(characters) {
    if (window.DanddyStorage) {
      window.DanddyStorage.writeCache(characters);
    } else {
      localStorage.setItem(CONFIG.STORAGE_KEY + '_cache', JSON.stringify(characters));
    }
  },
  
  _cacheCharacterLocally(character) {
    const cached = this._getCharactersFromLocalStorage();
    const index = cached.findIndex((c) => c.id === character.id);
    
    if (index >= 0) {
      cached[index] = character;
    } else {
      cached.push(character);
    }
    
    this._cacheCharactersLocally(cached);
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
    const raceLower = race?.toLowerCase().replace(/\s+/g, '-') || '';
    const classLower = classType?.toLowerCase().replace(/\s+/g, '-') || '';
    
    if (!raceLower) return null;

    const fileName = classLower
      ? `${raceLower}-${classLower}.png`
      : `${raceLower}.png`;

    // If a public R2 (or other CDN) base URL is configured, use that.
    if (CONFIG && CONFIG.PREGENERATED_PORTRAIT_BASE_URL) {
      const base = CONFIG.PREGENERATED_PORTRAIT_BASE_URL.replace(/\/+$/, '');
      return `${base}/${fileName}`;
    }

    // Fallback: relative path for environments where PNGs are served locally.
    // This keeps older static setups working if images are present on disk.
    return `../web/generated_portraits/images/${fileName}`;
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

        // Store ASCII art (and original image URL, when configured) in character for export
        if (window.CharacterState) {
          const updates = {
            asciiPortrait: preGenerated,
            asciiPortraitKey: key,
          };

          // If we have a known location for the original pre-generated PNG,
          // expose it as originalPortraitUrl so apps can show "View Original Art".
          const pregenImageUrl = this.getPreGeneratedImageUrl(
            character.race,
            character.class,
          );
          if (pregenImageUrl) {
            updates.originalPortraitUrl = pregenImageUrl;
          }

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
  async generateCustomAIPortrait(character) {
    try {
      console.log('🎨 Generating custom AI portrait with DALL-E...');

      // Step 1: Generate image with DALL-E
      const imageUrl = await AIService.generatePortraitImage(character);

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
    console.log('%c🔄 WARMUP: Waking up backend server...', 'color: #fa0; font-weight: bold');
    
    while (this._backendAvailable !== true) {
      try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.available) {
            this._backendAvailable = true;
            console.log('%c✅ WARMUP: Backend is now ready!', 'color: #0f0; font-weight: bold');
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
      const response = await fetch(url, {
        ...options,
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
        'color: #ff0; font-weight: bold',
      );
      return Utils.randomChoice(fallbacks);
    }

    try {
      console.log('%c🤖 NARRATOR: Calling backend AI...', 'color: #0ff; font-weight: bold');
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
        console.log('%c🤖 NARRATOR (Fallback - API Error)', 'color: #f80; font-weight: bold');
        console.log('  Status:', response.status);
        return Utils.randomChoice(fallbacks);
      }

      const data = await response.json();
      let text = data.comment || Utils.randomChoice(fallbacks);
      
      console.log('%c🤖 NARRATOR (AI Generated) ✨', 'color: #0f0; font-weight: bold');
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
        console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c🤖 NARRATOR (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
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
          'color: #ff0; font-weight: bold',
        );
        return;
      }

      try {
        console.log(
          '%c📛 NAMES: Calling backend AI...',
          'color: #0ff; font-weight: bold',
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
            'color: #f80; font-weight: bold',
          );
          return;
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.names) && data.names.length > 0) {
          console.log(
            '%c📛 NAMES (AI Generated) ✨',
            'color: #0f0; font-weight: bold',
          );
          console.log('  Response:', data.names);
          candidates.push(...data.names);
        }
      } catch (error) {
        if (error.message && error.message.includes('timed out')) {
          console.log(
            '%c📛 NAMES (Fallback - Backend Waking Up)',
            'color: #f80; font-weight: bold',
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
            'color: #f00; font-weight: bold',
          );
          console.error('  Error:', error);
        }
      }
    };

    // Helper: always-available fallback candidates
    const addFallbackCandidates = (multiplier = 3) => {
      console.log(
        '%c📛 NAMES (Fallback)',
        'color: #f80; font-weight: bold',
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
        `${race || 'mysterious'} ${classType || 'adventurer'} with a mysterious past. ` +
        "They don't talk about it much. Probably for the best.";
      return {
        names: fallbackNames,
        backstoryTemplate: template,
      };
    };

    if (!CONFIG.ENABLE_AI) {
      console.log(
        '%c📦 SUMMARY (Fallback - AI Disabled)',
        'color: #ff0; font-weight: bold',
      );
      return buildLocalFallback();
    }

    try {
      console.log(
        '%c📦 SUMMARY: Calling backend AI for names + backstory template...',
        'color: #0ff; font-weight: bold',
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
            '%c📦 SUMMARY (Cooldown / Rate Limit)',
            'color: #ff0; font-weight: bold',
          );
          if (window.UIService) {
            window.UIService.showNotification(
              detail ||
                'AI character generation is cooling down. Using offline suggestions for this one.',
              'warning',
              6000,
            );
          }
        } else {
          console.log(
            '%c📦 SUMMARY (Fallback - API Error)',
            'color: #f80; font-weight: bold',
          );
          console.log('  Status:', status);
        }

        return buildLocalFallback();
      }

      const data = await response.json();
      if (!data || data.success !== true) {
        console.log(
          '%c📦 SUMMARY (Fallback - Bad Payload)',
          'color: #f80; font-weight: bold',
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
          'color: #f80; font-weight: bold',
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
        'color: #0f0; font-weight: bold',
      );
      console.log('  Names:', names);

      return {
        names,
        backstoryTemplate:
          template ||
          (character && character.backstory) ||
          buildLocalFallback().backstoryTemplate,
      };
    } catch (error) {
      if (error.message && error.message.includes('timed out')) {
        console.log(
          '%c📦 SUMMARY (Fallback - Backend Waking Up)',
          'color: #f80; font-weight: bold',
        );
        console.log(
          '  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',
        );
      } else {
        console.log(
          '%c📦 SUMMARY (Fallback - Connection Error)',
          'color: #f00; font-weight: bold',
        );
        console.error('  Error:', error);
      }
      return buildLocalFallback();
    }
  },

  generateFallbackNames(race, count) {
    const namePatterns = {
      dwarf: {
        first: [
          'Thorin',
          'Gimli',
          'Balin',
          'Dwalin',
          'Thrain',
          'Dain',
          'Bombur',
          'Bofur',
          'Kili',
          'Fili',
          'Oin',
          'Gloin',
          'Bruenor',
          'Morgran',
          'Rurik',
          'Einkil',
          'Barendd',
          'Baern',
          'Harbek',
          'Rumnar',
        ],
        last: [
          'Ironforge',
          'Stonehelm',
          'Deepdelver',
          'Mountainheart',
          'Goldseeker',
          'Ironfoot',
          'Hammerhand',
          'Oakenshield',
          'Battlehammer',
          'Fireforge',
          'Stormdelver',
          'Stonebreaker',
          'Coppervein',
          'Bronzebrow',
          'Rockseeker',
        ],
      },
      elf: {
        first: [
          'Legolas',
          'Galadriel',
          'Elrond',
          'Arwen',
          'Thranduil',
          'Celeborn',
          'Elessar',
          'Elendil',
          'Finrod',
          'Luthien',
          'Faelar',
          'Aelar',
          'Mialee',
          'Syllin',
          'Thia',
          'Varis',
          'Althaea',
          'Enna',
          'Nelar',
        ],
        last: [
          'Greenleaf',
          'Starweaver',
          'Moonwhisper',
          'Silverbow',
          'Nightbreeze',
          'Sunshadow',
          'Stormwind',
          'Brightwood',
          'Dawnpetal',
          'Evenwood',
          'Silverfrond',
          'Nightstar',
          'Willowshade',
          'Starfall',
          'Moonbrook',
        ],
      },
      human: {
        first: [
          'Aragorn',
          'Boromir',
          'Eowyn',
          'Faramir',
          'Theodred',
          'Eomer',
          'Eddard',
          'Catelyn',
          'Jon',
          'Sansa',
          'Alaric',
          'Rowan',
          'Serena',
          'Garrick',
          'Lysa',
          'Marcus',
          'Elena',
          'Corin',
          'Brynn',
        ],
        last: [
          'Stormborn',
          'Blackwood',
          'Riverrun',
          'Ironwall',
          'Longstrider',
          'Stormblade',
          'Brightshield',
          'Greywind',
          'Highvale',
          'Steelguard',
          'Duskwalker',
          'Redcrest',
          'Stoneward',
          'Ashborne',
          'Hawkspear',
        ],
      },
      halfling: {
        first: [
          'Bilbo',
          'Frodo',
          'Sam',
          'Merry',
          'Pippin',
          'Rosie',
          'Hamfast',
          'Belladonna',
          'Lobelia',
          'Fredegar',
          'Milo',
          'Daisy',
          'Rosa',
          'Cora',
          'Perrin',
          'Tansy',
          'Dodo',
          'Seraphina',
          'Odo',
        ],
        last: [
          'Baggins',
          'Took',
          'Brandybuck',
          'Gamgee',
          'Goodbody',
          'Proudfoot',
          'Burrows',
          'Underhill',
          'Greenhill',
          'Fairbairn',
          'Hilltopple',
          'Brushgather',
          'Tealeaf',
          'Thorngage',
          'Goodbarrel',
          'Hearthcoat',
        ],
      },
      dragonborn: {
        first: [
          'Drax',
          'Razax',
          'Thordak',
          'Torinn',
          'Balasar',
          'Kriv',
          'Nadarr',
          'Heskan',
          'Shedinn',
          'Ghesh',
          'Arjhan',
          'Medrash',
          'Rhogar',
          'Tarhun',
          'Akra',
          'Miirym',
          'Sora',
          'Vezera',
          'Zorvath',
        ],
        last: [
          'Flameheart',
          'Ironclaw',
          'Stormsinger',
          'Ashborn',
          'Dragonfall',
          'Firebreath',
          'Scaleborn',
          'Wyrmblood',
          'Skyscale',
          'Embermaw',
          'Stormscale',
          'Brightflame',
          'Stoneclaw',
          'Cloudsunder',
          'Blazewing',
        ],
      },
      gnome: {
        first: [
          'Glim',
          'Boddynock',
          'Dimble',
          'Fonkin',
          'Seebo',
          'Zook',
          'Eldon',
          'Brocc',
          'Burgell',
          'Jebeddo',
          'Alston',
          'Bimpnottin',
          'Fizzik',
          'Carlin',
          'Nissa',
          'Wrenn',
          'Tavi',
          'Ellyjobell',
          'Zanna',
        ],
        last: [
          'Tinkertop',
          'Sparklegem',
          'Nimblefingers',
          'Brightgear',
          'Gadgetwhiz',
          'Fizzlebang',
          'Cogsworth',
          'Glimmergold',
          'Whistlewhirr',
          'Gadgetgrind',
          'Janglecoin',
          'Copperbolt',
          'Mithrilspanner',
          'Quickwidget',
          'Proudgear',
        ],
      },
      'half-elf': {
        first: [
          'Tanis',
          'Raistlin',
          'Laurana',
          'Gilthanas',
          'Tanthalas',
          'Silvara',
          'Eliana',
          'Korrin',
          'Faelyn',
          'Soveliss',
          'Ilanis',
          'Kael',
          'Myla',
          'Tharos',
          'Elira',
          'Daeris',
          'Rian',
          'Caelynn',
          'Torren',
        ],
        last: [
          'Half-Elven',
          'Moonbrook',
          'Starfall',
          'Whisperwind',
          'Shadowvale',
          'Dawnbringer',
          'Twilightbane',
          'Silvermoon',
          'Nightbloom',
          'Duskwillow',
          'Starcrest',
          'Eveningfall',
          'Shadeglade',
          'Brightglen',
          'Silvershade',
        ],
      },
      'half-orc': {
        first: [
          'Grognak',
          'Throk',
          'Ugak',
          'Krod',
          'Sharn',
          'Dench',
          'Grul',
          'Drog',
          'Feng',
          'Shump',
          'Ghorbash',
          'Mazog',
          'Uglar',
          'Ruk',
          'Karash',
          'Vorag',
          'Yagra',
          'Shautha',
          'Ovak',
        ],
        last: [
          'Ironhide',
          'Bonecrusher',
          'Skullsplitter',
          'Bloodaxe',
          'Stonefist',
          'Grimjaw',
          'Warbringer',
          'Doomhammer',
          'Boulderfist',
          'Skullbrand',
          'Gorefang',
          'Bloodfury',
          'Ironmaw',
          'Steelgrip',
          'Rageborn',
        ],
      },
      tiefling: {
        first: [
          'Zevlor',
          'Raven',
          'Damakos',
          'Akta',
          'Therai',
          'Nemeia',
          'Kallista',
          'Leucis',
          'Orianna',
          'Morthos',
          'Azazel',
          'Seraphine',
          'Xathos',
          'Riven',
          'Lyra',
          'Caelum',
          'Naeris',
          'Vexria',
          'Zheren',
        ],
        last: [
          'Hellborn',
          'Darkflame',
          'Shadowhorn',
          'Nightwhisper',
          'Embersoul',
          'Dreadfire',
          'Ashenborn',
          'Voidwalker',
          'Grimshroud',
          'Duskwreath',
          'Soulbrand',
          'Cindertongue',
          'Nightreign',
          'Gloomsigil',
          'Shadebinder',
        ],
      },
    };

    const pattern = namePatterns[race] || namePatterns.human;
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
      const fullName = `${firstName} ${lastName}`;

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
      const fullKey = last ? `${firstKey} ${lastKey}` : firstKey;

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
    const fallback = `${character.name} is a ${character.race} ${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";

    if (!CONFIG.ENABLE_AI) {
      console.log('%c📖 BACKSTORY (Fallback - AI Disabled)', 'color: #ff0; font-weight: bold');
      return fallback;
    }

    try {
      console.log('%c📖 BACKSTORY: Calling backend AI...', 'color: #0ff; font-weight: bold');
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
        console.log('%c📖 BACKSTORY (Fallback - API Error)', 'color: #f80; font-weight: bold');
        return fallback;
      }

      const data = await response.json();
      if (data.success && data.backstory) {
        console.log('%c📖 BACKSTORY (AI Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  Response:', data.backstory.substring(0, 100) + '...');
        return data.backstory;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📖 BACKSTORY (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
        console.error('  Error:', error);
      }
    }

    console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80; font-weight: bold');
    return fallback;
  },

  async generateOptionVariations(questionText, options) {
    if (!CONFIG.ENABLE_AI || CONFIG.ENABLE_AI_OPTION_VARIATIONS === false) {
      console.log(
        '%c🎲 OPTIONS (Fallback - AI Disabled or variations off)',
        'color: #ff0; font-weight: bold',
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

    console.log('%c🎲 OPTIONS: Calling backend AI...', 'color: #0ff; font-weight: bold');
    console.log('  Note: Will fallback to original option texts if unavailable...');

    const response = await this.generateCompletion(prompt, systemPrompt);

    if (response) {
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const variations = JSON.parse(jsonMatch[0]);
          if (Array.isArray(variations) && variations.length === options.length) {
            console.log('%c🎲 OPTIONS (AI Generated) ✨', 'color: #0f0; font-weight: bold');
            return variations;
          }
        }
      } catch (error) {
        console.log('Failed to parse AI option variations:', error);
      }
    }

    // Fallback: return original texts
    console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅', 'color: #f80; font-weight: bold');
    console.log('  The original option texts will be used instead of AI variations');
    return options.map((opt) => opt.text);
  },

  // Generate character portrait image using DALL-E
  async generatePortraitImage(character) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c🎨 DALL-E (Unavailable - AI Disabled)', 'color: #ff0; font-weight: bold');
      return null;
    }

    try {
      // Resolve current image model preference (builder + manager share this).
      let model = 'dall-e-3';
      try {
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          model = StorageService.getImageModel();
        } else if (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) {
          model = CONFIG.DEFAULT_IMAGE_MODEL;
        }
      } catch (e) {
        console.warn('AIService.generateImageFromPrompt: failed to read image model, using default', e);
      }

      console.log('%c🎨 IMAGE: Calling backend AI...', 'color: #0ff; font-weight: bold');
      // Log only a preview of the prompt so the console isn't flooded,
      // but make it clear that the full prompt (without truncation) is
      // sent to the backend.
      console.log('  Prompt (preview):', prompt.substring(0, 100) + (prompt.length > 100 ? '…' : ''));
      console.log('  Model:', model);
      console.log('  Note: Image generation takes 20-30s (longer than text AI)...');
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          size: '1024x1024',
          // Use "high" for best quality portraits (kept for compatibility with existing backend validation).
          quality: 'high',
          model: model,
        }),
      }, 70000); // 70 seconds for image generation (DALL-E can be very slow, plus R2 upload)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 IMAGE (Error)', 'color: #f00; font-weight: bold');
        console.log('  Error:', errorData.detail);
        
        // Check for rate limiting
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.detail || 'Rate limit exceeded');
          rateLimitError.isRateLimit = true;
          throw rateLimitError;
        }
        
        // Check for safety system rejection
        if (response.status === 400 && errorData.detail && errorData.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', errorData.detail);
          console.warn('📝 REJECTED PROMPT:', prompt);
          
          // Analyze the prompt to help identify problematic sections
          const analysis = this.analyzeRejectedPrompt(prompt);
          
          const safetyError = new Error('Portrait generation was flagged by OpenAI\'s content safety system');
          safetyError.isSafetyRejection = true;
          safetyError.originalMessage = errorData.detail;
          safetyError.rejectedPrompt = prompt; // Capture the prompt for debugging
          safetyError.promptAnalysis = analysis; // Include analysis results
          throw safetyError;
        }
        
        throw new Error(errorData.detail || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        console.log('%c🎨 IMAGE (Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  URL:', data.url.substring(0, 50) + '...');
        return data.url;
      }
      return null;
    } catch (error) {
      console.log('%c🎨 IMAGE (Failed)', 'color: #f00; font-weight: bold');
      console.error('  Error:', error);
      throw error;
    }
  },

  // Build character description (shown to user in modal)
  buildCharacterDescription(character) {
    const parts = [];

    // Race
    if (character.race) {
      const raceDescriptions = {
        human: 'human with average features',
        elf: 'elf with pointed ears and graceful features',
        dwarf: 'dwarf with a thick beard and stocky build',
        halfling: 'halfling, small and cheerful',
        dragonborn: 'dragonborn with scaled skin and dragon-like features',
        gnome: 'gnome, small with clever eyes',
        'half-elf': 'half-elf with slightly pointed ears',
        'half-orc': 'half-orc with tusks and powerful build',
        tiefling: 'tiefling with horns and a tail',
      };
      parts.push(raceDescriptions[character.race] || character.race);
    }

    // Class
    if (character.class) {
      const classDescriptions = {
        fighter: 'wearing heavy armor and holding a sword',
        wizard: 'in flowing robes holding a staff',
        rogue: 'in dark leather armor with daggers',
        cleric: 'in holy vestments with a sacred symbol',
        ranger: 'with a bow and forest attire',
        paladin: 'in shining armor with a holy shield',
        barbarian: 'with wild hair wielding a massive axe',
        bard: 'with a lute and colorful clothing',
        druid: 'with nature-themed robes and wooden staff',
        monk: 'in simple robes in a martial stance',
        sorcerer: 'with crackling magical energy',
        warlock: 'with dark robes and eldritch symbols',
      };
      parts.push(classDescriptions[character.class] || character.class);
    }

    // Magic specialization (only for spellcasting classes)
    if (character.class) {
      const magicSpecializations = {
        wizard: 'specializing in elemental magic like fire and ice',
        sorcerer: 'channeling raw elemental arcane power',
        warlock: 'wielding shadowy eldritch magic',
        cleric: 'focused on radiant and healing magic',
        druid: 'calling on primal nature and elemental magic',
        bard: 'weaving subtle enchantments and support magic through music',
        paladin: 'enhancing strikes with holy, radiant magic',
      };

      const magicText = magicSpecializations[character.class];
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
    const characterDescription = this.buildCharacterDescription(character);

    // Normalize class key for lookups
    const classKey = (character.class || 'default').toLowerCase();

    // Class-specific pose variants (5 each where applicable)
    const poseVariantsByClass = {
      // Martial / weapon-focused
      fighter: [
        'posed mid-swing with a heavy weapon, body twisted to show the arc of the strike',
        'standing in a ready battle stance, shield raised and weapon held low but tense',
        'caught in the moment of blocking an attack, weight shifted back with shield braced',
        'charging forward with weapon raised overhead, cloak and gear trailing behind',
        'standing atop fallen rubble in a victorious stance, weapon planted like a banner',
      ],
      barbarian: [
        'leaning forward in a feral roar, muscles tensed, weapon mid-swing',
        'standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands',
        'caught mid-leap as if diving into battle, hair and trophies flying outward',
        'holding a weapon across the shoulders, posture relaxed but intimidating',
        'bracing against an unseen impact, teeth bared and stance low and aggressive',
      ],
      paladin: [
        'kneeling with shield planted in front, weapon held upright in a solemn vow pose',
        'standing tall with shield forward and weapon raised in a protective gesture',
        'framed in a side stance, shield angled and weapon ready for a precise strike',
        'holding a holy symbol aloft with one hand while resting the weapon point-down',
        'striding forward with shield half-raised, cloak sweeping back in a confident march',
      ],
      rogue: [
        'crouched low in the shadows, one dagger drawn and the other held behind for balance',
        'leaning casually against an unseen wall, one hand resting on a hidden blade',
        'mid-step on a narrow ledge, body turned sideways with cloak pulled close',
        'poised behind an unseen target, daggers reversed in a silent takedown stance',
        'perched on a raised surface, knees bent, ready to spring into motion',
      ],
      monk: [
        'balanced on one leg in a classic kick pose, arms forming a flowing guard shape',
        'mid-strike with an open palm, body rotated and lines clean and focused',
        'seated in calm meditation, legs crossed and hands resting in a composed mudra',
        'low sweeping stance with one arm extended and the other drawn back defensively',
        'caught at the peak of a spinning kick, robes and sashes tracing the motion',
      ],
      ranger: [
        'drawing a bow with the string fully pulled, body turned in a three-quarter stance',
        'kneeling on one knee with bow lowered, scanning the distance like a watchful scout',
        'mid-stride through an implied forest floor, bow held loosely but ready',
        'standing on a slight rise, bow raised and arrow aimed slightly downward',
        'leaning against an unseen tree, one hand resting on the bow, posture relaxed but alert',
      ],

      // Casters and support
      wizard: [
        'standing with one hand raised and fingers splayed, arcane energy swirling upward',
        'leaning over an invisible spellbook, staff angled forward as if channeling power',
        'mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion',
        'holding a staff planted before them, gaze lifted as if calling down distant power',
        'caught turning dramatically, cloak sweeping, one hand tracing a glowing sigil',
      ],
      sorcerer: [
        'surrounded by swirling magical energy, one hand outstretched and the other pulled close',
        'standing with arms wide, raw power coiling around their torso and shoulders',
        'mid-step as a surge of magic bursts from the ground around their feet',
        'leaning back slightly as if resisting an overwhelming tide of inner power',
        'cradling a concentrated sphere of magic between both hands at chest height',
      ],
      warlock: [
        'holding a pact focus or talisman forward, dark energy streaming from it',
        'standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes',
        'reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind',
        'half-turned away, casting a spell over their shoulder with a sly or knowing posture',
        'arms crossed loosely while faint sigils burn in the air around them',
      ],
      cleric: [
        'raising a holy symbol high, light radiating outward in a protective arc',
        'standing with shield angled and mace lowered, posture firm and resolute',
        'kneeling in prayerful focus, holy symbol clasped between both hands',
        'reaching one hand toward an unseen ally as if channeling healing energy',
        'planting a weapon or staff into the ground as radiant power rises around them',
      ],
      druid: [
        'standing with staff planted in the earth, vines and leaves swirling around',
        'mid-transformation pose, body partly turned and framed by natural shapes',
        'kneeling to touch the ground, one hand extended as if coaxing growth',
        'arms lifted as if calling wind or storm, cloak and hair driven by imaginary weather',
        'leaning gently against an unseen tree, posture relaxed and rooted',
      ],
      bard: [
        'mid-performance with an instrument, one foot forward and body open to an unseen crowd',
        'leaning back in a dramatic flourish, cloak and hair trailing with the motion',
        'perched casually on an unseen stool or crate, instrument resting comfortably in hand',
        'bowing deeply at the end of a performance, one arm sweeping wide',
        'caught mid-step in a dance-like pose, instrument held close to the torso',
      ],

      // Default / non-class-specific fallback
      default: [
        'standing in a relaxed but heroic stance, weight shifted slightly to one side',
        'mid-stride as if walking toward the viewer with confident energy',
        'standing in profile with head turned toward the viewer, posture composed and steady',
        'seated on an implied stone or crate, leaning slightly forward in a thoughtful pose',
        'standing with arms loosely folded or resting on a weapon, calm and watchful',
      ],
    };

    // Camera angle variants (5 each where applicable)
    const cameraVariantsByClass = {
      fighter: [
        'Camera angle: slightly low and three-quarter to emphasize strength and presence.',
        'Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.',
        'Camera angle: three-quarter from the shield side, highlighting defense and stance.',
        'Camera angle: slightly above, looking down to show battlefield context around the figure.',
        'Camera angle: close to ground level, making the character loom large in the frame.',
      ],
      barbarian: [
        'Camera angle: low and close, exaggerating size and ferocity.',
        'Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.',
        'Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.',
        'Camera angle: pulled back to show the full silhouette and large weapon in motion.',
        'Camera angle: slightly below the shoulders, looking up into a battle roar.',
      ],
      paladin: [
        'Camera angle: eye-level, straight on, emphasizing honor and symmetry.',
        'Camera angle: slightly low, looking up past the shield to give a guardian feeling.',
        'Camera angle: three-quarter from the weapon side, showing both devotion and readiness.',
        'Camera angle: slightly above, as if from the viewpoint of someone being protected.',
        'Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.',
      ],
      rogue: [
        'Camera angle: slightly above and to the side, emphasizing stealth and environment.',
        'Camera angle: three-quarter from behind, with the face turned back toward the viewer.',
        'Camera angle: low and angled sharply, creating long, dramatic shadows.',
        'Camera angle: tight framing around the upper body, leaving the background mostly in shadow.',
        'Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.',
      ],
      monk: [
        'Camera angle: mid-distance and centered, capturing clean lines of the martial pose.',
        'Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.',
        'Camera angle: from above, looking down on a circular stance pattern.',
        'Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.',
        'Camera angle: side-on profile to highlight precision and alignment of the form.',
      ],
      ranger: [
        'Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.',
        'Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.',
        'Camera angle: slightly elevated, framing the ranger and implied terrain below.',
        'Camera angle: low and angled upward through implied undergrowth or rough ground.',
        'Camera angle: mid-distance, with the character slightly off-center to suggest open space.',
      ],
      wizard: [
        'Camera angle: three-quarter, framing both staff and spell effect in the same view.',
        'Camera angle: slightly low, making the spellcasting gesture feel towering and grand.',
        'Camera angle: slightly above, looking down on a circle of arcane energy.',
        'Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.',
        'Camera angle: oblique and off-center, with arcane elements framing the composition.',
      ],
      sorcerer: [
        'Camera angle: close and low, centered on the chest where power is gathering.',
        'Camera angle: three-quarter from the side, showing energy spiraling around the figure.',
        'Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.',
        'Camera angle: tight framing on the face and hands, emphasizing raw intensity.',
        'Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.',
      ],
      warlock: [
        'Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.',
        'Camera angle: three-quarter from behind, looking toward an unseen source of power.',
        'Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.',
        'Camera angle: close to the focus or talisman, with the character looming just behind it.',
        'Camera angle: slightly above, letting eldritch patterns form around the character\'s feet.',
      ],
      cleric: [
        'Camera angle: slightly low, looking up toward the raised holy symbol.',
        'Camera angle: eye-level, centered to evoke balance and stability.',
        'Camera angle: three-quarter, allowing both shield and symbol to read clearly.',
        'Camera angle: slightly above, as if from the viewpoint of a blessed ally.',
        'Camera angle: mid-distance with the character framed symmetrically in the composition.',
      ],
      druid: [
        'Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.',
        'Camera angle: three-quarter, with implied branches or leaves partially framing the view.',
        'Camera angle: slightly above, looking down as if from a bird\'s-eye vantage.',
        'Camera angle: eye-level but softened, placing the character gently into the environment.',
        'Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.',
      ],
      bard: [
        'Camera angle: eye-level, as if the viewer is part of an unseen audience.',
        'Camera angle: three-quarter, capturing both gesture and instrument clearly.',
        'Camera angle: slightly low, turning a performance flourish into a heroic moment.',
        'Camera angle: above and angled, as if looking down from a balcony over a small stage.',
        'Camera angle: tight around the upper body and instrument, focusing on expression.',
      ],
      default: [
        'Camera angle: three-quarter view that clearly shows the full silhouette.',
        'Camera angle: eye-level, centered, with the figure dominating the frame.',
        'Camera angle: slightly low, making the character feel larger and more heroic.',
        'Camera angle: slightly above, looking down just enough to show shoulders and gear.',
        'Camera angle: mid-distance with the character placed slightly off-center for balance.',
      ],
    };

    // Select randomized pose and camera angle for this generation
    const poseList =
      poseVariantsByClass[classKey] || poseVariantsByClass.default;
    const cameraList =
      cameraVariantsByClass[classKey] || cameraVariantsByClass.default;

    const posePrompt =
      poseList[Math.floor(Math.random() * poseList.length)];
    const cameraPrompt =
      cameraList[Math.floor(Math.random() * cameraList.length)];

    const renderingInstructions = [
      `Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,
      'Art style: classic fantasy ink illustration with strong contrast.',
      'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
      'Include some controlled, directional hatching to define form (light mid-tone texture only).',
      'Use realistic heroic anatomy with natural proportions (smaller head, longer arms, taller figure).',
      `Pose: ${posePrompt}`,
      'Frame the character so the entire head, hands, and primary weapon or spell effect are fully visible in the image (no cropping at the top of the head).',
      cameraPrompt,
      'Background should be simple, entirely black, and free of symbols or text.',
      'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
      'Aspect ratio 3:4.',
    ];
    return renderingInstructions.join(' ');
  },

  // Analyze a rejected prompt to help identify problematic sections
  analyzeRejectedPrompt(prompt) {
    console.log('%c🔍 Analyzing Rejected Prompt', 'color: #ff0; font-weight: bold; font-size: 14px;');
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
      console.log('%c⚠️  POTENTIAL ISSUES DETECTED:', 'color: #f90; font-weight: bold;');
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
    console.log('%c💡 DEBUGGING SUGGESTIONS:', 'color: #0ff; font-weight: bold;');
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



