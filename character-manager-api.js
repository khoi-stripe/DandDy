// ========================================
// CHARACTER MANAGER - CLOUD API SERVICE
// ========================================
// Handles authentication and cloud storage operations for character-manager

// Shared environment / URL config (single source of truth for the whole app)
const {
  isLocalEnvironment = false,
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} = window.DanddyConfig || {};

const DEBUG_CLOUD = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

// ========================================
// AUTH SERVICE
// ========================================
// The unified AuthService is now defined in `danddy-auth.js` and exposed as
// `window.AuthService`. This file only *uses* that shared service (for example,
// via AuthService.getToken() inside API helpers below).

// ========================================
// CHARACTER CLOUD STORAGE SERVICE
// ========================================
const CharacterCloudStorage = (window.CharacterCloudStorage = {
  // Helper to convert spell arrays (objects or strings) to string arrays for backend
  _spellsToStringArray(arr) {
    if (!arr || !Array.isArray(arr)) return [];
    
    return arr.map(item => {
      // If it's an object with a name property, extract the name
      if (typeof item === 'object' && item !== null && item.name) {
        return item.name;
      }
      // If it's already a string, return as-is
      if (typeof item === 'string') {
        return item;
      }
      // Fallback - convert to string
      return String(item);
    });
  },
  
  // Convert localStorage character format to API format (shared mapper)
  _toAPIFormat(character) {
    return window.DanddyCharacterMapper.fromManagerToBackend(character);
  },
  
  // Convert API format to frontend character format (shared mapper)
  _fromAPIFormat(apiChar) {
    return window.DanddyCharacterMapper.fromBackendToManager(apiChar);
  },

  // Map alignment to API enum format
  _mapAlignment(alignment) {
    if (!alignment) return null;
    
    const alignmentMap = {
      'Lawful Good': 'lawful_good',
      'Neutral Good': 'neutral_good',
      'Chaotic Good': 'chaotic_good',
      'Lawful Neutral': 'lawful_neutral',
      'True Neutral': 'true_neutral',
      'Chaotic Neutral': 'chaotic_neutral',
      'Lawful Evil': 'lawful_evil',
      'Neutral Evil': 'neutral_evil',
      'Chaotic Evil': 'chaotic_evil',
    };
    
    return alignmentMap[alignment] || null;
  },

  // Make authenticated API request
  async _apiRequest(endpoint, options = {}) {
    const token = AuthService.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token expired or invalid – clear auth state and sync UI so the user
      // doesn't appear "logged in" while we silently fall back to local data.
      AuthService.clearToken();
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
      throw new Error('Session expired. Please log in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const detail =
        typeof error.detail === 'string'
          ? error.detail
          : JSON.stringify(error.detail || error);
      console.error('API error response:', error);
      throw new Error(detail || `API error: ${response.status}`);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return null;
    }

    return await response.json();
  },

  // Get all characters for current user
  async getAll() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching all characters from API...');
      }
      const apiChars = await this._apiRequest('/characters/');
      const characters = apiChars.map(c => this._fromAPIFormat(c));
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Retrieved', characters.length, 'characters');
      }
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch characters:', error);
      throw error;
    }
  },

  // Get single character by ID
  async getById(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}`);
      return this._fromAPIFormat(apiChar);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch character:', error);
      throw error;
    }
  },

  // Add new character
  async add(character) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Creating character:', character.name);
      }
      const apiData = this._toAPIFormat(character);
      const apiChar = await this._apiRequest('/characters/', {
        method: 'POST',
        body: JSON.stringify(apiData),
      });
      
      const newChar = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character created with ID:', newChar.id);
      }
      return newChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to create character:', error);
      throw error;
    }
  },

  // Update existing character
  async update(id, updates) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Updating character', id);
      }
      
      // For partial updates, we need to map the frontend fields
      const apiUpdates = {};
      
      // Map common update fields
      if (updates.name !== undefined) apiUpdates.name = updates.name;
      if (updates.level !== undefined) apiUpdates.level = updates.level;
      if (updates.experiencePoints !== undefined) apiUpdates.experience_points = updates.experiencePoints;
      if (updates.alignment !== undefined) {
        // Convert frontend alignment ID (lg, ce, etc.) to backend enum format
        const alignmentMap = {
          'lg': 'lawful_good',
          'ng': 'neutral_good',
          'cg': 'chaotic_good',
          'ln': 'lawful_neutral',
          'n': 'true_neutral',
          'cn': 'chaotic_neutral',
          'le': 'lawful_evil',
          'ne': 'neutral_evil',
          'ce': 'chaotic_evil'
        };
        apiUpdates.alignment = alignmentMap[updates.alignment] || updates.alignment;
      }
      
      // Ability Scores (partial updates from manager)
      if (updates.abilities) {
        const abilities = updates.abilities;
        if (abilities.str !== undefined) apiUpdates.strength = abilities.str;
        if (abilities.dex !== undefined) apiUpdates.dexterity = abilities.dex;
        if (abilities.con !== undefined) apiUpdates.constitution = abilities.con;
        if (abilities.int !== undefined) apiUpdates.intelligence = abilities.int;
        if (abilities.wis !== undefined) apiUpdates.wisdom = abilities.wis;
        if (abilities.cha !== undefined) apiUpdates.charisma = abilities.cha;
      }

      // Combat stats
      if (updates.hitPoints?.max !== undefined) apiUpdates.hit_points_max = updates.hitPoints.max;
      if (updates.hitPoints?.current !== undefined) apiUpdates.hit_points_current = updates.hitPoints.current;
      if (updates.hitPoints?.temp !== undefined) apiUpdates.hit_points_temp = updates.hitPoints.temp;
      if (updates.armorClass !== undefined) apiUpdates.armor_class = updates.armorClass;
      if (updates.initiative !== undefined) apiUpdates.initiative = updates.initiative;
      if (updates.speed !== undefined) apiUpdates.speed = updates.speed;
      
      // Arrays
      if (updates.skillProficiencies !== undefined) apiUpdates.skill_proficiencies = updates.skillProficiencies;
      if (updates.toolProficiencies !== undefined) apiUpdates.tool_proficiencies = updates.toolProficiencies;
      if (updates.languages !== undefined) apiUpdates.languages = updates.languages;
      if (updates.equipment !== undefined) {
        apiUpdates.inventory = updates.equipment.map(item => 
          typeof item === 'string' ? { name: item } : item
        );
      }
      if (updates.conditions !== undefined) apiUpdates.conditions = updates.conditions;
      
      // Text fields
      if (updates.backstory !== undefined) apiUpdates.backstory = updates.backstory;
      if (updates.sex !== undefined) apiUpdates.sex = updates.sex;
      
      // Portrait data
      if (updates.asciiPortrait !== undefined) apiUpdates.ascii_portrait = updates.asciiPortrait;
      if (updates.originalPortraitUrl !== undefined) apiUpdates.original_portrait_url = updates.originalPortraitUrl;
      if (updates.customPortraitAscii !== undefined) apiUpdates.custom_portrait_ascii = updates.customPortraitAscii;
      if (updates.customPortraitCount !== undefined) apiUpdates.custom_portrait_count = updates.customPortraitCount;
      if (updates.portraitMetadata !== undefined) apiUpdates.portrait_metadata = updates.portraitMetadata;
      
      const apiChar = await this._apiRequest(`/characters/${id}`, {
        method: 'PUT',
        body: JSON.stringify(apiUpdates),
      });
      
      const updatedChar = this._fromAPIFormat(apiChar);
      return updatedChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to update character:', error);
      throw error;
    }
  },

  // Delete character
  async delete(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Deleting character', id);
      }
      await this._apiRequest(`/characters/${id}`, { method: 'DELETE' });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character deleted successfully');
      }
      return true;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to delete character:', error);
      throw error;
    }
  },

  // Duplicate character
  async duplicate(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Duplicating character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}/duplicate`, {
        method: 'POST',
      });
      const duplicated = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character duplicated with ID:', duplicated.id);
      }
      return duplicated;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to duplicate character:', error);
      throw error;
    }
  },

  // Export character as JSON
  async export(id) {
    try {
      const character = await this.getById(id);
      return JSON.stringify(character, null, 2);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to export character:', error);
      throw error;
    }
  },

  // Import character from JSON
  async import(jsonString) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Importing character from JSON');
      }
      const character = JSON.parse(jsonString);
      
      // Remove ID if it exists (create new character)
      delete character.id;
      delete character.ownerId;
      
      const result = await this.add(character);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character imported with ID:', result.id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to import character:', error);
      return null;
    }
  },

  // Generate unique ID (not used for cloud storage, API generates IDs)
  generateId() {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
});

