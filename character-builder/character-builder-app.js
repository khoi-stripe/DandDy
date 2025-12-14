// Core app logic and keyboard navigation for the DandDy terminal character builder.
// Exposes App and KeyboardNav as globals on window.

// ===== KEYBOARD NAVIGATION =====

const KeyboardNav = (window.KeyboardNav = {
  currentFocusIndex: 0,
  isActive: false,
  retryCount: 0,

  activate() {
    this.isActive = true;
    // Focus on the first button of the last question by default
    const buttons = this.getActiveButtons();
    if (buttons.length > 0) {
      // Find the first button in the last question card
      const allCards = document.querySelectorAll('.question-card');
      const lastCard = allCards[allCards.length - 1];
      const lastCardButtons = buttons.filter((btn) => lastCard.contains(btn));

      if (lastCardButtons.length > 0) {
        this.currentFocusIndex = buttons.indexOf(lastCardButtons[0]);
      } else {
        this.currentFocusIndex = 0;
      }
    } else {
      this.currentFocusIndex = 0;
    }
    this.retryCount = 0;
    // Wait for DOM to update before focusing
    this.tryActivate();
  },

  /**
   * Calculate a reasonable default Armor Class based on class, abilities,
   * and a simplified 5e armor model.
   *
   * Precedence:
   * - If class is Barbarian/Monk *and* no armorCategory is set → Unarmored Defense.
   * - Otherwise, if armorCategory is set → use armor + optional shield.
   * - Otherwise → 10 + DEX mod (no armor).
   */
  calculateArmorClassForClass(classId, abilities, armorCategory = null, hasShield = false) {
    const dexMod = Utils.abilityModifier(abilities.dex);
    const conMod = Utils.abilityModifier(abilities.con);
    const wisMod = Utils.abilityModifier(abilities.wis);

    // Unarmored Defense for Barbarian/Monk when not wearing armor
    if (classId === 'barbarian' && !armorCategory) {
      return 10 + dexMod + conMod;
    }
    if (classId === 'monk' && !armorCategory) {
      return 10 + dexMod + wisMod;
    }

    // Armor-based AC when an armor category is present
    let baseAC;
    switch (armorCategory) {
      case 'light':
        // Typical light armor baseline (leather): 11 + DEX
        baseAC = 11 + dexMod;
        break;
      case 'medium':
        // Typical medium armor (scale mail): 14 + min(DEX, +2)
        baseAC = 14 + Math.min(dexMod, 2);
        break;
      case 'heavy':
        // Typical heavy armor (chain mail): fixed 16, no DEX
        baseAC = 16;
        break;
      default:
        // No armor: 10 + DEX
        baseAC = 10 + dexMod;
        break;
    }

    if (hasShield) {
      baseAC += 2;
    }

    return baseAC;
  },

  /**
   * Infer a coarse armor loadout (armor category + shield) from the class's
   * starting equipment text. This doesn't try to be exhaustive – it gives us
   * stable fields we can later surface in UI.
   */
  inferArmorLoadoutForClass(classId) {
    const cls = DND_DATA.classes.find((c) => c.id === classId);
    if (!cls || !Array.isArray(cls.equipment)) {
      return { armorCategory: null, hasShield: false };
    }

    const equipmentText = cls.equipment.join(' ').toLowerCase();

    let armorCategory = null;
    if (equipmentText.includes('leather armor') || equipmentText.includes('light armor')) {
      armorCategory = 'light';
    } else if (equipmentText.includes('medium armor')) {
      armorCategory = 'medium';
    } else if (equipmentText.includes('heavy armor')) {
      armorCategory = 'heavy';
    }

    const hasShield =
      equipmentText.includes('shield') ||
      equipmentText.includes('wooden shield');

    return { armorCategory, hasShield };
  },

  /**
   * Map an armorCategory + class into concrete armor item strings that should
   * appear in the equipment list (e.g., "Leather Armor", "Chain Mail", "Shield").
   */
  getStartingArmorItems(classId, armorCategory, hasShield) {
    const items = [];

    if (armorCategory === 'light') {
      items.push('Leather Armor');
    } else if (armorCategory === 'medium') {
      // Barbarians often start in hide; others in scale mail.
      if (classId === 'barbarian') {
        items.push('Hide Armor');
      } else {
        items.push('Scale Mail');
      }
    } else if (armorCategory === 'heavy') {
      items.push('Chain Mail');
    }

    if (hasShield) {
      // Druids/clerics often have wooden shields; others a generic shield.
      if (classId === 'druid' || classId === 'cleric') {
        items.push('Wooden Shield');
      } else {
        items.push('Shield');
      }
    }

    return items;
  },

  tryActivate() {
    setTimeout(() => {
      const buttons = this.getActiveButtons();

      if (buttons.length > 0) {
        this.updateFocus();
      } else if (this.retryCount < 10) {
        // Retry up to 10 times (1 second total)
        this.retryCount++;
        this.tryActivate();
      }
    }, 100);
  },

  deactivate() {
    this.isActive = false;
    this.clearFocus();
  },

  getActiveButtons() {
    // Get ALL question cards
    const allCards = document.querySelectorAll('.question-card');

    if (allCards.length === 0) {
      return [];
    }

    // Get ALL clickable buttons from ALL cards
    const allButtons = [];
    allCards.forEach((card) => {
      const cardButtons = Array.from(card.querySelectorAll('.button-primary'));
      // Include all buttons (selected, locked, etc) - they're all clickable now
      cardButtons.forEach((btn) => {
        // Skip only truly disabled buttons (like name input buttons after selection)
        if (!btn.hasAttribute('disabled')) {
          allButtons.push(btn);
        }
      });
    });

    return allButtons;
  },

  updateFocus() {
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) {
      return;
    }

    // Remove focus from all buttons
    buttons.forEach((btn) => btn.classList.remove('is-focused'));

    // Add focus to current index
    if (buttons[this.currentFocusIndex]) {
      const focusedButton = buttons[this.currentFocusIndex];
      focusedButton.classList.add('is-focused');

      // Scroll the focused button into view
      focusedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  },

  clearFocus() {
    const buttons = this.getActiveButtons();
    buttons.forEach((btn) => btn.classList.remove('is-focused'));
  },

  moveUp() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the top
    this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 1);
    this.updateFocus();
  },

  moveDown() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the bottom
    this.currentFocusIndex = Math.min(buttons.length - 1, this.currentFocusIndex + 1);
    this.updateFocus();
  },

  // Horizontal navigation mirrors vertical movement for now:
  // buttons are laid out linearly, but when they appear side by side,
  // Left/Right should feel like moving between siblings.
  moveLeft() {
    this.moveUp();
  },

  moveRight() {
    this.moveDown();
  },

  select() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    const button = buttons[this.currentFocusIndex];
    if (button) {
      button.click();
      this.deactivate();
    }
  },
});

// ===== APP LOGIC =====

// Track current portrait style selected in modal (module-level like manager)
let currentBuilderPortraitStyle = null;

/**
 * Format style ID to display label (title case, no dashes/underscores)
 */
function formatStyleLabelBuilder(idOrLabel) {
  if (!idOrLabel) return '';
  
  // Remove "Custom: " prefix if present
  let cleaned = String(idOrLabel).replace(/^Custom:\s*/i, '');
  
  // Remove " (default)" suffix
  cleaned = cleaned.replace(/\s*\(default\)\s*$/i, '');
  
  // Replace dashes/underscores with spaces
  cleaned = cleaned.replace(/[-_]/g, ' ');
  
  // Title case: capitalize first letter of each word
  if (cleaned.length > 0) {
    cleaned = cleaned.split(' ').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    ).join(' ');
  }
  
  return cleaned;
}

/**
 * Populate the style listbox menu in the portrait prompt modal.
 * Uses the same selector pattern as the settings modal and manager.
 * 
 * This is now async to properly wait for API sync before fetching themes.
 */
async function populateBuilderPortraitStyleDropdown(activeStyle) {
  const menu = document.getElementById('builderPortraitStyleMenu');
  const label = document.getElementById('builderPortraitStyleLabel');
  if (!menu) return null;

  // Clear existing options
  menu.innerHTML = '';

  // Wait for API sync to complete before fetching themes
  // This ensures global styles are loaded for authenticated users
  if (window.PortraitPrompt && typeof PortraitPrompt.syncFromAPI === 'function') {
    try {
      await PortraitPrompt.syncFromAPI();
    } catch (e) {
      console.warn('populateBuilderPortraitStyleDropdown: API sync failed', e);
    }
  }

  // Get available themes from PortraitPrompt
  let themes = [];
  let defaultThemeId = 'cinematic-inks';
  
  try {
    if (window.PortraitPrompt) {
      if (typeof PortraitPrompt.getThemes === 'function') {
        themes = PortraitPrompt.getThemes() || [];
      }
      if (typeof PortraitPrompt.getDefaultThemeId === 'function') {
        defaultThemeId = PortraitPrompt.getDefaultThemeId() || defaultThemeId;
      }
    }
  } catch (e) {
    console.warn('populateBuilderPortraitStyleDropdown: Error getting themes', e);
  }

  // Always ensure at least the default theme is available
  if (!themes.length) {
    themes = [
      { id: 'cinematic-inks', label: 'Cinematic Inks (default)' }
    ];
  }

  // Sort themes alphabetically by id
  themes = themes.slice().sort((a, b) => {
    const nameA = (a.id || '').toLowerCase();
    const nameB = (b.id || '').toLowerCase();
    return nameA.localeCompare(nameB);
  });

  // Determine selected value
  const selectedStyle = activeStyle || defaultThemeId;
  let selectedLabel = formatStyleLabelBuilder(defaultThemeId);

  // Populate menu with options (same pattern as settings modal)
  themes.forEach((theme) => {
    const formattedLabel = formatStyleLabelBuilder(theme.id);
    const isSelected = theme.id === selectedStyle;
    
    if (isSelected) {
      selectedLabel = formattedLabel;
    }

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'selector-option' + (isSelected ? ' is-selected' : '');
    button.setAttribute('role', 'option');
    button.setAttribute('data-value', theme.id);
    button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    button.innerHTML = `<span class="selector-option-label">${formattedLabel}</span>`;
    menu.appendChild(button);
  });

  // Update trigger label
  if (label) {
    label.textContent = selectedLabel;
  }

  currentBuilderPortraitStyle = selectedStyle;
  
  // Wire up option clicks
  initBuilderPortraitStyleSelector();
  
  return selectedStyle;
}

/**
 * Initialize the portrait style selector click handlers.
 * Uses the same pattern as manager.
 */
