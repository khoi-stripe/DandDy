// Class Features Data for D&D 5e SRD Classes
// This provides a read-only reference of features gained at each level.
// Designed to be displayed as an optional panel on the character sheet.

(function (global) {
  'use strict';

  /**
   * Class features organized by class and level.
   * Each feature has:
   *   - name: Feature name
   *   - description: Brief description (optional, kept short for display)
   *   - choice: true if player must make a choice (subclass, fighting style, etc.)
   * 
   * Based on SRD 5.1 content.
   */
  const CLASS_FEATURES = {
    fighter: {
      1: [
        { name: 'Fighting Style', choice: true, description: 'Choose a combat specialty' },
        { name: 'Second Wind', description: 'Bonus action to regain 1d10 + level HP (1/short rest)' },
      ],
      2: [
        { name: 'Action Surge', description: 'Take one additional action (1/short rest)' },
      ],
      3: [
        { name: 'Martial Archetype', choice: true, description: 'Choose a subclass (Champion, etc.)' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action' },
      ],
      6: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      7: [
        { name: 'Martial Archetype Feature', description: 'Subclass feature' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Indomitable', description: 'Reroll a failed saving throw (1/long rest)' },
      ],
      10: [
        { name: 'Martial Archetype Feature', description: 'Subclass feature' },
      ],
      11: [
        { name: 'Extra Attack (2)', description: 'Attack three times when you take the Attack action' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [
        { name: 'Indomitable (2)', description: 'Reroll a failed saving throw (2/long rest)' },
      ],
      14: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      15: [
        { name: 'Martial Archetype Feature', description: 'Subclass feature' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Action Surge (2)', description: 'Use Action Surge twice (2/short rest)' },
        { name: 'Indomitable (3)', description: 'Reroll a failed saving throw (3/long rest)' },
      ],
      18: [
        { name: 'Martial Archetype Feature', description: 'Subclass feature' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Extra Attack (3)', description: 'Attack four times when you take the Attack action' },
      ],
    },

    wizard: {
      1: [
        { name: 'Spellcasting', description: 'Cast wizard spells using Intelligence' },
        { name: 'Arcane Recovery', description: 'Recover spell slots during short rest (1/day)' },
      ],
      2: [
        { name: 'Arcane Tradition', choice: true, description: 'Choose a subclass (School of Evocation, etc.)' },
      ],
      3: [],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [],
      6: [
        { name: 'Arcane Tradition Feature', description: 'Subclass feature' },
      ],
      7: [],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [],
      10: [
        { name: 'Arcane Tradition Feature', description: 'Subclass feature' },
      ],
      11: [],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Arcane Tradition Feature', description: 'Subclass feature' },
      ],
      15: [],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [],
      18: [
        { name: 'Spell Mastery', description: 'Cast one 1st and one 2nd level spell at will' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Signature Spells', description: 'Two 3rd level spells always prepared, cast 1/short rest free' },
      ],
    },

    rogue: {
      1: [
        { name: 'Expertise', description: 'Double proficiency bonus for two skills' },
        { name: 'Sneak Attack', description: '1d6 extra damage when you have advantage' },
        { name: 'Thieves\' Cant', description: 'Secret language of rogues' },
      ],
      2: [
        { name: 'Cunning Action', description: 'Bonus action to Dash, Disengage, or Hide' },
      ],
      3: [
        { name: 'Roguish Archetype', choice: true, description: 'Choose a subclass (Thief, etc.)' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Uncanny Dodge', description: 'Reaction to halve attack damage' },
      ],
      6: [
        { name: 'Expertise', description: 'Double proficiency bonus for two more skills' },
      ],
      7: [
        { name: 'Evasion', description: 'No damage on successful DEX save, half on fail' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Roguish Archetype Feature', description: 'Subclass feature' },
      ],
      10: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      11: [
        { name: 'Reliable Talent', description: 'Minimum 10 on proficient ability checks' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [
        { name: 'Roguish Archetype Feature', description: 'Subclass feature' },
      ],
      14: [
        { name: 'Blindsense', description: 'Sense hidden creatures within 10 feet' },
      ],
      15: [
        { name: 'Slippery Mind', description: 'Proficiency in Wisdom saving throws' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Roguish Archetype Feature', description: 'Subclass feature' },
      ],
      18: [
        { name: 'Elusive', description: 'No attack has advantage against you' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Stroke of Luck', description: 'Turn a miss into a hit or a failed check into 20' },
      ],
    },

    cleric: {
      1: [
        { name: 'Spellcasting', description: 'Cast cleric spells using Wisdom' },
        { name: 'Divine Domain', choice: true, description: 'Choose a subclass (Life, etc.)' },
      ],
      2: [
        { name: 'Channel Divinity', description: 'Turn Undead + domain power (1/short rest)' },
      ],
      3: [],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Destroy Undead', description: 'Turn Undead destroys CR 1/2 or lower' },
      ],
      6: [
        { name: 'Channel Divinity (2)', description: 'Use Channel Divinity twice (2/short rest)' },
        { name: 'Divine Domain Feature', description: 'Subclass feature' },
      ],
      7: [],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
        { name: 'Destroy Undead (CR 1)', description: 'Turn Undead destroys CR 1 or lower' },
        { name: 'Divine Domain Feature', description: 'Subclass feature' },
      ],
      9: [],
      10: [
        { name: 'Divine Intervention', description: 'Call upon your deity for aid' },
      ],
      11: [
        { name: 'Destroy Undead (CR 2)', description: 'Turn Undead destroys CR 2 or lower' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Destroy Undead (CR 3)', description: 'Turn Undead destroys CR 3 or lower' },
      ],
      15: [],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Destroy Undead (CR 4)', description: 'Turn Undead destroys CR 4 or lower' },
        { name: 'Divine Domain Feature', description: 'Subclass feature' },
      ],
      18: [
        { name: 'Channel Divinity (3)', description: 'Use Channel Divinity three times (3/short rest)' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Divine Intervention Improvement', description: 'Divine Intervention automatically succeeds' },
      ],
    },

    barbarian: {
      1: [
        { name: 'Rage', description: 'Bonus damage, resistance, advantage on STR (2/long rest)' },
        { name: 'Unarmored Defense', description: 'AC = 10 + DEX + CON when unarmored' },
      ],
      2: [
        { name: 'Reckless Attack', description: 'Advantage on attacks, enemies have advantage on you' },
        { name: 'Danger Sense', description: 'Advantage on DEX saves vs. visible effects' },
      ],
      3: [
        { name: 'Primal Path', choice: true, description: 'Choose a subclass (Berserker, etc.)' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action' },
        { name: 'Fast Movement', description: '+10 feet speed when not in heavy armor' },
      ],
      6: [
        { name: 'Primal Path Feature', description: 'Subclass feature' },
      ],
      7: [
        { name: 'Feral Instinct', description: 'Advantage on initiative, act while surprised if you rage' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Brutal Critical', description: '+1 damage die on critical hits' },
      ],
      10: [
        { name: 'Primal Path Feature', description: 'Subclass feature' },
      ],
      11: [
        { name: 'Relentless Rage', description: 'CON save to stay at 1 HP instead of 0' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [
        { name: 'Brutal Critical (2)', description: '+2 damage dice on critical hits' },
      ],
      14: [
        { name: 'Primal Path Feature', description: 'Subclass feature' },
      ],
      15: [
        { name: 'Persistent Rage', description: 'Rage only ends early if you choose' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Brutal Critical (3)', description: '+3 damage dice on critical hits' },
      ],
      18: [
        { name: 'Indomitable Might', description: 'Min STR check = STR score' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Primal Champion', description: '+4 STR, +4 CON (max 24)' },
      ],
    },

    bard: {
      1: [
        { name: 'Spellcasting', description: 'Cast bard spells using Charisma' },
        { name: 'Bardic Inspiration', description: 'Give d6 inspiration die (CHA mod/long rest)' },
      ],
      2: [
        { name: 'Jack of All Trades', description: 'Add half proficiency to non-proficient checks' },
        { name: 'Song of Rest', description: 'Extra d6 healing during short rest' },
      ],
      3: [
        { name: 'Bard College', choice: true, description: 'Choose a subclass (Lore, Valor, etc.)' },
        { name: 'Expertise', description: 'Double proficiency bonus for two skills' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Bardic Inspiration (d8)', description: 'Inspiration die increases to d8' },
        { name: 'Font of Inspiration', description: 'Regain Bardic Inspiration on short rest' },
      ],
      6: [
        { name: 'Countercharm', description: 'Allies advantage vs. frightened/charmed' },
        { name: 'Bard College Feature', description: 'Subclass feature' },
      ],
      7: [],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Song of Rest (d8)', description: 'Song of Rest healing increases to d8' },
      ],
      10: [
        { name: 'Bardic Inspiration (d10)', description: 'Inspiration die increases to d10' },
        { name: 'Expertise', description: 'Double proficiency bonus for two more skills' },
        { name: 'Magical Secrets', description: 'Learn 2 spells from any class' },
      ],
      11: [],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [
        { name: 'Song of Rest (d10)', description: 'Song of Rest healing increases to d10' },
      ],
      14: [
        { name: 'Magical Secrets', description: 'Learn 2 more spells from any class' },
        { name: 'Bard College Feature', description: 'Subclass feature' },
      ],
      15: [
        { name: 'Bardic Inspiration (d12)', description: 'Inspiration die increases to d12' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Song of Rest (d12)', description: 'Song of Rest healing increases to d12' },
      ],
      18: [
        { name: 'Magical Secrets', description: 'Learn 2 more spells from any class' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Superior Inspiration', description: 'Regain 1 Bardic Inspiration when you roll initiative with 0' },
      ],
    },

    monk: {
      1: [
        { name: 'Unarmored Defense', description: 'AC = 10 + DEX + WIS when unarmored' },
        { name: 'Martial Arts', description: 'Use DEX for unarmed/monk weapons, bonus unarmed strike' },
      ],
      2: [
        { name: 'Ki', description: 'Ki points equal to monk level' },
        { name: 'Flurry of Blows', description: '1 ki: two unarmed strikes as bonus action' },
        { name: 'Patient Defense', description: '1 ki: Dodge as bonus action' },
        { name: 'Step of the Wind', description: '1 ki: Dash or Disengage as bonus action + double jump' },
        { name: 'Unarmored Movement', description: '+10 feet speed when unarmored' },
      ],
      3: [
        { name: 'Monastic Tradition', choice: true, description: 'Choose a subclass (Open Hand, etc.)' },
        { name: 'Deflect Missiles', description: 'Reduce ranged damage, possibly catch and throw' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
        { name: 'Slow Fall', description: 'Reduce falling damage by 5 × monk level' },
      ],
      5: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action' },
        { name: 'Stunning Strike', description: '1 ki: target must CON save or be stunned' },
      ],
      6: [
        { name: 'Ki-Empowered Strikes', description: 'Unarmed strikes count as magical' },
        { name: 'Monastic Tradition Feature', description: 'Subclass feature' },
        { name: 'Unarmored Movement (+15)', description: '+15 feet speed when unarmored' },
      ],
      7: [
        { name: 'Evasion', description: 'No damage on successful DEX save, half on fail' },
        { name: 'Stillness of Mind', description: 'End charmed or frightened on yourself' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Unarmored Movement (Walls)', description: 'Run along walls and across liquids' },
      ],
      10: [
        { name: 'Purity of Body', description: 'Immune to disease and poison' },
        { name: 'Unarmored Movement (+20)', description: '+20 feet speed when unarmored' },
      ],
      11: [
        { name: 'Monastic Tradition Feature', description: 'Subclass feature' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [
        { name: 'Tongue of the Sun and Moon', description: 'Understand and speak all languages' },
      ],
      14: [
        { name: 'Diamond Soul', description: 'Proficiency in all saving throws, spend ki to reroll' },
        { name: 'Unarmored Movement (+25)', description: '+25 feet speed when unarmored' },
      ],
      15: [
        { name: 'Timeless Body', description: 'No frailty of old age, don\'t need food or water' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Monastic Tradition Feature', description: 'Subclass feature' },
      ],
      18: [
        { name: 'Empty Body', description: '4 ki: invisible + resistant for 1 minute' },
        { name: 'Unarmored Movement (+30)', description: '+30 feet speed when unarmored' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Perfect Self', description: 'Regain 4 ki when you roll initiative with 0' },
      ],
    },

    paladin: {
      1: [
        { name: 'Divine Sense', description: 'Detect celestials, fiends, and undead' },
        { name: 'Lay on Hands', description: 'Healing pool of 5 × paladin level' },
      ],
      2: [
        { name: 'Fighting Style', choice: true, description: 'Choose a combat specialty' },
        { name: 'Spellcasting', description: 'Cast paladin spells using Charisma' },
        { name: 'Divine Smite', description: 'Spend spell slot for +2d8 radiant damage' },
      ],
      3: [
        { name: 'Divine Health', description: 'Immune to disease' },
        { name: 'Sacred Oath', choice: true, description: 'Choose a subclass (Devotion, etc.)' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action' },
      ],
      6: [
        { name: 'Aura of Protection', description: '+CHA mod to saves within 10 feet' },
      ],
      7: [
        { name: 'Sacred Oath Feature', description: 'Subclass feature (Aura)' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [],
      10: [
        { name: 'Aura of Courage', description: 'You and allies within 10 feet can\'t be frightened' },
      ],
      11: [
        { name: 'Improved Divine Smite', description: '+1d8 radiant on all melee hits' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Cleansing Touch', description: 'End one spell on yourself or willing creature' },
      ],
      15: [
        { name: 'Sacred Oath Feature', description: 'Subclass feature' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [],
      18: [
        { name: 'Aura Improvements', description: 'Auras extend to 30 feet' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Sacred Oath Feature', description: 'Subclass capstone feature' },
      ],
    },

    ranger: {
      1: [
        { name: 'Favored Enemy', choice: true, description: 'Choose a type of creature to track/hunt' },
        { name: 'Natural Explorer', choice: true, description: 'Choose a favored terrain' },
      ],
      2: [
        { name: 'Fighting Style', choice: true, description: 'Choose a combat specialty' },
        { name: 'Spellcasting', description: 'Cast ranger spells using Wisdom' },
      ],
      3: [
        { name: 'Ranger Archetype', choice: true, description: 'Choose a subclass (Hunter, etc.)' },
        { name: 'Primeval Awareness', description: 'Sense aberrations, celestials, etc. within 1 mile' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Extra Attack', description: 'Attack twice when you take the Attack action' },
      ],
      6: [
        { name: 'Favored Enemy (2)', description: 'Choose another favored enemy type' },
        { name: 'Natural Explorer (2)', description: 'Choose another favored terrain' },
      ],
      7: [
        { name: 'Ranger Archetype Feature', description: 'Subclass feature' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
        { name: 'Land\'s Stride', description: 'Move through difficult terrain without penalty' },
      ],
      9: [],
      10: [
        { name: 'Natural Explorer (3)', description: 'Choose another favored terrain' },
        { name: 'Hide in Plain Sight', description: 'Camouflage for +10 Stealth' },
      ],
      11: [
        { name: 'Ranger Archetype Feature', description: 'Subclass feature' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Favored Enemy (3)', description: 'Choose another favored enemy type' },
        { name: 'Vanish', description: 'Hide as a bonus action, can\'t be tracked nonmagically' },
      ],
      15: [
        { name: 'Ranger Archetype Feature', description: 'Subclass feature' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [],
      18: [
        { name: 'Feral Senses', description: 'No disadvantage attacking invisible creatures' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Foe Slayer', description: '+WIS mod to attack or damage vs. favored enemy' },
      ],
    },

    sorcerer: {
      1: [
        { name: 'Spellcasting', description: 'Cast sorcerer spells using Charisma' },
        { name: 'Sorcerous Origin', choice: true, description: 'Choose a subclass (Draconic, Wild Magic, etc.)' },
      ],
      2: [
        { name: 'Font of Magic', description: 'Sorcery points equal to sorcerer level' },
      ],
      3: [
        { name: 'Metamagic', choice: true, description: 'Choose 2 ways to modify your spells' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [],
      6: [
        { name: 'Sorcerous Origin Feature', description: 'Subclass feature' },
      ],
      7: [],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [],
      10: [
        { name: 'Metamagic', choice: true, description: 'Choose 1 additional Metamagic option' },
      ],
      11: [],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Sorcerous Origin Feature', description: 'Subclass feature' },
      ],
      15: [],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Metamagic', choice: true, description: 'Choose 1 additional Metamagic option' },
      ],
      18: [
        { name: 'Sorcerous Origin Feature', description: 'Subclass feature' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Sorcerous Restoration', description: 'Regain 4 sorcery points on short rest' },
      ],
    },

    warlock: {
      1: [
        { name: 'Otherworldly Patron', choice: true, description: 'Choose a subclass (Fiend, Archfey, etc.)' },
        { name: 'Pact Magic', description: 'Cast warlock spells using Charisma (short rest recovery)' },
      ],
      2: [
        { name: 'Eldritch Invocations', choice: true, description: 'Choose 2 invocations to customize your powers' },
      ],
      3: [
        { name: 'Pact Boon', choice: true, description: 'Choose Pact of the Chain, Blade, or Tome' },
      ],
      4: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [
        { name: 'Eldritch Invocations (3)', description: 'Choose 1 additional invocation' },
      ],
      6: [
        { name: 'Otherworldly Patron Feature', description: 'Subclass feature' },
      ],
      7: [
        { name: 'Eldritch Invocations (4)', description: 'Choose 1 additional invocation' },
      ],
      8: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [
        { name: 'Eldritch Invocations (5)', description: 'Choose 1 additional invocation' },
      ],
      10: [
        { name: 'Otherworldly Patron Feature', description: 'Subclass feature' },
      ],
      11: [
        { name: 'Mystic Arcanum (6th)', description: 'Cast one 6th level spell 1/long rest' },
      ],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
        { name: 'Eldritch Invocations (6)', description: 'Choose 1 additional invocation' },
      ],
      13: [
        { name: 'Mystic Arcanum (7th)', description: 'Cast one 7th level spell 1/long rest' },
      ],
      14: [
        { name: 'Otherworldly Patron Feature', description: 'Subclass feature' },
      ],
      15: [
        { name: 'Mystic Arcanum (8th)', description: 'Cast one 8th level spell 1/long rest' },
        { name: 'Eldritch Invocations (7)', description: 'Choose 1 additional invocation' },
      ],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [
        { name: 'Mystic Arcanum (9th)', description: 'Cast one 9th level spell 1/long rest' },
      ],
      18: [
        { name: 'Eldritch Invocations (8)', description: 'Choose 1 additional invocation' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Eldritch Master', description: 'Regain all Pact Magic slots (1/long rest)' },
      ],
    },

    druid: {
      1: [
        { name: 'Druidic', description: 'Secret language of druids' },
        { name: 'Spellcasting', description: 'Cast druid spells using Wisdom' },
      ],
      2: [
        { name: 'Wild Shape', description: 'Transform into beasts (2/short rest)' },
        { name: 'Druid Circle', choice: true, description: 'Choose a subclass (Land, Moon, etc.)' },
      ],
      3: [],
      4: [
        { name: 'Wild Shape Improvement', description: 'Transform into CR 1/2 beasts, swim speed' },
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      5: [],
      6: [
        { name: 'Druid Circle Feature', description: 'Subclass feature' },
      ],
      7: [],
      8: [
        { name: 'Wild Shape Improvement', description: 'Transform into CR 1 beasts, fly speed' },
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      9: [],
      10: [
        { name: 'Druid Circle Feature', description: 'Subclass feature' },
      ],
      11: [],
      12: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      13: [],
      14: [
        { name: 'Druid Circle Feature', description: 'Subclass feature' },
      ],
      15: [],
      16: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      17: [],
      18: [
        { name: 'Timeless Body', description: 'Age slowly, can\'t be magically aged' },
        { name: 'Beast Spells', description: 'Cast spells while in Wild Shape' },
      ],
      19: [
        { name: 'Ability Score Improvement', choice: true, description: '+2 to one ability or +1 to two abilities' },
      ],
      20: [
        { name: 'Archdruid', description: 'Unlimited Wild Shape uses, ignore V/S components' },
      ],
    },
  };

  /**
   * Get all features a character has up to their current level.
   * @param {string} className - The class name (e.g., 'fighter', 'wizard')
   * @param {number} level - The character's current level (1-20)
   * @returns {Array} Array of { level, features: [...] } objects
   */
  function getFeaturesUpToLevel(className, level) {
    const normalizedClass = String(className || '').toLowerCase().trim().replace(/\s+/g, '-');
    const classData = CLASS_FEATURES[normalizedClass];
    
    if (!classData) {
      return [];
    }

    const result = [];
    const clampedLevel = Math.max(1, Math.min(20, level || 1));
    
    for (let lvl = 1; lvl <= clampedLevel; lvl++) {
      const features = classData[lvl] || [];
      if (features.length > 0) {
        result.push({
          level: lvl,
          features: features,
          isCurrentLevel: lvl === clampedLevel,
        });
      } else {
        // Show placeholder for levels with no new features
        result.push({
          level: lvl,
          features: [{ name: 'No new features', description: '', placeholder: true }],
          isCurrentLevel: lvl === clampedLevel,
        });
      }
    }

    return result;
  }

  /**
   * Get features gained at a specific level.
   * @param {string} className - The class name
   * @param {number} level - The specific level to check
   * @returns {Array} Array of feature objects
   */
  function getFeaturesAtLevel(className, level) {
    const normalizedClass = String(className || '').toLowerCase().trim().replace(/\s+/g, '-');
    const classData = CLASS_FEATURES[normalizedClass];
    
    if (!classData) {
      return [];
    }

    return classData[level] || [];
  }

  /**
   * Check if a class has feature data available.
   * @param {string} className - The class name
   * @returns {boolean} True if feature data exists
   */
  function hasClassFeatures(className) {
    const normalizedClass = String(className || '').toLowerCase().trim().replace(/\s+/g, '-');
    return !!CLASS_FEATURES[normalizedClass];
  }

  /**
   * Get a flat list of all feature names a character has.
   * Useful for quick lookups like "does this character have Extra Attack?"
   * @param {string} className - The class name
   * @param {number} level - The character's current level
   * @returns {Array} Array of feature name strings
   */
  function getFeatureNames(className, level) {
    const allFeatures = getFeaturesUpToLevel(className, level);
    const names = [];
    
    for (const levelData of allFeatures) {
      for (const feature of levelData.features) {
        names.push(feature.name);
      }
    }

    return names;
  }

  /**
   * Check if a character has a specific feature by name.
   * @param {string} className - The class name
   * @param {number} level - The character's current level
   * @param {string} featureName - The feature name to check for
   * @returns {boolean} True if the character has this feature
   */
  function hasFeature(className, level, featureName) {
    const names = getFeatureNames(className, level);
    const normalizedSearch = featureName.toLowerCase().trim();
    return names.some(name => name.toLowerCase().includes(normalizedSearch));
  }

  // Expose the API
  global.ClassFeaturesData = {
    CLASS_FEATURES,
    getFeaturesUpToLevel,
    getFeaturesAtLevel,
    hasClassFeatures,
    getFeatureNames,
    hasFeature,
  };

})(window);



