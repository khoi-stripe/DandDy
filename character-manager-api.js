// ========================================
// CHARACTER MANAGER - CLOUD API SERVICE
// ========================================
// Handles authentication and cloud storage operations for character-manager

// Auto-detect environment (local file / localhost vs deployed on GitHub Pages)
const isLocalEnvironment =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.protocol === 'file:';

// Use localhost in dev, Render in production (avoid global name collision)
const API_BASE_URL = isLocalEnvironment
  ? 'http://localhost:8000/api'
  : 'https://danddy-api.onrender.com/api';

const TOKEN_STORAGE_KEY = 'dnd_auth_token';
const USER_STORAGE_KEY = 'dnd_user_info';

// ========================================
// AUTH SERVICE (Extend existing if present)
// ========================================
// Extend the existing AuthService from character-builder-services.js
if (!window.AuthService) {
  window.AuthService = {};
}

// Override/add methods for character manager
Object.assign(window.AuthService, {
  // Register new user (override existing)
  async register(username, email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Registration failed');
      }

      const data = await response.json();
      this.setToken(data.access_token);
      this.setCurrentUser({ username, email });
      
      return { success: true, user: { username, email } };
    } catch (error) {
      console.error('Registration error:', error);
      return { success: false, error: error.message };
    }
  },

  // Login user (override existing)
  async login(username, password) {
    try {
      // OAuth2 password flow expects form data
      const formData = new FormData();
      formData.append('username', username);
      formData.append('password', password);

      const response = await fetch(`${API_BASE_URL}/auth/token`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Login failed');
      }

      const data = await response.json();
      this.setToken(data.access_token);
      
      // Fetch user profile
      const userProfile = await this.fetchUserProfile();
      if (userProfile) {
        this.setCurrentUser(userProfile);
      }

      return { success: true, user: userProfile };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: error.message };
    }
  },

  // Fetch user profile
  async fetchUserProfile() {
    try {
      const token = this.getToken();
      if (!token) return null;

      const response = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user profile');
      }

      return await response.json();
    } catch (error) {
      console.error('Fetch profile error:', error);
      return null;
    }
  },
});