function initBuilderPortraitStyleSelector() {
  const menu = document.getElementById('builderPortraitStyleMenu');
  const label = document.getElementById('builderPortraitStyleLabel');
  const trigger = document.getElementById('builderPortraitStyleTrigger');
  
  if (!menu) return;
  
  const options = menu.querySelectorAll('.selector-option');
  
  options.forEach((option) => {
    option.addEventListener('click', (e) => {
      e.stopPropagation();
      const value = option.getAttribute('data-value');
      const optionLabel = option.querySelector('.selector-option-label');
      
      if (value && optionLabel) {
        // Update trigger label
        if (label) {
          label.textContent = optionLabel.textContent.trim();
        }
        
        // Update current style
        currentBuilderPortraitStyle = value;
        
        // Update visual selection state
        options.forEach((opt) => {
          const isSelected = opt.getAttribute('data-value') === value;
          opt.classList.toggle('is-selected', isSelected);
          opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
        
        // Close the menu using the standard toggle
        if (trigger && window.CharacterSheet && typeof CharacterSheet.toggleSelectorMenu === 'function') {
          CharacterSheet.toggleSelectorMenu(trigger);
        }
      }
    });
  });
}

const App = (window.App = {
  currentQuestion: null,
  _lastRenderedCharacter: null,
  _PORTRAIT_HISTORY_MAX_VERSIONS: 5,
  // When true, the next character-panel update will render portraits without
  // re-running the ASCII "type-in" animation (used for non-visual updates like save).
  _suppressNextPortraitAnimation: false,

  async init() {
    console.log('Initializing Character Builder...');

    // Subscribe to state changes
    CharacterState.subscribe((state) => {
      this.updateCharacterPanel(state.character);
    });

    // Check URL for explicit resume parameter
    const urlParams = new URLSearchParams(window.location.search);
    const forceResume = urlParams.get('resume') === 'true';
    const forceNew = urlParams.get('new') === 'true';

    // Check for existing session to resume
    if (!forceNew && CharacterState.hasSession()) {
      const preview = CharacterState.getSessionPreview();
      
      if (forceResume) {
        // URL says resume - do it immediately
        await this._resumeSession();
        return;
      }
      
      // Show resume prompt
      await this._showResumePrompt(preview);
      return;
    }

    // Start fresh
    await this._startNewCharacter();
  },

  // Resume from saved session
  async _resumeSession() {
    console.log('Resuming character builder session...');
    const resumeQuestionId = CharacterState.restoreSession();
    OptionVariationsCache.reset(); // Clear variation cache (may regenerate)
    this._lastPortraitArt = null;
    
    // Update character panel with restored data
    const character = CharacterState.get().character;
    this.updateCharacterPanel(character);
    
    // Show a brief "resuming" message then continue
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    const messageEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, '> SESSION RESTORED. Let\'s continue where we left off...');
    Utils.scrollToBottom(true);
    await Utils.sleep(1000);
    
    // Check if character is complete (has all required fields)
    // If so, jump straight to the completion screen regardless of currentQuestionId
    const isCharacterComplete = character.name && character.race && 
                                 character.class && character.background && 
                                 character.alignment;
    
    if (isCharacterComplete) {
      await this.showQuestion('complete');
    } else {
    // Jump to the question we were on
    await this.showQuestion(resumeQuestionId || 'intro');
    }
  },

  // Start a brand new character
  async _startNewCharacter() {
    CharacterState.reset();
    OptionVariationsCache.reset();
    this._lastPortraitArt = null;
    await this.showQuestion('intro');
  },

  // Show modal asking user if they want to resume
  async _showResumePrompt(preview) {
    const modal = document.getElementById('sessionResumeModal');
    const timeStampEl = document.getElementById('sessionTimeStamp');
    const resumeBtn = document.getElementById('sessionResumeBtn');
    const discardBtn = document.getElementById('sessionDiscardBtn');
    
    // Format the time if available
    let timeNote = '';
    if (preview.savedAt) {
      const savedDate = new Date(preview.savedAt);
      const now = new Date();
      const diffMs = now - savedDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) {
        timeNote = 'saved moments ago';
      } else if (diffMins < 60) {
        timeNote = `saved ${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeNote = `saved ${diffHours}h ago`;
      } else {
        timeNote = `saved ${savedDate.toLocaleDateString()}`;
      }
    }

    // Update timestamp in header
    timeStampEl.textContent = timeNote;
    
    // Show the modal
    modal.classList.add('show');
    
    // Handle button clicks
    return new Promise((resolve) => {
      const handleResume = async () => {
        cleanup();
        modal.classList.remove('show');
        await this._resumeSession();
        resolve();
      };
      
      const handleDiscard = async () => {
        cleanup();
        modal.classList.remove('show');
        CharacterState.clearSession();
        await this._startNewCharacter();
        resolve();
      };
      
      const cleanup = () => {
        resumeBtn.removeEventListener('click', handleResume);
        discardBtn.removeEventListener('click', handleDiscard);
      };
      
      resumeBtn.addEventListener('click', handleResume);
      discardBtn.addEventListener('click', handleDiscard);
    });
  },

  // Show progressive "thinking" messages while waiting for AI
  showProgressiveThinking(element) {
    if (!element) return;
    
    // Clear any existing interval
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
    }
    
    let elapsed = 0;
    // Cube markup used inside a narrator-spinner-shell so that whitespace
    // behavior is controlled and the cube + text stay on a single line.
    const cubeMarkup =
      '<span class="spinner-cube-scene">' +
      '<span class="spinner-cube-tilt">' +
      '<span class="spinner-cube">' +
      '<span class="spinner-cube-face spinner-cube-face-front"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-back"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-right"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-left"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-top"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-bottom"></span>' +
      '</span></span></span>';

    const renderLine = (text) =>
      `<span class="narrator-spinner-shell">${cubeMarkup} ${text}</span>`;

    element.innerHTML = renderLine('rolling the dice...');
    
    this._thinkingInterval = setInterval(() => {
      elapsed++;
      
      if (elapsed < 3) {
        element.innerHTML = renderLine('rolling the dice...');
      } else if (elapsed < 6) {
        element.innerHTML = renderLine('still rolling...');
      } else {
        element.innerHTML = renderLine('server waking up... hang tight!');
      }
    }, 1000); // Update every second
  },
  
  stopProgressiveThinking() {
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
      this._thinkingInterval = null;
    }
  },

  async showQuestion(questionId) {
    const question = QUESTIONS.find((q) => q.id === questionId);
    if (!question) {
      console.error('Question not found:', questionId);
      return;
    }

    this.currentQuestion = question;
    // Track current question for session persistence
    CharacterState.setCurrentQuestion(questionId);
    const narratorPanel = document.getElementById('narrator-panel');

    // Handle different question types
    switch (question.type) {
      case 'message':
        await this.showMessage(question);
        break;
      case 'choice':
        await this.showChoice(question);
        break;
      case 'list-choice':
        await this.showListChoice(question);
        break;
      case 'suggestion':
        await this.showSuggestion(question);
        break;
      case 'abilities':
        await this.showAbilities(question);
        break;
      case 'name':
        await this.showNameChoice(question);
        break;
      case 'backstory':
        await this.showBackstory(question);
        break;
      case 'complete':
        await this.showComplete(question);
        break;
      case 'spell-selection':
        await this.showSpellSelection(question);
        break;
    }
  },

  async showMessage(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // For intro message, use narrator-specific intro text
    let messageText = question.text;
    if (question.id === 'intro') {
      const narratorId = StorageService.getNarratorId();
      const narrator = getNarrator(narratorId);
      messageText = narrator.introText;
    }

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, messageText);
    Utils.scrollToBottom(true);

    if (question.next) {
      messageEl.classList.add('is-waiting');
      await Utils.sleep(1500);
      messageEl.classList.remove('is-waiting');
      await this.showQuestion(question.next);
    }
  },

  async showChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    
    // For entry-mode question, check creation quota first
    if (question.id === 'entry-mode') {
      let quotaInfo = null;
      try {
        quotaInfo = await AIService.getCreationQuotaStatus();
      } catch (e) {
        // Non-fatal: quota check failed, allow user to proceed
        console.warn('Creation quota check failed:', e);
      }

      // Store quota info for later display
      this._creationQuotaInfo = quotaInfo;
    }

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);
    const variedQuestion = { ...question, options: variedOptions };

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderQuestion(variedQuestion),
    );

    // For entry-mode, add quota info inside the options box
    if (question.id === 'entry-mode' && this._creationQuotaInfo) {
      const qi = this._creationQuotaInfo;
      const questionCard = narratorPanel.querySelector(`.question-card[data-question-id="${question.id}"]`);
      const optionsContainer = questionCard?.querySelector('.options-container');
      
      // Only show if enforced (remaining !== -1 means quota is enforced)
      if (qi.remaining !== -1 && optionsContainer) {
        const quotaLine = document.createElement('div');
        quotaLine.className = 'creation-quota-info';
        
        if (qi.remaining === 0) {
          // Format reset time nicely
          let resetText = 'Resets tomorrow';
          if (qi.resetAt) {
            try {
              const resetDate = new Date(qi.resetAt);
              const now = new Date();
              const hoursUntil = Math.ceil((resetDate - now) / (1000 * 60 * 60));
              if (hoursUntil <= 1) {
                resetText = 'Resets in about an hour';
              } else if (hoursUntil < 24) {
                resetText = `Resets in about ${hoursUntil} hours`;
              }
            } catch (_) {}
          }
          quotaLine.textContent = `You've reached today's limit. ${resetText}.`;
          quotaLine.classList.add('is-exhausted');
          
          // Disable the option buttons
          const buttons = questionCard.querySelectorAll('.button-primary');
          buttons.forEach(btn => {
            btn.disabled = true;
            btn.title = "Daily character creation limit reached";
            btn.classList.add('is-quota-disabled');
          });
          
          // Add a back button
          optionsContainer.insertAdjacentHTML(
            'beforeend',
            `<button class="button-primary" onclick="exitToManager()" style="margin-top: var(--spacing-md);">
              Back to Character Manager
            </button>`,
          );
        } else {
          quotaLine.textContent = qi.remaining + ' character creation' + (qi.remaining === 1 ? '' : 's') + ' remaining today';
          // Slow continuous blink
          quotaLine.classList.add('is-blinking');
        }
        
        // Insert at the top of options container
        optionsContainer.insertBefore(quotaLine, optionsContainer.firstChild);
      }
    }

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle
    await Utils.sleep(150);

    // In guided (co-create) mode, default keyboard focus to the ROLL button so
    // players can immediately press Enter to roll abilities, while still being
    // able to arrow between the selector and the roll button.
    try {
      const rollButton = document.querySelector(
        `.question-card[data-question-id="${question.id}"] .ability-method-roll`,
      );
      if (
        rollButton &&
        typeof KeyboardNav !== 'undefined' &&
        typeof KeyboardNav.getActiveButtons === 'function'
      ) {
        const activeButtons = KeyboardNav.getActiveButtons();
        const rollIndex = activeButtons.indexOf(rollButton);
        if (rollIndex !== -1) {
          KeyboardNav.currentFocusIndex = rollIndex;
          KeyboardNav.updateFocus();
        }
      }
    } catch (e) {
      // Non-fatal: fall back to the default keyboard focus behavior
      console.error('Ability method keyboard focus override failed', e);
    }

    Utils.scrollToBottom(true);
  },

  async showListChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);

    // Check for recommendations
    const state = CharacterState.get();
    const recommendations = state.recommendations?.[question.id] || [];

    // Separate options into recommended and non-recommended
    const recommendedOptions = [];
    const otherOptions = [];

    variedOptions.forEach((opt, index) => {
      // Check if this option's value is in the recommendations list
      const isRecommended = recommendations.includes(opt.value);
      if (isRecommended) {
        recommendedOptions.push({ opt, originalIndex: index });
      } else {
        otherOptions.push({ opt, originalIndex: index });
      }
    });

    // Ensure recommended options appear in the SAME order as the narrator's
    // recommendation list, so the "RECOMMENDED" buttons match the bullet list
    // that was just narrated to the player.
    if (recommendations.length > 0 && recommendedOptions.length > 1) {
      const indexInRecommendations = (value) => {
        const idx = recommendations.indexOf(value);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };

      recommendedOptions.sort(
        (a, b) =>
          indexInRecommendations(a.opt.value) -
          indexInRecommendations(b.opt.value),
      );
    }

    // Reorder options: recommended first (in narrated order), then others
    const reorderedOptions = [...recommendedOptions, ...otherOptions];

    // Store the reordered mapping for handleAnswer to use
    if (!this._optionIndexMapping) this._optionIndexMapping = {};
    this._optionIndexMapping[question.id] = reorderedOptions.map(
      (item) => item.originalIndex,
    );

    // Build the HTML with recommendations first
    let optionsHTML = '';
    let displayIndex = 0;

    if (recommendedOptions.length > 0) {
      optionsHTML += '<div class="recommendations-header">RECOMMENDED</div>';
      optionsHTML += recommendedOptions
        .map(({ opt, originalIndex }) => {
          const currentIndex = displayIndex++;
          return `
              <button class="button-primary" onclick="App.handleListAnswer('${question.id}', ${currentIndex})">★\u00A0${opt.text}</button>
            `;
        })
        .join('');

      if (otherOptions.length > 0) {
        optionsHTML += '<hr class="recommendations-divider">';
      }
    }

    optionsHTML += otherOptions
      .map(({ opt, originalIndex }) => {
        const currentIndex = displayIndex++;
        return `
            <button class="button-primary" onclick="App.handleListAnswer('${question.id}', ${currentIndex})">
              ${opt.text}
            </button>
          `;
      })
      .join('');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${optionsHTML}
        </div>
      </div>`,
    );

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showSuggestion(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Get AI suggestion if available
    const suggestion = question.getSuggestion(state);

    // Store recommendations in state for the next question
    if (!state.recommendations) {
      state.recommendations = {};
    }
    state.recommendations[question.next] = suggestion.suggestions;

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const suggestionEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(suggestionEl, suggestion.message);
    Utils.scrollToBottom(true);

    // Show suggested options
    const suggestedHTML = suggestion.suggestions
      .map((s) => {
        const data =
          DND_DATA.races.find((r) => r.id === s) ||
          DND_DATA.classes.find((c) => c.id === s);
        if (data) return `• ${data.name}`;
        return `• ${s}`;
      })
      .join('\n');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(suggestedHTML),
    );
    await Utils.sleep(100);
    Utils.scrollToBottom(true);

    const suggestedListEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    suggestedListEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    suggestedListEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showAbilities(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Helper to truncate option text
    const truncate = (text, maxLength) => {
      return text.length > maxLength
        ? text.substring(0, maxLength - 3) + '...'
        : text;
    };

    const options = question.options || [];
    const selectOptionsHTML = options
      .map(
        (opt, index) => `
          <option value="${opt.value}" ${
            index === 0 ? 'selected' : ''
          }>${truncate(opt.text, 45)}</option>
        `,
      )
      .join('');

    const listboxOptionsHTML = options
      .map(
        (opt, index) => `
          <button
            class="ability-method-option selector-option${
              index === 0 ? ' is-selected' : ''
            }"
            data-method="${opt.value}"
            role="option"
            aria-selected="${index === 0 ? 'true' : 'false'}"
          >
            <span class="selector-option-label">
              ${truncate(opt.text, 45)}
            </span>
          </button>
        `,
      )
      .join('');

    const initialMethod = options[0]?.value || 'standard';
    const initialLabel = truncate(
      options[0]?.text || 'Standard Array',
      45,
    );

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container ability-method-container">
          <label class="settings-label ability-method-label">Ability generation method:</label>
          <div class="ability-method-controls">
            <div class="ability-method-trigger-wrap selector-shell selector-shell--listbox">
              <button
                class="button-primary ability-method-trigger selector-trigger"
                id="ability-method-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="ability-method-listbox"
                data-selected-method="${initialMethod}"
              >
                <span class="ability-method-trigger-label">
                  ${initialLabel}
                </span>
              </button>
              <div
                id="ability-method-listbox"
                class="ability-method-listbox selector-menu"
                role="listbox"
                aria-label="Ability generation method"
              >
                ${listboxOptionsHTML}
              </div>
            </div>
            <button class="button-primary ability-method-roll" onclick="App.handleAbilityFromSelect()">
              ROLL
            </button>
          </div>
        </div>
      </div>`,
    );

    // Wire up animated listbox behavior for ability method selector
    const trigger = document.getElementById('ability-method-trigger');
    const listbox = document.getElementById('ability-method-listbox');
    if (trigger && listbox) {
      const optionsEls = Array.from(
        listbox.querySelectorAll('.ability-method-option'),
      );

      const setMethod = (method, label) => {
        trigger.setAttribute('data-selected-method', method);
        const labelEl = trigger.querySelector(
          '.ability-method-trigger-label',
        );
        if (labelEl) {
          labelEl.textContent = label;
        }

        optionsEls.forEach((opt) => {
          const isSelected = opt.getAttribute('data-method') === method;
          opt.classList.toggle('is-selected', isSelected);
          opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = listbox.classList.contains('is-open');
        if (!isOpen) {
          // Open and focus first option for immediate keyboard nav
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');

          // Position the listbox relative to the trigger so it behaves like
          // other selector menus: always above or below (preferring below),
          // at least as wide as the trigger, and constrained to the viewport
          // with internal scrolling if it can't fully fit on-screen.
          const shell =
            trigger.closest('.selector-shell') || trigger.parentElement;
          if (shell) {
            const shellRect = shell.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();

            // Measure menu size without affecting final animation. Temporarily
            // neutralize transforms so we get the full height instead of the
            // scaled (collapsed) height from CSS. Also clear any previous
            // inline sizing so each open starts from a clean baseline.
            const prevDisplay = listbox.style.display;
            const prevVisibility = listbox.style.visibility;
            const prevTransform = listbox.style.transform;

            listbox.style.maxHeight = '';
            listbox.style.overflowY = '';
            listbox.style.position = 'fixed';
            listbox.style.top = '0';
            listbox.style.left = '0';
            listbox.style.visibility = 'hidden';
            listbox.style.display = 'block';
            listbox.style.transform = 'none';

            const menuRect = listbox.getBoundingClientRect();
            let menuHeight = menuRect.height || 0;
            let menuWidth = menuRect.width || 0;

            // Ensure the listbox is at least as wide as the trigger. For small
            // triggers (like icons), we still respect the global min-width.
            const triggerWidth = triggerRect.width || 0;
            if (triggerWidth > 0 && menuWidth < triggerWidth) {
              listbox.style.minWidth = `${triggerWidth}px`;
              const remeasureRect = listbox.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            }

            listbox.style.display = prevDisplay;
            listbox.style.visibility = prevVisibility;
            listbox.style.transform = prevTransform;

            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const padding = 8; // breathing room from edges
            const gapY = 4; // small gap between trigger and menu when opening below

            // Treat the nearest terminal frame/container as the visual "viewport"
            // so the listbox never extends outside the green app frame.
            const host =
              trigger.closest('.terminal-frame, .terminal-container') ||
              document.documentElement;
            const hostRect = host.getBoundingClientRect();
            const hostTop = hostRect.top + padding;
            const hostBottom = hostRect.bottom - padding;

            // Space available above and below the trigger within the host.
            const spaceAbove = triggerRect.top - hostTop;
            const spaceBelow = hostBottom - triggerRect.bottom;

            const fitsBelow = spaceBelow >= menuHeight + gapY;
            const fitsAbove = spaceAbove >= menuHeight + gapY;

            // Choose direction: prefer below when possible, but fall back to
            // whichever side has room, similar to the shared selector menus.
            const triggerCenterY = triggerRect.top + triggerRect.height / 2;
            const inTopHalf = triggerCenterY < viewportHeight / 2;

            let openBelow;
            if (fitsBelow && fitsAbove) {
              openBelow = inTopHalf;
            } else if (fitsBelow) {
              openBelow = true;
            } else if (fitsAbove) {
              openBelow = false;
            } else {
              // Neither direction fits perfectly: use the side with more space.
              openBelow = spaceBelow >= spaceAbove;
            }

            // Position using a single top coordinate, clamped so the menu stays
            // fully inside the host. If there's not enough room for full height,
            // we'll cap height and enable internal scrolling.
            const maxTop = hostBottom - menuHeight;
            let topInViewport;

            if (openBelow) {
              topInViewport = triggerRect.bottom + gapY;
              if (topInViewport > maxTop) {
                topInViewport = Math.max(hostTop, maxTop);
              }
            } else {
              topInViewport = triggerRect.top - gapY - menuHeight;
              if (topInViewport < hostTop) {
                topInViewport = hostTop;
              }
            }

            // If the menu would extend past the host, cap its height so it scrolls
            // instead of being clipped by the terminal container.
            const availableHeight = hostBottom - topInViewport;
            if (menuHeight > availableHeight && availableHeight > 0) {
              listbox.style.maxHeight = `${availableHeight}px`;
              listbox.style.overflowY = 'auto';
            } else {
              listbox.style.maxHeight = '';
              listbox.style.overflowY = '';
            }

            // Horizontal alignment: start left-aligned, then if that would
            // overflow to the right, right-align to the trigger instead.
            const minLeft = padding;
            const maxLeft = Math.max(
              minLeft,
              viewportWidth - padding - menuWidth,
            );

            let targetLeft = triggerRect.left;
            const naturalRight = targetLeft + menuWidth;
            const viewportRightLimit = viewportWidth - padding;
            if (naturalRight > viewportRightLimit) {
              targetLeft = triggerRect.right - menuWidth;
            }

            if (targetLeft < minLeft) targetLeft = minLeft;
            if (targetLeft > maxLeft) targetLeft = maxLeft;

            // Use fixed positioning in viewport space so the listbox is
            // independent of scroll containers and always anchors to the
            // trigger's visual position.
            listbox.style.position = 'fixed';
            listbox.style.top = `${topInViewport}px`;
            listbox.style.left = `${targetLeft}px`;
            listbox.style.right = 'auto';
          }

          if (optionsEls.length) {
            optionsEls[0].focus();
          }
        } else {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      optionsEls.forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const method = opt.getAttribute('data-method') || 'standard';
          const label = (opt.textContent || '').trim();
          setMethod(method, label);
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', (e) => {
        if (!listbox.classList.contains('is-open')) return;
        if (trigger.contains(e.target) || listbox.contains(e.target)) return;
        listbox.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && listbox.classList.contains('is-open')) {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });

      // Keyboard navigation for ability method listbox
      const handleAbilityListboxKeydown = (e) => {
        const isOpen = listbox.classList.contains('is-open');

        const openAndFocus = (index) => {
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          if (optionsEls.length) {
            const clamped = Math.max(
              0,
              Math.min(optionsEls.length - 1, index),
            );
            optionsEls[clamped].focus();
          }
        };

        if (e.target === trigger) {
          if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowUp' && !isOpen) {
            e.preventDefault();
            openAndFocus(optionsEls.length - 1);
            return;
          }
        }

        if (!isOpen) return;

        if (e.key === 'Escape') {
          // Global ESC handler above will close and refocus trigger
          return;
        }

        if (!optionsEls.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIndex = optionsEls.indexOf(document.activeElement);
          let nextIndex = currentIndex;
          if (currentIndex === -1) {
            nextIndex = e.key === 'ArrowDown' ? 0 : optionsEls.length - 1;
          } else {
            nextIndex =
              e.key === 'ArrowDown'
                ? (currentIndex + 1) % optionsEls.length
                : (currentIndex - 1 + optionsEls.length) % optionsEls.length;
          }
          optionsEls[nextIndex].focus();
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          const activeOption = optionsEls.find(
            (opt) => opt === document.activeElement,
          );
          if (activeOption) {
            e.preventDefault();
            activeOption.click();
          }
        }
      };

      trigger.addEventListener('keydown', handleAbilityListboxKeydown);
      listbox.addEventListener('keydown', handleAbilityListboxKeydown);

      // Initialize selected state from initial method
      setMethod(initialMethod, initialLabel);
    }

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
    
    // Focus the roll button instead of the selector
    const rollButton = document.querySelector('.ability-method-roll');
    if (rollButton) {
      rollButton.focus();
    }
  },

  async showNameChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    // Show the question text with typewriter effect
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Show progressive thinking message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(nameThinkingEl);

    // Generate BOTH name suggestions and a backstory template using a single
    // backend AI call. This front-loads the heavy work so the later backstory
    // step can feel instant.
    let names = [];
    try {
      const summary = await AIService.generateCharacterSummary(state.character, {
        nameCount: 3,
      });
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        names = summary.names;
      }
      // Stash the backstory template (if provided) on the character so the
      // backstory step can simply substitute {{NAME}} later without another
      // API call.
      if (summary && summary.backstoryTemplate) {
        CharacterState.updateCharacter({
          backstoryTemplate: summary.backstoryTemplate,
        });
      }
    } catch (e) {
      console.error('Name/backstory summary error; falling back to names-only flow:', e);
    }

    // Absolute fallback in case summary failed for any reason
    if (!names.length) {
      names = await AIService.generateNames(
        state.character.race,
        state.character.class,
        3,
      );
    }

    // Remove the thinking message
    this.stopProgressiveThinking();
    narratorPanel.lastElementChild.remove();

    // Build the name selection UI with proper styling matching other sections
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${names
            .map(
              (name, index) =>
                `<button class="button-primary" onclick="App.handleNameSelect(${index})">${name}</button>`,
            )
            .join('\n              ')}
        </div>
        <div class="name-input-container">
          <input 
            type="text" 
            class="input-field" 
            id="custom-name-input" 
            placeholder="Or enter your own name..."
          >
          <button class="button-primary" onclick="App.handleCustomName()">
            SUBMIT
          </button>
        </div>
      </div>`,
    );

    // Store generated names for later reference
    this._generatedNames = names;

    // Wire up custom name behavior:
    // - When the input is focused, clear button keyboard focus so the
    //   user's attention is on their custom entry.
    // - Pressing Enter in the input submits the custom name.
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.addEventListener('focus', () => {
        if (typeof KeyboardNav !== 'undefined' && KeyboardNav.clearFocus) {
          KeyboardNav.clearFocus();
        }
      });

      customInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleCustomName();
        }
      });
    }

    // Activate keyboard navigation
    KeyboardNav.activate();

    // Wait for DOM to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showBackstory(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Show progressive thinking message for backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(backstoryThinkingEl);

    // Prefer using a cached backstory template (generated earlier during the
    // name step) so this feels instant and does not require another AI call.
    let backstory = state.character.backstory;
    const template = state.character.backstoryTemplate;
    const nameForTemplate = state.character.name || 'This character';

    if (!backstory && template && typeof template === 'string') {
      backstory = template
        .replace(/{{\s*NAME\s*}}/g, nameForTemplate)
        .replace(/{{\s*RACE\s*}}/g, state.character.race || 'adventurer')
        .replace(/{{\s*CLASS\s*}}/g, state.character.class || 'hero');
      CharacterState.updateCharacter({ backstory });
    }

    // Fallback: if we have no template or something went wrong, fall back to
    // the original behavior and call the dedicated backstory endpoint.
    if (!backstory) {
      backstory = await AIService.generateBackstory(state.character);
      CharacterState.updateCharacter({ backstory });
    }

    // Stop thinking and clear the element, then type out the backstory
    this.stopProgressiveThinking();
    backstoryThinkingEl.textContent = '';
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    backstoryThinkingEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showSpellSelection(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const classId = state.character.class;

    // Show narrator message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');

    let spells = null;

    if (question.mode === 'quick') {
      // Quick mode: auto-select spells
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      // Get auto-selected spells
      spells = SPELL_DATA.getQuickModeSpells(classId);

      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(classId);
        
        // Show what was selected
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        const spellSummary = `> Selected ${spells.cantrips.length} cantrip${spells.cantrips.length !== 1 ? 's' : ''} and ${spells.firstLevel.length} 1st level spell${spells.firstLevel.length !== 1 ? 's' : ''}.
> 
> Cantrips: ${spells.cantrips.map(s => s.name).join(', ')}
> 1st Level: ${spells.firstLevel.map(s => s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    } else {
      // Guided mode: suggest based on preferences
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      const preferences = {
        style: state.answers.spellStyle || 'offense',
        element: state.answers.spellElement || 'versatile',
      };

      spells = SPELL_DATA.getGuidedSpells(classId, preferences);

      if (spells) {
        // Show personalized recommendations
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        let flavorText = '';
        if (preferences.style === 'offense') {
          flavorText = "> Ah, a blaster. How... predictable. Here's your destruction kit:";
        } else if (preferences.style === 'defense') {
          flavorText = "> The cautious type, I see. Here are your survival tools:";
        } else if (preferences.style === 'control') {
          flavorText = "> A tactician. Interesting. Here's your battlefield control suite:";
        } else {
          flavorText = "> Utility over flash. Practical. Here's your toolkit:";
        }
        
        const spellSummary = `${flavorText}
> 
> Cantrips: ${spells.cantrips.map(s => s.name).join(', ')}
> 1st Level: ${spells.firstLevel.map(s => s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    }

    // Save spells to character
    if (spells) {
      const config = SPELL_DATA.getSpellcastingConfig(classId);
      CharacterState.updateCharacter({
        spellcastingAbility: config.ability,
        cantrips: spells.cantrips,
        spellsKnown: spells.firstLevel,
        spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
        spellSlots: config.spellSlots,
      });
    }

    await Utils.sleep(1500);
    await this.showQuestion(question.next);
  },

  async showComplete(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // Use narrator-specific completion text
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const completionText = narrator.completeText || question.text;

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, completionText);
    Utils.scrollToBottom(true);

    // NOTE: AI portrait generation now starts after name selection (earlier in flow)
    // since we removed backstory from the prompt. This gives it more time to complete.
    
    // NOTE: We don't save here anymore - we wait for portrait to load first
    // This prevents creating duplicate characters in cloud storage

    // Check if user can create another character after this one
    // Demo mode: check if saving this character would hit the limit
    // Logged in: check creation quota (remaining === 0 means exhausted, -1 means unlimited)
    const isDemoMode = window.DemoCharacters && DemoCharacters.isDemoMode();
    const demoLimitReached = isDemoMode && 
      DemoCharacters.getUserCharacterCount() + 1 >= DemoCharacters.DEMO_MAX_USER_CHARACTERS;
    const quotaExhausted = this._creationQuotaInfo &&
      this._creationQuotaInfo.remaining !== -1 &&
      this._creationQuotaInfo.remaining <= 0;
    const canCreateAnother = !demoLimitReached && !quotaExhausted;

    // Show completion options
    const createAnotherBtn = canCreateAnother
      ? `<button class="button-primary" id="completion-new-btn" onclick="App.startNew()">&gt;\u00A0CREATE ANOTHER CHARACTER</button>`
      : '';
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card mt-lg" data-question-id="${question.id}">
        <button class="button-primary completion-save-btn" id="completion-save-btn" onclick="App.saveCharacter()">&gt;\u00A0SAVE CHARACTER</button>
        ${createAnotherBtn}
      </div>`,
    );
    Utils.scrollToBottom(true);

    // Activate keyboard navigation
    KeyboardNav.activate();
  },

  /**
   * Stop the portrait loading animation interval.
   */
  _stopPortraitLoadingAnimation() {
    if (this._portraitLoadingInterval) {
      clearInterval(this._portraitLoadingInterval);
      this._portraitLoadingInterval = null;
    }
    this._portraitElapsed = 0;
  },

  /**
   * Render the standard AI portrait loading state in the portrait panel.
   * Uses the glowing, fast-spinning cube plus animated dots matching
   * the manager view and shared PortraitUI helper.
   */
  _renderPortraitGeneratingLoader(portraitEl) {
    if (!portraitEl) return;

    // Stop any existing animation interval before starting a new one.
    this._stopPortraitLoadingAnimation();

    // Normalize the portrait container into a loading state so the cube + text
    // layout matches the shared portrait styles in `portraits.css`.
    // - Ensure the placeholder variant (16:9 flex box) is present so the cube
    //   stays centered and the 3D context is correct even after custom art
    //   has been rendered previously.
    // - Also add the loading variant, which loosens white-space/overflow and
    //   guarantees a minimum height for the spinner + status text.
    portraitEl.classList.add('ascii-portrait--placeholder');
    portraitEl.classList.add('ascii-portrait--loading');
    // Clear any custom inline sizing overrides from previous renders.
    portraitEl.style.fontSize = '';
    portraitEl.style.whiteSpace = '';
    portraitEl.style.textAlign = '';
    portraitEl.style.overflowX = '';
    portraitEl.style.overflowY = '';

    // Use standardized message matching manager view.
    const baseMessage = 'Generating character art';
    
    // Model-aware subtext: GPT Image 1 takes longer than DALL·E 3.
    let subtext = '(This usually takes 20–30 seconds)';
    try {
      if (
        window.PortraitUI &&
        typeof PortraitUI.getImageModelSubtext === 'function'
      ) {
        subtext = PortraitUI.getImageModelSubtext();
      } else {
        // Inline fallback if PortraitUI not available.
        let imageModel = 'dall-e-3';
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          imageModel = StorageService.getImageModel();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
          imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }
        if (imageModel === 'gpt-image-1') {
          subtext = '(This can take up to a minute)';
        } else if (imageModel === 'flux-1.1-pro') {
          subtext = '(Flux Pro – usually 10–20 seconds)';
        } else if (imageModel === 'flux-schnell') {
          subtext = '(Flux Schnell – usually 5–10 seconds)';
        }
      }
    } catch (e) {
      // Fall back to default subtext on any error.
    }

    // Initialize elapsed counter for dot animation.
    this._portraitElapsed = 0;

    // Update function that animates the dots (cycles 1→2→3).
    const updatePortraitLoading = () => {
      if (!portraitEl) return;
      const dotCount = (this._portraitElapsed % 3) + 1;

      if (
        window.PortraitUI &&
        typeof PortraitUI.renderGeneratingLoader === 'function'
      ) {
        PortraitUI.renderGeneratingLoader(portraitEl, {
          baseMessage,
          subtext,
          dotCount,
          isLoading: true,
        });
      } else {
        // Fallback: update dot state manually if shared helper unavailable.
        // Check for the generating-specific class to know if loader is already rendered.
        let cubeEl = portraitEl.querySelector('.portrait-placeholder-cube--generating');
        let textEl = portraitEl.querySelector('.portrait-placeholder-text');
        if (!cubeEl) {
          // Loader not yet rendered - replace the placeholder with loader HTML
          portraitEl.innerHTML = `
            <div class="portrait-placeholder-content">
              <div class="portrait-placeholder-cube-container">
                <div class="portrait-placeholder-cube portrait-placeholder-cube--generating">
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
              </div>
              <div class="portrait-placeholder-text" data-dots="${dotCount}">
                <span class="portrait-placeholder-message">${baseMessage}</span>
                <span class="portrait-placeholder-dots">
                  <span class="dot dot-1">.</span>
                  <span class="dot dot-2">.</span>
                  <span class="dot dot-3">.</span>
                </span>
                <div class="portrait-placeholder-subtext">
                  ${subtext}
                </div>
              </div>
            </div>
          `;
          textEl = portraitEl.querySelector('.portrait-placeholder-text');
        } else if (textEl) {
          // Loader already rendered - just update dot count
          textEl.setAttribute('data-dots', String(dotCount));
        }
      }

      this._portraitElapsed++;
    };

    // Render immediately, then start interval for animation.
    updatePortraitLoading();
    this._portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
  },

  // In guided (co-create) mode, automatically generate a custom AI portrait
  // once we have the essential character context (race, class, name).
  // Triggered after name selection since backstory is no longer used in prompts.
  // This runs in the background and doesn't block the conversational flow.
  async autoGenerateGuidedAIPortraitIfReady() {
    try {
      if (
        !window.CharacterState ||
        typeof CharacterState.get !== 'function' ||
        !window.AsciiArtService ||
        !CONFIG.ENABLE_AI
      ) {
        return;
      }

      const state = CharacterState.get() || {};
      const character = state.character || {};
      const answers = state.answers || {};
      const entryMode = answers['entry-mode'];

      // Only run this logic for guided (co-create) mode.
      if (entryMode !== 'guided') {
        return;
      }

      // Require the core fields that we include in portrait prompts.
      // Name is now the trigger point (backstory removed from prompts).
      // We also have race, class, background, and alignment at this point.
      const hasCoreFields =
        character.race &&
        character.class &&
        character.name;

      if (!hasCoreFields) {
        return;
      }

      // If we already have a custom AI portrait, don't regenerate.
      if (character.customPortraitAscii || (character.customPortraitCount || 0) > 0) {
        return;
      }

      // Mark that portrait generation is in progress (used by updateCharacterPanel)
      this._guidedPortraitGenerating = true;

      const portraitEl = document.getElementById('character-portrait');

      // Show a loading state in the portrait panel while the AI image is
      // being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(character);

      if (result && result.asciiArt) {
        const currentCount = character.customPortraitCount || 0;

        // Get the current style theme for tagging
        let guidedStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            guidedStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
        }

        // Capture the model and quality that were used for generation
        let generationModel = 'dall-e-3';
        let generationQuality = null;
        try {
          if (window.StorageService && typeof StorageService.getImageModel === 'function') {
            generationModel = StorageService.getImageModel();
          } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
            generationModel = CONFIG.DEFAULT_IMAGE_MODEL;
          }
          if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
            generationQuality = StorageService.getImageQuality(generationModel);
          }
        } catch (e) {
          // Non-fatal: use defaults
        }

        const updatedMetadata =
          window.PortraitHistory && typeof PortraitHistory.addVersion === 'function'
            ? PortraitHistory.addVersion(
                character,
                result.asciiArt,
                result.imageUrl || null,
                {
                  source: 'guided-auto',
                  prompt:
                    (AIService.buildPortraitPrompt &&
                      AIService.buildPortraitPrompt(character)) ||
                    null,
                  style: guidedStyle,
                  model: generationModel,
                  quality: generationQuality,
                },
              )
            : character.portraitMetadata || {};

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Guided-mode AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Guided Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a basic portrait to fall back to.
      await this._ensurePreGeneratedPortraitFallback(character);
    } finally {
      // Clear the generating flag so future re-renders work normally
      this._guidedPortraitGenerating = false;
      
      // Stop the animated dots interval.
      this._stopPortraitLoadingAnimation();
      
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  // Persist changes to shared storage only after a character has been saved once.
  // This keeps manager in sync for post-completion edits (rename, level, portrait, etc.)
  async persistIfAlreadySaved() {
    const state = CharacterState.get();
    const character = state.character;
    
    // If there's no ID yet, this character hasn't been saved to shared storage.
    if (!character || !character.id) {
      return;
    }
    
    try {
      await StorageService.saveCharacter(character);
    } catch (error) {
      console.error('Error persisting character changes:', error);
    }
  },

  async handleListAnswer(questionId, displayIndex) {
    // Check if this is a previous question being changed.
    // We consider any question card that is NOT the last one in the narrator
    // panel to be "previous", regardless of current state.answers contents.
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, displayIndex, true);
      return;
    }

    // Translate display index to original index using the mapping
    const originalIndex =
      this._optionIndexMapping?.[questionId]?.[displayIndex] ??
      displayIndex;

    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[originalIndex];

    // Mark the selected button using the DISPLAY index
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn) => {
      btn.classList.remove('is-selected', 'is-locked');
    });
    buttons.forEach((btn, idx) => {
      if (idx === displayIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
      
      // Apply background benefits if a background was selected
      if (question.saveTo === 'background') {
        const backgroundData = DND_DATA.backgrounds.find(b => b.id === option.value);
        if (backgroundData) {
          CharacterState.updateCharacter({
            skillProficiencies: backgroundData.skillProficiencies || [],
            toolProficiencies: backgroundData.toolProficiencies || [],
            equipment: backgroundData.equipment || [],
            backgroundFeature: backgroundData.feature || null,
            // Note: languages is a number (choices to make), not automatically assigned
            languageChoices: backgroundData.languages || 0,
          });
        }
      }
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.insertAdjacentHTML(
        'beforeend',
        Components.renderNarratorMessage(''),
      );
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAnswer(questionId, optionIndex) {
    // Check if this is a previous question being changed (see comment in
    // handleListAnswer for rationale).
    const narratorPanel = document.getElementById('narrator-panel');
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, optionIndex, false);
      return;
    }

    const state = CharacterState.get();
    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[optionIndex];

    // Special handling for entry mode selection
    if (questionId === 'entry-mode') {
      if (option.value === 'quick') {
        // Record the selected entry mode in state so downstream logic
        // (like updateCharacterPanel) can detect that we're in quick mode
        // before any character renders happen.
        state.answers[questionId] = option.value;
        await this.quickCreateCharacter();
        return;
      }
      // Guided mode just continues into the normal flow below.
    }

    // Mark the selected button
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn, idx) => {
      btn.classList.remove('is-selected', 'is-locked');
      if (idx === optionIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.innerHTML += Components.renderNarratorMessage('');
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAbilityMethod(method) {
    // Mark the selected button
    const buttons = document.querySelectorAll(
      '.question-card:last-child .button-primary',
    );
    buttons.forEach((btn) => {
      if (
        btn.textContent.includes(
          method === 'standard' ? 'Standard Array' : 'Roll 4d6',
        )
      ) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    const state = CharacterState.get();
    let classData = DND_DATA.classes.find(
      (c) => c.id === state.character.class,
    );

    // Guard against missing or invalid class data so the flow never stalls
    // on the ability generation step. If something went wrong earlier and we
    // don't have a valid class, fall back to a generic Fighter-like profile.
    if (!classData) {
      console.error(
        'handleAbilityMethod: missing class data for',
        state.character?.class,
      );
      classData = {
        id: 'fighter',
        name: 'Fighter (fallback)',
        hitDie: 10,
        primaryAbility: ['str'],
        savingThrows: ['str', 'con'],
        equipment: [],
      };
    }

    let abilities = {};

    if (method === 'standard') {
      // Standard array: let user assign them (for now, auto-assign based on class)
      const scores = [15, 14, 13, 12, 10, 8];
      const primary = classData.primaryAbility[0];

      // Simple auto-assignment based on class
      abilities = {
        str: primary === 'str' ? 15 : 10,
        dex: primary === 'dex' ? 15 : 12,
        con: 14,
        int: primary === 'int' ? 15 : 8,
        wis: primary === 'wis' ? 15 : 13,
        cha: primary === 'cha' ? 15 : 10,
      };
    } else {
      // Roll 4d6 drop lowest
      abilities = {
        str: this.rollAbility(),
        dex: this.rollAbility(),
        con: this.rollAbility(),
        int: this.rollAbility(),
        wis: this.rollAbility(),
        cha: this.rollAbility(),
      };
    }

    // Apply racial bonuses (with a safe fallback if race data is missing)
    const race =
      DND_DATA.races.find((r) => r.id === state.character.race) || {
        abilityBonuses: {},
      };
    Object.keys(race.abilityBonuses || {}).forEach((ability) => {
      const bonus = race.abilityBonuses[ability] || 0;
      abilities[ability] = (abilities[ability] || 0) + bonus;
    });

    // Infer a coarse armor loadout from class equipment
    // Infer a coarse armor loadout from class equipment. The helper lives
    // on KeyboardNav (where the armor helpers are defined), so delegate to it.
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      state.character.class,
    );

    // Calculate HP (level 1)
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = classData.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor,
    // delegating to the shared armor helper on KeyboardNav.
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      state.character.class,
      abilities,
      armorCategory,
      hasShield,
    );

    // Store both base (level 1) abilities and current abilities
    CharacterState.updateCharacter({
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
    });
    CharacterState.set({ abilityMethod: method });

    // Tailor narrator tone based on how sturdy this character looks at level 1
    let hpComment;
    if (hitPoints <= Math.max(4, Math.floor(classData.hitDie * 0.5))) {
      hpComment = 'Ouch. I hope you like making death saves.';
    } else if (hitPoints >= classData.hitDie + 2) {
      hpComment = 'All meat, no subtlety. The healer will be proud.';
    } else {
      hpComment = 'Respectable. You might even survive the tutorial.';
    }

    // Also make a quick remark about other standout abilities
    const abilityNames = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma',
    };

    const abilityEntries = Object.entries(abilities);
    const highest = abilityEntries.reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      abilityEntries[0],
    );
    const lowest = abilityEntries.reduce(
      (worst, current) => (current[1] < worst[1] ? current : worst),
      abilityEntries[0],
    );

    let abilityComment = '';
    if (highest && highest[1] >= 16) {
      abilityComment += ` Your ${abilityNames[highest[0]]} is doing a lot of heavy lifting.`;
    }
    if (lowest && lowest[1] <= 8) {
      abilityComment += ` Maybe don't advertise that ${abilityNames[lowest[0]]} score.`;
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `Your abilities have been determined. HP: ${hitPoints}. ${hpComment}${abilityComment}`,
    );
    Utils.scrollToBottom(true);

    await Utils.sleep(2000);
    // Decide next question dynamically:
    // - If class is a spellcaster, branch into spell selection
    //   (guided vs quick based on entry mode).
    // - Otherwise, continue to background selection.
    const latestState = CharacterState.get();
    const classId = latestState.character.class;
    let nextQuestionId = this.currentQuestion.next || 'background-choice';

    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(classId)) {
      const entryMode = latestState.answers['entry-mode'];
      if (entryMode === 'guided') {
        nextQuestionId = 'spell-style-intro';
      } else {
        nextQuestionId = 'spell-quick-mode';
      }
    } else {
      nextQuestionId = 'background-choice';
    }

    await this.showQuestion(nextQuestionId);
  },

  async handleAbilityFromSelect() {
    const trigger = document.getElementById('ability-method-trigger');
    const method =
      trigger?.getAttribute('data-selected-method') || 'standard';
    await this.handleAbilityMethod(method);
  },

  rollAbility() {
    const rolls = [
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
    ].sort((a, b) => b - a);

    // Drop lowest, sum the rest
    return rolls[0] + rolls[1] + rolls[2];
  },

  async handleNameSelect(nameIndex) {
    // Get the selected name from the generated names array
    const name = this._generatedNames[nameIndex];

    if (!name) {
      console.error('Name not found at index:', nameIndex);
      return;
    }

    // Find all buttons in the last question card
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');

    // Mark the selected button and lock others
    buttons.forEach((btn, index) => {
      // Skip the submit button (last button in the card)
      if (btn.textContent.includes('SUBMIT')) return;

      if (index === nameIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Disable and lock the custom name input
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-locked');
    }

    // Disable the custom name submit button
    const submitButton = questionCard.querySelector(
      '.name-input-container .button-primary',
    );
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('is-locked');
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}. Sure. Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async handleCustomName() {
    const customInput = document.getElementById('custom-name-input');
    const name = customInput.value.trim();

    if (!name) {
      // Optionally provide feedback to the user
      console.log('Custom name cannot be empty.');
      return;
    }

    // Disable all name buttons and the input field
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');
    buttons.forEach((btn) => {
      btn.classList.add('is-locked');
      btn.disabled = true;
    });

    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-selected'); // Mark custom input as selected
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}. Sure. Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async checkBackendStatus() {
    // Backend status indicator has been removed from the settings modal UI.
    // This method is kept as a no-op for backwards compatibility.
    return;
  },

  // Legacy settings helpers are now routed through the shared SettingsModal
  // so both builder + manager use a single implementation.
  async openSettings() {
    if (window.SettingsModal && typeof SettingsModal.open === 'function') {
      SettingsModal.open();
    }
  },

  closeSettings() {
    if (window.SettingsModal && typeof SettingsModal.close === 'function') {
      SettingsModal.close();
    }
  },

  saveSettings() {
    if (window.SettingsModal && typeof SettingsModal.save === 'function') {
      SettingsModal.save();
    }
  },

  // Build the inner HTML for the portrait history modal body. This is shared
  // between the initial open and any in-place "reload" after a delete.
  _buildPortraitHistoryBody(normalized) {
    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];
    const hasVersions = !!normalized.hasVersions;
    const hasCustomPortraitWithoutHistory =
      !!normalized.hasCustomPortraitWithoutHistory;

    const listHtml = hasVersions
      ? versions
          .map((v) => {
            const isActive = metadata.activeVersionId === v.id;
            const createdLabel = v.createdAt
              ? new Date(v.createdAt).toLocaleString()
              : '';
            // Use only the generation date/time as the label for each version
            const title = createdLabel || 'Unknown time';
            const infoText = '';

            const hasImage = !!v.url;
            const hasPrompt = !!v.prompt;
            const thumbHtml = `
            <div class="card-thumbnail">
              <div class="ascii-portrait portrait-history-preview" data-version-id="${v.id}"></div>
              ${
                hasImage
                  ? `<img src="${v.url}" alt="${title}" class="portrait-history-image is-hidden" data-version-id="${v.id}">`
                  : ''
              }
            </div>`;

            // Overflow menu for per-version actions (View, Prompt, Delete)
            const actionItems = [];

            if (hasImage) {
              actionItems.push(`
                <button
                  class="selector-option"
                  type="button"
                  role="menuitem"
                  onclick="event.stopPropagation(); App.togglePortraitHistoryView('${v.id}')"
                  data-toggle-version-id="${v.id}"
                >
                  <span class="selector-option-icon">◉</span>
                  <span class="selector-option-label">View original</span>
                </button>
              `);
            }

            // Always show Image Info - displays date, style, model, and prompt (if available)
            actionItems.push(`
              <button
                class="selector-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); App.viewPortraitImageInfo('${v.id}')"
                title="View image generation details"
              >
                <span class="selector-option-icon">ℹ︎</span>
                <span class="selector-option-label">Image info</span>
              </button>
            `);

            actionItems.push(`
              <button
                class="selector-option portrait-history-delete-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); App.deletePortraitVersion('${v.id}')"
                title="Delete this portrait version"
                aria-label="Delete portrait version"
              >
                <span class="selector-option-icon">×</span>
                <span class="selector-option-label">Delete version</span>
              </button>
            `);

            const actionsMenu =
              actionItems.length > 0
                ? `
                <div class="portrait-history-actions selector-shell selector-shell--actions">
                  <button
                    class="terminal-btn-small selector-trigger overflow-trigger portrait-history-overflow-btn"
                    type="button"
                    aria-haspopup="menu"
                    aria-expanded="false"
                    aria-label="More portrait actions"
                    onclick="CharacterSheet.toggleSelectorMenu(this); event.stopPropagation();"
                  >
                    <span class="sheet-actions-icon" aria-hidden="true">
                      <span class="sheet-actions-dot dot-1"></span>
                      <span class="sheet-actions-dot dot-2"></span>
                      <span class="sheet-actions-dot dot-3"></span>
                    </span>
                  </button>
                  <div class="selector-menu portrait-history-menu" role="menu" aria-hidden="true">
                    ${actionItems.join('')}
                  </div>
                </div>
              `
                : '';

            return `
            <div class="character-card portrait-history-card${
              isActive ? ' is-selected' : ''
            }" data-version-id="${v.id}" onclick="App.selectPortraitHistoryCard('${
              v.id
            }')">
              ${thumbHtml}
              <div class="card-details portrait-history-details">
                <div class="portrait-history-meta">
                  <div class="card-name">${title}</div>
                  <div class="card-info">${infoText || '&nbsp;'}</div>
                </div>
                ${actionsMenu}
              </div>
            </div>
          `;
          })
          .join('')
      : hasCustomPortraitWithoutHistory
        ? `<div class="terminal-text-small terminal-text-dim portrait-history-callout">
              <p><strong>No portrait history yet.</strong></p>
              <p>This character's portrait was created before the history feature was added.</p>
              <p>Generate a new custom AI portrait to:</p>
              <ul class="portrait-history-callout-list">
                <li>• Save your current portrait as Version 1</li>
                <li>• Add the new portrait as Version 2</li>
                <li>• Enable portrait version switching</li>
              </ul>
            </div>`
        : `<p class="terminal-text-small terminal-text-dim portrait-history-callout">
              No saved portraits yet.<br><br>
              Generate a custom AI portrait to start building a history.
            </p>`;

    return `
      <p class="terminal-text-small terminal-text-dim">
        View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
      </p>
      <div class="portrait-history-card-row${
        versions.length === 1 ? ' is-single' : ''
      }">
        ${listHtml}
      </div>
    `;
  },

  // Smoothly animate a modal's content height when its body is "reloaded"
  // (e.g., after deleting a portrait history entry). This uses a simple FLIP
  // pattern: measure -> update -> animate height from old to new.
  _animateModalContentResize(modalId, updateFn) {
    const modal = document.getElementById(modalId);
    if (!modal || typeof updateFn !== 'function') {
      if (typeof updateFn === 'function') {
        updateFn();
      }
      return;
    }

    const content = modal.querySelector('.modal-content');
    if (!content) {
      updateFn();
      return;
    }

    const startHeight = content.offsetHeight;

    // Apply DOM updates synchronously so we can measure the new height.
    updateFn();

    const endHeight = content.offsetHeight;

    if (!startHeight || !endHeight || startHeight === endHeight) {
      return;
    }

    // Lock the current height, then animate to the new height.
    content.style.height = `${startHeight}px`;
    // Force reflow so the browser registers the starting height.
    // eslint-disable-next-line no-unused-expressions
    content.offsetHeight;

    content.style.transition =
      'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1.05)';
    content.style.height = `${endHeight}px`;

    const cleanup = () => {
      content.style.height = '';
      content.style.transition = '';
      content.removeEventListener('transitionend', cleanup);
    };

    content.addEventListener('transitionend', cleanup);
  },

  openPortraitHistory() {
    const state = CharacterState.get();
    const character = state.character || {};
    // Normalize portrait metadata + versions using the shared helper so the
    // builder and manager stay in sync.
    const normalized =
      window.PortraitHistory &&
      typeof PortraitHistory.normalizeForDisplay === 'function'
        ? PortraitHistory.normalizeForDisplay(character)
        : (() => {
            const fallbackMetadata = character.portraitMetadata || {};
            const fallbackRaw = Array.isArray(fallbackMetadata.versions)
              ? fallbackMetadata.versions
              : [];
            return {
              metadata: fallbackMetadata,
              versions: fallbackRaw,
              hasVersions: fallbackRaw.length > 0,
              hasCustomPortraitWithoutHistory: !fallbackRaw.length,
            };
          })();

    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];

    if (document.getElementById('portraitHistoryModal')) {
      return;
    }

    const bodyInnerHtml = this._buildPortraitHistoryBody(normalized);

    const modalHTML = `
      <div id="portraitHistoryModal" class="modal show" onclick="App.closePortraitHistory()">
        <div class="modal-content portrait-history-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Portrait History</h2>
            <button class="modal-close" onclick="App.closePortraitHistory()">&times;</button>
          </div>
          <div class="modal-body">
            ${bodyInnerHtml}
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closePortraitHistory()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmPortraitHistorySelection()">USE SELECTED</button>
          </div>
        </div>
      </div>
    `;

    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Populate ASCII previews (for versions without an image URL) as plain
    // text, cropped to the same thumbnail framing as the main character cards.
    // Shared helper batches this work across animation frames.
    if (
      Array.isArray(versions) &&
      versions.length > 0 &&
      window.PortraitHistory &&
      typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
    ) {
      PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
        this.cropAsciiForThumbnail(ascii),
      );
    }

    // Initialize keyboard-style focus on the currently active portrait card,
    // falling back to the first card if no active version is set.
    const cards = this.getPortraitHistoryCards();
    if (cards.length > 0) {
      let initialIndex = 0;
      if (metadata.activeVersionId) {
        const matchIndex = cards.findIndex(
          (card) =>
            card.getAttribute('data-version-id') === metadata.activeVersionId,
        );
        if (matchIndex >= 0) {
          initialIndex = matchIndex;
        }
      }

      this._portraitHistoryFocusIndex = initialIndex;
      this.updatePortraitHistoryFocus();
    }

    // ESC / arrow keys / Enter inside the history modal
    this._portraitHistoryEscHandler = (e) => {
      if (e.key === 'Escape') this.closePortraitHistory();
    };
    this._portraitHistoryKeyHandler = (e) => {
      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmPortraitHistorySelection();
      }
    };

    document.addEventListener('keydown', this._portraitHistoryEscHandler);
    document.addEventListener('keydown', this._portraitHistoryKeyHandler);
  },

  closePortraitHistory() {
    const modal = document.getElementById('portraitHistoryModal');
    if (!modal) {
      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }

    if (this._portraitHistoryEscHandler) {
      document.removeEventListener('keydown', this._portraitHistoryEscHandler);
      this._portraitHistoryEscHandler = null;
    }
    if (this._portraitHistoryKeyHandler) {
      document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
      this._portraitHistoryKeyHandler = null;
    }
    this._portraitHistoryFocusIndex = 0;
  },

  getPortraitHistoryCards() {
    return Array.from(
      document.querySelectorAll('#portraitHistoryModal .character-card'),
    );
  },

  updatePortraitHistoryFocus() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;

    cards.forEach((card, i) => {
      const isFocused = i === index;
      card.classList.toggle('is-keyboard-focused', isFocused);
      card.classList.toggle('is-selected', isFocused);
    });
  },

  movePortraitHistoryFocus(delta) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const current =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const next = Math.max(0, Math.min(cards.length - 1, current + delta));
    this._portraitHistoryFocusIndex = next;
    this.updatePortraitHistoryFocus();
  },

  selectPortraitHistoryCard(versionId) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    let targetIndex = 0;
    cards.forEach((card, i) => {
      const matches = card.getAttribute('data-version-id') === versionId;
      if (matches) {
        targetIndex = i;
      }
    });

    this._portraitHistoryFocusIndex = targetIndex;
    this.updatePortraitHistoryFocus();
  },

  togglePortraitHistoryView(versionId) {
    const asciiEl = document.querySelector(
      `.portrait-history-preview.ascii-portrait[data-version-id="${versionId}"]`,
    );
    const imgEl = document.querySelector(
      `.portrait-history-image[data-version-id="${versionId}"]`,
    );
    const btn = document.querySelector(
      `.portrait-history-actions button[data-toggle-version-id="${versionId}"]`,
    );

    if (!imgEl || !asciiEl || !btn) return;

    const showingAscii = imgEl.classList.contains('is-hidden');

    if (showingAscii) {
      // Switch to original image
      asciiEl.classList.add('is-hidden');
      imgEl.classList.remove('is-hidden');
      btn.textContent = 'View ASCII';
    } else {
      // Switch back to ASCII art
      imgEl.classList.add('is-hidden');
      asciiEl.classList.remove('is-hidden');
      btn.textContent = 'View Original';
    }
  },

  cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
    // Split into lines
    const lines = asciiArt.split('\n');

    // VERTICAL: Crop from bottom only (keep top pinned for faces/heads)
    const totalLines = lines.length;
    const startLine = 0;
    const endLine = Math.min(totalLines, heightLines);

    // HORIZONTAL: Crop equally from both sides to stay centered
    const topLines = lines.slice(startLine, endLine).map((line) => {
      if (line.length <= widthChars) return line;
      const excess = line.length - widthChars;
      const cropLeft = Math.floor(excess / 2);
      return line.slice(cropLeft, cropLeft + widthChars);
    });

    return topLines.join('\n');
  },

  async confirmPortraitHistorySelection() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) {
      this.closePortraitHistory();
      return;
    }

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const card = cards[index];
    if (!card) {
      this.closePortraitHistory();
      return;
    }

    const versionId = card.getAttribute('data-version-id');
    if (!versionId) {
      this.closePortraitHistory();
      return;
    }

    // Show a lightweight loading state on the primary button while we apply
    // the selected portrait. The modal will close once the operation finishes.
    const modal = document.getElementById('portraitHistoryModal');
    const useBtn =
      modal && modal.querySelector('.modal-footer .terminal-btn-primary');
    const originalLabel = useBtn ? useBtn.textContent : null;
    if (useBtn) {
      useBtn.disabled = true;
      useBtn.textContent = 'Applying...';
    }

    try {
      await this.usePortraitVersion(versionId);
    } catch (error) {
      console.error(
        'App.confirmPortraitHistorySelection: failed to apply portrait version',
        error,
      );
      if (useBtn) {
        useBtn.disabled = false;
        useBtn.textContent = originalLabel || 'USE SELECTED';
      }
      this.showSystemMessage(
        'Failed to switch portrait. Please try again in a moment.',
      );
    }
  },

  async usePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      this.showSystemMessage('Portrait version not found.');
      return;
    }

    const updatedMetadata = {
      ...metadata,
      activeVersionId: version.id,
    };

    CharacterState.updateCharacter({
      originalPortraitUrl:
        version.url || character.originalPortraitUrl || null,
      customPortraitAscii: version.ascii || character.customPortraitAscii || '',
      portraitMetadata: updatedMetadata,
    });

    // Persist in the background if the character is already saved to shared storage.
    await this.persistIfAlreadySaved();

    // Force an immediate refresh of the in-builder character sheet so the new
    // portrait is visible even if any listeners were missed.
    try {
      const latestState = CharacterState.get();
      if (
        latestState &&
        latestState.character &&
        typeof this.updateCharacterPanel === 'function'
      ) {
        await this.updateCharacterPanel(latestState.character);
      }
    } catch (e) {
      console.error(
        'App.usePortraitVersion: failed to refresh character panel after version switch',
        e,
      );
    }

    this.closePortraitHistory();
  },

  async deletePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    if (!versions.length) {
      this.closePortraitHistory();
      return;
    }

    const modal = document.getElementById('portraitHistoryModal');
    if (!modal) return;

    const modalBody = modal.querySelector('.modal-body');
    const modalTitle = modal.querySelector('.modal-title');
    const modalFooter = modal.querySelector('.modal-footer');
    if (!modalBody) return;

    // Store original content to restore on cancel
    const originalBodyHtml = modalBody.innerHTML;
    const originalTitle = modalTitle ? modalTitle.textContent : '';
    const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';

    // If this is the only portrait, show "create new" prompt instead of delete confirmation
    if (versions.length === 1) {
      const createNewBodyHtml = `
        <p class="terminal-text">
          To delete this portrait, create a new one first.
        </p>
      `;

      const createNewFooterHtml = `
        <button class="terminal-btn" id="portrait-delete-cancel">CANCEL</button>
        <button class="terminal-btn terminal-btn-primary" id="portrait-create-new">CREATE NEW</button>
      `;

      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = 'Create a New Portrait?';
        modalBody.innerHTML = createNewBodyHtml;
        if (modalFooter) modalFooter.innerHTML = createNewFooterHtml;
      });

      const cancelBtn = document.getElementById('portrait-delete-cancel');
      const createNewBtn = document.getElementById('portrait-create-new');

      if (cancelBtn) {
        cancelBtn.onclick = () => {
          this._animateModalContentResize('portraitHistoryModal', () => {
            if (modalTitle) modalTitle.textContent = originalTitle;
            modalBody.innerHTML = originalBodyHtml;
            if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
          });

          // Re-populate ASCII previews after restoring
          if (Array.isArray(versions) && versions.length > 0 &&
              window.PortraitHistory &&
              typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
            PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
              this.cropAsciiForThumbnail(ascii),
            );
          }

          const cards = this.getPortraitHistoryCards();
          if (cards.length > 0) {
            this._portraitHistoryFocusIndex = 0;
            this.updatePortraitHistoryFocus();
          }
        };
      }

      if (createNewBtn) {
        createNewBtn.onclick = () => {
          this.closePortraitHistory();
          this.generateCustomAIPortrait();
        };
      }

      return;
    }

    // Build the confirmation view using standard modal structure
    const confirmationBodyHtml = `
      <p class="terminal-text">
        Delete this saved portrait version? This cannot be undone.
      </p>
    `;

    const confirmationFooterHtml = `
      <button class="terminal-btn" id="portrait-delete-cancel">NO</button>
      <button class="terminal-btn terminal-btn-primary" id="portrait-delete-confirm">YES</button>
    `;

    // Transform modal to confirmation view
    this._animateModalContentResize('portraitHistoryModal', () => {
      if (modalTitle) modalTitle.textContent = 'Confirm Delete';
      modalBody.innerHTML = confirmationBodyHtml;
      if (modalFooter) modalFooter.innerHTML = confirmationFooterHtml;
    });

    // Handle cancel - restore original content
    const cancelBtn = document.getElementById('portrait-delete-cancel');
    const confirmBtn = document.getElementById('portrait-delete-confirm');

    const restoreOriginal = () => {
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = originalTitle;
        modalBody.innerHTML = originalBodyHtml;
        if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
      });

      // Re-populate ASCII previews after restoring
      if (
        Array.isArray(versions) &&
        versions.length > 0 &&
        window.PortraitHistory &&
        typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
      ) {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
    };

    if (cancelBtn) {
      cancelBtn.onclick = restoreOriginal;
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
        const remaining = versions.filter((v) => v.id !== versionId);
        const deletedWasActive = metadata.activeVersionId === versionId;

        const updatedMetadata = {
          ...metadata,
          versions: remaining,
          activeVersionId: deletedWasActive
            ? remaining[0]?.id || null
            : metadata.activeVersionId,
        };

        const updates = {
          portraitMetadata: updatedMetadata,
        };

        if (deletedWasActive) {
          if (remaining[0]) {
            updates.originalPortraitUrl =
              remaining[0].url || character.originalPortraitUrl || null;
            updates.customPortraitAscii =
              remaining[0].ascii || character.customPortraitAscii || '';
          } else {
            // No remaining custom versions – clear custom portrait so we fall back to template/pre-generated art
            updates.originalPortraitUrl = null;
            updates.customPortraitAscii = '';
          }
        }

        CharacterState.updateCharacter(updates);
        await this.persistIfAlreadySaved();

        // If no remaining versions, close the modal entirely
        if (!remaining.length) {
          this.closePortraitHistory();
          return;
        }

        // Rebuild normalized metadata from the latest state
        const latestState = CharacterState.get();
        const latestCharacter = latestState.character || {};
        const latestNormalized =
          window.PortraitHistory &&
          typeof PortraitHistory.normalizeForDisplay === 'function'
            ? PortraitHistory.normalizeForDisplay(latestCharacter)
            : (() => {
                const fallbackMetadata = latestCharacter.portraitMetadata || {};
                const fallbackRaw = Array.isArray(fallbackMetadata.versions)
                  ? fallbackMetadata.versions
                  : [];
                return {
                  metadata: fallbackMetadata,
                  versions: fallbackRaw,
                  hasVersions: fallbackRaw.length > 0,
                  hasCustomPortraitWithoutHistory: !fallbackRaw.length,
                };
              })();

        // Transform back to history view with updated content
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = originalTitle;
          modalBody.innerHTML = this._buildPortraitHistoryBody(latestNormalized);
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-run ASCII thumbnail population & focus wiring for the updated list
        const nextVersions = Array.isArray(latestNormalized.versions)
          ? latestNormalized.versions
          : [];
        if (
          Array.isArray(nextVersions) &&
          nextVersions.length > 0 &&
          window.PortraitHistory &&
          typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
        ) {
          PortraitHistory.batchPopulateAsciiPreviews(nextVersions, (ascii) =>
            this.cropAsciiForThumbnail(ascii),
          );
        }

        const cards = this.getPortraitHistoryCards();
        if (cards.length > 0) {
          this._portraitHistoryFocusIndex = 0;
          this.updatePortraitHistoryFocus();
        }
      };
    }
  },

  viewPortraitImageInfo(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      this.showToast('No info available for this portrait.');
      return;
    }

    const modal = document.getElementById('portraitHistoryModal');
    if (!modal) return;

    const modalBody = modal.querySelector('.modal-body');
    const modalTitle = modal.querySelector('.modal-title');
    const modalFooter = modal.querySelector('.modal-footer');
    if (!modalBody) return;

    // Store original content to restore on back
    const modalHeader = modal.querySelector('.modal-header');
    const originalBodyHtml = modalBody.innerHTML;
    const originalHeaderHtml = modalHeader ? modalHeader.innerHTML : '';
    const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';

    // Helper to format labels to title case
    const formatLabel = (str) => {
      if (!str) return null;
      // Replace dashes/underscores with spaces
      let cleaned = str.replace(/[-_]/g, ' ');
      // Title case: capitalize first letter of each word
      if (cleaned.length > 0) {
        cleaned = cleaned.split(' ').map(word => 
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
      }
      return cleaned;
    };

    // Format model name for display
    const formatModelName = (model) => {
      if (!model) return null;
      const modelNames = {
        'dall-e-3': 'DALL·E 3',
        'gpt-image-1': 'GPT Image 1',
        'flux-1.1-pro': 'Flux 1.1 Pro',
        'flux-schnell': 'Flux Schnell',
      };
      return modelNames[model] || formatLabel(model);
    };

    // Format quality for display
    const formatQuality = (quality) => {
      if (!quality) return null;
      const qualityNames = {
        'standard': 'Standard',
        'medium': 'Medium',
        'high': 'High',
        'hd': 'HD',
      };
      return qualityNames[quality] || formatLabel(quality);
    };

    // Format date/time for display
    const formatDateTime = (isoString) => {
      if (!isoString) return null;
      try {
        const date = new Date(isoString);
        return date.toLocaleString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      } catch (e) {
        return isoString;
      }
    };

    const styleLabel = formatLabel(version.style) || 'Default';
    const modelLabel = formatModelName(version.model);
    const qualityLabel = formatQuality(version.quality);
    const dateTimeLabel = formatDateTime(version.createdAt);

    // Escape prompt text for safe display
    const escapedPrompt = (version.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const infoHeaderHtml = `
      <h2 class="modal-title">Image Info</h2>
      <button class="modal-close" onclick="App.closePortraitHistory()">&times;</button>
    `;

    // Build the info sections
    let infoSections = '';

    // Date/Time
    if (dateTimeLabel) {
      infoSections += `
        <div class="image-info-row">
          <span class="image-info-label">Created</span>
          <span class="image-info-value">${dateTimeLabel}</span>
        </div>
      `;
    }

    // Style
    infoSections += `
      <div class="image-info-row">
        <span class="image-info-label">Style</span>
        <span class="image-info-value">${styleLabel}</span>
      </div>
    `;

    // Model and Quality
    if (modelLabel) {
      let modelDisplay = modelLabel;
      if (qualityLabel) {
        modelDisplay = modelDisplay + ' (' + qualityLabel + ')';
      }
      infoSections += `
        <div class="image-info-row">
          <span class="image-info-label">Model</span>
          <span class="image-info-value">${modelDisplay}</span>
        </div>
      `;
    }

    // Prompt section
    let promptSection = '';
    if (escapedPrompt) {
      promptSection = `
        <div class="image-info-prompt-section">
          <div class="image-info-prompt-label">Prompt</div>
          <pre class="terminal-text portrait-prompt-display">${escapedPrompt}</pre>
        </div>
      `;
    } else {
      promptSection = `
        <div class="image-info-prompt-section">
          <div class="image-info-prompt-label">Prompt</div>
          <p class="terminal-text-dim">No prompt saved for this portrait.</p>
        </div>
      `;
    }

    const infoBodyHtml = `
      <div class="image-info-container">
        <div class="image-info-metadata">
          ${infoSections}
        </div>
        ${promptSection}
      </div>
    `;

    const infoFooterHtml = `
      <button class="terminal-btn" id="portrait-info-back">BACK</button>
      ${escapedPrompt ? '<button class="terminal-btn" id="portrait-info-copy">COPY PROMPT</button>' : ''}
    `;

    // Transform modal to info view
    this._animateModalContentResize('portraitHistoryModal', () => {
      if (modalHeader) modalHeader.innerHTML = infoHeaderHtml;
      modalBody.innerHTML = infoBodyHtml;
      if (modalFooter) modalFooter.innerHTML = infoFooterHtml;
    });

    const backBtn = document.getElementById('portrait-info-back');
    const copyBtn = document.getElementById('portrait-info-copy');

    const goBack = () => {
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalHeader) modalHeader.innerHTML = originalHeaderHtml;
        modalBody.innerHTML = originalBodyHtml;
        if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
      });

      // Re-populate ASCII previews after restoring
      if (Array.isArray(versions) && versions.length > 0 &&
          window.PortraitHistory &&
          typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
    };

    if (backBtn) {
      backBtn.onclick = goBack;
    }

    if (copyBtn) {
      copyBtn.onclick = async () => {
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(version.prompt);
          } else {
            const textarea = document.createElement('textarea');
            textarea.value = version.prompt;
            textarea.setAttribute('readonly', '');
            textarea.style.position = 'absolute';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            try {
              document.execCommand('copy');
            } finally {
              document.body.removeChild(textarea);
            }
          }
          this.showToast('Prompt copied.');
        } catch (error) {
          console.error('Failed to copy portrait prompt:', error);
          this.showToast('Could not copy prompt.', 5000);
        }
      };
    }
  },

  // Legacy alias for backwards compatibility
  viewPortraitPrompt(versionId) {
    return this.viewPortraitImageInfo(versionId);
  },

  async generateCustomAIPortrait() {
    const state = CharacterState.get();
    const character = state.character;

    // Block custom art generation for sample (demo) characters
    if (window.DemoCharacters && DemoCharacters.isDemo(character)) {
      this.showSystemMessage(
        'Custom art generation is not available for sample characters. ' +
        'Create your own character to generate custom portraits!'
      );
      return;
    }

    // Note: Daily portrait limits are now enforced by the backend.
    // Demo users get 5/day, logged-in users get 20/day.
    // The backend returns appropriate error messages when limits are hit.

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select both a race and a class before generating a custom portrait.',
      );
      return;
    }

    // Check if backend is available (API key check now handled server-side)
    try {
      const statusCheck = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`);
      if (!statusCheck.ok) {
      this.showSystemMessage(
          'Backend server is not available. Make sure the backend is running on port 8000.',
        );
        return;
      }
      const statusData = await statusCheck.json();
      if (!statusData.available) {
        this.showSystemMessage(
          'AI features are not available. The backend server is not configured.',
        );
        return;
      }
    } catch (error) {
      this.showSystemMessage(
        'Cannot connect to backend server. Make sure it is running on http://localhost:8000',
      );
      return;
    }

    // Show prompt modal
    this.openPromptModal(character);
  },

  /**
   * Ensure we have at least a basic ASCII fallback portrait for the given
   * character. Used when custom AI portrait generation fails (rate limits,
   * backend errors, etc.) so we don't leave the frame empty.
   *
   * Important: this intentionally does NOT load any pre-generated portrait
   * assets (ASCII or images). It only uses the simple template portrait.
   */
  async _ensurePreGeneratedPortraitFallback(character, options = {}) {
    const force = !!(options && options.force);

    try {
      if (!window.AsciiArtService || !character || !character.race) {
        return;
      }

      const currentState = CharacterState.get();
      const existing = currentState && currentState.character ? currentState.character : {};

      if (
        !force &&
        (existing.customPortraitAscii ||
          (existing.portrait && (existing.portrait.ascii || existing.portrait.url)) ||
          existing.asciiPortrait)
      ) {
        // We already have some kind of portrait attached; don't overwrite it.
        return;
      }

      // Use the simple template portrait only (no pre-generated file loads).
      const fallbackArt = AsciiArtService.getFullPortrait
        ? AsciiArtService.getFullPortrait(character)
        : '';

      // In guided/quick mode, updateCharacterPanel only shows customPortraitAscii,
      // not asciiPortrait. So we also set customPortraitAscii here to ensure the
      // fallback portrait actually displays in those modes.
      if (fallbackArt && window.CharacterState) {
        CharacterState.updateCharacter({
          customPortraitAscii: fallbackArt,
          // Explicitly clear any existing original image URL so pre-generated
          // images (or stale URLs) cannot appear as a fallback.
          originalPortraitUrl: null,
          portrait: {
            ...(existing.portrait || {}),
            url: null,
          },
        });
      }

      // Clear last-portrait cache so the pre-generated art will animate in.
      this._lastPortraitArt = null;

      const latest = CharacterState.get().character;
      await this.updateCharacterPanel(latest);
    } catch (fallbackError) {
      console.error('Failed to apply fallback portrait:', fallbackError);
    }
  },

  async openPromptModal(character) {
    // Show only the character description to the user (not the rendering instructions)
    const defaultPrompt = AIService.buildCharacterDescription
      ? AIService.buildCharacterDescription(character)
      : ''; // backwards compat if renamed
    
    // Get active style from portrait version or user's saved preference
    let activeStyle = null;
    try {
      // Check if character has an active portrait version with a style
      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      if (versions.length) {
        const activeId = metadata.activeVersionId;
        let active =
          (activeId && versions.find((v) => v && v.id === activeId)) ||
          versions[versions.length - 1];
        if (active && active.style) {
          activeStyle = active.style;
        }
      }
      // Fall back to user's saved preference
      if (!activeStyle && window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
        activeStyle = StorageService.getPortraitPromptTheme();
      }
    } catch (e) {
      // Non-fatal
    }

    const modalHTML = `
      <div id="promptModal" class="modal show" onclick="App.closePromptModal(false)">
        <div class="modal-content portrait-customize-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Customize portrait</h2>
            <button class="modal-close" onclick="App.closePromptModal(false)">&times;</button>
          </div>
          <div class="modal-body">
            <div class="portrait-style-row">
              <div class="portrait-style-label">Style</div>
              <div class="selector-shell selector-shell--listbox portrait-style-selector" id="builderPortraitStyleShell">
                <button 
                  type="button"
                  class="terminal-btn selector-trigger"
                  id="builderPortraitStyleTrigger"
                  aria-haspopup="listbox"
                  aria-expanded="false"
                  onclick="CharacterSheet.toggleSelectorMenu(this)"
                >
                  <span class="selector-trigger-label" id="builderPortraitStyleLabel">Cinematic inks</span>
                </button>
                <div class="selector-menu portrait-style-menu" id="builderPortraitStyleMenu" role="listbox" aria-label="Portrait style" aria-hidden="true">
                  <!-- Options populated by JS -->
                </div>
              </div>
            </div>
            <div class="image-quota-info is-blinking" id="builderImageQuotaLine">Checking image quota…</div>
            <textarea
              class="terminal-textarea portrait-prompt-textarea"
              id="custom-prompt"
              placeholder="Enter custom description..."
            >${defaultPrompt}</textarea>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.surpriseMePortrait()">SURPRISE ME</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmPromptModal()">GENERATE PORTRAIT</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Populate the style dropdown (await to ensure API sync completes first)
    // This ensures global/shared styles are loaded for all authenticated users
    await populateBuilderPortraitStyleDropdown(activeStyle);

    const modal = document.getElementById('promptModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // Populate the quota line (and keep it updated while the modal is open).
    try {
      const quotaLine = document.getElementById('builderImageQuotaLine');
      const updateQuotaLine = (detail) => {
        const el = document.getElementById('builderImageQuotaLine');
        if (!el) return;
        const remaining = detail && typeof detail.remaining === 'number' ? detail.remaining : null;
        const limit = detail && typeof detail.limit === 'number' ? detail.limit : null;

        // Find and update Generate button state based on quota
        const generateBtn = document.querySelector('#promptModal .terminal-btn-primary');
        const surpriseBtn = document.querySelector('#promptModal .terminal-btn:not(.terminal-btn-primary)');

        if (remaining === -1) {
          el.textContent = 'Image quota: unlimited (admin/dev)';
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.title = '';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = false;
            surpriseBtn.title = '';
          }
          return;
        }

        if (remaining === 0 && limit != null) {
          el.textContent = `Custom portraits left today: 0/${limit}`;
          if (generateBtn) {
            generateBtn.disabled = true;
            generateBtn.title = 'Daily custom portrait limit reached';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = true;
            surpriseBtn.title = 'Daily custom portrait limit reached';
          }
          return;
        }

        if (remaining != null && limit != null) {
          el.textContent = `Custom portraits left today: ${remaining}/${limit}`;
          if (generateBtn) {
            generateBtn.disabled = false;
            generateBtn.title = '';
          }
          if (surpriseBtn) {
            surpriseBtn.disabled = false;
            surpriseBtn.title = '';
          }
          return;
        }

        el.textContent = 'Image quota: unavailable';
      };

      // Store handler so we can remove it on close.
      this._promptModalQuotaHandler = (e) => updateQuotaLine(e && e.detail);
      window.addEventListener('danddy:imageQuotaUpdate', this._promptModalQuotaHandler);

      // Initial fetch for current quota status.
      if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
        const quota = await AIService.getImageQuotaStatus();
        if (quotaLine && quota) {
          updateQuotaLine({
            limit: quota.limit,
            remaining: quota.remaining,
          });
        }
      }
    } catch (e) {
      // Non-fatal
    }

    // ESC key to close
    this._promptModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closePromptModal(false);
    };
    document.addEventListener('keydown', this._promptModalEscHandler);
  },

  closePromptModal(regenerate = false) {
    // Close the style menu if open (using standard selector toggle)
    const trigger = document.getElementById('builderPortraitStyleTrigger');
    if (trigger && trigger.classList.contains('is-open') && window.CharacterSheet) {
      CharacterSheet.toggleSelectorMenu(trigger);
    }
    
    const modal = document.getElementById('promptModal');
    if (!modal) {
      // Reset style state even if modal is gone
      currentBuilderPortraitStyle = null;
      return;
    }

    // If the modal is already in the process of closing, don't re-run animation.
    if (modal.classList.contains('closing')) return;

    modal.classList.add('closing');

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      // Remove the modal from the DOM after the close animation completes.
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      // Remove ESC key listener
      if (this._promptModalEscHandler) {
        document.removeEventListener('keydown', this._promptModalEscHandler);
        this._promptModalEscHandler = null;
      }

      // Remove quota listener
      if (this._promptModalQuotaHandler) {
        window.removeEventListener('danddy:imageQuotaUpdate', this._promptModalQuotaHandler);
        this._promptModalQuotaHandler = null;
      }
      
      // Reset the style selection state
      currentBuilderPortraitStyle = null;

      if (regenerate) {
        // Trigger portrait regeneration if confirmed
        const state = CharacterState.get();
        this.updateCharacterPanel(state.character);
      }
    };

    // If we have a modal-content element, wait for the close animation to finish.
    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      // Fallback: no animation support, just close immediately.
      handleClose();
    }
  },

  async confirmPromptModal() {
    const customPromptInput = document.getElementById('custom-prompt');
    const customPrompt = customPromptInput.value.trim();
    
    // Capture the selected style before closing the modal (which resets it)
    const selectedStyle = currentBuilderPortraitStyle;

    if (!customPrompt) {
      this.showSystemMessage('Portrait prompt cannot be empty.');
      return;
    }

    this.closePromptModal(false); // Close modal without regenerating yet

    const portraitEl = document.getElementById('character-portrait');
    const originalPortraitEl = document.getElementById('original-portrait');

    // If the user prefers original images, temporarily switch the visible
    // frame from original → ASCII so they see the cube loader + status while
    // the new portrait is being generated. The shared sheet will re-read the
    // global preference on re-render and switch back to original afterward.
    if (portraitEl && originalPortraitEl) {
      const container = portraitEl.closest('.portrait-container');
      const toggleBtn = document.getElementById('toggle-portrait-btn');

      let portraitViewMode = 'original';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (
          typeof CONFIG !== 'undefined' &&
          CONFIG.DEFAULT_PORTRAIT_VIEW_MODE
        ) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal: keep default
      }

      const isAsciiHidden = portraitEl.classList.contains('is-hidden');
      const isOriginalVisible = !originalPortraitEl.classList.contains(
        'is-hidden',
      );
      const isContainerOriginal =
        !!container &&
        container.classList.contains('portrait-container--original-mode');

      if (
        portraitViewMode === 'original' &&
        isAsciiHidden &&
        isOriginalVisible &&
        isContainerOriginal
      ) {
        // Temporarily switch the DOM to ASCII view so the loader is visible.
        portraitEl.classList.remove('is-hidden');
        originalPortraitEl.classList.add('is-hidden');
        if (container) {
          container.classList.remove('portrait-container--original-mode');
        }

        // Update the toggle label to reflect that ASCII is currently shown.
        if (toggleBtn) {
          const iconSpan = toggleBtn.querySelector('.selector-option-icon');
          const labelSpan = toggleBtn.querySelector('.selector-option-label');
          if (iconSpan && labelSpan) {
            iconSpan.textContent = '◉';
            labelSpan.textContent = 'View Original Art';
          } else {
            toggleBtn.textContent = '◉ View Original Art';
          }
        }
      }
    }

    if (portraitEl) {
      // While generating, scroll the character sheet back to the top so the
      // user immediately sees the portrait frame and loading status message.
      const characterPanel = document.getElementById('character-panel');
      if (characterPanel) {
        characterPanel.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }

      // Show the standard loading state with glowing, spinning cube and unified text.
      this._renderPortraitGeneratingLoader(portraitEl);
    }

    try {
      // Add rendering instructions to the user's character description
      // (hidden system-level guidance for the image model)
      // Use shared pose + camera data from PortraitPoseData module
      const character = CharacterState.get().character || {};
      const classKey = (character.class || 'default').toLowerCase();

      const { pose: posePrompt, camera: cameraPrompt } =
        window.PortraitPoseData && typeof PortraitPoseData.getRandomPoseAndCamera === 'function'
          ? PortraitPoseData.getRandomPoseAndCamera(classKey)
          : {
              pose: 'standing in a relaxed but heroic stance',
              camera: 'Camera angle: three-quarter view that clearly shows the full silhouette.',
            };

      let renderingInstructions;
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.buildCustomPortraitInstructions ===
          'function'
      ) {
        // Use the style selected from the modal dropdown
        renderingInstructions =
          window.PortraitPrompt.buildCustomPortraitInstructions({
            posePrompt,
            cameraPrompt,
            themeId: selectedStyle,
          });
      } else {
        // Fallback if PortraitPrompt is not loaded for some reason.
        // Note: Camera temporarily disabled - may interfere with pose
        renderingInstructions = [
          'Create a high-contrast black-and-white fantasy illustration.',
          'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
          'Include some controlled, directional hatching to define form (light mid-tone texture only).',
          `Pose: ${posePrompt}`,
          // cameraPrompt,
          'Background should be simple, entirely black, and free of symbols or text.',
          'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
          'Aspect ratio 3:4.',
        ];
      }
      
      // Combine character description with rendering instructions.
      // Character info comes first, then style/pose/camera instructions.
      // The backend has a 4000 character limit on prompts, so we need to truncate
      // if necessary. Prioritize keeping the character description (customPrompt)
      // and trim style instructions if we exceed the limit.
      const MAX_PROMPT_LENGTH = 3900; // Leave some margin below the 4000 limit
      let fullPrompt = [customPrompt, ...renderingInstructions].join(' ');
      
      if (fullPrompt.length > MAX_PROMPT_LENGTH) {
        console.warn(`Portrait prompt exceeds ${MAX_PROMPT_LENGTH} chars (${fullPrompt.length}), truncating...`);
        // Try to keep the custom prompt intact and reduce style instructions
        const styleInstructionsText = renderingInstructions.join(' ');
        const availableForStyle = MAX_PROMPT_LENGTH - customPrompt.length - 50; // 50 chars buffer
        
        if (availableForStyle > 200) {
          // We have room for some style instructions
          const truncatedStyle = styleInstructionsText.substring(0, availableForStyle);
          fullPrompt = truncatedStyle + ' ' + customPrompt;
        } else {
          // Not much room - just use the custom prompt with minimal style
          const minimalStyle = 'High-contrast black-and-white fantasy ink illustration.';
          fullPrompt = minimalStyle + ' ' + customPrompt.substring(0, MAX_PROMPT_LENGTH - minimalStyle.length - 1);
        }
        console.log(`Truncated prompt length: ${fullPrompt.length}`);
      }
      
      // Generate custom portrait with full prompt (including hidden rendering instructions)
      const result =
        await AsciiArtService.generateCustomAIPortraitWithPrompt(
          fullPrompt,
        );

      // Store both the original image URL and custom ASCII art in character state
      // Also increment the custom portrait counter and append to portrait history
      const current = CharacterState.get().character;
      const currentCount = current.customPortraitCount || 0;

      // Capture the model and quality that were used for generation
      let generationModel = 'dall-e-3';
      let generationQuality = null;
      try {
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          generationModel = StorageService.getImageModel();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
          generationModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }
        if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
          generationQuality = StorageService.getImageQuality(generationModel);
        }
      } catch (e) {
        // Non-fatal: use defaults
      }

      const updatedMetadata = window.PortraitHistory
        ? window.PortraitHistory.addVersion(
            current,
            result.asciiArt,
            result.imageUrl,
            {
              source: 'custom-ai',
              prompt: fullPrompt,
              style: selectedStyle,
              model: generationModel,
              quality: generationQuality,
            },
          )
        : current.portraitMetadata || {};

      // Respect the player's portrait view preference:
      // - If they prefer original images, keep that mode.
      // - If they prefer ASCII, continue to show ASCII first.
      // We do not forcibly flip the global portrait view mode here.

      CharacterState.updateCharacter({
        originalPortraitUrl: result.imageUrl,
        customPortraitAscii: result.asciiArt,
        customPortraitCount: currentCount + 1,
        portraitMetadata: updatedMetadata,
      });

      if (portraitEl) {
        // Stop the animated dots interval and restore portrait font size back
        // to ASCII default; the sheet will re-render for the newly generated art.
        this._stopPortraitLoadingAnimation();
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }

      // Update the last portrait art to trigger animation
      this._lastPortraitArt = null;

      // Re-render to show the toggle button and trigger animation
      const state = CharacterState.get();
      await this.updateCharacterPanel(state.character);
    } catch (error) {
      console.error('Error generating custom AI portrait with prompt:', error);

      // Check error type and show appropriate message
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Custom Prompt Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Restore portrait font sizing and swap back to a safe fallback portrait.
      const state = CharacterState.get();
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove(
          'ascii-portrait--loading',
          'ascii-portrait--placeholder',
        );
      }

      // If we already have some portrait art, just re-render the sheet;
      // otherwise, apply a basic fallback portrait now.
      await this._ensurePreGeneratedPortraitFallback(state.character, {
        force: !(
          state.character &&
          (state.character.customPortraitAscii ||
            state.character.asciiPortrait ||
            (state.character.portrait &&
              (state.character.portrait.ascii || state.character.portrait.url)))
        ),
      });
    }
  },

  // "Surprise Me" - generate a fresh randomized prompt and immediately generate portrait
  async surpriseMePortrait() {
    const state = CharacterState.get();
    const character = state && state.character ? state.character : {};

    if (!character.race || !character.class) {
      this.showSystemMessage('Select a race and class first.');
      return;
    }

    // Build a fresh randomized character description for the user to edit.
    // NOTE: Use buildCharacterDescription (not buildPortraitPrompt) so that
    // rendering instructions (Pose/Camera/STYLE/Scene) are only added once
    // by confirmPromptModal, avoiding duplication in the final prompt.
    let templatePrompt = '';
    try {
      if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
        templatePrompt = AIService.buildCharacterDescription(character);
      } else {
        templatePrompt = `${character.race}\u0020${character.class}`;
      }
    } catch (e) {
      templatePrompt = `${character.race}\u0020${character.class}`;
    }

    // Update the prompt input field so user can see what was generated
    const promptInput = document.getElementById('custom-prompt');
    if (promptInput) {
      promptInput.value = templatePrompt;
    }

    // Immediately trigger generation with the new prompt
    await this.confirmPromptModal();
  },

  togglePortraitView() {
    const asciiPortrait = document.getElementById('character-portrait');
    const originalPortrait = document.getElementById('original-portrait');
    const toggleBtn = document.getElementById('toggle-portrait-btn');
    const container = asciiPortrait
      ? asciiPortrait.closest('.portrait-container')
      : null;

    if (!asciiPortrait || !originalPortrait || !toggleBtn) return;

    // Use the shared "is-hidden" class to determine visibility so we stay
    // consistent with the manager + shared character sheet markup. Relying on
    // inline style.display can get out of sync with the initial render, which
    // applies visibility purely via classes.
    const isShowingAscii = !asciiPortrait.classList.contains('is-hidden');

    const iconSpan = toggleBtn.querySelector('.selector-option-icon');
    const labelSpan = toggleBtn.querySelector('.selector-option-label');

    if (isShowingAscii) {
      // Switch to original
      asciiPortrait.classList.add('is-hidden');
      originalPortrait.classList.remove('is-hidden');
      if (container) {
        container.classList.add('portrait-container--original-mode');
      }

      if (iconSpan && labelSpan) {
        iconSpan.textContent = '≡';
        labelSpan.textContent = 'View ASCII Art';
      } else {
        toggleBtn.textContent = '≡ View ASCII Art';
      }

      toggleBtn.title = 'Toggle between ASCII and original art';
    } else {
      // Switch to ASCII
      asciiPortrait.classList.remove('is-hidden');
      originalPortrait.classList.add('is-hidden');
      if (container) {
        container.classList.remove('portrait-container--original-mode');
      }

      if (iconSpan && labelSpan) {
        iconSpan.textContent = '◉';
        labelSpan.textContent = 'View Original Art';
      } else {
        toggleBtn.textContent = '◉ View Original Art';
      }

      toggleBtn.title = 'Toggle between ASCII and original art';
    }
  },

  /**
   * (Deprecated) Kept for backwards compatibility. The shared character sheet
   * now applies the default portrait view (ASCII vs Original) during initial
   * render based on StorageService.getPortraitViewMode(), so this helper is
   * no longer needed. It is intentionally a no-op.
   */
  _applyPreferredPortraitViewBuilder(character) {
    try {
      const asciiPortrait = document.getElementById('character-portrait');
      const originalPortrait = document.getElementById('original-portrait');
      if (!asciiPortrait || !originalPortrait) return;

      const container = asciiPortrait.closest('.portrait-container');

      // Respect global preference (shared with manager).
      let portraitViewMode = 'original';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal
      }

      // Only show the original image if we actually have a URL resolved for it.
      let hasOriginalUrl = false;
      try {
        if (window.CharacterSheet && typeof CharacterSheet.getOriginalPortraitUrl === 'function') {
          hasOriginalUrl = !!CharacterSheet.getOriginalPortraitUrl(character);
        } else {
          hasOriginalUrl = !!originalPortrait.getAttribute('src');
        }
      } catch (e) {
        hasOriginalUrl = !!originalPortrait.getAttribute('src');
      }

      if (portraitViewMode === 'original' && hasOriginalUrl) {
        asciiPortrait.classList.add('is-hidden');
        originalPortrait.classList.remove('is-hidden');
        if (container) {
          container.classList.add('portrait-container--original-mode');
        }
      } else {
        asciiPortrait.classList.remove('is-hidden');
        originalPortrait.classList.add('is-hidden');
        if (container) {
          container.classList.remove('portrait-container--original-mode');
        }
      }
    } catch (e) {
      // Non-fatal: if anything goes wrong, don't block the render path.
      console.warn('App._applyPreferredPortraitViewBuilder failed', e);
    }
  },

  // Track if we've shown the guest save notice this session
  _guestSaveNoticeShown: false,

  // Explicit save entry point for the completion screen.
  async saveCharacter(showMessage = true) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character || !window.StorageService) {
      this.showSystemMessage(
        'Unable to save character right now. Please try again shortly.',
      );
      return;
    }

    // In demo mode, check if user has reached the character limit (for new characters only)
    if (!character.id && window.DemoCharacters && DemoCharacters.hasReachedCharacterLimit()) {
      const limit = DemoCharacters.DEMO_MAX_USER_CHARACTERS;
      this.showSystemMessage(
        'You\'ve reached the limit of ' + limit + ' characters in guest mode. ' +
        '<a href="#" onclick="showAuthModal(); showLoginForm(); return false;" class="terminal-link">Log in</a> or ' +
        '<a href="#" onclick="showAuthModal(); showRegisterForm(); return false;" class="terminal-link">create a free account</a> to save unlimited characters!'
      );
      return;
    }

    // Validate character has minimum required fields before saving
    if (!character.name || !character.race || !character.class) {
      if (showMessage) {
        this.showSystemMessage(
          'Character must have at least a name, race, and class before saving.',
        );
      }
      return;
    }

    try {
      console.log('💾 Saving character to shared storage (explicit save)...');
      // Saving should be a non-disruptive action – we don't want to re-animate
      // the ASCII portrait when the only change is an assigned ID/timestamps.
      this._suppressNextPortraitAnimation = true;

      // Build a complete character snapshot with derived stats (AC, speed, etc.)
      const completeCharacter = this.buildCompleteCharacter(character);
      const saved = await window.StorageService.saveCharacter(completeCharacter);
      CharacterState.updateCharacter(saved);

      // Clear the in-progress session since character is now saved
      CharacterState.clearSession();

      if (showMessage) {
        // Use a short, non-intrusive toast instead of an inline narrator system line.
        this.showToast('Character saved');
      }

      // Focus the "Create Another Character" button for keyboard navigation
      const newBtn = document.getElementById('completion-new-btn');
      if (newBtn) {
        newBtn.focus();
      }

      // Show reminder to log in if in guest mode (only once per session)
      if (!this._guestSaveNoticeShown && window.AuthService && !window.AuthService.isAuthenticated()) {
        this._guestSaveNoticeShown = true;
        // Set flag to show guest notice banner when returning to character manager
        sessionStorage.setItem('showGuestNoticeOnReturn', 'true');
        setTimeout(() => {
          this.showNotification('💡 Log in or create an account to save your character to the cloud', 'info');
        }, 1000);
      }
    } catch (error) {
      console.error('Error saving character:', error);
      this.showSystemMessage('Save failed: ' + error.message);
    }
  },

  buildCompleteCharacter(character) {
    // Get data from DND_DATA
    const race = DND_DATA.races.find((r) => r.id === character.race);
    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const background = DND_DATA.backgrounds.find((b) => b.id === character.background);

    // Calculate ability modifiers
    const abilityMods = {
      str: Utils.abilityModifier(character.abilities.str),
      dex: Utils.abilityModifier(character.abilities.dex),
      con: Utils.abilityModifier(character.abilities.con),
      int: Utils.abilityModifier(character.abilities.int),
      wis: Utils.abilityModifier(character.abilities.wis),
      cha: Utils.abilityModifier(character.abilities.cha)
    };

    // Calculate derived stats
    const proficiencyBonus = Math.ceil(character.level / 4) + 1;
    const initiative = abilityMods.dex;
    // Prefer any armorClass already stored on the character (e.g., from builder),
    // otherwise derive a reasonable default based on class + abilities + armor.
    const armorClass =
      character.armorClass != null
        ? character.armorClass
        : KeyboardNav.calculateArmorClassForClass(
            character.class,
            character.abilities,
            character.armorCategory,
            character.hasShield,
          );
    const speed = race?.speed || 30;

    // Calculate HP (if not already set)
    const hitPoints = character.hitPoints || (classData ? classData.hitDie + abilityMods.con : 0);

    // Build skill modifiers
    const skills = {};
    if (character.skillProficiencies) {
      character.skillProficiencies.forEach(skill => {
        const abilityForSkill = this.getSkillAbility(skill);
        const abilityMod = abilityMods[abilityForSkill];
        skills[skill] = abilityMod + proficiencyBonus;
      });
    }

    // Build starting armor items based on armorCategory/hasShield
    // Note: armor helpers live on `KeyboardNav` for now, so call through that namespace.
    const armorItems = KeyboardNav.getStartingArmorItems(
      character.class,
      character.armorCategory,
      character.hasShield,
    );

    // Merge armor items into explicit equipment (without duplicating)
    const explicitEquipment = [...(character.equipment || [])];
    armorItems.forEach((item) => {
      if (!explicitEquipment.includes(item)) {
        explicitEquipment.push(item);
      }
    });

    // Get portrait data
    const portraitContainer = document.getElementById('character-portrait');
    const portraitElement = portraitContainer
      ? portraitContainer.querySelector('pre')
      : null;
    const asciiArt = portraitElement
      ? portraitElement.textContent
      : portraitContainer
      ? portraitContainer.textContent.trim()
      : null;
    
    const originalPortrait = character.portrait?.url || character.portraitUrl || character.originalPortraitUrl || null;
    
    // Get ASCII art from various possible sources
    const portraitAscii = character.customPortraitAscii || character.asciiPortrait || asciiArt || null;

    // Ensure character has a stable UID for cross-app identity
    let stableUid = character.characterUid;
    if (!stableUid) {
      stableUid = `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({ characterUid: stableUid });
      } else {
        character.characterUid = stableUid;
      }
    }

    // Build complete character object
    return {
      // Export metadata (used by Character Manager to detect true duplicates)
      metadata: {
        exportVersion: '1.1',
        exportDate: new Date().toISOString(),
        exportedBy: 'DandDy Character Builder v1.4',
        characterUid: stableUid,
        source: 'builder',
      },

      // Basic info (original)
      ...character,

      // Normalized portrait object for compatibility with character manager
      portrait: portraitAscii || originalPortrait ? {
        ascii: portraitAscii,
        url: originalPortrait
      } : null,

      // Calculated stats
      abilityModifiers: abilityMods,
      proficiencyBonus,
      initiative,
      armorClass,
      speed,
      hitPoints,
      armorCategory: character.armorCategory || null,
      hasShield: !!character.hasShield,

      // Skills with modifiers
      skillModifiers: skills,

      // Saving throws
      savingThrows: classData?.savingThrows || [],
      savingThrowModifiers: this.calculateSavingThrows(abilityMods, classData?.savingThrows || [], proficiencyBonus),

      // Derived data from DND_DATA
      raceData: race ? {
        name: race.name,
        size: race.size,
        speed: race.speed,
        traits: race.traits,
        languages: race.languages
      } : null,

      classData: classData ? {
        name: classData.name,
        hitDie: classData.hitDie,
        primaryAbility: classData.primaryAbility,
        savingThrows: classData.savingThrows,
        skills: classData.skills,
        equipment: classData.equipment,
        spellcaster: classData.spellcaster || false
      } : null,

      backgroundData: background ? {
        name: background.name,
        description: background.description,
        feature: background.feature,
        skillProficiencies: background.skillProficiencies,
        toolProficiencies: background.toolProficiencies,
        languages: background.languages,
        equipment: background.equipment
      } : null,

      // Equipment (including any inferred armor/shield items)
      equipment: explicitEquipment,

      // Portrait data
      portrait: {
        ascii: asciiArt,
        original: originalPortrait
      }
    };
  },

  getSkillAbility(skill) {
    const skillAbilities = {
      'acrobatics': 'dex',
      'animal-handling': 'wis',
      'arcana': 'int',
      'athletics': 'str',
      'deception': 'cha',
      'history': 'int',
      'insight': 'wis',
      'intimidation': 'cha',
      'investigation': 'int',
      'medicine': 'wis',
      'nature': 'int',
      'perception': 'wis',
      'performance': 'cha',
      'persuasion': 'cha',
      'religion': 'int',
      'sleight-of-hand': 'dex',
      'stealth': 'dex',
      'survival': 'wis'
    };
    return skillAbilities[skill] || 'str';
  },

  calculateSavingThrows(abilityMods, savingThrows, proficiencyBonus) {
    const saves = {};
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
      const isProficient = savingThrows.includes(ability);
      saves[ability] = abilityMods[ability] + (isProficient ? proficiencyBonus : 0);
    });
    return saves;
  },

  printCharacterSheet() {
    const panel = document.getElementById('character-panel');
    if (!panel || !panel.querySelector('.character-sheet')) {
      this.showSystemMessage('No character sheet to print yet.');
      return;
    }

    // Defer to the browser's print dialog, with print-specific CSS handling
    // what is visible on the page.
    window.print();
  },

  // Render a system-style message in the narrator panel instead of using
  // window.alert. Keeps all feedback in-universe.
  showSystemMessage(text) {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(`<span class="text-warning">[ SYSTEM ] ${text}</span>`),
    );
    Utils.scrollToBottom(true);
  },

  // Toast used for quick, non-blocking feedback (e.g. "Prompt copied"), anchored to the terminal container.
  showToast(rawMessage, duration = 4000) {
    const message = (rawMessage == null) ? '' : String(rawMessage);
    // Remove any leading glyphs (checkmarks, warning icons, etc.) so builder
    // toasts stay clean and rely only on text + the "×" close button. Also
    // trim stray leading/trailing whitespace so messages render cleanly.
    const cleanedMessage = message
      .replace(
        /^[\s\u200b]*(?:[✓✔✕✖✗★⚠💡❌⏰🔌]+[\s\u00a0\u200b]*)+/u,
        ''
      )
      .trim();

    // Normalize overly-emphatic punctuation so toast messages stay calm and
    // readable. We keep question marks intact but strip trailing exclamation
    // marks (including "!!" etc.) which tend to feel shouty in short toasts.
    const displayMessage = cleanedMessage
      // Collapse any run of exclamation marks to a single one
      .replace(/!{2,}/g, '!')
      // Remove a trailing exclamation mark (or run of them) while preserving
      // any final period or closing paren that may follow.
      .replace(/!+(\s*[\.\)])?$/u, '$1')
      .trim();

    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'toast-notification';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      // Inner structure: message + dismiss "X" pinned to the right in its own wrapper
      // The inner span gets the shared spin treatment used elsewhere in the app.
      toast.innerHTML = `
        <span class="toast-message"></span>
        <div class="toast-dismiss-wrapper">
          <button type="button" class="toast-dismiss" aria-label="Dismiss notification">
            <span class="toast-dismiss-icon">&times;</span>
          </button>
        </div>
      `;

      const container = document.querySelector('.terminal-container') || document.body;
      container.appendChild(toast);

      const dismissBtn = toast.querySelector('.toast-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          toast.classList.remove('show');
          // Clear any pending show/hide timers
          if (App._toastShowTimeout) {
            clearTimeout(App._toastShowTimeout);
            App._toastShowTimeout = null;
          }
          if (App._toastTimeout) {
            clearTimeout(App._toastTimeout);
            App._toastTimeout = null;
          }
        });
      }
    }

    const messageEl = toast.querySelector('.toast-message');
    if (messageEl) {
      messageEl.textContent = displayMessage;
    } else {
      // Fallback in case markup is missing for any reason
      toast.textContent = displayMessage;
    }

    // Reset any in-flight timers so we can replay the entrance animation
    if (App._toastShowTimeout) {
      clearTimeout(App._toastShowTimeout);
      App._toastShowTimeout = null;
    }
    if (App._toastTimeout) {
      clearTimeout(App._toastTimeout);
      App._toastTimeout = null;
    }

    // Ensure we start from the hidden state so the transition always plays,
    // even immediately after a page reload.
    toast.classList.remove('show');
    // Force a reflow so the browser acknowledges the hidden state
    // before we add the "show" class.
    void toast.offsetWidth; // eslint-disable-line no-unused-expressions

    App._toastShowTimeout = setTimeout(() => {
      toast.classList.add('show');
      App._toastShowTimeout = null;

      // Auto-dismiss after specified duration (default 4s for success messages)
      App._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        App._toastTimeout = null;
      }, duration);
    }, 80);
  },

  // ===== LEVEL CHANGE =====
  openLevelModal() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const currentLevel = character.level || 1;

    const modalHTML = `
      <div id="levelModal" class="modal show" onclick="App.closeLevelModal()">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Change Character Level</h2>
            <button class="modal-close" onclick="App.closeLevelModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Changing level will <span class="terminal-text-strong">adjust your ability scores and hit points</span>
              as if your character had gained Ability Score Increases at higher levels.
            </p>
            <p class="terminal-text-small terminal-text-dim">
              This cannot be undone. Choose a new level between 1 and 99.
            </p>
            <div class="level-modal-row modal-section">
              <label for="level-input" class="terminal-text-small modal-section-label">New Level:</label>
              <input
                type="number"
                id="level-input"
                class="terminal-input"
                min="1"
                max="99"
                value="${currentLevel}"
              >
            </div>
            <div id="level-modal-error" class="terminal-text-error level-modal-error is-hidden"></div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closeLevelModal()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmLevelModal()">APPLY LEVEL</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('levelModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._levelModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeLevelModal();
    };
    document.addEventListener('keydown', this._levelModalEscHandler);
  },

  closeLevelModal() {
    const modal = document.getElementById('levelModal');
    if (!modal) {
      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  async confirmLevelModal() {
    const input = document.getElementById('level-input');
    if (!input) {
      this.closeLevelModal();
      return;
    }

    const errorEl = document.getElementById('level-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    let newLevel = parseInt(input.value, 10);
    if (isNaN(newLevel) || newLevel < 1 || newLevel > 99) {
      showError('Level must be a number between 1 and 99.');
      return;
    }

    clearError();

    this.closeLevelModal();
    await this.applyLevelChange(newLevel);
  },

  async applyLevelChange(newLevel) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const race = DND_DATA.races.find((r) => r.id === character.race);

    if (!classData || !race) {
      this.showSystemMessage(
        'Unable to change level because race or class data is missing.',
      );
      return;
    }

    // Start from base (level 1) abilities, falling back to current if missing
    const base = character.baseAbilities || character.abilities;
    let abilities = { ...base };

    // Simulate Ability Score Increases at levels 4, 8, 12, 16, 19
    const asiLevels = [4, 8, 12, 16, 19];
    const asiCount = asiLevels.filter((lvl) => lvl <= newLevel).length;
    let remainingPoints = asiCount * 2;

    const primary = classData.primaryAbility?.[0] || 'str';
    const secondary = classData.primaryAbility?.[1] || null;

    // Distribute ASI points across primary/secondary, capped at 20
    while (remainingPoints > 0) {
      const candidates = [];
      if (abilities[primary] < 20) candidates.push(primary);
      if (secondary && abilities[secondary] < 20) candidates.push(secondary);

      if (candidates.length === 0) {
        break;
      }

      const target = candidates[0];
      abilities[target] += 1;
      remainingPoints -= 1;
    }

    // Approximate HP across levels:
    // Level 1: full hit die + CON mod
    // Each additional level: average die (rounded up) + CON mod
    const conMod = Utils.abilityModifier(abilities.con);
    const baseHP = classData.hitDie + conMod;
    const averageDie = Math.floor(classData.hitDie / 2) + 1;
    const perLevel = Math.max(1, averageDie + conMod);
    const hitPoints =
      newLevel <= 1 ? baseHP : baseHP + (newLevel - 1) * perLevel;

    // Recalculate Armor Class based on updated abilities + existing armor loadout
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      character.class,
      abilities,
      character.armorCategory,
      character.hasShield,
    );

    CharacterState.updateCharacter({
      level: newLevel,
      abilities,
      hitPoints,
      armorClass,
    });

    this.showSystemMessage(
      `Level set to ${newLevel}. Ability scores and hit points have been re-rolled.`,
    );

    // Persist level/stat changes so manager stays in sync
    await this.persistIfAlreadySaved();
  },

  // ===== NAME CHANGE =====
  openNameModal() {
    const state = CharacterState.get();
    const character = state.character;

    const currentName = character.name || '';

    const modalHTML = `
      <div id="nameModal" class="modal show" onclick="App.closeNameModal()">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Change Character Name</h2>
            <button class="modal-close" onclick="App.closeNameModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Enter a new name for your character.
            </p>
            <div class="name-modal-row modal-section">
              <label for="name-input" class="terminal-text-small modal-section-label">New Name:</label>
              <input
                type="text"
                id="name-input"
                class="terminal-input name-modal-input"
                value="${currentName}"
                placeholder="Enter character name"
              >
            </div>
            <div id="name-modal-error" class="terminal-text-error name-modal-error is-hidden"></div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closeNameModal()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmNameModal()">APPLY NAME</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('nameModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._nameModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeNameModal();
    };
    document.addEventListener('keydown', this._nameModalEscHandler);
  },

  closeNameModal() {
    const modal = document.getElementById('nameModal');
    if (!modal) {
      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  async confirmNameModal() {
    const input = document.getElementById('name-input');
    if (!input) {
      this.closeNameModal();
      return;
    }

    const errorEl = document.getElementById('name-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    const newName = input.value.trim();
    if (!newName) {
      showError('Name cannot be empty.');
      return;
    }

    clearError();

    this.closeNameModal();
    await this.applyNameChange(newName);
  },

  async applyNameChange(newName) {
    // Update the character name in state (this will trigger observers)
    CharacterState.updateCharacter({ name: newName });

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(
        `Character renamed to "${newName}". Identity crisis averted.`,
      ),
    );
    Utils.scrollToBottom(true);

    // Persist rename so manager sees updated name
    await this.persistIfAlreadySaved();
  },

  // ===== QUICK CREATE MODE =====
  
  // Generate AI portrait for quick-create mode (runs in background)
  async _generateQuickCreatePortrait() {
    try {
      const stateAfter = CharacterState.get();
      const currentChar = stateAfter.character || {};

      if (!CONFIG.ENABLE_AI || !currentChar.race || !currentChar.class || !window.AsciiArtService) {
        return;
      }

      // Wait for DOM to update before trying to render the loader.
      // The character sheet may not exist yet if state changes are still pending.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      let portraitEl = document.getElementById('character-portrait');

      // Retry a few times if the element doesn't exist yet (DOM may still be updating)
      if (!portraitEl) {
        for (let i = 0; i < 5 && !portraitEl; i++) {
          await Utils.sleep(100);
          portraitEl = document.getElementById('character-portrait');
        }
      }

      // Show a loading state in the portrait panel while the AI image
      // is being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(currentChar);

      if (result && result.asciiArt) {
        const currentCount = currentChar.customPortraitCount || 0;

        // Get the current style theme for tagging
        let quickStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            quickStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
        }

        // Capture the model and quality that were used for generation
        let generationModel = 'dall-e-3';
        let generationQuality = null;
        try {
          if (window.StorageService && typeof StorageService.getImageModel === 'function') {
            generationModel = StorageService.getImageModel();
          } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
            generationModel = CONFIG.DEFAULT_IMAGE_MODEL;
          }
          if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
            generationQuality = StorageService.getImageQuality(generationModel);
          }
        } catch (e) {
          // Non-fatal: use defaults
        }

        const updatedMetadata = window.PortraitHistory
          ? window.PortraitHistory.addVersion(
              currentChar,
              result.asciiArt,
              result.imageUrl || null,
              {
                source: 'quick-ai',
                prompt:
                  (AIService.buildPortraitPrompt &&
                    AIService.buildPortraitPrompt(currentChar)) ||
                  null,
                style: quickStyle,
                model: generationModel,
                quality: generationQuality,
              },
            )
          : currentChar.portraitMetadata || {};

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Quick-create AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Quick Create Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          "You've reached today's portrait limit, so we're using a simple fallback portrait for now. You can create a custom one tomorrow from the character sheet.",
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a simple fallback portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a basic portrait to fall back to.
      await this._ensurePreGeneratedPortraitFallback(currentChar, { force: true });
    } finally {
      // Whatever happens above (success or failure), stop the animated dots
      // and restore portrait font size so the ASCII art uses CSS defaults.
      this._stopPortraitLoadingAnimation();
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  async quickCreateCharacter() {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;

    // Clear any existing content for a clean quick-create experience
    narratorPanel.innerHTML = '';
    
    // Reset portrait tracking to ensure animation happens
    this._lastPortraitArt = null;

    // In quick-create, we never want to show pre-generated portrait templates.
    // Start by clearing any existing portrait fields on the in-progress
    // character so the sheet renders with *no* art until custom AI kicks in.
    if (window.CharacterState && typeof CharacterState.updateCharacter === 'function') {
      CharacterState.updateCharacter({
        asciiPortrait: null,
        asciiPortraitKey: null,
        customPortraitAscii: null,
        originalPortraitUrl: null,
        portrait: null,
        portraitMetadata: null,
        customPortraitCount: 0,
      });
    }

    // Intro message for quick create (narrator-specific)
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const introEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      introEl,
      narrator.quickCreateIntro,
    );
    Utils.scrollToBottom(true);

    // Randomly choose race, class, background, alignment, sex
    const race = Utils.randomChoice(DND_DATA.races);
    const cls = Utils.randomChoice(DND_DATA.classes);
    const background = Utils.randomChoice(DND_DATA.backgrounds);
    const alignment = Utils.randomChoice(DND_DATA.alignments);
    const sex = Utils.randomChoice(['male', 'female']);

    // Roll abilities using the existing rollAbility helper and apply racial bonuses
    let abilities = {
      str: this.rollAbility(),
      dex: this.rollAbility(),
      con: this.rollAbility(),
      int: this.rollAbility(),
      wis: this.rollAbility(),
      cha: this.rollAbility(),
    };

    Object.keys(race.abilityBonuses).forEach((ability) => {
      abilities[ability] += race.abilityBonuses[ability];
    });

    // Infer a coarse armor loadout from class equipment using the shared
    // helpers on KeyboardNav (where armor logic lives).
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      cls.id,
    );

    // Calculate HP for level 1
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = cls.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      cls.id,
      abilities,
      armorCategory,
      hasShield,
    );

    // Try to auto-generate name + backstory in a SINGLE API call
    // (uses the combined /characters/summary endpoint to save rate limit)
    let name = '';
    let backstory = '';
    
    // Show thinking message for name + backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const thinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(thinkingEl);
    
    try {
      // Build a temporary character object for the summary call
      const tempChar = {
        race: race.id,
        class: cls.id,
        background: background.id,
        alignment: alignment.id,
        sex: sex,
      };
      const summary = await AIService.generateCharacterSummary(tempChar, { nameCount: 3 });
      
      // Pick a random name from suggestions
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        name = Utils.randomChoice(summary.names);
      }
      
      // Substitute {{NAME}} in the backstory template
      if (summary && summary.backstoryTemplate) {
        backstory = summary.backstoryTemplate.replace(/\{\{NAME\}\}/g, name || 'The adventurer');
      }
    } catch (e) {
      // Ignore AI errors; we'll fall back below
      console.error('Quick create summary error:', e);
    }
    
    // Stop thinking and remove the message
    this.stopProgressiveThinking();
    thinkingEl.parentElement.remove();

    // Fallback name if AI failed
    if (!name) {
      const fallbackNames = [
        'Ashen Vale',
        'Rin Thorn',
        'Kael Brightwind',
        'Lyra Nightbloom',
      ];
      name = Utils.randomChoice(fallbackNames);
    }
    
    // Fallback backstory if AI failed
    if (!backstory) {
      backstory =
        'A mysterious past, a questionable present, and a future that depends entirely on your dice.';
    }

    // Set flag BEFORE state update so updateCharacterPanel knows to show the loader
    // instead of any stale/fallback image. The actual generation promise is set
    // later, but this flag tells the panel "generation is coming".
    this._quickCreatePortraitPending = true;

    // Update character state with all basic info at once to avoid multiple renders
    CharacterState.updateCharacter({
      race: race.id,
      class: cls.id,
      background: background.id,
      alignment: alignment.id,
      sex: sex,
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
      name,
      backstory,
      // Apply background benefits
      skillProficiencies: background.skillProficiencies || [],
      toolProficiencies: background.toolProficiencies || [],
      equipment: background.equipment || [],
      backgroundFeature: background.feature || null,
      languageChoices: background.languages || 0,
    });
    CharacterState.set({ abilityMethod: 'roll' });

    // Show a short summary of what we picked (narrator-specific)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const summaryEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      summaryEl,
      narrator.quickCreateSummary(race.name, cls.name, background.name, alignment.name, sex.charAt(0).toUpperCase() + sex.slice(1)),
    );
    Utils.scrollToBottom(true);

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(nameEl, narrator.quickCreateName(name));
    Utils.scrollToBottom(true);

    // Start generating AI portrait in background now (runs while backstory displays)
    // IMPORTANT: Render the loader immediately (synchronously) before starting async generation
    // to avoid race conditions where state updates overwrite the loader.
    const portraitEl = document.getElementById('character-portrait');
    if (portraitEl) {
      this._renderPortraitGeneratingLoader(portraitEl);
    }
    // Clear the pending flag now that we're starting the actual generation
    this._quickCreatePortraitPending = false;
    this._quickCreatePortraitGeneration = this._generateQuickCreatePortrait();

    // Show thinking message for backstory (just displaying, no API call needed)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    
    // Show the actual backstory
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(1500);
    backstoryThinkingEl.classList.remove('is-waiting');

    // Auto-select spells if character is a spellcaster
    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(cls.id)) {
      const spells = SPELL_DATA.getQuickModeSpells(cls.id);
      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(cls.id);
        CharacterState.updateCharacter({
          spellcastingAbility: config.ability,
          cantrips: spells.cantrips,
          spellsKnown: spells.firstLevel,
          spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
          spellSlots: config.spellSlots,
        });
        
        // Show a brief message about spell selection
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        const spellsEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        await Utils.typewriter(
          spellsEl,
          `>${' '}Auto-selected ${spells.cantrips.length}${' '}cantrip${spells.cantrips.length !== 1 ? 's' : ''}${' '}and ${spells.firstLevel.length}${' '}1st level spell${spells.firstLevel.length !== 1 ? 's' : ''}${' '}for your ${cls.name}.`,
        );
        Utils.scrollToBottom(true);
        
        await Utils.sleep(1000);
      }
    }

    // Wait for portrait generation to complete (if it was started)
    if (this._quickCreatePortraitGeneration) {
      try {
        await this._quickCreatePortraitGeneration;
      } catch (error) {
        // Error already handled in _generateQuickCreatePortrait
      }
      this._quickCreatePortraitGeneration = null;
    }

    // Jump straight to the completion screen
    const completeQuestion = QUESTIONS.find((q) => q.id === 'complete');
    if (completeQuestion) {
      await this.showComplete(completeQuestion);
    }
  },

  startNew() {
    const state = CharacterState.get();
    const character = state.character;

    // Only prompt to save if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Ask the user if they want to save before starting over.
      this.showConfirmationOverlay(
        'You have not saved this character yet. What would you like to do?',
        async () => {
          // User chose SAVE: first attempt to save; if save fails, we keep the current character.
          await this.saveCharacter(true);

          // Re-check that we now have an ID before clearing.
          const latest = CharacterState.get().character;
          if (!latest || !latest.id) {
            this.showSystemMessage(
              'Character was not saved. Staying on the current character.',
            );
            return;
          }

          this._startNewInternal();
        },
        () => {
          // User chose DISCARD: start a fresh character without saving.
          this._startNewInternal();
        },
        {
          primaryLabel: 'SAVE',
          secondaryLabel: 'DISCARD',
          // Both CTAs use the secondary visual style in this flow.
          primaryClass: 'terminal-btn',
        },
      );
    } else {
      // Character is already saved or incomplete; immediately start a new one.
      this._startNewInternal();
    }
  },

  _startNewInternal() {
    // User confirmed: clear current character and restart flow.
    // Clear panels BEFORE resetting state so the state change listener can properly re-render
    const narratorPanel = document.getElementById('narrator-panel');
    const characterPanel = document.getElementById('character-panel');
    if (narratorPanel) narratorPanel.innerHTML = '';
    
    // Reset state and caches
    CharacterState.reset();
    OptionVariationsCache.reset();
    if (window.AIService && typeof AIService.resetNarratorSession === 'function') {
      AIService.resetNarratorSession();
    }
    this._lastPortraitArt = null; // Reset portrait tracking for new character
    
    // Don't manually clear character panel - let the state change listener handle it
    // The CharacterState.reset() above will trigger updateCharacterPanel via the subscriber
    
    // Skip intro and go directly to entry-mode for returning users
    this.showQuestion('entry-mode');
  },

  showConfirmationOverlay(message, onConfirm, onCancel, options) {
    // Support old signature where third param was an options object:
    // showConfirmationOverlay(message, onConfirm, { ...options })
    if (
      options === undefined &&
      typeof onCancel === 'object' &&
      onCancel !== null
    ) {
      options = onCancel;
      onCancel = null;
    }

    options = options || {};

    const targetSelector = options.targetSelector;
    const primaryLabel = options.primaryLabel || 'YES';
    const secondaryLabel =
      options.secondaryLabel === undefined ? 'NO' : options.secondaryLabel;
    const hideSecondary = Boolean(options.hideSecondary);
    const primaryClass =
      options.primaryClass || 'terminal-btn terminal-btn-primary';
    const secondaryClass = options.secondaryClass || 'terminal-btn';

    // While a confirmation dialog is open, pause keyboard navigation so
    // arrow keys don't move focus behind the modal.
    KeyboardNav.deactivate();

    const secondaryBtnHTML =
      hideSecondary || secondaryLabel === null
        ? ''
        : `<button class="${secondaryClass}" id="confirm-no">${secondaryLabel}</button>`;

    const overlayHTML = `
      <div id="confirmationModal" class="modal show confirmation-overlay">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Confirm</h2>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              ${message}
            </p>
          </div>
          <div class="modal-footer modal-footer-end">
            ${secondaryBtnHTML}
            <button class="${primaryClass}" id="confirm-yes">${primaryLabel}</button>
          </div>
        </div>
      </div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', overlayHTML);

    const overlay = document.getElementById('confirmationModal');
    const primaryBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-no');

    // Mark this overlay as "just opened" so the same Enter key event that
    // triggered it does NOT immediately auto-confirm. The flag is cleared
    // on the next tick.
    overlay.classList.add('just-opened');
    setTimeout(() => {
      if (overlay && overlay.classList) {
        overlay.classList.remove('just-opened');
      }
    }, 0);

    // Move keyboard focus into the modal so Enter presses are scoped correctly.
    if (primaryBtn) {
      primaryBtn.focus();
    }

    const runCloseAnimation = (onClosed) => {
      if (!overlay || overlay.classList.contains('closing')) {
        return;
      }

      overlay.classList.add('closing');

      const content = overlay.querySelector('.modal-content') || overlay;

      const handleClose = () => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }

        // Reactivate keyboard navigation now that the modal is gone.
        KeyboardNav.activate();

        if (typeof onClosed === 'function') {
          onClosed();
        }
      };

      if (content && content.addEventListener) {
        content.addEventListener('animationend', handleClose, { once: true });
      } else {
        handleClose();
      }
    };

    primaryBtn.addEventListener('click', () => {
      runCloseAnimation(onConfirm);
    });

    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        runCloseAnimation(onCancel);
      });
    }
  },

  async showChangeConfirmation(questionId, selectedIndex, isListChoice) {
    const message =
      'Changing this answer will reset subsequent choices. Are you sure?';
    const targetSelector = `.question-card[data-question-id="${questionId}"]`;

    this.showConfirmationOverlay(message, async () => {
      // User confirmed change
      const state = CharacterState.get();

      // Find the index of the current question in the QUESTIONS array
      const currentQuestionIndex = QUESTIONS.findIndex(
        (q) => q.id === questionId,
      );

      // Clear answers and character data for all subsequent questions
      for (let i = currentQuestionIndex; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        delete state.answers[q.id];
        if (q.saveTo) {
          CharacterState.updateCharacter({ [q.saveTo]: '' });
        }
      }
      // Remove all narrator content AFTER this question card (dialog + options)
      const narratorPanel = document.getElementById('narrator-panel');
      if (narratorPanel) {
        const anchorCard = narratorPanel.querySelector(targetSelector);
        if (anchorCard) {
          const children = Array.from(narratorPanel.children);
          const anchorIndex = children.indexOf(anchorCard);
          if (anchorIndex !== -1) {
            const toRemove = children.slice(anchorIndex + 1);

            // Fade out downstream elements, then remove them before
            // replaying the flow from this question forward.
            const fadeDurationMs = 400;
            toRemove.forEach((el) => {
              el.classList.add('fade-out');
              // Rely on a simple timeout to guarantee removal
              setTimeout(() => {
                if (el.parentNode) {
                  el.remove();
                }
              }, fadeDurationMs);
            });

            // Wait until after the fade + removal before continuing,
            // so the new branch starts with a clean terminal.
            await Utils.sleep(fadeDurationMs + 50);

            // After cleanup, ensure the anchor question is centered and
            // keyboard navigation starts from that card.
            anchorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }

      // Reset recommendations and option variations cache
      state.recommendations = {};
      OptionVariationsCache.reset();

      // Re-process the selected answer for the current question
      if (isListChoice) {
        await this.handleListAnswer(questionId, selectedIndex);
      } else {
        await this.handleAnswer(questionId, selectedIndex);
      }
    }, { targetSelector });
  },

  // Helper to update status text in header
  updateStatus(text) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  },

  // Character panel renderer (called on state changes)
  async updateCharacterPanel(character) {
    const panel = document.getElementById('character-panel');

    // Determine entry mode (guided vs quick) from shared state so we can
    // adjust portrait behavior. In quick-create we suppress pre-generated
    // portraits until an AI portrait generation has actually started.
    let entryMode = null;
    try {
      if (window.CharacterState && typeof CharacterState.get === 'function') {
        const state = CharacterState.get();
        entryMode = state?.answers?.['entry-mode'] || null;
      }
    } catch (e) {
      // If state lookup fails for any reason, fall back to default behavior.
      entryMode = null;
    }
    const isQuickMode = entryMode === 'quick';
    const isGuidedMode = entryMode === 'guided';

    // If a portrait animation is in progress, queue this update for after animation completes
    if (this._portraitAnimating) {
      this._pendingCharacterUpdate = character;
      return;
    }

    // Avoid redundant re-renders if the character has not actually changed.
    // This keeps us from re-running portrait generation when only transient
    // state (like answers or recommendations) changes.
    try {
      const serialized = JSON.stringify(character);
      if (this._lastRenderedCharacter === serialized) {
        return;
      }
      this._lastRenderedCharacter = serialized;
    } catch (e) {
      // If serialization fails for any reason, fall back to always rendering.
    }
    
    // If we have a race, normally we load a pre-generated portrait
    // (race+class combo or race-only) and fall back to the simple template.
    if (character.race) {
      // In quick-create and co-create (guided) modes, NEVER call the pre-generated 
      // portrait loader. We either show the final custom AI portrait (when available) 
      // or a placeholder message while gathering character information. We explicitly 
      // ignore any asciiPortrait that may have been set by older exports or background 
      // upgrades so templates/pre-generated art never appear during character creation.
      if (isQuickMode || isGuidedMode) {
        // Before custom AI portrait is generated, characters will not yet
        // have a custom portrait. In that case render the sheet with a placeholder
        // message in the portrait area. The placeholder will show:
        // "Your portrait will be generated once we learn more about your character"
        const portraitArt = character.customPortraitAscii || null;

        // Decide whether to animate: only when we have new portrait art that
        // differs from what was last rendered, and we're not explicitly
        // suppressing animation (such as after a save).
        const shouldAnimate =
          !!portraitArt &&
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);

        this._lastPortraitArt = portraitArt || null;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Only show the "★ Custom AI Portrait" button once the initial custom 
        // portrait has been generated and is ready to display. Until then, we 
        // keep the portrait frame but hide the button to avoid suggesting an 
        // action that is already in progress.
        const hasCustomPortrait = !!portraitArt;

        // Always show the portrait container so the placeholder message
        // or custom portrait has a place to render.
        
        // IMPORTANT: If portrait generation is in progress (in either quick or guided mode),
        // we need to preserve the current portrait HTML (the fast-spinning "Generating..." cube).
        // Otherwise the re-render will replace it with the slow "Waiting..." cube.
        // Also check _quickCreatePortraitPending which is set before the state update but
        // before the actual generation promise is assigned.
        const isGenerating =
          !!this._quickCreatePortraitGeneration || !!this._guidedPortraitGenerating || !!this._quickCreatePortraitPending;
        const portraitNode = document.getElementById('character-portrait');
        // Only capture HTML if it's actually the loader (has the --generating class on the cube)
        const hasLoaderRendered = portraitNode && 
          portraitNode.querySelector('.portrait-placeholder-cube--generating');
        const currentPortraitHTML = isGenerating && hasLoaderRendered
          ? portraitNode.innerHTML
          : null;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          null,
          true,
          {
            showGeneratePortraitButton: hasCustomPortrait,
          },
        );

        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Restore the generating state if we captured it, OR render it fresh
        // if we're generating but don't have captured HTML (first render after
        // generation started). This ensures the loader shows even if the sheet
        // is rendered for the first time after portrait generation began.
        if (isGenerating && portraitEl) {
          if (currentPortraitHTML) {
            // Restore previously captured loader HTML
            portraitEl.innerHTML = currentPortraitHTML;
          } else {
            // First render after generation started - render loader fresh
            this._renderPortraitGeneratingLoader(portraitEl);
          }
          // Keep both placeholder + loading classes in sync with the initial
          // loader render so the cube geometry doesn't get distorted after
          // a sheet re-render.
          portraitEl.classList.add('ascii-portrait--placeholder');
          portraitEl.classList.add('ascii-portrait--loading');
          // Ensure the ASCII portrait area is visible (not hidden behind the image)
          portraitEl.classList.remove('is-hidden');
          
          // Hide any existing original image during generation so only the
          // spinning cube loader is visible.
          if (originalPortraitEl) {
            originalPortraitEl.classList.add('is-hidden');
          }
          const portraitContainer = portraitEl.closest('.portrait-container');
          if (portraitContainer) {
            portraitContainer.classList.remove('portrait-container--original-mode');
          }
        }

        if (originalPortraitEl && character.originalPortraitUrl && !isGenerating) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }

        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character so new custom portraits "type in"
            this._portraitAnimating = true;
            this.typePortrait(portraitEl, portraitArt).then(async () => {
              this._portraitAnimating = false;
              // Process any pending updates that came in during animation
              if (this._pendingCharacterUpdate) {
                const pending = this._pendingCharacterUpdate;
                this._pendingCharacterUpdate = null;
                await this.updateCharacterPanel(pending);
              }
            });
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, portraitArt);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        // once elements are wired up so we don't flash the teal background.
        this._applyPreferredPortraitViewBuilder(character);

        return;
      }

      // Legacy mode: Load pre-generated or fallback portrait text
      // This code path is only reached if entryMode is not set (shouldn't happen in normal flow)
      try {
        const portraitArt = await AsciiArtService.generateAIPortrait(character);
        
        // Check again if animation is in progress (might have started while we were loading)
        if (this._portraitAnimating) {
          return;
        }
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);
        
        // If we're about to animate, set the flag BEFORE rendering to prevent race conditions
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = portraitArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Render sheet skeleton, then inject ASCII as text to avoid HTML parsing
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          portraitArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, portraitArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, portraitArt);
            }
          }
        }
      } catch (error) {
        console.error('Error generating portrait:', error);

        // Check again if animation is in progress
        if (this._portraitAnimating) {
          return;
        }

        const fallbackArt = AsciiArtService.getFullPortrait(character);
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== fallbackArt);
        
        // If we're about to animate, set the flag BEFORE rendering
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = fallbackArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          fallbackArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && fallbackArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, fallbackArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
              CharacterSheet.setPortraitContent(portraitEl, fallbackArt);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        this._applyPreferredPortraitViewBuilder(character);
      }
      return;
    }

    // No race yet – show portrait container with placeholder during character creation.
    // Always show the placeholder in builder mode since user is actively creating a character.
    // The placeholder will display: "Your portrait will be generated once we learn more about your character"
    panel.innerHTML = Components.renderCharacterSheet(
      character,
      null,
      true, // Always show portrait placeholder during initial character creation
    );
  },

  // Animate ASCII portrait character-by-character, line-by-line
  async typePortrait(element, portraitText) {
    const lines = portraitText.split('\n');
    // Use a <pre> child element for proper CSS flex centering
    element.innerHTML = '';
    const pre = document.createElement('pre');
    element.appendChild(pre);
    
    let currentText = '';
    const charsPerFrame = 40; // Type multiple characters per frame for speed
    let charCount = 0;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Type characters in batches
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        currentText += line[charIndex];
        charCount++;

        // Update DOM every N characters
        if (charCount >= charsPerFrame) {
          pre.textContent = currentText;
          charCount = 0;
          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      
      // Add newline after each line (except the last)
      if (lineIndex < lines.length - 1) {
        currentText += '\n';
      }
    }
    
    // Final update to ensure all text is shown
    pre.textContent = currentText;
  },

});

