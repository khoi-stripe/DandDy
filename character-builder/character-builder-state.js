// State management for the DandDy terminal character builder.
// Exposes CharacterState and OptionVariationsCache as globals on window.

// Cache of AI-generated option text variations (per session)
const OptionVariationsCache = (window.OptionVariationsCache = {
  cache: {},

  async get(questionId, question) {
    // Don't vary race, class, background, or alignment choices - keep classic D&D terms
    const noVariationQuestions = [
      'race-choice',
      'class-choice',
      'background-choice',
      'alignment-choice',
    ];
    if (noVariationQuestions.includes(questionId)) {
      return question.options;
    }

    // Return cached if exists
    if (this.cache[questionId]) {
      return this.cache[questionId];
    }

    // Generate new variations
    const variations = await AIService.generateOptionVariations(
      question.text,
      question.options,
    );

    // Create new options array with varied text but same underlying data
    const variedOptions = question.options.map((opt, index) => ({
      ...opt,
      text: variations[index],
    }));

    // Cache it
    this.cache[questionId] = variedOptions;

    return variedOptions;
  },

  reset() {
    this.cache = {};
  },
});

// Character creation state (current character, answers, listeners)
const CharacterState = (window.CharacterState = {
  current: {
    id: null,
    step: 0,
    abilityMethod: null,
    answers: {},
    character: {
      // Stable identity for this character across renames/exports/imports
      // Used by Character Manager to detect "this is the same character"
      characterUid: null,
      name: '',
      race: '',
      class: '',
      background: '',
      alignment: '',
      baseAbilities: null,
      abilities: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
      },
      level: 1,
      hitPoints: 0,
      personalityTrait: '',
      backstory: '',
      // Background benefits
      skillProficiencies: [],
      toolProficiencies: [],
      languages: [],
      equipment: [],
      backgroundFeature: null,
      // Spellcasting
      spellcastingAbility: null,
      cantrips: [],
      spellsKnown: [],
      spellsPrepared: [],
      spellSlots: {},
    },
  },

  listeners: [],

  get() {
    return this.current;
  },

  set(updates) {
    this.current = { ...this.current, ...updates };
    this.notify();
  },

  updateCharacter(updates) {
    this.current.character = { ...this.current.character, ...updates };
    this.notify();
  },

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach((listener) => listener(this.current));
  },

  reset() {
    this.current = {
      id: Date.now().toString(),
      step: 0,
      abilityMethod: null,
      answers: {},
      character: {
        // Generate a fresh stable UID for this new character
        characterUid: `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: '',
        race: '',
        class: '',
        background: '',
        alignment: '',
        baseAbilities: null,
        abilities: {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
        level: 1,
        hitPoints: 0,
        personalityTrait: '',
        backstory: '',
        // Background benefits
        skillProficiencies: [],
        toolProficiencies: [],
        languages: [],
        equipment: [],
        backgroundFeature: null,
        // Spellcasting
        spellcastingAbility: null,
        cantrips: [],
        spellsKnown: [],
        spellsPrepared: [],
        spellSlots: {},
      },
    };
    this.notify();
  },
});




