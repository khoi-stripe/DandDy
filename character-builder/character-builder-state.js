// State management for the DandDy terminal character builder.
// Exposes CharacterState and OptionVariationsCache as globals on window.

// Session persistence key (using localStorage for cross-tab and browser restart persistence)
const SESSION_STORAGE_KEY = 'danddy_builder_session';

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
    currentQuestionId: null, // Track current question for session resume
    character: {
      // Stable identity for this character across renames/exports/imports
      // Used by Character Manager to detect "this is the same character"
      characterUid: null,
      name: '',
      race: '',
      class: '',
      background: '',
      alignment: '',
      sex: null,
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
  
  // Flag to prevent auto-save during restore
  _restoring: false,

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

  // Set the current question ID (called by App.showQuestion)
  setCurrentQuestion(questionId) {
    this.current.currentQuestionId = questionId;
    this._saveSession();
  },

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach((listener) => listener(this.current));
    // Auto-save to session on every state change (unless restoring)
    if (!this._restoring) {
      this._saveSession();
    }
  },

  // ===== Session Persistence =====

  // Get the current user's identifier (for session ownership)
  _getCurrentUserId() {
    // AuthService may not be loaded yet in character-builder context
    if (typeof AuthService !== 'undefined' && AuthService.getCurrentUser) {
      const user = AuthService.getCurrentUser();
      // Use the user's ID if available, fall back to email
      return user ? (user.id || user.email || null) : null;
    }
    return null;
  },

  // Check if there's an in-progress session to resume
  hasSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      
      // Check if this session belongs to the current user
      const currentUserId = this._getCurrentUserId();
      const sessionUserId = session._userId !== undefined ? session._userId : null;
      
      // If user IDs don't match, don't offer to resume
      // (null matches null for anonymous sessions)
      if (currentUserId !== sessionUserId) {
        return false;
      }
      
      // Consider it a valid session if we have meaningful progress
      // (past the intro, or have any character data)
      const hasProgress = session.currentQuestionId && session.currentQuestionId !== 'intro';
      const hasCharacterData = session.character && (
        session.character.name ||
        session.character.race ||
        session.character.class
      );
      return hasProgress || hasCharacterData;
    } catch {
      return false;
    }
  },

  // Get session metadata for display (without fully loading)
  getSessionPreview() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      
      // Only return preview if session belongs to current user
      const currentUserId = this._getCurrentUserId();
      const sessionUserId = session._userId !== undefined ? session._userId : null;
      if (currentUserId !== sessionUserId) {
        return null;
      }
      
      return {
        characterName: session.character?.name || null,
        race: session.character?.race || null,
        class: session.character?.class || null,
        currentQuestionId: session.currentQuestionId,
        savedAt: session._savedAt || null,
      };
    } catch {
      return null;
    }
  },

  // Save current state to localStorage
  _saveSession() {
    try {
      const toSave = {
        ...this.current,
        _savedAt: new Date().toISOString(),
        _userId: this._getCurrentUserId(), // Track which user owns this session
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[CharacterState] Failed to save session:', e);
    }
  },

  // Restore state from localStorage
  restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      
      const session = JSON.parse(raw);
      this._restoring = true;
      this.current = {
        id: session.id || Date.now().toString(),
        step: session.step || 0,
        abilityMethod: session.abilityMethod || null,
        answers: session.answers || {},
        currentQuestionId: session.currentQuestionId || null,
        character: {
          characterUid: session.character?.characterUid || `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: session.character?.name || '',
          race: session.character?.race || '',
          class: session.character?.class || '',
          background: session.character?.background || '',
          alignment: session.character?.alignment || '',
          baseAbilities: session.character?.baseAbilities || null,
          abilities: session.character?.abilities || {
            str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
          },
          level: session.character?.level || 1,
          hitPoints: session.character?.hitPoints || 0,
          personalityTrait: session.character?.personalityTrait || '',
          backstory: session.character?.backstory || '',
          skillProficiencies: session.character?.skillProficiencies || [],
          toolProficiencies: session.character?.toolProficiencies || [],
          languages: session.character?.languages || [],
          equipment: session.character?.equipment || [],
          backgroundFeature: session.character?.backgroundFeature || null,
          spellcastingAbility: session.character?.spellcastingAbility || null,
          cantrips: session.character?.cantrips || [],
          spellsKnown: session.character?.spellsKnown || [],
          spellsPrepared: session.character?.spellsPrepared || [],
          spellSlots: session.character?.spellSlots || {},
          // Portrait data - restore all portrait-related fields
          customPortraitAscii: session.character?.customPortraitAscii || null,
          originalPortraitUrl: session.character?.originalPortraitUrl || null,
          customPortraitCount: session.character?.customPortraitCount || 0,
          portraitMetadata: session.character?.portraitMetadata || null,
          asciiPortrait: session.character?.asciiPortrait || null,
          asciiPortraitKey: session.character?.asciiPortraitKey || null,
        },
      };
      this._restoring = false;
      this.notify();
      return session.currentQuestionId || 'intro';
    } catch (e) {
      console.warn('[CharacterState] Failed to restore session:', e);
      this._restoring = false;
      return false;
    }
  },

  // Clear the saved session (call after save/discard)
  clearSession() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('[CharacterState] Failed to clear session:', e);
    }
  },

  reset() {
    this.current = {
      id: Date.now().toString(),
      step: 0,
      abilityMethod: null,
      answers: {},
      currentQuestionId: null,
      character: {
        // Generate a fresh stable UID for this new character
        characterUid: `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: '',
        race: '',
        class: '',
        background: '',
        alignment: '',
        sex: null,
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
    // Clear session when explicitly resetting
    this.clearSession();
    this.notify();
  },
});