// ===== AUTHENTICATION & BOOTSTRAP (builder splash handling) =====

let builderSplashActive = true;

let loadingInterval = null;

function startLoadingAnimation() {
  const statusText = document.getElementById('status-text');
  // Previously showed rotating \"fun\" boot messages; now we keep this area quiet.
  if (statusText) {
    statusText.textContent = '';
  }
}

// Flag to suppress beforeunload warning during intentional navigation
let allowNavigationFlag = false;
window.suppressBeforeunloadWarning = () => {
  allowNavigationFlag = true;
};

// Exit back to the Character Manager app from builder mode
function exitToManager() {
  const state = CharacterState.get();
  const character = state.character;

  // Only prompt to save if character is complete (has name, race, class) and unsaved
  const isComplete = character && character.name && character.race && character.class;
  const hasUnsavedChanges = character && !character.id && isComplete;

  if (hasUnsavedChanges) {
    // Ask the user if they want to save before exiting
    App.showConfirmationOverlay(
      'You have unsaved changes. What would you like to do?',
      async () => {
        // User clicked "SAVE" - attempt to save; if save fails, we stay in the builder
        await App.saveCharacter(true);

        // Re-check that we now have an ID before exiting
        const latest = CharacterState.get().character;
        if (!latest || !latest.id) {
          App.showSystemMessage(
            'Character was not saved. Staying in the builder.',
          );
          return;
        }

        // Character saved successfully, proceed to exit
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      },
      () => {
        // User clicked "DISCARD" - exit without saving
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      },
      {
        primaryLabel: 'SAVE',
        secondaryLabel: 'DISCARD',
        primaryClass: 'terminal-btn',
        secondaryClass: 'terminal-btn'
      }
    );
  } else {
    // Character is already saved or incomplete; immediately exit
    window.suppressBeforeunloadWarning();
    window.location.href = '../index.html?from=builder';
  }
}

