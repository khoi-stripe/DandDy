// ========================================
// DEMO CHARACTERS
// ========================================
// Pre-made sample characters available in demo mode (not authenticated).
// These showcase the variety of characters users can create.

(function (global) {
  // Demo character IDs use a special prefix for identification
  const DEMO_PREFIX = 'demo_';
  
  // Key to track if user has been asked about demo migration
  const DEMO_MIGRATION_ASKED_KEY = 'danddy_demo_migration_asked';

  // Demo mode limits
  const DEMO_MAX_USER_CHARACTERS = 3;
  const DEMO_MAX_CUSTOM_PORTRAITS_PER_CHARACTER = 3;

  const DemoCharacters = (global.DemoCharacters = {
    DEMO_PREFIX,
    DEMO_MIGRATION_ASKED_KEY,
    DEMO_MAX_USER_CHARACTERS,
    DEMO_MAX_CUSTOM_PORTRAITS_PER_CHARACTER,

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

    // Get all demo characters
    getAll() {
      return [
        this._createLyra(),
        this._createThorgrim(),
        this._createZephyr(),
      ];
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

    // Check if a character has reached the portrait limit in demo mode
    hasReachedPortraitLimit(character) {
      if (!this.isDemoMode()) return false;
      const currentCount = (character && character.customPortraitCount) || 0;
      return currentCount >= DEMO_MAX_CUSTOM_PORTRAITS_PER_CHARACTER;
    },

    // Check if custom art generation is allowed for a character
    canGenerateCustomArt(character) {
      // Sample characters cannot have custom art generated
      if (this.isDemo(character)) {
        return false;
      }
      // In demo mode, check portrait limit
      if (this.isDemoMode()) {
        return !this.hasReachedPortraitLimit(character);
      }
      // Authenticated users have no demo restrictions
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
        
        // Portrait - custom Boris Vallejo style from app
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298665_9f926a959c214c14bb7d1d04580843ff.png',
        portrait: {
          url: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298665_9f926a959c214c14bb7d1d04580843ff.png',
        },
        
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
        
        // Portrait - custom Boris Vallejo style from app
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298747_fd80b4efff0c4544942b98b1c15438ee.png',
        portrait: {
          url: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298747_fd80b4efff0c4544942b98b1c15438ee.png',
        },
        
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
        
        // Portrait - custom Boris Vallejo style from app
        originalPortraitUrl: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298383_2a5a798489b0460481a28c99bb85d235.png',
        portrait: {
          url: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/1765298383_2a5a798489b0460481a28c99bb85d235.png',
        },
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },
  });
})(window);