// ========================================
// CHARACTER CLOUD STORAGE SERVICE
// ========================================
const CharacterCloudStorage = (window.CharacterCloudStorage = {
  // Convert localStorage character format to API format
  _toAPIFormat(character) {
    // Map frontend character structure to backend API schema
    return {
      name: character.name || 'Unnamed Character',
      race: character.race || character.raceData?.name || 'Human',
      character_class: character.class || character.classData?.name || 'Fighter',
      level: character.level || 1,
      background: character.background || character.backgroundData?.name || null,
      alignment: this._mapAlignment(character.alignment),
      experience_points: character.experiencePoints || 0,
      
      // Ability Scores
      strength: character.abilities?.str || character.abilityScores?.str || 10,
      dexterity: character.abilities?.dex || character.abilityScores?.dex || 10,
      constitution: character.abilities?.con || character.abilityScores?.con || 10,
      intelligence: character.abilities?.int || character.abilityScores?.int || 10,
      wisdom: character.abilities?.wis || character.abilityScores?.wis || 10,
      charisma: character.abilities?.cha || character.abilityScores?.cha || 10,
      
      // Combat Stats
      hit_points_max: character.hitPoints?.max || character.hitPoints || 10,
      hit_points_current: character.hitPoints?.current || character.hitPoints?.max || character.hitPoints || 10,
      hit_points_temp: character.hitPoints?.temp || 0,
      armor_class: character.armorClass || 10,
      initiative: character.initiative || 0,
      speed: character.speed || 30,
      
      // Death Saves
      death_save_successes: character.deathSaves?.successes || 0,
      death_save_failures: character.deathSaves?.failures || 0,
      
      // Proficiencies (arrays)
      saving_throw_proficiencies: character.savingThrows || [],
      skill_proficiencies: character.skillProficiencies || [],
      skill_expertises: character.skillExpertises || [],
      tool_proficiencies: character.toolProficiencies || [],
      languages: character.languages || [],
      
      // Features and Traits
      racial_traits: character.racialTraits || character.raceData?.traits || [],
      class_features: character.classFeatures || character.classData?.features || [],
      feats: character.feats || [],
      background_feature: character.backgroundFeature || character.backgroundData?.feature || {},
      
      // Personality
      personality_traits: character.personalityTraits || character.personalityTrait || null,
      ideals: character.ideals || null,
      bonds: character.bonds || null,
      flaws: character.flaws || null,
      
      // Appearance & Backstory
      appearance: character.appearance || null,
      backstory: character.backstory || null,
      
      // Portrait Data
      ascii_portrait: character.asciiPortrait || null,
      original_portrait_url: character.originalPortraitUrl || null,
      custom_portrait_ascii: character.customPortraitAscii || null,
      custom_portrait_count: character.customPortraitCount || 0,
      portrait_metadata: character.portraitMetadata || {},
      
      // Inventory
      inventory: (character.equipment || []).map(item => 
        typeof item === 'string' ? { name: item } : item
      ),
      
      // Spellcasting
      spellcasting_ability: character.spellcastingAbility || null,
      spell_save_dc: character.spellSaveDC || null,
      spell_attack_bonus: character.spellAttackBonus || null,
      spell_slots: character.spellSlots || {},
      spell_slots_used: character.spellSlotsUsed || {},
      spells_known: character.spellsKnown || [],
      spells_prepared: character.spellsPrepared || [],
      
      // Combat
      conditions: character.conditions || [],
      attacks: character.attacks || [],
      
      // Currency
      copper_pieces: character.currency?.cp || 0,
      silver_pieces: character.currency?.sp || 0,
      electrum_pieces: character.currency?.ep || 0,
      gold_pieces: character.currency?.gp || 0,
      platinum_pieces: character.currency?.pp || 0,
      
      // Campaign
      campaign_id: character.campaignId || null,
    };
  },

  // Convert API format to frontend character format
  _fromAPIFormat(apiChar) {
    return {
      id: apiChar.id.toString(),
      name: apiChar.name,
      race: apiChar.race,
      class: apiChar.character_class,
      level: apiChar.level,
      background: apiChar.background,
      alignment: apiChar.alignment,
      experiencePoints: apiChar.experience_points,
      
      // Ability Scores
      abilities: {
        str: apiChar.strength,
        dex: apiChar.dexterity,
        con: apiChar.constitution,
        int: apiChar.intelligence,
        wis: apiChar.wisdom,
        cha: apiChar.charisma,
      },
      
      // Combat Stats
      hitPoints: {
        max: apiChar.hit_points_max,
        current: apiChar.hit_points_current,
        temp: apiChar.hit_points_temp,
      },
      armorClass: apiChar.armor_class,
      initiative: apiChar.initiative,
      speed: apiChar.speed,
      
      // Proficiencies
      savingThrows: apiChar.saving_throw_proficiencies,
      skillProficiencies: apiChar.skill_proficiencies,
      skillExpertises: apiChar.skill_expertises,
      toolProficiencies: apiChar.tool_proficiencies,
      languages: apiChar.languages,
      
      // Features
      racialTraits: apiChar.racial_traits,
      classFeatures: apiChar.class_features,
      feats: apiChar.feats,
      backgroundFeature: apiChar.background_feature,
      
      // Personality & Backstory
      personalityTraits: apiChar.personality_traits,
      ideals: apiChar.ideals,
      bonds: apiChar.bonds,
      flaws: apiChar.flaws,
      appearance: apiChar.appearance,
      backstory: apiChar.backstory,
      
      // Equipment
      equipment: apiChar.inventory.map(item => 
        typeof item === 'object' && item.name ? item.name : item
      ),
      
      // Spellcasting
      spellcastingAbility: apiChar.spellcasting_ability,
      spellSaveDC: apiChar.spell_save_dc,
      spellAttackBonus: apiChar.spell_attack_bonus,
      spellSlots: apiChar.spell_slots,
      spellSlotsUsed: apiChar.spell_slots_used,
      spellsKnown: apiChar.spells_known,
      spellsPrepared: apiChar.spells_prepared,
      
      // Combat
      conditions: apiChar.conditions,
      attacks: apiChar.attacks,
      
      // Currency
      currency: {
        cp: apiChar.copper_pieces,
        sp: apiChar.silver_pieces,
        ep: apiChar.electrum_pieces,
        gp: apiChar.gold_pieces,
        pp: apiChar.platinum_pieces,
      },
      
      // Metadata
      campaignId: apiChar.campaign_id,
      ownerId: apiChar.owner_id,
      createdAt: apiChar.created_at,
      updatedAt: apiChar.updated_at,
      
      // Portrait data (from API snake_case fields)
      asciiPortrait: apiChar.ascii_portrait,
      originalPortraitUrl: apiChar.original_portrait_url,
      customPortraitAscii: apiChar.custom_portrait_ascii,
      customPortraitCount: apiChar.custom_portrait_count || 0,
      portraitMetadata: apiChar.portrait_metadata || {},
    };
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
      console.log('☁️ CLOUD: Fetching all characters from API...');
      const apiChars = await this._apiRequest('/characters/');
      const characters = apiChars.map(c => this._fromAPIFormat(c));
      console.log('☁️ CLOUD: Retrieved', characters.length, 'characters');
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch characters:', error);
      throw error;
    }
  },

  // Get single character by ID
  async getById(id) {
    try {
      console.log('☁️ CLOUD: Fetching character', id);
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
      console.log('☁️ CLOUD: Creating character:', character.name);
      const apiData = this._toAPIFormat(character);
      const apiChar = await this._apiRequest('/characters/', {
        method: 'POST',
        body: JSON.stringify(apiData),
      });
      
      const newChar = this._fromAPIFormat(apiChar);
      console.log('☁️ CLOUD: Character created with ID:', newChar.id);
      return newChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to create character:', error);
      throw error;
    }
  },

  // Update existing character
  async update(id, updates) {
    try {
      console.log('☁️ CLOUD: Updating character', id);
      
      // For partial updates, we need to map the frontend fields
      const apiUpdates = {};
      
      // Map common update fields
      if (updates.name !== undefined) apiUpdates.name = updates.name;
      if (updates.level !== undefined) apiUpdates.level = updates.level;
      if (updates.experiencePoints !== undefined) apiUpdates.experience_points = updates.experiencePoints;
      
      // Combat stats
      if (updates.hitPoints?.current !== undefined) apiUpdates.hit_points_current = updates.hitPoints.current;
      if (updates.hitPoints?.temp !== undefined) apiUpdates.hit_points_temp = updates.hitPoints.temp;
      
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
      console.log('☁️ CLOUD: Deleting character', id);
      await this._apiRequest(`/characters/${id}`, { method: 'DELETE' });
      console.log('☁️ CLOUD: Character deleted successfully');
      return true;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to delete character:', error);
      throw error;
    }
  },

  // Duplicate character
  async duplicate(id) {
    try {
      console.log('☁️ CLOUD: Duplicating character', id);
      const apiChar = await this._apiRequest(`/characters/${id}/duplicate`, {
        method: 'POST',
      });
      const duplicated = this._fromAPIFormat(apiChar);
      console.log('☁️ CLOUD: Character duplicated with ID:', duplicated.id);
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
      console.log('☁️ CLOUD: Importing character from JSON');
      const character = JSON.parse(jsonString);
      
      // Remove ID if it exists (create new character)
      delete character.id;
      delete character.ownerId;
      
      const result = await this.add(character);
      console.log('☁️ CLOUD: Character imported with ID:', result.id);
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
  LOCAL_STORAGE_KEY: 'dnd_characters',
  
  // Check if there are characters in localStorage
  hasLocalCharacters() {
    const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    const characters = data ? JSON.parse(data) : [];
    return characters.length > 0;
  },

  // Get count of local characters
  getLocalCharacterCount() {
    const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    const characters = data ? JSON.parse(data) : [];
    return characters.length;
  },

  // Migrate all localStorage characters to cloud
  async migrateToCloud() {
    try {
      if (!AuthService.isAuthenticated()) {
        throw new Error('Must be logged in to migrate characters');
      }

      console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');
      
      const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
      const localCharacters = data ? JSON.parse(data) : [];
      
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
          await CharacterCloudStorage.add(character);
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
    const data = localStorage.getItem(this.LOCAL_STORAGE_KEY);
    if (data) {
      const backup = {
        timestamp: new Date().toISOString(),
        characters: JSON.parse(data),
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
    localStorage.removeItem(this.LOCAL_STORAGE_KEY);
    console.log('📦 CLEAR: Cleared localStorage characters');
  },
});

console.log('☁️ Character Manager Cloud API Service loaded');

