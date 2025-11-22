// Spell data for D&D 5e character builder.
// Exposes SPELL_DATA as a global on window.

window.SPELL_DATA = {
  // Spellcasting class configurations
  spellcastingClasses: {
    wizard: {
      ability: 'int',
      cantripsKnown: 3,
      spellsKnown: 6, // Written in spellbook
      preparedSpells: 'INT + level', // Can prepare this many
      spellSlots: { 1: 2 },
    },
    sorcerer: {
      ability: 'cha',
      cantripsKnown: 4,
      spellsKnown: 2,
      spellSlots: { 1: 2 },
    },
    warlock: {
      ability: 'cha',
      cantripsKnown: 2,
      spellsKnown: 2,
      spellSlots: { 1: 1 }, // Pact magic
    },
    bard: {
      ability: 'cha',
      cantripsKnown: 2,
      spellsKnown: 4,
      spellSlots: { 1: 2 },
    },
    cleric: {
      ability: 'wis',
      cantripsKnown: 3,
      preparedSpells: 'WIS + level', // Can prepare from full list
      spellSlots: { 1: 2 },
    },
    druid: {
      ability: 'wis',
      cantripsKnown: 2,
      preparedSpells: 'WIS + level', // Can prepare from full list
      spellSlots: { 1: 2 },
    },
  },

  // Cantrips organized by class
  cantrips: {
    wizard: [
      {
        id: 'fire-bolt',
        name: 'Fire Bolt',
        school: 'Evocation',
        description: 'Hurl a mote of fire at a creature or object. 1d10 fire damage.',
        tags: ['damage', 'fire', 'offense'],
      },
      {
        id: 'mage-hand',
        name: 'Mage Hand',
        school: 'Conjuration',
        description: 'Create a spectral hand that can manipulate objects at range.',
        tags: ['utility', 'manipulation'],
      },
      {
        id: 'light',
        name: 'Light',
        school: 'Evocation',
        description: 'Touch an object to make it shed bright light for 1 hour.',
        tags: ['utility', 'light'],
      },
      {
        id: 'ray-of-frost',
        name: 'Ray of Frost',
        school: 'Evocation',
        description: 'Frigid beam dealing 1d8 cold damage and reducing speed.',
        tags: ['damage', 'cold', 'offense', 'control'],
      },
      {
        id: 'shocking-grasp',
        name: 'Shocking Grasp',
        school: 'Evocation',
        description: 'Lightning damage on touch (1d8) and target cannot take reactions.',
        tags: ['damage', 'lightning', 'offense'],
      },
      {
        id: 'prestidigitation',
        name: 'Prestidigitation',
        school: 'Transmutation',
        description: 'Minor magical trick: light a candle, clean clothes, flavor food.',
        tags: ['utility', 'social'],
      },
      {
        id: 'minor-illusion',
        name: 'Minor Illusion',
        school: 'Illusion',
        description: 'Create a sound or image of an object within range.',
        tags: ['utility', 'illusion', 'deception'],
      },
    ],
    sorcerer: [
      { id: 'fire-bolt', name: 'Fire Bolt', school: 'Evocation', description: 'Hurl a mote of fire at a creature or object. 1d10 fire damage.', tags: ['damage', 'fire', 'offense'] },
      { id: 'ray-of-frost', name: 'Ray of Frost', school: 'Evocation', description: 'Frigid beam dealing 1d8 cold damage and reducing speed.', tags: ['damage', 'cold', 'offense', 'control'] },
      { id: 'shocking-grasp', name: 'Shocking Grasp', school: 'Evocation', description: 'Lightning damage on touch (1d8) and target cannot take reactions.', tags: ['damage', 'lightning', 'offense'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
    ],
    warlock: [
      { id: 'eldritch-blast', name: 'Eldritch Blast', school: 'Evocation', description: 'Beam of crackling energy dealing 1d10 force damage.', tags: ['damage', 'force', 'offense'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'chill-touch', name: 'Chill Touch', school: 'Necromancy', description: 'Ghostly hand dealing 1d8 necrotic damage and preventing healing.', tags: ['damage', 'necrotic', 'offense'] },
    ],
    bard: [
      { id: 'vicious-mockery', name: 'Vicious Mockery', school: 'Enchantment', description: 'Insult dealing 1d4 psychic damage and imposing disadvantage.', tags: ['damage', 'psychic', 'debuff', 'social'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
    ],
    cleric: [
      { id: 'sacred-flame', name: 'Sacred Flame', school: 'Evocation', description: 'Flame-like radiance dealing 1d8 radiant damage (Dex save).', tags: ['damage', 'radiant', 'offense'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'guidance', name: 'Guidance', school: 'Divination', description: 'Touch a creature to grant +1d4 to one ability check.', tags: ['buff', 'support'] },
      { id: 'spare-the-dying', name: 'Spare the Dying', school: 'Necromancy', description: 'Touch a dying creature to stabilize it.', tags: ['healing', 'support'] },
      { id: 'thaumaturgy', name: 'Thaumaturgy', school: 'Transmutation', description: 'Minor wonder: amplify voice, flicker flames, open doors.', tags: ['utility', 'social'] },
    ],
    druid: [
      { id: 'produce-flame', name: 'Produce Flame', school: 'Conjuration', description: 'Flickering flame for light or to throw (1d8 fire damage).', tags: ['damage', 'fire', 'utility', 'light'] },
      { id: 'guidance', name: 'Guidance', school: 'Divination', description: 'Touch a creature to grant +1d4 to one ability check.', tags: ['buff', 'support'] },
      { id: 'shillelagh', name: 'Shillelagh', school: 'Transmutation', description: 'Imbue a club or staff to use Wisdom for attacks (1d8 damage).', tags: ['buff', 'combat'] },
      { id: 'druidcraft', name: 'Druidcraft', school: 'Transmutation', description: 'Minor druidic effects: predict weather, bloom flowers, light fires.', tags: ['utility', 'nature'] },
    ],
  },

  // 1st level spells organized by class
  firstLevel: {
    wizard: [
      {
        id: 'magic-missile',
        name: 'Magic Missile',
        school: 'Evocation',
        description: 'Three darts of force, each dealing 1d4+1 damage (auto-hit).',
        tags: ['damage', 'force', 'offense', 'reliable'],
      },
      {
        id: 'shield',
        name: 'Shield',
        school: 'Abjuration',
        description: 'Reaction: +5 AC until start of your next turn.',
        tags: ['defense', 'protection', 'reaction'],
      },
      {
        id: 'mage-armor',
        name: 'Mage Armor',
        school: 'Abjuration',
        description: 'Set AC to 13 + Dex modifier for 8 hours.',
        tags: ['defense', 'protection', 'buff'],
      },
      {
        id: 'detect-magic',
        name: 'Detect Magic',
        school: 'Divination',
        description: 'Sense magic within 30 feet for 10 minutes (concentration).',
        tags: ['utility', 'detection', 'exploration'],
      },
      {
        id: 'identify',
        name: 'Identify',
        school: 'Divination',
        description: 'Learn properties of a magical object or spell affecting a creature.',
        tags: ['utility', 'knowledge', 'exploration'],
      },
      {
        id: 'sleep',
        name: 'Sleep',
        school: 'Enchantment',
        description: 'Put 5d8 HP worth of creatures to sleep.',
        tags: ['control', 'debuff', 'crowd-control'],
      },
      {
        id: 'burning-hands',
        name: 'Burning Hands',
        school: 'Evocation',
        description: 'Cone of fire dealing 3d6 fire damage (Dex save for half).',
        tags: ['damage', 'fire', 'aoe', 'offense'],
      },
      {
        id: 'disguise-self',
        name: 'Disguise Self',
        school: 'Illusion',
        description: 'Make yourself look different for 1 hour.',
        tags: ['utility', 'illusion', 'social', 'deception'],
      },
      {
        id: 'feather-fall',
        name: 'Feather Fall',
        school: 'Transmutation',
        description: 'Reaction: Up to 5 creatures fall slowly, taking no damage.',
        tags: ['utility', 'protection', 'reaction'],
      },
      {
        id: 'grease',
        name: 'Grease',
        school: 'Conjuration',
        description: 'Slick grease covers a 10-foot square (Dex save or fall prone).',
        tags: ['control', 'terrain', 'debuff'],
      },
    ],
    sorcerer: [
      { id: 'magic-missile', name: 'Magic Missile', school: 'Evocation', description: 'Three darts of force, each dealing 1d4+1 damage (auto-hit).', tags: ['damage', 'force', 'offense', 'reliable'] },
      { id: 'shield', name: 'Shield', school: 'Abjuration', description: 'Reaction: +5 AC until start of your next turn.', tags: ['defense', 'protection', 'reaction'] },
      { id: 'mage-armor', name: 'Mage Armor', school: 'Abjuration', description: 'Set AC to 13 + Dex modifier for 8 hours.', tags: ['defense', 'protection', 'buff'] },
      { id: 'burning-hands', name: 'Burning Hands', school: 'Evocation', description: 'Cone of fire dealing 3d6 fire damage (Dex save for half).', tags: ['damage', 'fire', 'aoe', 'offense'] },
      { id: 'chromatic-orb', name: 'Chromatic Orb', school: 'Evocation', description: 'Hurl a 4-inch sphere dealing 3d8 damage (choose: acid, cold, fire, lightning, poison, thunder).', tags: ['damage', 'versatile', 'offense'] },
      { id: 'disguise-self', name: 'Disguise Self', school: 'Illusion', description: 'Make yourself look different for 1 hour.', tags: ['utility', 'illusion', 'social', 'deception'] },
      { id: 'sleep', name: 'Sleep', school: 'Enchantment', description: 'Put 5d8 HP worth of creatures to sleep.', tags: ['control', 'debuff', 'crowd-control'] },
    ],
    warlock: [
      { id: 'hex', name: 'Hex', school: 'Enchantment', description: 'Curse a creature to take +1d6 necrotic damage and disadvantage on checks (1 hour, concentration).', tags: ['damage', 'debuff', 'curse'] },
      { id: 'armor-of-agathys', name: 'Armor of Agathys', school: 'Abjuration', description: 'Gain 5 temp HP; attackers take 5 cold damage when they hit you (1 hour).', tags: ['defense', 'protection', 'retaliation'] },
      { id: 'arms-of-hadar', name: 'Arms of Hadar', school: 'Conjuration', description: 'Tendrils deal 2d6 necrotic damage in 10-foot radius (Str save for half).', tags: ['damage', 'necrotic', 'aoe', 'offense'] },
      { id: 'charm-person', name: 'Charm Person', school: 'Enchantment', description: 'Charm a humanoid (Wis save) for 1 hour.', tags: ['control', 'social', 'charm'] },
      { id: 'hellish-rebuke', name: 'Hellish Rebuke', school: 'Evocation', description: 'Reaction: Attacker takes 2d10 fire damage (Dex save for half).', tags: ['damage', 'fire', 'reaction', 'retaliation'] },
    ],
    bard: [
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'charm-person', name: 'Charm Person', school: 'Enchantment', description: 'Charm a humanoid (Wis save) for 1 hour.', tags: ['control', 'social', 'charm'] },
      { id: 'disguise-self', name: 'Disguise Self', school: 'Illusion', description: 'Make yourself look different for 1 hour.', tags: ['utility', 'illusion', 'social', 'deception'] },
      { id: 'faerie-fire', name: 'Faerie Fire', school: 'Evocation', description: 'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).', tags: ['buff', 'support', 'debuff'] },
      { id: 'sleep', name: 'Sleep', school: 'Enchantment', description: 'Put 5d8 HP worth of creatures to sleep.', tags: ['control', 'debuff', 'crowd-control'] },
      { id: 'thunderwave', name: 'Thunderwave', school: 'Evocation', description: '15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).', tags: ['damage', 'thunder', 'aoe', 'control'] },
    ],
    cleric: [
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'bless', name: 'Bless', school: 'Enchantment', description: 'Up to 3 creatures add 1d4 to attacks and saves (1 minute, concentration).', tags: ['buff', 'support', 'team'] },
      { id: 'shield-of-faith', name: 'Shield of Faith', school: 'Abjuration', description: 'Grant +2 AC to a creature (10 minutes, concentration).', tags: ['buff', 'defense', 'support'] },
      { id: 'guiding-bolt', name: 'Guiding Bolt', school: 'Evocation', description: 'Ranged attack dealing 4d6 radiant damage; next attack against target has advantage.', tags: ['damage', 'radiant', 'offense', 'buff'] },
      { id: 'inflict-wounds', name: 'Inflict Wounds', school: 'Necromancy', description: 'Melee attack dealing 3d10 necrotic damage.', tags: ['damage', 'necrotic', 'offense'] },
      { id: 'sanctuary', name: 'Sanctuary', school: 'Abjuration', description: 'Attackers must make Wis save or choose another target (1 minute).', tags: ['defense', 'protection', 'support'] },
    ],
    druid: [
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'entangle', name: 'Entangle', school: 'Conjuration', description: 'Grasping vines restrain creatures in 20-foot square (Str save, 1 minute, concentration).', tags: ['control', 'terrain', 'debuff'] },
      { id: 'faerie-fire', name: 'Faerie Fire', school: 'Evocation', description: 'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).', tags: ['buff', 'support', 'debuff'] },
      { id: 'goodberry', name: 'Goodberry', school: 'Transmutation', description: 'Create 10 berries that each restore 1 HP and provide nourishment (24 hours).', tags: ['healing', 'utility', 'support'] },
      { id: 'thunderwave', name: 'Thunderwave', school: 'Evocation', description: '15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).', tags: ['damage', 'thunder', 'aoe', 'control'] },
      { id: 'speak-with-animals', name: 'Speak with Animals', school: 'Divination', description: 'Communicate with beasts for 10 minutes.', tags: ['utility', 'social', 'nature'] },
    ],
  },

  // Helper to get spells for a class
  getCantripsForClass(classId) {
    return this.cantrips[classId] || [];
  },

  getFirstLevelSpellsForClass(classId) {
    return this.firstLevel[classId] || [];
  },

  getSpellcastingConfig(classId) {
    return this.spellcastingClasses[classId] || null;
  },

  isSpellcaster(classId) {
    return !!this.spellcastingClasses[classId];
  },

  // Quick mode auto-selection (balanced starter spells)
  getQuickModeSpells(classId) {
    const config = this.getSpellcastingConfig(classId);
    if (!config) return null;

    const cantrips = this.getCantripsForClass(classId);
    const firstLevel = this.getFirstLevelSpellsForClass(classId);

    const result = {
      cantrips: [],
      firstLevel: [],
    };

    // Auto-select balanced cantrips
    switch (classId) {
      case 'wizard':
        result.cantrips = [cantrips[0], cantrips[1], cantrips[2]]; // Fire Bolt, Mage Hand, Light
        result.firstLevel = [
          firstLevel[0], // Magic Missile
          firstLevel[1], // Shield
          firstLevel[2], // Mage Armor
          firstLevel[3], // Detect Magic
          firstLevel[4], // Identify
          firstLevel[5], // Sleep
        ];
        break;
      case 'sorcerer':
        result.cantrips = [cantrips[0], cantrips[1], cantrips[4], cantrips[5]]; // Fire Bolt, Ray of Frost, Mage Hand, Prestidigitation
        result.firstLevel = [firstLevel[0], firstLevel[1]]; // Magic Missile, Shield
        break;
      case 'warlock':
        result.cantrips = [cantrips[0], cantrips[1]]; // Eldritch Blast, Mage Hand
        result.firstLevel = [firstLevel[0], firstLevel[1]]; // Hex, Armor of Agathys
        break;
      case 'bard':
        result.cantrips = [cantrips[0], cantrips[4]]; // Vicious Mockery, Minor Illusion
        result.firstLevel = [firstLevel[0], firstLevel[1], firstLevel[2], firstLevel[3]]; // Healing Word, Cure Wounds, Charm Person, Disguise Self
        break;
      case 'cleric':
        result.cantrips = [cantrips[0], cantrips[2], cantrips[3]]; // Sacred Flame, Guidance, Spare the Dying
        // Clerics prepare spells, so we give them a starter prepared list
        result.firstLevel = [firstLevel[0], firstLevel[1], firstLevel[2]]; // Cure Wounds, Healing Word, Bless
        break;
      case 'druid':
        result.cantrips = [cantrips[0], cantrips[1]]; // Produce Flame, Guidance
        // Druids prepare spells, so we give them a starter prepared list
        result.firstLevel = [firstLevel[0], firstLevel[2], firstLevel[3]]; // Cure Wounds, Entangle, Faerie Fire
        break;
    }

    return result;
  },

  // Guided mode spell selection based on playstyle
  getGuidedSpells(classId, preferences) {
    const config = this.getSpellcastingConfig(classId);
    if (!config) return null;

    const cantrips = this.getCantripsForClass(classId);
    const firstLevel = this.getFirstLevelSpellsForClass(classId);

    // Filter spells by tags based on preferences
    const filterByTags = (spells, preferredTags, count) => {
      const tagged = spells.map(spell => {
        const matchCount = spell.tags.filter(tag => preferredTags.includes(tag)).length;
        return { spell, matchCount };
      });
      tagged.sort((a, b) => b.matchCount - a.matchCount);
      return tagged.slice(0, count).map(item => item.spell);
    };

    // Determine preferred tags from preferences
    const preferredTags = [];
    if (preferences.style === 'offense') preferredTags.push('damage', 'offense');
    if (preferences.style === 'defense') preferredTags.push('defense', 'protection', 'healing', 'support');
    if (preferences.style === 'control') preferredTags.push('control', 'debuff', 'crowd-control');
    if (preferences.style === 'utility') preferredTags.push('utility', 'social', 'exploration');

    if (preferences.element) preferredTags.push(preferences.element);

    const result = {
      cantrips: filterByTags(cantrips, preferredTags, config.cantripsKnown),
      firstLevel: [],
    };

    // Get first level spells
    if (config.spellsKnown) {
      result.firstLevel = filterByTags(firstLevel, preferredTags, config.spellsKnown);
    } else if (config.preparedSpells) {
      // For clerics/druids, suggest a starter prepared list
      result.firstLevel = filterByTags(firstLevel, preferredTags, 3);
    }

    return result;
  },
};

