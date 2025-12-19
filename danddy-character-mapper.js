// Shared helpers for mapping between backend character DTOs and the various
// frontend shapes used across the DandDy app (manager + builder).
// Exposes `window.DanddyCharacterMapper`.

(function (global) {
  const Mapper = {
    /**
     * Map builder character → backend DTO (CharacterCreate).
     * Mirrors the previous `CharacterAPI.toBackendFormat` logic.
     */
    fromBuilderToBackend(character) {
      if (!character) return null;

      return {
        name: character.name || '',
        race: character.race || '',
        character_class: character.class || '',
        level: character.level || 1,
        background: character.background || null,
        alignment: this._mapAlignmentFromBuilder(character.alignment),
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
        armor_class: this._calculateACFromBuilder(character),
        initiative: this._calculateInitiativeFromBuilder(character),
        speed: this._getSpeedFromBuilder(character),
        hit_dice_current: character.hitDiceCurrent ?? null,  // null means full
        class_resources: character.classResources || {},

        // Death Saves
        death_save_successes: 0,
        death_save_failures: 0,

        // Proficiencies
        saving_throw_proficiencies: character.savingThrows || [],
        skill_proficiencies: character.skillProficiencies || [],
        skill_expertises: [],
        tool_proficiencies: character.toolProficiencies || [],
        languages: character.languages || [],

        // Features
        racial_traits: this._arrayToDict(character.racialTraits),
        class_features: this._arrayToDict(character.classFeatures),
        feats: [],
        background_feature: character.backgroundFeature || {},

        // Personality
        personality_traits: character.personalityTrait || null,
        ideals: character.ideal || null,
        bonds: character.bond || null,
        flaws: character.flaw || null,

        // Appearance & Backstory
        appearance: character.appearance || null,
        backstory: character.backstory || null,
        sex: character.sex || null,

        // Portrait
        ascii_portrait: character.asciiPortrait || null,
        original_portrait_url: character.originalPortraitUrl || null,
        custom_portrait_ascii: character.customPortraitAscii || null,
        custom_portrait_count: character.customPortraitCount || 0,
        portrait_metadata: character.portraitMetadata || {},

        // Inventory
        inventory: this._arrayToDict(character.equipment),

        // Spellcasting
        spellcasting_ability: character.spellcastingAbility || null,
        spell_save_dc: character.spellSaveDC || null,
        spell_attack_bonus: character.spellAttackBonus || null,
        spell_slots: character.spellSlots || {},
        spell_slots_used: {},
        cantrips: this._spellsToStringArray(character.cantrips),
        spells_known: this._spellsToStringArray(character.spellsKnown),
        spells_prepared: this._spellsToStringArray(character.spellsPrepared),

        // Combat
        conditions: [],
        attacks: this._arrayToDict(character.attacks),

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

    /**
     * Map backend DTO → builder character shape.
     * Mirrors the previous `CharacterAPI.toFrontendFormat` logic.
     */
    fromBackendToBuilder(backendChar) {
      if (!backendChar) return null;

      return {
        id: backendChar.id,
        name: backendChar.name,
        race: backendChar.race,
        class: backendChar.character_class,
        level: backendChar.level,
        background: backendChar.background,
        alignment: this._mapAlignmentFromBackend(backendChar.alignment),
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
        hitDiceCurrent: backendChar.hit_dice_current,
        classResources: backendChar.class_resources || {},

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
        sex: backendChar.sex || null,

        asciiPortrait: backendChar.ascii_portrait,
        originalPortraitUrl: backendChar.original_portrait_url,
        customPortraitAscii: backendChar.custom_portrait_ascii,
        customPortraitCount: backendChar.custom_portrait_count,
        portraitMetadata: backendChar.portrait_metadata,

        equipment: backendChar.inventory,

        spellcastingAbility: backendChar.spellcasting_ability,
        spellSaveDC: backendChar.spell_save_dc,
        spellAttackBonus: backendChar.spell_attack_bonus,
        spellSlots: backendChar.spell_slots,
        cantrips: backendChar.cantrips || [],
        spellsKnown: backendChar.spells_known || [],
        spellsPrepared: backendChar.spells_prepared || [],

        attacks: backendChar.attacks,

        copper: backendChar.copper_pieces,
        silver: backendChar.silver_pieces,
        electrum: backendChar.electrum_pieces,
        gold: backendChar.gold_pieces,
        platinum: backendChar.platinum_pieces,

        campaignId: backendChar.campaign_id,
        ownerId: backendChar.owner_id,

        _backendData: backendChar,
      };
    },

    /**
     * Map manager character → backend DTO.
     * Mirrors `CharacterCloudStorage._toAPIFormat`.
     */
    fromManagerToBackend(character) {
      if (!character) return null;

      // Normalize background feature into a dict, even if it started as a string.
      const rawBackgroundFeature =
        character.backgroundFeature || character.backgroundData?.feature || {};
      const backgroundFeatureDict =
        typeof rawBackgroundFeature === 'string'
          ? { name: rawBackgroundFeature }
          : rawBackgroundFeature;

      return {
        name: character.name || 'Unnamed Character',
        race: character.race || character.raceData?.name || 'Human',
        character_class: character.class || character.classData?.name || 'Fighter',
        level: character.level || 1,
        background: character.background || character.backgroundData?.name || null,
        alignment: this._mapAlignmentFromManager(character.alignment),
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
        hit_points_current:
          character.hitPoints?.current || character.hitPoints?.max || character.hitPoints || 10,
        hit_points_temp: character.hitPoints?.temp || 0,
        armor_class: character.armorClass || 10,
        initiative: character.initiative || 0,
        speed: character.speed || 30,
        hit_dice_current: character.hitDiceCurrent ?? null,  // null means full
        class_resources: character.classResources || {},

        // Death Saves
        death_save_successes: character.deathSaves?.successes || 0,
        death_save_failures: character.deathSaves?.failures || 0,

        // Proficiencies
        saving_throw_proficiencies: character.savingThrows || [],
        skill_proficiencies: character.skillProficiencies || [],
        skill_expertises: character.skillExpertises || [],
        tool_proficiencies: character.toolProficiencies || [],
        languages: character.languages || [],

        // Features & Traits
        // Backend expects arrays of dicts, not raw strings.
        racial_traits: this._arrayToDict(
          character.racialTraits || character.raceData?.traits || [],
        ),
        class_features: this._arrayToDict(
          character.classFeatures || character.classData?.features || [],
        ),
        feats: this._arrayToDict(character.feats || []),
        background_feature: backgroundFeatureDict,

        // Personality
        personality_traits: character.personalityTraits || character.personalityTrait || null,
        ideals: character.ideals || null,
        bonds: character.bonds || null,
        flaws: character.flaws || null,

        // Appearance & Backstory
        appearance: character.appearance || null,
        backstory: character.backstory || null,
        sex: character.sex || null,

        // Portrait data
        ascii_portrait: character.asciiPortrait || null,
        original_portrait_url: character.originalPortraitUrl || null,
        custom_portrait_ascii: character.customPortraitAscii || null,
        custom_portrait_count: character.customPortraitCount || 0,
        portrait_metadata: character.portraitMetadata || {},

        // Inventory
        inventory: (character.equipment || character.inventory || []).map((item) =>
          typeof item === 'string' ? { name: item } : item,
        ),

        // Spellcasting
        spellcasting_ability: character.spellcastingAbility || null,
        spell_save_dc: character.spellSaveDC || null,
        spell_attack_bonus: character.spellAttackBonus || null,
        spell_slots: character.spellSlots || {},
        spell_slots_used: character.spellSlotsUsed || {},
        // Backend expects arrays of spell *names* (strings), not full objects.
        cantrips: this._spellsToStringArray(character.cantrips || []),
        spells_known: this._spellsToStringArray(character.spellsKnown || []),
        spells_prepared: this._spellsToStringArray(character.spellsPrepared || []),

        // Combat
        conditions: character.conditions || [],
        attacks: character.attacks || [],

        // Currency
        copper_pieces: character.currency?.cp ?? character.copper ?? 0,
        silver_pieces: character.currency?.sp ?? character.silver ?? 0,
        electrum_pieces: character.currency?.ep ?? character.electrum ?? 0,
        gold_pieces: character.currency?.gp ?? character.gold ?? 0,
        platinum_pieces: character.currency?.pp ?? character.platinum ?? 0,

        // Campaign & ownership
        campaign_id: character.campaignId || null,
      };
    },

    /**
     * Map backend DTO → manager character shape.
     * Mirrors `CharacterCloudStorage._fromAPIFormat`.
     */
    fromBackendToManager(apiChar) {
      if (!apiChar) return null;

      return {
        id: apiChar.id.toString(),
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        level: apiChar.level,
        background: apiChar.background,
        alignment: this._mapAlignmentFromBackend(apiChar.alignment),
        experiencePoints: apiChar.experience_points,

        abilities: {
          str: apiChar.strength,
          dex: apiChar.dexterity,
          con: apiChar.constitution,
          int: apiChar.intelligence,
          wis: apiChar.wisdom,
          cha: apiChar.charisma,
        },

        hitPoints: {
          max: apiChar.hit_points_max,
          current: apiChar.hit_points_current,
          temp: apiChar.hit_points_temp,
        },
        armorClass: apiChar.armor_class,
        initiative: apiChar.initiative,
        speed: apiChar.speed,
        hitDiceCurrent: apiChar.hit_dice_current,
        hitDiceMax: apiChar.level || 1,
        classResources: apiChar.class_resources || {},

        savingThrows: apiChar.saving_throw_proficiencies,
        skillProficiencies: apiChar.skill_proficiencies,
        skillExpertises: apiChar.skill_expertises,
        toolProficiencies: apiChar.tool_proficiencies,
        languages: apiChar.languages,

        racialTraits: apiChar.racial_traits,
        classFeatures: apiChar.class_features,
        feats: apiChar.feats,
        backgroundFeature: apiChar.background_feature,

        personalityTraits: apiChar.personality_traits,
        ideals: apiChar.ideals,
        bonds: apiChar.bonds,
        flaws: apiChar.flaws,
        appearance: apiChar.appearance,
        backstory: apiChar.backstory,
        sex: apiChar.sex || null,

        equipment: apiChar.inventory.map((item) =>
          typeof item === 'object' && item.name ? item.name : item,
        ),

        spellcastingAbility: apiChar.spellcasting_ability,
        spellSaveDC: apiChar.spell_save_dc,
        spellAttackBonus: apiChar.spell_attack_bonus,
        spellSlots: apiChar.spell_slots,
        spellSlotsUsed: apiChar.spell_slots_used,
        cantrips: apiChar.cantrips || [],
        spellsKnown: apiChar.spells_known || [],
        spellsPrepared: apiChar.spells_prepared || [],

        conditions: apiChar.conditions,
        attacks: apiChar.attacks,

        currency: {
          cp: apiChar.copper_pieces,
          sp: apiChar.silver_pieces,
          ep: apiChar.electrum_pieces,
          gp: apiChar.gold_pieces,
          pp: apiChar.platinum_pieces,
        },

        campaignId: apiChar.campaign_id,
        ownerId: apiChar.owner_id,
        createdAt: apiChar.created_at,
        updatedAt: apiChar.updated_at,

        // Sharing metadata
        isShared: apiChar.is_shared || false,
        ownerEmail: apiChar.owner_email || null,
        permission: apiChar.permission || null,
        collaboratorCount: apiChar.collaborator_count || 0,

        asciiPortrait: apiChar.ascii_portrait,
        originalPortraitUrl: apiChar.original_portrait_url,
        customPortraitAscii: apiChar.custom_portrait_ascii,
        customPortraitCount: apiChar.custom_portrait_count || 0,
        portraitMetadata: apiChar.portrait_metadata || {},
      };
    },

    // ===== Shared helpers =====

    _arrayToDict(arr) {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.map((item) => {
        if (typeof item === 'object' && item !== null) return item;
        if (typeof item === 'string') return { name: item };
        return { value: item };
      });
    },

    _spellsToStringArray(arr) {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.map((item) => {
        if (typeof item === 'object' && item !== null && item.name) return item.name;
        if (typeof item === 'string') return item;
        return String(item);
      });
    },

    _mapAlignmentFromBuilder(alignment) {
      if (!alignment) return null;
      
      // Map both abbreviations (from builder) and full names to backend format
      const map = {
        // Abbreviations (what builder actually stores)
        'lg': 'lawful_good',
        'ng': 'neutral_good',
        'cg': 'chaotic_good',
        'ln': 'lawful_neutral',
        'n': 'true_neutral',
        'cn': 'chaotic_neutral',
        'le': 'lawful_evil',
        'ne': 'neutral_evil',
        'ce': 'chaotic_evil',
        // Full names (for backwards compatibility)
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

    _mapAlignmentFromManager(alignment) {
      // Manager already uses the same string labels as builder; reuse mapping.
      return this._mapAlignmentFromBuilder(alignment);
    },

    _mapAlignmentFromBackend(backendAlignment) {
      if (!backendAlignment) return null;
      
      // Map backend format (e.g., 'lawful_good') to frontend abbreviations (e.g., 'lg')
      const reverseMap = {
        'lawful_good': 'lg',
        'neutral_good': 'ng',
        'chaotic_good': 'cg',
        'lawful_neutral': 'ln',
        'true_neutral': 'n',
        'chaotic_neutral': 'cn',
        'lawful_evil': 'le',
        'neutral_evil': 'ne',
        'chaotic_evil': 'ce',
      };
      return reverseMap[backendAlignment] || null;
    },

    _calculateACFromBuilder(character) {
      const dex = character.abilities?.dex;
      const dexMod = dex ? Math.floor((dex - 10) / 2) : 0;
      return 10 + dexMod;
    },

    _calculateInitiativeFromBuilder(character) {
      const dex = character.abilities?.dex;
      return dex ? Math.floor((dex - 10) / 2) : 0;
    },

    _getSpeedFromBuilder(character) {
      const race = (character.race || '').toLowerCase();
      const speedMap = {
        dwarf: 25,
        halfling: 25,
        gnome: 25,
        elf: 30,
        human: 30,
        'half-elf': 30,
        'half-orc': 30,
        tiefling: 30,
        dragonborn: 30,
      };
      return speedMap[race] || 30;
    },
  };

  global.DanddyCharacterMapper = Mapper;
})(window);




