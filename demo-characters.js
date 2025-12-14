// ========================================
// DEMO CHARACTERS
// ========================================
// Pre-made sample characters available in demo mode (not authenticated).
// These showcase the variety of characters users can create.
// 
// Demo characters can be fetched from the API (characters marked with is_demo=true)
// or fall back to hardcoded characters if the API is unavailable.

(function (global) {
  // Demo character IDs use a special prefix for identification
  const DEMO_PREFIX = 'demo_';
  
  // Key to track if user has been asked about demo migration
  const DEMO_MIGRATION_ASKED_KEY = 'danddy_demo_migration_asked';

  // Demo mode limits
  // Character limit is enforced locally (total characters stored)
  // Portrait limit is enforced by backend (daily quota)
  const DEMO_MAX_USER_CHARACTERS = 3;

  // Cache for loaded ASCII art and demo characters
  let _asciiCache = {};
  let _demoCharactersCache = null;
  let _asciiLoadPromise = null;
  let _apiDemoCharacters = null; // Characters fetched from API
  let _apiDemoFetchPromise = null;

  const DemoCharacters = (global.DemoCharacters = {
    DEMO_PREFIX,
    DEMO_MIGRATION_ASKED_KEY,
    DEMO_MAX_USER_CHARACTERS,

    /**
     * Load ASCII art for a race/class combination from pre-generated files.
     * @param {string} race - Character race
     * @param {string} classType - Character class
     * @returns {Promise<string|null>} ASCII art or null if not found
     */
    async _loadAscii(race, classType) {
      const raceLower = String(race).toLowerCase().replace(/\s+/g, '-');
      const classLower = String(classType).toLowerCase().replace(/\s+/g, '-');
      const key = `${raceLower}-${classLower}`;
      
      if (_asciiCache[key]) return _asciiCache[key];
      
      // Try to load from generated_portraits/ascii/
      const paths = [
        `generated_portraits/ascii/${key}.txt`,
        `./generated_portraits/ascii/${key}.txt`,
        `../generated_portraits/ascii/${key}.txt`,
      ];
      
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const ascii = await response.text();
            _asciiCache[key] = ascii;
            return ascii;
          }
        } catch (e) {
          // Try next path
        }
      }
      
      return null;
    },

    /**
     * Pre-load ASCII art for all demo characters.
     * Call this on page load to ensure demo characters have ASCII art ready.
     * Characters from API may already have ASCII art, so we skip those.
     * @returns {Promise<void>}
     */
    async loadAsciiForAllDemoCharacters() {
      if (_asciiLoadPromise) return _asciiLoadPromise;
      
      _asciiLoadPromise = (async () => {
        const characters = this.getAll();
        console.log('DemoCharacters: Loading ASCII art for', characters.length, 'demo characters...');
        
        let loadedCount = 0;
        let skippedCount = 0;
        const loadPromises = characters.map(async (char) => {
          // Skip if character already has ASCII art (from API)
          if (char.asciiPortrait) {
            skippedCount++;
            console.log(`  ⏭️ Skipped ${char.name} (already has ASCII art)`);
            return;
          }
          
          if (!char.race || !char.class) return;
          const ascii = await this._loadAscii(char.race, char.class);
          if (ascii) {
            // Patch the character object with ASCII art
            char.asciiPortrait = ascii;
            char.asciiPortraitKey = `${char.race}|${char.class}`;
            loadedCount++;
            console.log(`  ✅ Loaded ASCII for ${char.name} (${char.race}-${char.class})`);
          } else {
            console.warn(`  ❌ Failed to load ASCII for ${char.name} (${char.race}-${char.class})`);
          }
        });
        await Promise.all(loadPromises);
        console.log(`DemoCharacters: ASCII art loaded for ${loadedCount} / skipped ${skippedCount} / total ${characters.length} demo characters`);
      })();
      
      return _asciiLoadPromise;
    },
    
    /**
     * Clear the demo characters cache. Useful for testing.
     */
    _clearCache() {
      _demoCharactersCache = null;
      _asciiCache = {};
      _asciiLoadPromise = null;
      _apiDemoCharacters = null;
      _apiDemoFetchPromise = null;
    },

    /**
     * Fetch demo characters from the API.
     * @returns {Promise<Array|null>} Array of demo characters or null if fetch failed
     */
    async fetchFromApi() {
      if (_apiDemoFetchPromise) return _apiDemoFetchPromise;

      _apiDemoFetchPromise = (async () => {
        try {
          const apiBase = global.DanddyConfig?.BACKEND_ORIGIN || 'https://danddy-api.onrender.com';
          console.log('DemoCharacters: Fetching demo characters from API...');
          
          const response = await fetch(`${apiBase}/api/characters/demo/list`);
          if (!response.ok) {
            console.warn('DemoCharacters: API returned', response.status);
            return null;
          }

          const apiChars = await response.json();
          console.log(`DemoCharacters: Fetched ${apiChars.length} demo characters from API`);

          // Transform API response to match expected format
          _apiDemoCharacters = apiChars.map(char => this._transformApiCharacter(char));
          return _apiDemoCharacters;
        } catch (err) {
          console.warn('DemoCharacters: Failed to fetch from API:', err.message);
          return null;
        }
      })();

      return _apiDemoFetchPromise;
    },

    /**
     * Transform an API character response to the format expected by the frontend.
     * @param {Object} apiChar - Character from API
     * @returns {Object} Transformed character
     */
    _transformApiCharacter(apiChar) {
      const nowIso = new Date().toISOString();
      
      return {
        // Use demo prefix for ID to mark as demo character
        id: `${DEMO_PREFIX}${apiChar.id}`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}${apiChar.id}`,
        
        // Basic info
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        background: apiChar.background,
        alignment: apiChar.alignment,
        sex: apiChar.sex,
        level: apiChar.level || 1,
        
        // Abilities
        abilities: {
          str: apiChar.strength,
          dex: apiChar.dexterity,
          con: apiChar.constitution,
          int: apiChar.intelligence,
          wis: apiChar.wisdom,
          cha: apiChar.charisma,
        },
        
        // Computed stats
        hitPoints: apiChar.hit_points_max,
        armorClass: apiChar.armor_class,
        initiative: apiChar.initiative,
        speed: apiChar.speed,
        
        // Skills and proficiencies
        skillProficiencies: apiChar.skill_proficiencies || [],
        savingThrows: apiChar.saving_throw_proficiencies || [],
        languages: apiChar.languages || [],
        toolProficiencies: apiChar.tool_proficiencies || [],
        
        // Spellcasting
        spellcastingAbility: apiChar.spellcasting_ability,
        cantrips: apiChar.cantrips || [],
        spellsKnown: apiChar.spells_known || [],
        spellSlots: apiChar.spell_slots || {},
        
        // Background and personality
        backstory: apiChar.backstory,
        personalityTrait: apiChar.personality_traits,
        
        // Portrait - use API values
        originalPortraitUrl: apiChar.original_portrait_url,
        asciiPortrait: apiChar.custom_portrait_ascii || apiChar.ascii_portrait,
        
        // Metadata
        createdAt: apiChar.created_at || nowIso,
        updatedAt: apiChar.updated_at || nowIso,
      };
    },

    // Check if a character is a demo character
    isDemo(character) {
      return character && (
        character.isDemo === true ||
        (character.id && String(character.id).startsWith(DEMO_PREFIX))
      );
    },

    // Check if user is in demo mode (not authenticated)
    isDemoMode() {
      return !(global.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated());
    },

    // Check if migration prompt has been shown
    hasMigrationBeenAsked() {
      return localStorage.getItem(DEMO_MIGRATION_ASKED_KEY) === 'true';
    },

    // Mark migration prompt as shown
    markMigrationAsked() {
      localStorage.setItem(DEMO_MIGRATION_ASKED_KEY, 'true');
    },

    // Clear migration asked flag (for testing)
    clearMigrationAsked() {
      localStorage.removeItem(DEMO_MIGRATION_ASKED_KEY);
    },

    // Get all demo characters (cached so ASCII can be patched)
    // Returns API characters if available, otherwise falls back to hardcoded
    getAll() {
      // If we have API characters, use those
      if (_apiDemoCharacters && _apiDemoCharacters.length > 0) {
        return _apiDemoCharacters;
      }
      
      // Fall back to hardcoded characters
      if (!_demoCharactersCache) {
        _demoCharactersCache = [
          this._createLyra(),
          this._createThorgrim(),
          this._createZephyr(),
          this._createSienna(),
          this._createKrazul(),
        ];
      }
      return _demoCharactersCache;
    },

    /**
     * Get all demo characters, fetching from API first.
     * Use this async version when you want to ensure API characters are loaded.
     * @returns {Promise<Array>} Array of demo characters
     */
    async getAllAsync() {
      // Try to fetch from API first
      const apiChars = await this.fetchFromApi();
      if (apiChars && apiChars.length > 0) {
        return apiChars;
      }
      // Fall back to hardcoded characters
      return this.getAll();
    },

    // Get count of demo characters that would be migrated
    getDemoCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => this.isDemo(c)).length;
    },

    // Get count of user-created (non-demo) local characters
    getUserCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => !this.isDemo(c)).length;
    },

    // Check if user has reached the character limit in demo mode
    hasReachedCharacterLimit() {
      if (!this.isDemoMode()) return false;
      return this.getUserCharacterCount() >= DEMO_MAX_USER_CHARACTERS;
    },

    // Check if custom art generation is allowed for a character
    // Note: Daily portrait limits are now enforced by the backend.
    // This function only checks if the character type allows custom art.
    canGenerateCustomArt(character) {
      // Sample characters cannot have custom art generated
      if (this.isDemo(character)) {
        return false;
      }
      // All other characters can have custom art (backend enforces daily quota)
      return true;
    },

    // ========================================
    // DEMO CHARACTER 1: Lyra Starwhisper
    // ========================================
    // Female Elf Wizard - scholarly and mystical
    _createLyra() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}lyra`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}lyra_starwhisper`,
        name: 'Lyra Starwhisper',
        race: 'elf',
        class: 'wizard',
        background: 'sage',
        alignment: 'ng',
        sex: 'female',
        level: 5,
        
        // Abilities (point buy optimized for wizard)
        abilities: {
          str: 8,
          dex: 14,
          con: 13,
          int: 17,  // Primary stat + racial bonus
          wis: 12,
          cha: 10,
        },
        baseAbilities: {
          str: 8,
          dex: 12,  // Before racial +2
          con: 13,
          int: 17,
          wis: 12,
          cha: 10,
        },
        
        // Computed stats
        hitPoints: 27,  // 6 + 4*4 + 5*1 (CON mod) = 27
        armorClass: 12, // 10 + DEX mod
        initiative: 2,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 3,
          wis: 1,
          cha: 0,
        },
        
        // Skills
        skillProficiencies: ['arcana', 'history', 'investigation', 'insight'],
        skillModifiers: {
          arcana: 6,      // INT + prof
          history: 6,     // INT + prof (sage)
          investigation: 6,
          insight: 4,     // WIS + prof (sage)
          perception: 3,  // WIS + racial keen senses
        },
        
        // Saving throws
        savingThrows: ['int', 'wis'],
        savingThrowModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 6,  // Proficient
          wis: 4,  // Proficient
          cha: 0,
        },
        
        // Languages
        languages: ['Common', 'Elvish', 'Draconic', 'Celestial'],
        
        // Equipment
        equipment: [
          'Spellbook',
          'Arcane focus (crystal orb)',
          'Scholar\'s pack',
          'Dagger',
          'Component pouch',
          'Bottle of black ink',
          'Quill',
          'Robes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'int',
        cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation', 'Light'],
        spellsKnown: [
          'Magic Missile',
          'Shield',
          'Detect Magic',
          'Mage Armor',
          'Misty Step',
          'Hold Person',
          'Fireball',
          'Counterspell',
        ],
        spellSlots: {
          1: 4,
          2: 3,
          3: 2,
        },
        
        // Race data
        raceData: {
          name: 'Elf',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
          languages: ['Common', 'Elvish'],
        },
        
        // Class data
        classData: {
          name: 'Wizard',
          hitDie: 6,
          primaryAbility: ['int'],
          savingThrows: ['int', 'wis'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Sage',
          feature: {
            name: 'Researcher',
            description: 'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it.',
          },
        },
        
        // Personality
        backstory: 'Lyra spent decades studying in the Silverspire Academy, where she discovered an ancient tome that hinted at forgotten magic from before the Sundering. Now she travels the realm, seeking fragments of lost arcane knowledge.',
        personalityTrait: 'I\'m convinced there\'s a logical explanation for everything, and I won\'t rest until I find it.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 2: Thorgrim Ironforge
    // ========================================
    // Male Dwarf Fighter - classic warrior tank
    _createThorgrim() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}thorgrim`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}thorgrim_ironforge`,
        name: 'Thorgrim Ironforge',
        race: 'dwarf',
        class: 'fighter',
        background: 'soldier',
        alignment: 'lg',
        sex: 'male',
        level: 3,
        
        // Abilities (strong and tough)
        abilities: {
          str: 16,
          dex: 12,
          con: 16,  // +2 racial
          int: 10,
          wis: 13,
          cha: 8,
        },
        baseAbilities: {
          str: 16,
          dex: 12,
          con: 14,
          int: 10,
          wis: 13,
          cha: 8,
        },
        
        // Computed stats
        hitPoints: 31,  // 10 + 2*6 + 3*3 = 31 (with CON mod)
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 1,
        speed: 25,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 1,
          con: 3,
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'perception', 'survival'],
        skillModifiers: {
          athletics: 5,     // STR + prof
          intimidation: 1,  // CHA + prof
          perception: 3,    // WIS + prof
          survival: 3,      // WIS + prof
        },
        
        // Saving throws
        savingThrows: ['str', 'con'],
        savingThrowModifiers: {
          str: 5,  // Proficient
          dex: 1,
          con: 5,  // Proficient
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Languages
        languages: ['Common', 'Dwarvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Battleaxe',
          'Handaxes (2)',
          'Explorer\'s pack',
          'Insignia of rank',
          'Trophy from fallen enemy',
          'Bone dice',
        ],
        
        // Race data
        raceData: {
          name: 'Dwarf',
          size: 'Medium',
          speed: 25,
          traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
          languages: ['Common', 'Dwarvish'],
        },
        
        // Class data
        classData: {
          name: 'Fighter',
          hitDie: 10,
          primaryAbility: ['str', 'dex'],
          savingThrows: ['str', 'con'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Soldier',
          feature: {
            name: 'Military Rank',
            description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence.',
          },
        },
        
        // Personality
        backstory: 'Thorgrim served twenty years in the Ironforge Legion, defending the mountain holds from orc raids and goblin incursions. After the Battle of Redstone Pass, where he was the sole survivor of his unit, he set out to forge his own legend.',
        personalityTrait: 'I face problems head-on. A simple, direct solution is the best path to success.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 3: Zephyr Nightshade
    // ========================================
    // Non-binary Tiefling Rogue - stealthy and charismatic
    _createZephyr() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}zephyr`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}zephyr_nightshade`,
        name: 'Zephyr Nightshade',
        race: 'tiefling',
        class: 'rogue',
        background: 'criminal',
        alignment: 'cn',
        sex: 'non-binary',
        level: 4,
        
        // Abilities (quick and charming)
        abilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 14,  // +1 racial
          wis: 10,
          cha: 15,  // +2 racial
        },
        baseAbilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 13,
          wis: 10,
          cha: 13,
        },
        
        // Computed stats
        hitPoints: 27,  // 8 + 3*5 + 4*1 = 27
        armorClass: 14, // Leather (11) + DEX mod (3)
        initiative: 3,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 0,
          dex: 3,
          con: 1,
          int: 2,
          wis: 0,
          cha: 2,
        },
        
        // Skills (rogues get 4 + 2 from background)
        skillProficiencies: ['acrobatics', 'deception', 'sleight-of-hand', 'stealth', 'perception', 'persuasion'],
        skillModifiers: {
          acrobatics: 5,      // DEX + prof
          deception: 4,       // CHA + prof
          'sleight-of-hand': 7, // DEX + prof + expertise
          stealth: 7,         // DEX + prof + expertise
          perception: 2,      // WIS + prof
          persuasion: 4,      // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['dex', 'int'],
        savingThrowModifiers: {
          str: 0,
          dex: 5,  // Proficient
          con: 1,
          int: 4,  // Proficient
          wis: 0,
          cha: 2,
        },
        
        // Languages
        languages: ['Common', 'Infernal', 'Thieves\' Cant'],
        
        // Tool proficiencies
        toolProficiencies: ['Thieves\' tools', 'Playing cards'],
        
        // Equipment
        equipment: [
          'Leather armor',
          'Rapier',
          'Shortbow',
          'Arrows (20)',
          'Thieves\' tools',
          'Burglar\'s pack',
          'Crowbar',
          'Dark hooded cloak',
        ],
        
        // Race data
        raceData: {
          name: 'Tiefling',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
          languages: ['Common', 'Infernal'],
        },
        
        // Class data
        classData: {
          name: 'Rogue',
          hitDie: 8,
          primaryAbility: ['dex'],
          savingThrows: ['dex', 'int'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Criminal',
          feature: {
            name: 'Criminal Contact',
            description: 'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances.',
          },
        },
        
        // Personality
        backstory: 'Zephyr grew up on the streets of Waterdeep, their infernal appearance making them an outcast from birth. They learned to survive through cunning and quick fingers, eventually joining the Shadow Thieves. Now they work independently, taking jobs that interest them and staying one step ahead of the law.',
        personalityTrait: 'I have a joke for every occasion, especially occasions where humor is inappropriate.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 4: Sienna Dawnbringer
    // ========================================
    // Female Human Cleric - compassionate healer
    _createSienna() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}sienna`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}sienna_dawnbringer`,
        name: 'Sienna Dawnbringer',
        race: 'human',
        class: 'cleric',
        background: 'acolyte',
        alignment: 'lg',
        sex: 'female',
        level: 4,
        
        // Abilities (wisdom-focused healer)
        abilities: {
          str: 12,
          dex: 10,
          con: 14,
          int: 11,
          wis: 17,
          cha: 14,
        },
        baseAbilities: {
          str: 11,  // +1 human
          dex: 9,   // +1 human
          con: 13,  // +1 human
          int: 10,  // +1 human
          wis: 16,  // +1 human
          cha: 13,  // +1 human
        },
        
        // Computed stats
        hitPoints: 31,  // 8 + 3*5 + 4*2 = 31
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 3,
          cha: 2,
        },
        
        // Skills
        skillProficiencies: ['insight', 'medicine', 'religion', 'persuasion'],
        skillModifiers: {
          insight: 5,     // WIS + prof
          medicine: 5,    // WIS + prof
          religion: 2,    // INT + prof
          persuasion: 4,  // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 5,  // Proficient
          cha: 4,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Celestial', 'Elvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Mace',
          'Holy symbol of Lathander',
          'Prayer book',
          'Incense sticks (5)',
          'Vestments',
          'Healer\'s kit',
        ],
        
        // Spellcasting
        spellcastingAbility: 'wis',
        cantrips: ['Sacred Flame', 'Spare the Dying', 'Guidance'],
        spellsKnown: [
          'Cure Wounds',
          'Bless',
          'Shield of Faith',
          'Healing Word',
          'Lesser Restoration',
          'Spiritual Weapon',
          'Prayer of Healing',
        ],
        spellSlots: {
          1: 4,
          2: 3,
        },
        
        // Race data
        raceData: {
          name: 'Human',
          size: 'Medium',
          speed: 30,
          traits: ['Extra Language', 'Versatile (+1 to all abilities)'],
          languages: ['Common', 'one extra'],
        },
        
        // Class data
        classData: {
          name: 'Cleric',
          hitDie: 8,
          primaryAbility: ['wis'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Acolyte',
          feature: {
            name: 'Shelter of the Faithful',
            description: 'You can receive free healing and care at temples of your faith, and you can call upon priests for assistance.',
          },
        },
        
        // Personality
        backstory: 'Sienna was orphaned during a plague that swept through her village. Taken in by the Temple of Lathander, she devoted her life to ensuring no one else would suffer as she had. Now she travels the land, bringing hope and healing wherever darkness threatens.',
        personalityTrait: 'I see omens in every event and action. The gods are always speaking to us, we just need to listen.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 5: Krazul Stormscale
    // ========================================
    // Male Dragonborn Paladin - noble dragon knight
    _createKrazul() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}krazul`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}krazul_stormscale`,
        name: 'Krazul Stormscale',
        race: 'dragonborn',
        class: 'paladin',
        background: 'noble',
        alignment: 'lg',
        sex: 'male',
        level: 5,
        
        // Abilities (strong and charismatic)
        abilities: {
          str: 17,  // +2 racial
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 16,  // +1 racial
        },
        baseAbilities: {
          str: 15,
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 15,
        },
        
        // Computed stats
        hitPoints: 44,  // 10 + 4*6 + 5*2 = 44
        armorClass: 18, // Chain mail (16) + shield (+2) or plate (18)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 1,
          cha: 3,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'persuasion', 'history'],
        skillModifiers: {
          athletics: 6,    // STR + prof
          intimidation: 6, // CHA + prof
          persuasion: 6,   // CHA + prof
          history: 3,      // INT + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 4,  // Proficient
          cha: 6,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Draconic'],
        
        // Equipment
        equipment: [
          'Plate armor',
          'Shield',
          'Longsword',
          'Javelins (5)',
          'Holy symbol embedded in shield',
          'Signet ring of House Stormscale',
          'Fine clothes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'cha',
        cantrips: [],
        spellsKnown: [
          'Divine Smite',
          'Thunderous Smite',
          'Shield of Faith',
          'Cure Wounds',
          'Command',
          'Find Steed',
        ],
        spellSlots: {
          1: 4,
          2: 2,
        },
        
        // Race data
        raceData: {
          name: 'Dragonborn',
          size: 'Medium',
          speed: 30,
          traits: ['Draconic Ancestry (Blue)', 'Breath Weapon (Lightning)', 'Damage Resistance (Lightning)'],
          languages: ['Common', 'Draconic'],
        },
        
        // Class data
        classData: {
          name: 'Paladin',
          hitDie: 10,
          primaryAbility: ['str', 'cha'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Noble',
          feature: {
            name: 'Position of Privilege',
            description: 'Thanks to your noble birth, people are inclined to think the best of you. Common folk make every effort to accommodate you.',
          },
        },
        
        // Personality
        backstory: 'Krazul hails from an ancient dragonborn clan that once served as dragon knights in a forgotten empire. When his clan\'s honor was questioned by corrupt nobles, he swore an oath to restore their name through righteous deeds. His lightning breath crackles with ancestral power.',
        personalityTrait: 'My favor, once lost, is lost forever. But my loyalty, once earned, is unshakeable.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },
  });
})(window);