function dismissBuilderSplash(instant = false) {
  const splash = document.getElementById('splash-content');
  const mainContent = document.getElementById('main-content');

  if (!splash || !builderSplashActive) return;
  builderSplashActive = false;

  if (instant) {
    splash.classList.add('is-hidden');
    if (mainContent) {
      mainContent.classList.remove('is-hidden');
    }
  } else {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('is-hidden');
      if (mainContent) {
        mainContent.classList.remove('is-hidden');
      }
    }, 300);
  }
}


// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  // Start loading animation
  startLoadingAnimation();
  
  // 🔥 Wake up the backend server early (Render cold start can take 30-50s)
  if (CONFIG.ENABLE_AI) {
    console.log('%c🚀 BOOT: Waking up backend server early...', 'color: #0ff; font-weight: bold');
    AIService.warmupBackend();
  }

  // Show main content immediately (behind splash)
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.remove('is-hidden');
  }

  // Splash screen handlers (press any key / click to begin)
  const splash = document.getElementById('splash-content');
  if (splash) {
    const keyHandler = (e) => {
      if (!builderSplashActive) return;
      e.preventDefault();
      e.stopPropagation();
      dismissBuilderSplash();
    };

    window.addEventListener('keydown', keyHandler);
    splash.addEventListener('click', () => dismissBuilderSplash(), { once: true });
  }

  // Initialize the builder app
  await App.init();

  // Stop loading animation once initialized
  if (loadingInterval) {
    clearInterval(loadingInterval);
  }
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = '';
  }

  // Keep narrator panel scrolled to bottom on resize
  window.addEventListener('resize', () => {
    Utils.scrollToBottom();
  });

  // Warn before leaving page if there are unsaved changes
  window.addEventListener('beforeunload', (e) => {
    // Skip warning if navigation is intentional (user clicked DISCARD/SAVE)
    if (allowNavigationFlag) return;

    const state = CharacterState.get();
    const character = state.character;

    // Only prompt if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Modern browsers ignore custom messages and show a generic one
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
      return ''; // Some browsers require a return value
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // Don't interfere if there's any modal open
    if (document.querySelector('.modal.show')) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      KeyboardNav.moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      KeyboardNav.moveDown();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      KeyboardNav.moveLeft();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      KeyboardNav.moveRight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      KeyboardNav.select();
    }
  });

  // When a modal is open, pressing Cmd/Ctrl+Enter should trigger its primary action.
  window.addEventListener('keydown', (e) => {
    if (!(e.key === 'Enter' && (e.metaKey || e.ctrlKey))) return;
    const modal = document.querySelector('.modal.show');
    if (!modal || modal.classList.contains('just-opened')) return;

    // Only trigger the modal's primary action if focus is currently inside
    // the modal.
    const activeElement = document.activeElement;
    if (!activeElement || !modal.contains(activeElement)) return;

    const primaryBtn = modal.querySelector('.modal-footer .terminal-btn-primary');
    if (primaryBtn) {
      e.preventDefault();
      primaryBtn.click();
    }
  });
});


