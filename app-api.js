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
      // Token expired or invalid – handle unexpected logout and notify user
      AuthService.handleUnexpectedLogout?.('character_api_401');
      throw new Error('Your session has expired. Please log in again.');
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

  // Helper to get portrait mode query param based on user preference
  _getPortraitModeParam() {
    try {
      if (window.StorageService && typeof StorageService.getPortraitViewMode === 'function') {
        const mode = StorageService.getPortraitViewMode();
        if (mode === 'original') {
          return '?portrait_mode=original';
        }
      }
    } catch (e) {
      // Non-fatal - default to including ASCII
    }
    return '';
  },

  // Get all characters for current user
  async getAll() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching all characters from API...');
      }
      const portraitParam = this._getPortraitModeParam();
      const apiChars = await this._apiRequest(`/characters/${portraitParam}`);
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

  // Get lightweight character list for current user (no heavy fields)
  async getAllLite() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching LITE character list from API...');
      }
      const apiChars = await this._apiRequest(`/characters/lite`);
      const characters = apiChars.map(c => window.DanddyCharacterMapper.fromBackendLiteToManager(c));
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Retrieved', characters.length, 'lite characters');
      }
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch lite characters:', error);
      throw error;
    }
  },

  // Get single character by ID
  async getById(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching character', id);
      }
      const portraitParam = this._getPortraitModeParam();
      const apiChar = await this._apiRequest(`/characters/${id}${portraitParam}`);
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
      
      // Spells
      if (updates.cantrips !== undefined) apiUpdates.cantrips = this._spellsToStringArray(updates.cantrips);
      if (updates.spellsKnown !== undefined) apiUpdates.spells_known = this._spellsToStringArray(updates.spellsKnown);
      if (updates.spellsPrepared !== undefined) apiUpdates.spells_prepared = this._spellsToStringArray(updates.spellsPrepared);
      if (updates.spellSlots !== undefined) apiUpdates.spell_slots = updates.spellSlots;
      if (updates.spellSlotsUsed !== undefined) apiUpdates.spell_slots_used = updates.spellSlotsUsed;
      
      // Hit dice and class resources
      if (updates.hitDiceCurrent !== undefined) apiUpdates.hit_dice_current = updates.hitDiceCurrent;
      if (updates.classResources !== undefined) apiUpdates.class_resources = updates.classResources;
      
      // Death saves
      if (updates.death_save_successes !== undefined) apiUpdates.death_save_successes = updates.death_save_successes;
      if (updates.death_save_failures !== undefined) apiUpdates.death_save_failures = updates.death_save_failures;
      
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

  // ========================================
  // CHARACTER SHARING
  // ========================================

  /**
   * Share a character with another user by username (primary) or email (fallback).
   * @param {number|string} characterId - The character ID to share
   * @param {Object} shareData - { to_username: string } or { to_email: string }
   * @returns {Promise<Object>} The created share record
   */
  async shareCharacterByUsernameOrEmail(characterId, shareData) {
    try {
      const identifier = shareData.to_username 
        ? `@${shareData.to_username}` 
        : shareData.to_email;
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Sharing character', characterId, 'to', identifier);
      }
      const result = await this._apiRequest(`/shares/character/${characterId}`, {
        method: 'POST',
        body: JSON.stringify(shareData),
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character shared successfully');
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to share character:', error);
      throw error;
    }
  },

  /**
   * Share a character with another user by email (legacy compatibility).
   * @deprecated Use shareCharacterByUsernameOrEmail instead
   */
  async shareCharacter(characterId, email) {
    return this.shareCharacterByUsernameOrEmail(characterId, { to_email: email });
  },

  /**
   * Get pending character shares for the current user.
   * @returns {Promise<Array>} List of pending shares with character previews
   */
  async getPendingShares() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching pending shares...');
      }
      const shares = await this._apiRequest('/shares/pending');
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', shares.length, 'pending shares');
      }
      return shares;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:', error);
      throw error;
    }
  },

  /**
   * Accept a pending character share (creates a copy).
   * @param {number} shareId - The share ID to accept
   * @returns {Promise<Object>} Result with the new character ID
   */
  async acceptShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Accepting share', shareId);
      }
      const result = await this._apiRequest(`/shares/${shareId}/accept`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share accepted, new character ID:', result.character_id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to accept share:', error);
      throw error;
    }
  },

  /**
   * Dismiss a pending character share (ignores forever).
   * @param {number} shareId - The share ID to dismiss
   * @returns {Promise<void>}
   */
  async dismissShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Dismissing share', shareId);
      }
      await this._apiRequest(`/shares/${shareId}/dismiss`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share dismissed');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to dismiss share:', error);
      throw error;
    }
  },

  /**
   * Leave a shared character (remove yourself as a collaborator).
   * @param {number|string} characterId - The character ID to leave
   * @returns {Promise<void>}
   */
  async leaveSharedCharacter(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Leaving shared character', characterId);
      }
      await this._apiRequest(`/characters/${characterId}/leave`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Left shared character');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to leave shared character:', error);
      throw error;
    }
  },

  /**
   * Get all collaborators for a character (owner only).
   * @param {number|string} characterId - The character ID
   * @returns {Promise<Array>} List of collaborators with id, user_email, permission, created_at
   */
  async getCollaborators(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching collaborators for character', characterId);
      }
      const collaborators = await this._apiRequest(`/characters/${characterId}/collaborators`);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', collaborators.length, 'collaborators');
      }
      return collaborators;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch collaborators:', error);
      throw error;
    }
  },

  /**
   * Remove a collaborator from a character (owner only).
   * @param {number|string} characterId - The character ID
   * @param {number} collaboratorId - The collaborator record ID to remove
   * @returns {Promise<void>}
   */
  async removeCollaborator(characterId, collaboratorId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Removing collaborator', collaboratorId, 'from character', characterId);
      }
      await this._apiRequest(`/characters/${characterId}/collaborators/${collaboratorId}`, {
        method: 'DELETE',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Collaborator removed');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to remove collaborator:', error);
      throw error;
    }
  },

  /**
   * Get pending share invitations for a character (owner only).
   * @param {number|string} characterId - The character ID
   * @returns {Promise<Array>} List of pending shares with id, to_email, created_at
   */
  async getPendingSharesForCharacter(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching pending shares for character', characterId);
      }
      const shares = await this._apiRequest(`/shares/character/${characterId}/pending`);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', shares.length, 'pending shares');
      }
      return shares;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:', error);
      throw error;
    }
  },

  /**
   * Cancel a pending share invitation (owner only).
   * @param {number|string} characterId - The character ID
   * @param {number} shareId - The share record ID to cancel
   * @returns {Promise<void>}
   */
  async cancelPendingShare(characterId, shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Canceling pending share', shareId, 'for character', characterId);
      }
      await this._apiRequest(`/shares/character/${characterId}/pending/${shareId}`, {
        method: 'DELETE',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Pending share canceled');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to cancel pending share:', error);
      throw error;
    }
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

