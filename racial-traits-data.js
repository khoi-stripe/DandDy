// Racial Traits Data for D&D 5e SRD Races
// This provides descriptions for all racial traits.
// Designed to be displayed alongside race information on character sheets.

(function (global) {
  'use strict';

  /**
   * Racial traits with descriptions.
   * Each trait has:
   *   - name: Trait name (must match the trait strings in DND_DATA.races)
   *   - description: Brief description of what the trait does
   *   - mechanic: Optional mechanical summary (dice, ranges, etc.)
   * 
   * Based on SRD 5.1 content.
   */
  const RACIAL_TRAITS = {
    // === SHARED TRAITS (appear on multiple races) ===
    'Darkvision': {
      name: 'Darkvision',
      description: 'You can see in dim light within 60 feet as if it were bright light, and in darkness as if it were dim light.',
      mechanic: '60 ft. range, can\'t discern color in darkness',
    },
    'Fey Ancestry': {
      name: 'Fey Ancestry',
      description: 'You have advantage on saving throws against being charmed, and magic can\'t put you to sleep.',
      mechanic: 'Advantage vs. charm, immune to magical sleep',
    },

    // === HUMAN TRAITS ===
    'Extra Language': {
      name: 'Extra Language',
      description: 'You can speak, read, and write one extra language of your choice.',
      mechanic: '+1 language',
    },
    'Versatile': {
      name: 'Versatile',
      description: 'Humans gain +1 to all ability scores, reflecting their adaptability and drive to excel.',
      mechanic: '+1 to all ability scores',
    },

    // === ELF TRAITS ===
    'Keen Senses': {
      name: 'Keen Senses',
      description: 'You have proficiency in the Perception skill.',
      mechanic: 'Proficiency: Perception',
    },
    'Trance': {
      name: 'Trance',
      description: 'Elves don\'t need to sleep. Instead, they meditate deeply for 4 hours a day, remaining semiconscious.',
      mechanic: '4 hours rest = 8 hours sleep',
    },

    // === DWARF TRAITS ===
    'Dwarven Resilience': {
      name: 'Dwarven Resilience',
      description: 'You have advantage on saving throws against poison, and you have resistance against poison damage.',
      mechanic: 'Advantage vs. poison saves, resistance to poison damage',
    },
    'Stonecunning': {
      name: 'Stonecunning',
      description: 'Whenever you make a History check related to the origin of stonework, you are considered proficient and add double your proficiency bonus.',
      mechanic: 'Double proficiency on stonework History checks',
    },

    // === HALFLING TRAITS ===
    'Lucky': {
      name: 'Lucky',
      description: 'When you roll a 1 on an attack roll, ability check, or saving throw, you can reroll the die and must use the new roll.',
      mechanic: 'Reroll natural 1s on d20s',
    },
    'Brave': {
      name: 'Brave',
      description: 'You have advantage on saving throws against being frightened.',
      mechanic: 'Advantage vs. frightened',
    },
    'Halfling Nimbleness': {
      name: 'Halfling Nimbleness',
      description: 'You can move through the space of any creature that is of a size larger than yours.',
      mechanic: 'Move through larger creatures\' spaces',
    },

    // === DRAGONBORN TRAITS ===
    'Draconic Ancestry': {
      name: 'Draconic Ancestry',
      description: 'You have draconic ancestry. Choose one type of dragon from the table. Your breath weapon and damage resistance are determined by the dragon type.',
      mechanic: 'Determines breath weapon damage type and resistance',
    },
    'Breath Weapon': {
      name: 'Breath Weapon',
      description: 'You can use your action to exhale destructive energy. Your draconic ancestry determines the size, shape, and damage type of the exhalation.',
      mechanic: '2d6 damage (scales with level), DEX or CON save, 1/short rest',
    },
    'Damage Resistance': {
      name: 'Damage Resistance',
      description: 'You have resistance to the damage type associated with your draconic ancestry.',
      mechanic: 'Resistance to one damage type (based on ancestry)',
    },

    // === GNOME TRAITS ===
    'Gnome Cunning': {
      name: 'Gnome Cunning',
      description: 'You have advantage on all Intelligence, Wisdom, and Charisma saving throws against magic.',
      mechanic: 'Advantage on INT/WIS/CHA saves vs. magic',
    },

    // === HALF-ELF TRAITS ===
    'Skill Versatility': {
      name: 'Skill Versatility',
      description: 'You gain proficiency in two skills of your choice.',
      mechanic: '+2 skill proficiencies',
    },

    // === HALF-ORC TRAITS ===
    'Menacing': {
      name: 'Menacing',
      description: 'You gain proficiency in the Intimidation skill.',
      mechanic: 'Proficiency: Intimidation',
    },
    'Relentless Endurance': {
      name: 'Relentless Endurance',
      description: 'When you are reduced to 0 hit points but not killed outright, you can drop to 1 hit point instead.',
      mechanic: 'Drop to 1 HP instead of 0, 1/long rest',
    },
    'Savage Attacks': {
      name: 'Savage Attacks',
      description: 'When you score a critical hit with a melee weapon attack, you can roll one of the weapon\'s damage dice one additional time and add it to the extra damage.',
      mechanic: '+1 damage die on melee critical hits',
    },

    // === TIEFLING TRAITS ===
    'Hellish Resistance': {
      name: 'Hellish Resistance',
      description: 'You have resistance to fire damage.',
      mechanic: 'Resistance: Fire',
    },
    'Infernal Legacy': {
      name: 'Infernal Legacy',
      description: 'You know the thaumaturgy cantrip. At 3rd level, you can cast hellish rebuke as a 2nd-level spell once per long rest. At 5th level, you can cast darkness once per long rest. Charisma is your spellcasting ability for these spells.',
      mechanic: 'Thaumaturgy cantrip; Hellish Rebuke at 3rd; Darkness at 5th',
    },
  };

  /**
   * Get the description for a specific trait.
   * @param {string} traitName - The trait name to look up
   * @returns {Object|null} Trait object with name, description, and mechanic, or null if not found
   */
  function getTrait(traitName) {
    if (!traitName) return null;
    return RACIAL_TRAITS[traitName] || null;
  }

  /**
   * Get the description string for a trait.
   * @param {string} traitName - The trait name to look up
   * @returns {string} The description, or empty string if not found
   */
  function getTraitDescription(traitName) {
    const trait = getTrait(traitName);
    return trait ? trait.description : '';
  }

  /**
   * Get the mechanic string for a trait.
   * @param {string} traitName - The trait name to look up
   * @returns {string} The mechanic summary, or empty string if not found
   */
  function getTraitMechanic(traitName) {
    const trait = getTrait(traitName);
    return trait ? (trait.mechanic || '') : '';
  }

  /**
   * Get traits for a specific race from DND_DATA.
   * @param {string} raceId - The race ID (e.g., 'elf', 'dwarf')
   * @returns {Array} Array of trait objects with full descriptions
   */
  function getTraitsForRace(raceId) {
    if (!global.DND_DATA || !global.DND_DATA.races) {
      return [];
    }

    const normalizedId = String(raceId || '').toLowerCase().trim();
    const race = global.DND_DATA.races.find(r => r.id === normalizedId);

    if (!race || !race.traits) {
      return [];
    }

    return race.traits.map(traitName => {
      const traitData = getTrait(traitName);
      return traitData || { name: traitName, description: '', mechanic: '' };
    });
  }

  /**
   * Check if a trait has data available.
   * @param {string} traitName - The trait name
   * @returns {boolean} True if trait data exists
   */
  function hasTrait(traitName) {
    return !!RACIAL_TRAITS[traitName];
  }

  /**
   * Get all available trait names.
   * @returns {Array} Array of all trait name strings
   */
  function getAllTraitNames() {
    return Object.keys(RACIAL_TRAITS);
  }

  /**
   * Get all traits as an array.
   * @returns {Array} Array of all trait objects
   */
  function getAllTraits() {
    return Object.values(RACIAL_TRAITS);
  }

  // Expose the API
  global.RacialTraitsData = {
    RACIAL_TRAITS,
    getTrait,
    getTraitDescription,
    getTraitMechanic,
    getTraitsForRace,
    hasTrait,
    getAllTraitNames,
    getAllTraits,
  };

})(window);

