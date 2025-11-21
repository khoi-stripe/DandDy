// Core D&D 5e data used by the character builder.
// Exposes DND_DATA as a global on window.

window.DND_DATA = {
  races: [
    {
      id: 'human',
      name: 'Human',
      description: 'Versatile and ambitious, found in every corner of the world.',
      abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
      traits: ['Extra Language', 'Versatile'],
      languages: ['Common'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'elf',
      name: 'Elf',
      description: 'Graceful and long-lived, masters of magic and nature.',
      abilityBonuses: { dex: 2 },
      traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
      languages: ['Common', 'Elvish'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'dwarf',
      name: 'Dwarf',
      description: 'Stout and hardy, renowned craftsmen and warriors.',
      abilityBonuses: { con: 2 },
      traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
      languages: ['Common', 'Dwarvish'],
      size: 'Medium',
      speed: 25,
    },
    {
      id: 'halfling',
      name: 'Halfling',
      description: 'Small and nimble, lucky and brave despite their size.',
      abilityBonuses: { dex: 2 },
      traits: ['Lucky', 'Brave', 'Halfling Nimbleness'],
      languages: ['Common', 'Halfling'],
      size: 'Small',
      speed: 25,
    },
    {
      id: 'dragonborn',
      name: 'Dragonborn',
      description: 'Draconic humanoids with breath weapons and scaled skin.',
      abilityBonuses: { str: 2, cha: 1 },
      traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'],
      languages: ['Common', 'Draconic'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'gnome',
      name: 'Gnome',
      description: 'Clever and curious, lovers of knowledge and tinkering.',
      abilityBonuses: { int: 2 },
      traits: ['Darkvision', 'Gnome Cunning'],
      languages: ['Common', 'Gnomish'],
      size: 'Small',
      speed: 25,
    },
    {
      id: 'half-elf',
      name: 'Half-Elf',
      description: 'Walking between two worlds, charismatic and adaptable.',
      abilityBonuses: { cha: 2 },
      traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility'],
      languages: ['Common', 'Elvish'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'half-orc',
      name: 'Half-Orc',
      description: 'Fierce and strong, proving themselves through deeds.',
      abilityBonuses: { str: 2, con: 1 },
      traits: ['Darkvision', 'Menacing', 'Relentless Endurance', 'Savage Attacks'],
      languages: ['Common', 'Orc'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'tiefling',
      name: 'Tiefling',
      description: 'Infernal heritage grants dark powers and distinction.',
      abilityBonuses: { cha: 2, int: 1 },
      traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
      languages: ['Common', 'Infernal'],
      size: 'Medium',
      speed: 30,
    },
  ],
  
  classes: [
    {
      id: 'fighter',
      name: 'Fighter',
      description: 'Master of martial combat, skilled with weapons and armor.',
      hitDie: 10,
      primaryAbility: ['str', 'dex'],
      savingThrows: ['str', 'con'],
      equipment: ['Martial weapons', 'Heavy armor', 'Shield'],
    },
    {
      id: 'wizard',
      name: 'Wizard',
      description: 'Scholar of arcane magic, wielding powerful spells.',
      hitDie: 6,
      primaryAbility: ['int'],
      savingThrows: ['int', 'wis'],
      equipment: ['Spellbook', 'Component pouch', 'Robes'],
    },
    {
      id: 'rogue',
      name: 'Rogue',
      description: 'Skilled in stealth and precision, master of skills.',
      hitDie: 8,
      primaryAbility: ['dex'],
      savingThrows: ['dex', 'int'],
      equipment: ['Light armor', 'Thieves\' tools', 'Rapier'],
    },
    {
      id: 'cleric',
      name: 'Cleric',
      description: 'Divine spellcaster, channeling the power of a deity.',
      hitDie: 8,
      primaryAbility: ['wis'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Medium armor', 'Shield', 'Holy symbol'],
    },
    {
      id: 'ranger',
      name: 'Ranger',
      description: 'Wilderness warrior, tracker, and protector of nature.',
      hitDie: 10,
      primaryAbility: ['dex', 'wis'],
      savingThrows: ['str', 'dex'],
      equipment: ['Longbow', 'Leather armor', 'Survival gear'],
    },
    {
      id: 'paladin',
      name: 'Paladin',
      description: 'Holy warrior sworn to an oath, wielding divine magic.',
      hitDie: 10,
      primaryAbility: ['str', 'cha'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Heavy armor', 'Martial weapons', 'Holy symbol'],
    },
    {
      id: 'barbarian',
      name: 'Barbarian',
      description: 'Fierce warrior who channels rage in battle.',
      hitDie: 12,
      primaryAbility: ['str'],
      savingThrows: ['str', 'con'],
      equipment: ['Greataxe', 'Medium armor', 'Javelins'],
    },
    {
      id: 'bard',
      name: 'Bard',
      description: 'Inspiring performer who weaves magic through music.',
      hitDie: 8,
      primaryAbility: ['cha'],
      savingThrows: ['dex', 'cha'],
      equipment: ['Musical instrument', 'Light armor', 'Rapier'],
    },
    {
      id: 'druid',
      name: 'Druid',
      description: 'Nature priest who can shapeshift and wield primal magic.',
      hitDie: 8,
      primaryAbility: ['wis'],
      savingThrows: ['int', 'wis'],
      equipment: ['Druidic focus', 'Leather armor', 'Wooden shield'],
    },
    {
      id: 'monk',
      name: 'Monk',
      description: 'Martial artist who channels ki energy through their body.',
      hitDie: 8,
      primaryAbility: ['dex', 'wis'],
      savingThrows: ['str', 'dex'],
      equipment: ['Martial arts', 'Simple weapons', 'Unarmored defense'],
    },
    {
      id: 'sorcerer',
      name: 'Sorcerer',
      description: 'Innate spellcaster with magic in their blood.',
      hitDie: 6,
      primaryAbility: ['cha'],
      savingThrows: ['con', 'cha'],
      equipment: ['Arcane focus', 'Light crossbow', 'Component pouch'],
    },
    {
      id: 'warlock',
      name: 'Warlock',
      description: 'Pact-bound caster drawing power from otherworldly patrons.',
      hitDie: 8,
      primaryAbility: ['cha'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Eldritch invocations', 'Light armor', 'Simple weapons'],
    },
  ],
  
  backgrounds: [
    {
      id: 'acolyte',
      name: 'Acolyte',
      description: 'Served in a temple to a deity or pantheon.',
      skillProficiencies: ['insight', 'religion'],
      languages: 2, // Choose 2 languages
      equipment: [
        'Holy symbol',
        'Prayer book or prayer wheel',
        '5 sticks of incense',
        'Vestments',
        'Common clothes',
        '15 gp'
      ],
      feature: {
        name: 'Shelter of the Faithful',
        description: 'You and your companions can receive free healing and care at temples, shrines, and other religious establishments of your faith. Those who share your religion will support you at a modest lifestyle and provide you with necessary (though not luxurious) assistance.'
      }
    },
    {
      id: 'criminal',
      name: 'Criminal',
      description: 'Experienced in breaking the law and living outside society.',
      skillProficiencies: ['deception', 'stealth'],
      toolProficiencies: ['thieves-tools', 'gaming-set'],
      equipment: [
        'Crowbar',
        'Dark common clothes with hood',
        'Belt pouch',
        '15 gp'
      ],
      feature: {
        name: 'Criminal Contact',
        description: 'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances, and you know the local messengers, corrupt officials, and fence who can help you.'
      }
    },
    {
      id: 'folk-hero',
      name: 'Folk Hero',
      description: 'Champion of the common people, standing up against tyrants.',
      skillProficiencies: ['animal-handling', 'survival'],
      toolProficiencies: ['artisan-tools', 'vehicles-land'],
      equipment: [
        'Set of artisan\'s tools',
        'Shovel',
        'Iron pot',
        'Common clothes',
        'Belt pouch',
        '10 gp'
      ],
      feature: {
        name: 'Rustic Hospitality',
        description: 'Since you come from the common folk, you fit in easily among them. You can find a place to hide, rest, or recuperate among commoners, who will shield you from the law or those hunting you (unless you show yourself to be a danger to them).'
      }
    },
    {
      id: 'noble',
      name: 'Noble',
      description: 'Born to wealth and privilege, understanding power and hierarchy.',
      skillProficiencies: ['history', 'persuasion'],
      toolProficiencies: ['gaming-set'],
      languages: 1,
      equipment: [
        'Fine clothes',
        'Signet ring',
        'Scroll of pedigree',
        'Purse',
        '25 gp'
      ],
      feature: {
        name: 'Position of Privilege',
        description: 'You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other nobles treat you as a member of the same social sphere.'
      }
    },
    {
      id: 'sage',
      name: 'Sage',
      description: 'Researcher and scholar, devoted to learning and study.',
      skillProficiencies: ['arcana', 'history'],
      languages: 2,
      equipment: [
        'Bottle of black ink',
        'Quill',
        'Small knife',
        'Letter from dead colleague',
        'Common clothes',
        '10 gp'
      ],
      feature: {
        name: 'Researcher',
        description: 'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it. Usually this comes from a library, scriptorium, university, or another sage or learned person.'
      }
    },
    {
      id: 'soldier',
      name: 'Soldier',
      description: 'Trained warrior with experience in military campaigns.',
      skillProficiencies: ['athletics', 'intimidation'],
      toolProficiencies: ['gaming-set', 'vehicles-land'],
      equipment: [
        'Insignia of rank',
        'Trophy from fallen enemy',
        'Bone dice or playing cards',
        'Common clothes',
        '10 gp'
      ],
      feature: {
        name: 'Military Rank',
        description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence. You can invoke your rank to influence soldiers and temporarily requisition simple equipment or horses.'
      }
    },
    {
      id: 'outlander',
      name: 'Outlander',
      description: 'Grew up in the wilderness, far from civilization.',
      skillProficiencies: ['athletics', 'survival'],
      toolProficiencies: ['musical-instrument'],
      languages: 1,
      equipment: [
        'Staff',
        'Hunting trap',
        'Trophy from animal you killed',
        'Traveler\'s clothes',
        '10 gp'
      ],
      feature: {
        name: 'Wanderer',
        description: 'You have excellent memory for maps and geography, and can always recall the general layout of terrain and settlements. You can find food and water for yourself and up to five others each day, provided the land offers berries, game, water, and so forth.'
      }
    },
    {
      id: 'entertainer',
      name: 'Entertainer',
      description: 'Performer who thrives in front of an audience.',
      skillProficiencies: ['acrobatics', 'performance'],
      toolProficiencies: ['disguise-kit', 'musical-instrument'],
      equipment: [
        'Musical instrument',
        'Favor of an admirer (love letter or trinket)',
        'Costume',
        'Belt pouch',
        '15 gp'
      ],
      feature: {
        name: 'By Popular Demand',
        description: 'You can always find a place to perform (inn, tavern, circus, etc.). You receive free lodging and food of modest or comfortable standard as long as you perform each night. Your performance makes you a local figure, and strangers recognize you in any town where you\'ve performed.'
      }
    },
  ],
  
  alignments: [
    { id: 'lg', name: 'Lawful Good', description: 'Honor and compassion' },
    { id: 'ng', name: 'Neutral Good', description: 'Kindness without bias' },
    { id: 'cg', name: 'Chaotic Good', description: 'Freedom and kindness' },
    { id: 'ln', name: 'Lawful Neutral', description: 'Order above all' },
    { id: 'n', name: 'True Neutral', description: 'Balance and pragmatism' },
    { id: 'cn', name: 'Chaotic Neutral', description: 'Freedom above all' },
    { id: 'le', name: 'Lawful Evil', description: 'Methodical cruelty' },
    { id: 'ne', name: 'Neutral Evil', description: 'Pure selfishness' },
    { id: 'ce', name: 'Chaotic Evil', description: 'Destruction and malice' },
  ],
};