// ========================================
// MIGRATION UTILITY
// ========================================
const MigrationService = (window.MigrationService = {
  LOCAL_STORAGE_KEY: (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) || 'dnd_characters',
  
  // Check if there are characters in localStorage (excluding demo characters)
  hasLocalCharacters() {
    const characters = this._getLocalCharacters();
    // Only count non-demo characters for migration prompt
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length > 0;
  },

  // Check if there are demo characters in localStorage
  hasDemoCharacters() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return false;
    return characters.some(c => window.DemoCharacters.isDemo(c));
  },

  // Get all local characters (helper)
  _getLocalCharacters() {
    return (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
  },

  // Get count of local characters (excluding demo)
  getLocalCharacterCount() {
    const characters = this._getLocalCharacters();
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length;
  },

  // Get count of demo characters
  getDemoCharacterCount() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return 0;
    return characters.filter(c => window.DemoCharacters.isDemo(c)).length;
  },

  // Migrate localStorage characters to cloud
  // Options:
  //   includeDemoCharacters: boolean - whether to include demo characters (default: false)
  async migrateToCloud(options = {}) {
    const { includeDemoCharacters = false } = options;
    
    try {
      if (!AuthService.isAuthenticated()) {
        throw new Error('Must be logged in to migrate characters');
      }

      console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');
      
      let localCharacters = this._getLocalCharacters();
      
      // Filter out demo characters if not including them
      if (!includeDemoCharacters && window.DemoCharacters) {
        localCharacters = localCharacters.filter(c => !window.DemoCharacters.isDemo(c));
      }
      
      console.log('📦 MIGRATION: Found', localCharacters.length, 'characters to migrate');
      
      const results = {
        total: localCharacters.length,
        success: 0,
        failed: 0,
        errors: [],
      };

      for (const character of localCharacters) {
        try {
          console.log('📦 MIGRATION: Migrating', character.name);
          // Remove demo flag when migrating to cloud
          const charToMigrate = { ...character };
          delete charToMigrate.isDemo;
          // Generate new ID for cloud (remove demo prefix)
          if (charToMigrate.id && String(charToMigrate.id).startsWith('demo_')) {
            delete charToMigrate.id;
          }
          await CharacterCloudStorage.add(charToMigrate);
          results.success++;
        } catch (error) {
          console.error('📦 MIGRATION ERROR: Failed to migrate', character.name, error);
          results.failed++;
          results.errors.push({ character: character.name, error: error.message });
        }
      }

      console.log('📦 MIGRATION: Complete!', results.success, 'succeeded,', results.failed, 'failed');
      
      return results;
    } catch (error) {
      console.error('📦 MIGRATION ERROR:', error);
      throw error;
    }
  },

  // Backup localStorage data before clearing
  backupLocalStorage() {
    const chars =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
    if (chars && chars.length) {
      const backup = {
        timestamp: new Date().toISOString(),
        characters: chars,
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dnd-characters-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log('📦 BACKUP: Created backup of', backup.characters.length, 'characters');
      return true;
    }
    return false;
  },

  // Clear localStorage characters (after successful migration)
  clearLocalStorage() {
    if (window.DanddyStorage) {
      window.DanddyStorage.clearAll();
    } else {
      // Remove primary character storage
      localStorage.removeItem(this.LOCAL_STORAGE_KEY);
      // Also remove any legacy/cache copies of characters to avoid duplicates
      try {
        localStorage.removeItem(this.LOCAL_STORAGE_KEY + '_cache');
      } catch (e) {
        console.warn('📦 CLEAR: Failed to clear local cache key', e);
      }
    }
    if (DEBUG_CLOUD) {
      console.log('📦 CLEAR: Cleared local character storage (including cache, if present)');
    }
  },
});

if (DEBUG_CLOUD) {
  console.log('☁️ Character Manager Cloud API Service loaded');
}

