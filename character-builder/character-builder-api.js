// API service layer for backend character operations.
// Exposes CharacterAPI as global on window.

const CharacterAPI = (window.CharacterAPI = {
  // Helper to convert arrays to dict format for backend
  arrayToDict(arr) {
    if (!arr || !Array.isArray(arr)) return [];
    
    return arr.map(item => {
      // If already an object, return as-is
      if (typeof item === 'object' && item !== null) {
        return item;
      }
      // If string, convert to dict format
      if (typeof item === 'string') {
        return { name: item };
      }
      // Fallback
      return { value: item };
    });
  },
  
  // Helper to make authenticated API requests
  async request(method, endpoint, body = null) {
    const token = AuthService.getToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = {
      method,
      headers,
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}${endpoint}`, options);
      
      if (response.status === 401) {
        // Token expired or invalid
        AuthService.clearToken();
        throw new Error('Session expired. Please log in again.');
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `API error: ${response.status}`);
      }
      
      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed [${method} ${endpoint}]:`, error);
      throw error;
    }
  },
  
  // Transform frontend character format to backend format
  toBackendFormat(character) {
    // Map frontend character properties to backend schema
    return {
      name: character.name || '',
      race: character.race || '',
      character_class: character.class || '',
      level: character.level || 1,
      background: character.background || null,
      alignment: this.mapAlignment(character.alignment),
      experience_points: character.experiencePoints || 0,
      
      // Ability Scores
      strength: character.abilities?.str || 10,
      dexterity: character.abilities?.dex || 10,
      constitution: character.abilities?.con || 10,
      intelligence: character.abilities?.int || 10,
      wisdom: character.abilities?.wis || 10,
      charisma: character.abilities?.cha || 10,
      
      // Combat Stats
      hit_points_max: character.hitPoints || 10,
      hit_points_current: character.hitPoints || 10,
      hit_points_temp: 0,
      armor_class: this.calculateAC(character),
      initiative: this.calculateInitiative(character),
      speed: this.getSpeed(character),
      
      // Death Saves
      death_save_successes: 0,
      death_save_failures: 0,
      
      // Proficiencies
      saving_throw_proficiencies: character.savingThrows || [],
      skill_proficiencies: character.skillProficiencies || [],
      skill_expertises: [],
      tool_proficiencies: character.toolProficiencies || [],
      languages: character.languages || [],
      
      // Features (convert strings to dict format if needed)
      racial_traits: this.arrayToDict(character.racialTraits),
      class_features: this.arrayToDict(character.classFeatures),
      feats: [],
      background_feature: character.backgroundFeature || {},
      
      // Personality
      personality_traits: character.personalityTrait || null,
      ideals: character.ideal || null,
      bonds: character.bond || null,
      flaws: character.flaw || null,
      
      // Appearance
      appearance: character.appearance || null,
      backstory: character.backstory || null,
      
      // Inventory (convert strings to dict format)
      inventory: this.arrayToDict(character.equipment),
      
      // Spellcasting
      spellcasting_ability: character.spellcastingAbility || null,
      spell_save_dc: character.spellSaveDC || null,
      spell_attack_bonus: character.spellAttackBonus || null,
      spell_slots: character.spellSlots || {},
      spell_slots_used: {},
      spells_known: this.arrayToDict(character.spells),
      spells_prepared: character.preparedSpells || [],
      
      // Combat
      conditions: [],
      attacks: this.arrayToDict(character.attacks),
      
      // Currency
      copper_pieces: character.copper || 0,
      silver_pieces: character.silver || 0,
      electrum_pieces: character.electrum || 0,
      gold_pieces: character.gold || 0,
      platinum_pieces: character.platinum || 0,
      
      // Campaign
      campaign_id: character.campaignId || null,
    };
  },
  
  // Transform backend character format to frontend format
  toFrontendFormat(backendChar) {
    return {
      id: backendChar.id,
      name: backendChar.name,
      race: backendChar.race,
      class: backendChar.character_class,
      level: backendChar.level,
      background: backendChar.background,
      alignment: backendChar.alignment,
      experiencePoints: backendChar.experience_points,
      
      abilities: {
        str: backendChar.strength,
        dex: backendChar.dexterity,
        con: backendChar.constitution,
        int: backendChar.intelligence,
        wis: backendChar.wisdom,
        cha: backendChar.charisma,
      },
      
      hitPoints: backendChar.hit_points_max,
      currentHitPoints: backendChar.hit_points_current,
      armorClass: backendChar.armor_class,
      initiative: backendChar.initiative,
      speed: backendChar.speed,
      
      savingThrows: backendChar.saving_throw_proficiencies,
      skillProficiencies: backendChar.skill_proficiencies,
      toolProficiencies: backendChar.tool_proficiencies,
      languages: backendChar.languages,
      
      racialTraits: backendChar.racial_traits,
      classFeatures: backendChar.class_features,
      backgroundFeature: backendChar.background_feature,
      
      personalityTrait: backendChar.personality_traits,
      ideal: backendChar.ideals,
      bond: backendChar.bonds,
      flaw: backendChar.flaws,
      
      appearance: backendChar.appearance,
      backstory: backendChar.backstory,
      
      equipment: backendChar.inventory,
      
      spellcastingAbility: backendChar.spellcasting_ability,
      spellSaveDC: backendChar.spell_save_dc,
      spellAttackBonus: backendChar.spell_attack_bonus,
      spellSlots: backendChar.spell_slots,
      spells: backendChar.spells_known,
      preparedSpells: backendChar.spells_prepared,
      
      attacks: backendChar.attacks,
      
      copper: backendChar.copper_pieces,
      silver: backendChar.silver_pieces,
      electrum: backendChar.electrum_pieces,
      gold: backendChar.gold_pieces,
      platinum: backendChar.platinum_pieces,
      
      campaignId: backendChar.campaign_id,
      ownerId: backendChar.owner_id,
      
      // Store original backend data for reference
      _backendData: backendChar,
    };
  },
  
  // Helper: Map alignment format
  mapAlignment(alignment) {
    if (!alignment) return null;
    
    // Convert from frontend format (e.g., "Lawful Good") to backend format (e.g., "lawful_good")
    const map = {
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
    
    return map[alignment] || null;
  },
  
  // Helper: Calculate AC (simplified)
  calculateAC(character) {
    const dexMod = character.abilities?.dex ? Math.floor((character.abilities.dex - 10) / 2) : 0;
    return 10 + dexMod; // Base AC calculation
  },
  
  // Helper: Calculate initiative
  calculateInitiative(character) {
    return character.abilities?.dex ? Math.floor((character.abilities.dex - 10) / 2) : 0;
  },
  
  // Helper: Get speed based on race
  getSpeed(character) {
    const speedMap = {
      'dwarf': 25,
      'halfling': 25,
      'gnome': 25,
      'elf': 30,
      'human': 30,
      'half-elf': 30,
      'half-orc': 30,
      'tiefling': 30,
      'dragonborn': 30,
    };
    
    return speedMap[character.race?.toLowerCase()] || 30;
  },
  
  // ==== CHARACTER CRUD OPERATIONS ====
  
  // Create a new character
  async createCharacter(character) {
    const backendData = this.toBackendFormat(character);
    const response = await this.request('POST', '/api/characters', backendData);
    return this.toFrontendFormat(response);
  },
  
  // Get all characters for current user
  async getCharacters() {
    const response = await this.request('GET', '/api/characters');
    return response.map(char => this.toFrontendFormat(char));
  },
  
  // Get a single character by ID
  async getCharacter(id) {
    const response = await this.request('GET', `/api/characters/${id}`);
    return this.toFrontendFormat(response);
  },
  
  // Update a character
  async updateCharacter(id, updates) {
    // If updates is a full character object, convert it
    const backendUpdates = updates.id ? this.toBackendFormat(updates) : updates;
    const response = await this.request('PUT', `/api/characters/${id}`, backendUpdates);
    return this.toFrontendFormat(response);
  },
  
  // Delete a character
  async deleteCharacter(id) {
    await this.request('DELETE', `/api/characters/${id}`);
    return true;
  },
  
  // ==== CAMPAIGN OPERATIONS ====
  
  // Get all campaigns
  async getCampaigns() {
    return await this.request('GET', '/api/campaigns');
  },
  
  // Create a campaign (DM only)
  async createCampaign(name, description) {
    return await this.request('POST', '/api/campaigns', { name, description });
  },
  
  // Assign character to campaign
  async assignToCampaign(characterId, campaignId) {
    return await this.request('PUT', `/api/characters/${characterId}`, {
      campaign_id: campaignId,
    });
  },
  
  // ==== ADDITIONAL CHARACTER OPERATIONS ====
  
  // Duplicate a character
  async duplicateCharacter(id, newName) {
    const response = await this.request('POST', `/api/characters/${id}/duplicate?new_name=${encodeURIComponent(newName || '')}`);
    return this.toFrontendFormat(response);
  },
  
  // Export character
  async exportCharacter(id) {
    return await this.request('GET', `/api/characters/${id}/export`);
  },
  
  // Import character
  async importCharacter(characterData) {
    const backendData = this.toBackendFormat(characterData);
    const response = await this.request('POST', '/api/characters/import', backendData);
    return this.toFrontendFormat(response);
  },
});

