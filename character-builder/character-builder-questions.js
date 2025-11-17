// Question flow definition for the DandDy terminal character builder.
// Exposes QUESTIONS as a global on window.

const QUESTIONS = (window.QUESTIONS = [
  {
    id: 'entry-mode',
    type: 'choice',
    text: 'How would you like to create your character?',
    options: [
      {
        text: 'Co-create with the narrator (guided mode)',
        value: 'guided',
      },
      {
        text: 'Quick create (let the system roll everything)',
        value: 'quick',
      },
    ],
    next: 'intro',
  },

  {
    id: 'intro',
    type: 'message',
    text: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> Ah. Another soul seeking adventure. Or at least, trying to.
> 
> Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.
> 
> Let's start with something easy...`,
    next: 'motivation',
  },

  {
    id: 'motivation',
    type: 'choice',
    text: 'What draws you to the adventuring life?',
    options: [
      { text: 'Glory and heroism', value: 'glory', trait: 'heroic' },
      { text: 'Gold and treasure', value: 'gold', trait: 'greedy' },
      { text: 'Escaping my past', value: 'escape', trait: 'mysterious' },
      { text: 'Just bored, honestly', value: 'bored', trait: 'casual' },
    ],
    aiPromptContext: 'player motivation for adventuring',
    next: 'physicality',
  },

  {
    id: 'physicality',
    type: 'choice',
    text: 'And physically, how would you describe yourself?',
    options: [
      {
        text: 'Strong and imposing',
        value: 'strong',
        suggests: ['fighter', 'barbarian', 'paladin'],
      },
      {
        text: 'Quick and nimble',
        value: 'nimble',
        suggests: ['rogue', 'ranger', 'monk'],
      },
      {
        text: 'Mystically gifted',
        value: 'mystical',
        suggests: ['wizard', 'sorcerer', 'warlock'],
      },
      {
        text: 'Unremarkable, honestly',
        value: 'average',
        suggests: ['bard', 'cleric', 'druid'],
      },
    ],
    aiPromptContext: 'player physical description',
    next: 'social',
  },

  {
    id: 'social',
    type: 'choice',
    text: 'In social situations, you tend to be...',
    options: [
      {
        text: 'Charismatic and charming',
        value: 'charismatic',
        suggests: ['bard', 'paladin', 'sorcerer', 'warlock'],
      },
      {
        text: 'Observant and quiet',
        value: 'observant',
        suggests: ['rogue', 'ranger', 'druid'],
      },
      {
        text: 'Intimidating',
        value: 'intimidating',
        suggests: ['barbarian', 'fighter'],
      },
      {
        text: 'Awkward but well-meaning',
        value: 'awkward',
        suggests: ['wizard', 'cleric', 'monk'],
      },
    ],
    aiPromptContext: 'player social tendencies',
    next: 'race-suggest',
  },

  {
    id: 'race-suggest',
    type: 'suggestion',
    text: 'Analyzing your responses... ( ._. )',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Map answers to race suggestions
      if (answers.physicality === 'strong') {
        suggestions.push('dwarf', 'half-orc', 'dragonborn');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('elf', 'halfling', 'half-elf');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('tiefling', 'elf', 'gnome');
      }
      if (answers.physicality === 'average') {
        suggestions.push('human', 'half-elf', 'halfling');
      }

      if (answers.social === 'charismatic') {
        suggestions.push('human', 'half-elf', 'tiefling');
      }
      if (answers.social === 'observant') {
        suggestions.push('elf', 'gnome');
      }
      if (answers.social === 'intimidating') {
        suggestions.push('half-orc', 'dragonborn', 'dwarf');
      }
      if (answers.social === 'awkward') {
        suggestions.push('gnome', 'halfling', 'tiefling');
      }

      // Get top 3 most suggested
      const counts = {};
      suggestions.forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
      const top3 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([race]) => race);

      return {
        message:
          'Based on your answers, you seem like the type who would be... let me think...',
        suggestions: top3.length === 3 ? top3 : ['human', 'elf', 'dwarf'],
      };
    },
    next: 'race-choice',
  },

  {
    id: 'race-choice',
    type: 'list-choice',
    text: 'Choose your race:',
    options: DND_DATA.races.map((r) => ({
      text: `${r.name} - ${r.description}`,
      value: r.id,
    })),
    saveTo: 'race',
    next: 'class-suggest',
  },

  {
    id: 'class-suggest',
    type: 'suggestion',
    text: 'Interesting choice. Now for your class...',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Simple logic to suggest classes based on previous answers
      if (answers.physicality === 'strong') {
        suggestions.push('fighter', 'barbarian', 'paladin');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('rogue', 'ranger', 'monk');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('wizard', 'sorcerer', 'warlock');
      }
      if (answers.social === 'charismatic') {
        suggestions.push('bard', 'paladin');
      }

      return {
        message: 'Given your choices, might I suggest...',
        suggestions: suggestions.length
          ? suggestions.slice(0, 3)
          : ['fighter', 'wizard', 'rogue'],
      };
    },
    next: 'class-choice',
  },

  {
    id: 'class-choice',
    type: 'list-choice',
    text: 'Choose your class:',
    options: DND_DATA.classes.map((c) => ({
      text: `${c.name} - ${c.description}`,
      value: c.id,
    })),
    saveTo: 'class',
    next: 'abilities',
  },

  {
    id: 'abilities',
    type: 'abilities',
    text: 'Time to roll your ability scores. Choose your method:',
    options: [
      {
        text: 'Standard Array (15, 14, 13, 12, 10, 8)',
        value: 'standard',
      },
      { text: 'Roll 4d6 (drop lowest)', value: 'roll' },
    ],
    next: 'background-choice',
  },

  {
    id: 'background-choice',
    type: 'list-choice',
    text: 'What was your life before adventuring?',
    options: DND_DATA.backgrounds.map((b) => ({
      text: `${b.name} - ${b.description}`,
      value: b.id,
    })),
    saveTo: 'background',
    next: 'alignment-choice',
  },

  {
    id: 'alignment-choice',
    type: 'list-choice',
    text: 'And your moral compass points toward...',
    options: DND_DATA.alignments.map((a) => ({
      text: `${a.name} - ${a.description}`,
      value: a.id,
    })),
    saveTo: 'alignment',
    next: 'name-choice',
  },

  {
    id: 'name-choice',
    type: 'name',
    text: 'Finally, what shall we call you?',
    next: 'backstory',
  },

  {
    id: 'backstory',
    type: 'backstory',
    text: 'Generating your backstory...',
    next: 'complete',
  },

  {
    id: 'complete',
    type: 'complete',
    text: "Well. That's done. Your character is ready. Try not to die immediately.",
  },
]);