// ========================================
// CAMPAIGN API SERVICE
// ========================================
// Handles campaign and session operations for campaign tracking feature

const DEBUG_CAMPAIGN = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

const CampaignAPI = (window.CampaignAPI = {
  
  // ========================================
  // HELPER METHODS
  // ========================================
  
  // Make authenticated API request (reuses pattern from CharacterCloudStorage)
  async _apiRequest(endpoint, options = {}) {
    const { API_BASE_URL } = window.DanddyConfig || {};
    const token = window.AuthService?.getToken();
    
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
      window.AuthService?.handleUnexpectedLogout?.('campaign_api_401');
      throw new Error('Your session has expired. Please log in again.');
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
      const detail = typeof error.detail === 'string'
        ? error.detail
        : JSON.stringify(error.detail || error);
      console.error('Campaign API error:', error);
      throw new Error(detail || `API error: ${response.status}`);
    }

    if (response.status === 204) {
      return null;
    }

    return await response.json();
  },

  // ========================================
  // CAMPAIGN METHODS
  // ========================================

  /**
   * Get all campaigns the user is a member of
   * @returns {Promise<Array>} List of campaigns
   */
  async getCampaigns() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaigns...');
      const campaigns = await this._apiRequest('/campaigns/');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', campaigns.length, 'campaigns');
      return campaigns;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaigns:', error);
      throw error;
    }
  },

  /**
   * Get past campaigns the user was a member of
   * (campaigns they left or that have been completed/archived)
   * @param {number|null} [characterId] - Optional character ID to filter by specific character
   * @returns {Promise<Array>} List of past campaigns with member info
   */
  async getPastCampaigns(characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching past campaigns...', characterId ? `for character ${characterId}` : '');
      const url = characterId ? `/campaigns/past?character_id=${characterId}` : '/campaigns/past';
      const campaigns = await this._apiRequest(url);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', campaigns.length, 'past campaigns');
      return campaigns;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch past campaigns:', error);
      throw error;
    }
  },

  /**
   * Get historical journal entries for a past campaign
   * @param {number} campaignId
   * @param {number} [limit=100] - Maximum entries to return
   * @returns {Promise<Array>} Journal entries (respecting visibility settings)
   */
  async getPastCampaignJournals(campaignId, limit = 100) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching past campaign journals for', campaignId);
      const journals = await this._apiRequest(`/journal/campaign/${campaignId}/history?limit=${limit}`);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', journals.length, 'journal entries');
      return journals;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch past campaign journals:', error);
      throw error;
    }
  },

  /**
   * Get a single campaign with characters
   * @param {number} campaignId
   * @returns {Promise<Object>} Campaign with characters
   */
  async getCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign:', error);
      throw error;
    }
  },

  /**
   * Create a new campaign
   * @param {Object} data - { name, description? }
   * @returns {Promise<Object>} Created campaign
   */
  async createCampaign(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Creating campaign:', data.name);
      const campaign = await this._apiRequest('/campaigns/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Created with invite code:', campaign.invite_code);
      return campaign;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to create campaign:', error);
      throw error;
    }
  },

  /**
   * Update a campaign
   * @param {number} campaignId
   * @param {Object} data - { name?, description?, status? }
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaign(campaignId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Updating campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to update campaign:', error);
      throw error;
    }
  },

  /**
   * Delete a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async deleteCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleting campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleted successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to delete campaign:', error);
      throw error;
    }
  },

  /**
   * Regenerate invite code for a campaign
   * @param {number} campaignId
   * @returns {Promise<Object>} Updated campaign with new invite code
   */
  async regenerateInviteCode(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Regenerating invite code for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/regenerate-code`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to regenerate invite code:', error);
      throw error;
    }
  },

  // ========================================
  // JOIN / MEMBERSHIP METHODS
  // ========================================

  /**
   * Join a campaign using an invite code
   * @param {string} inviteCode
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async joinCampaign(inviteCode, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joining with code:', inviteCode);
      const result = await this._apiRequest('/campaigns/join', {
        method: 'POST',
        body: JSON.stringify({
          invite_code: inviteCode,
          character_id: characterId,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joined campaign:', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to join campaign:', error);
      throw error;
    }
  },

  /**
   * Get all members of a campaign
   * @param {number} campaignId
   * @returns {Promise<Array>} List of members
   */
  async getCampaignMembers(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching members for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/members`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch members:', error);
      throw error;
    }
  },

  /**
   * Assign a character to your campaign membership
   * @param {number} campaignId
   * @param {number} characterId
   * @returns {Promise<Object>} Updated membership
   */
  async assignCharacter(campaignId, characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Assigning character', characterId, 'to campaign', campaignId);
      return await this._apiRequest(
        `/campaigns/${campaignId}/members/assign-character?character_id=${characterId}`,
        { method: 'PUT' }
      );
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to assign character:', error);
      throw error;
    }
  },

  /**
   * Leave a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async leaveCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Leaving campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/members/leave`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Left successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to leave campaign:', error);
      throw error;
    }
  },

  // ========================================
  // INVITATION METHODS
  // ========================================

  /**
   * Get pending campaign invitations for the current user
   * @returns {Promise<Array>} List of pending invitations
   */
  async getPendingInvitations() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations...');
      const invitations = await this._apiRequest('/campaigns/invitations/pending');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch invitations:', error);
      throw error;
    }
  },

  /**
   * Invite a user to a campaign by username (primary) or email (fallback).
   * @param {number} campaignId
   * @param {string} identifier - Username (starting with @) or email address
   * @returns {Promise<Object>} Invitation result
   */
  async inviteByUsernameOrEmail(campaignId, identifier) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Inviting', identifier, 'to campaign', campaignId);
      
      // Determine if this is a username (@user) or email
      const isUsername = identifier.startsWith('@');
      const body = isUsername 
        ? { username: identifier.substring(1) }  // Remove @ prefix
        : { email: identifier };
      
      return await this._apiRequest(`/campaigns/${campaignId}/invite`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to invite user:', error);
      throw error;
    }
  },

  /**
   * Invite a user to a campaign by email (legacy compatibility)
   * @deprecated Use inviteByUsernameOrEmail instead
   */
  async inviteByEmail(campaignId, email) {
    return this.inviteByUsernameOrEmail(campaignId, email);
  },

  /**
   * Look up a user by username (for invitation/sharing validation)
   * @param {string} username - Username to look up (with or without @ prefix)
   * @returns {Promise<{id: number, username: string}>} User info
   * @throws {Error} If user not found
   */
  async lookupUserByUsername(username) {
    try {
      // Strip @ prefix if present
      const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Looking up user by username:', cleanUsername);
      return await this._apiRequest(`/users/lookup?username=${encodeURIComponent(cleanUsername)}`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to lookup user:', error);
      throw error;
    }
  },

  /**
   * Get pending invitations sent from a campaign (for DM to see who's been invited)
   * @param {number} campaignId
   * @returns {Promise<Array>} List of pending invitations with email
   */
  async getCampaignPendingInvitations(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations for campaign', campaignId);
      const invitations = await this._apiRequest(`/campaigns/${campaignId}/pending-invitations`);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign pending invitations:', error);
      throw error;
    }
  },

  /**
   * Accept a campaign invitation
   * @param {number} campaignId
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async acceptInvitation(campaignId, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepting invitation for campaign', campaignId);
      const result = await this._apiRequest(`/campaigns/${campaignId}/accept-invitation`, {
        method: 'POST',
        body: JSON.stringify({ character_id: characterId }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepted invitation, now member of', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to accept invitation:', error);
      throw error;
    }
  },

  /**
   * Decline a campaign invitation
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async declineInvitation(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declining invitation for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/decline-invitation`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declined invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to decline invitation:', error);
      throw error;
    }
  },

  /**
   * Revoke a campaign invitation (DM only)
   * @param {number} campaignId
   * @param {number} invitationId - The membership/invitation ID to revoke
   * @returns {Promise<void>}
   */
  async revokeInvitation(campaignId, invitationId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoking invitation', invitationId, 'for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/revoke-invitation/${invitationId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoked invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to revoke invitation:', error);
      throw error;
    }
  },

  // ========================================
  // SESSION METHODS
  // ========================================

  /**
   * Start a new session for a character
   * @param {number} characterId
   * @param {number?} campaignId - Optional, uses character's campaign if not provided
   * @param {string?} name - Optional session name
   * @returns {Promise<Object>} Created session
   */
  async startSession(characterId, campaignId = null, name = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Starting session for character', characterId);
      const session = await this._apiRequest('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({
          character_id: characterId,
          campaign_id: campaignId,
          name: name,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Started session #', session.session_number);
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to start session:', error);
      throw error;
    }
  },

  /**
   * End a session with optional post-session log
   * @param {number} sessionId
   * @param {Object?} logData - Optional post-session data
   * @returns {Promise<Object>} Completed session with log
   */
  async endSession(sessionId, logData = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Ending session', sessionId);
      const session = await this._apiRequest(`/sessions/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify(logData || {}),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Session ended');
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to end session:', error);
      throw error;
    }
  },

  /**
   * Cancel an active session without logging
   * @param {number} sessionId
   * @returns {Promise<Object>} Cancelled session
   */
  async cancelSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Cancelling session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/cancel`, { method: 'POST' });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to cancel session:', error);
      throw error;
    }
  },

  /**
   * Get active session for a character
   * @param {number} characterId
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Checking active session for character', characterId);
      return await this._apiRequest(`/sessions/active?character_id=${characterId}`);
    } catch (error) {
      // 404 means no active session, which is fine
      if (error.message.includes('404')) {
        return null;
      }
      console.error('🎲 SESSION ERROR: Failed to check active session:', error);
      throw error;
    }
  },

  /**
   * Get session history for a character
   * @param {number} characterId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCharacterSessions(characterId, limit = 20) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for character', characterId);
      return await this._apiRequest(`/sessions/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch character sessions:', error);
      throw error;
    }
  },

  /**
   * Get all sessions for a campaign
   * @param {number} campaignId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCampaignSessions(campaignId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for campaign', campaignId);
      return await this._apiRequest(`/sessions/campaign/${campaignId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch campaign sessions:', error);
      throw error;
    }
  },

  /**
   * Get a specific session
   * @param {number} sessionId
   * @returns {Promise<Object>} Session with log
   */
  async getSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch session:', error);
      throw error;
    }
  },

  /**
   * Add or update session log (for backdated entries)
   * @param {number} sessionId
   * @param {Object} logData
   * @returns {Promise<Object>} Session log
   */
  async addSessionLog(sessionId, logData) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Adding log to session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/log`, {
        method: 'POST',
        body: JSON.stringify(logData),
      });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to add session log:', error);
      throw error;
    }
  },

  // ========================================
  // JOURNAL ENTRY METHODS
  // ========================================

  /**
   * Get journal entries for a character
   * @param {number} characterId
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} List of journal entries (newest first)
   */
  async getJournalEntries(characterId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entries for character', characterId);
      return await this._apiRequest(`/journal/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entries:', error);
      throw error;
    }
  },

  /**
   * Get a single journal entry
   * @param {number} entryId
   * @returns {Promise<Object>} Journal entry
   */
  async getJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entry:', error);
      throw error;
    }
  },

  /**
   * Create a new journal entry
   * @param {Object} data - { character_id, title, content, entry_date, campaign_id? }
   * @returns {Promise<Object>} Created journal entry
   */
  async createJournalEntry(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating entry:', data.title);
      const entry = await this._apiRequest('/journal/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Created entry', entry.id);
      return entry;
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create entry:', error);
      throw error;
    }
  },

  /**
   * Update a journal entry
   * @param {number} entryId
   * @param {Object} data - { title?, content?, entry_date? }
   * @returns {Promise<Object>} Updated journal entry
   */
  async updateJournalEntry(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Updating entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to update entry:', error);
      throw error;
    }
  },

  /**
   * Delete a journal entry
   * @param {number} entryId
   * @returns {Promise<void>}
   */
  async deleteJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleting entry', entryId);
      await this._apiRequest(`/journal/${entryId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleted entry', entryId);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to delete entry:', error);
      throw error;
    }
  },

  /**
   * Create a character update linked to a journal entry
   * @param {number} entryId - Journal entry to link
   * @param {Object} data - { xp_gained, gold_change, hp_change, items_acquired, items_lost, conditions }
   * @returns {Promise<Object>} Character update record
   */
  async createCharacterUpdate(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating character update for entry', entryId);
      return await this._apiRequest(`/journal/${entryId}/character-update`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create character update:', error);
      throw error;
    }
  },

  /**
   * Get campaign-wide journal entries with visibility filtering
   * @param {number} campaignId
   * @param {number|null} userId - Optional filter by user ID
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} List of journal entries with character_name and user_email
   */
  async getCampaignJournalEntries(campaignId, userId = null, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching campaign entries for', campaignId, 'user filter:', userId);
      let url = `/journal/campaign/${campaignId}?limit=${limit}`;
      if (userId !== null) {
        url += `&user_id=${userId}`;
      }
      return await this._apiRequest(url);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch campaign entries:', error);
      throw error;
    }
  },

  /**
   * Update journal visibility setting for your campaign membership
   * @param {number} campaignId
   * @param {string} visibility - "private" or "public"
   * @returns {Promise<Object>} Updated membership
   */
  async updateJournalVisibility(campaignId, visibility) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Updating visibility for campaign', campaignId, 'to', visibility);
      return await this._apiRequest(`/campaigns/${campaignId}/members/journal-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ visibility }),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to update visibility:', error);
      throw error;
    }
  },
});

if (DEBUG_CAMPAIGN) {
  console.log('🏰 Campaign API Service loaded');
}

