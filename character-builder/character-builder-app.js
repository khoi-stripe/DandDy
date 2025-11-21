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

const App = (window.App = {
  currentQuestion: null,
  _lastRenderedCharacter: null,

  async init() {
    console.log('Initializing Character Builder...');

    // Subscribe to state changes
    CharacterState.subscribe((state) => {
      this.updateCharacterPanel(state.character);
    });

    // Start the flow
    CharacterState.reset();
    OptionVariationsCache.reset(); // Reset option variations for new character
    this._lastPortraitArt = null; // Reset portrait tracking for new character
    await this.showQuestion('intro');
  },

  // Show progressive "thinking" messages while waiting for AI
  showProgressiveThinking(element) {
    if (!element) return;
    
    // Clear any existing interval
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
    }
    
    let elapsed = 0;
    element.innerHTML = '[<span class="spinner">↻</span>] rolling the dice...';
    
    this._thinkingInterval = setInterval(() => {
      elapsed++;
      
      if (elapsed < 3) {
        element.innerHTML = '[<span class="spinner">↻</span>] rolling the dice...';
      } else if (elapsed < 6) {
        element.innerHTML = '[<span class="spinner">↻</span>] still rolling...';
      } else {
        element.innerHTML = '[<span class="spinner">↻</span>] server waking up... hang tight!';
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
    const narratorPanel = document.getElementById('narrator-panel');

    // Handle different question types
    switch (question.type) {
      case 'message':
        await this.showMessage(question);
        break;
      case 'choice':
        // Entry mode is a special case: show mode options immediately
        // without an extra narrator line.
        if (question.id === 'entry-mode') {
          await this.showEntryMode(question);
        } else {
          await this.showChoice(question);
        }
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
    }
  },

  // Special handler for the entry-mode question: show options immediately
  // without an additional narrator message.
  async showEntryMode(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderQuestion(question),
    );

    KeyboardNav.activate();
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
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

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
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

    // Reorder options: recommended first, then others
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
              <button class="button-primary" onclick="App.handleListAnswer('${question.id}', ${currentIndex})">
                ${opt.text}
              </button>
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
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };

    const optionsHTML = question.options
      .map(
        (opt, index) => `
          <option value="${opt.value}" ${
            index === 0 ? 'selected' : ''
          }>${truncate(opt.text, 45)}</option>
        `,
      )
      .join('');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container ability-method-container">
          <label class="settings-label ability-method-label">Ability generation method:</label>
          <div class="ability-method-controls">
            <select id="ability-method-select" class="input-field ability-method-select">
              ${optionsHTML}
            </select>
            <button class="button-primary ability-method-roll" onclick="App.handleAbilityFromSelect()">
              > ROLL
            </button>
          </div>
        </div>
      </div>`,
    );

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
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

    // Generate name suggestions using AI
    const names = await AIService.generateNames(
      state.character.race,
      state.character.class,
      3,
    );

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
            onkeypress="if(event.key === 'Enter') App.handleCustomName()"
          >
          <button class="button-primary" onclick="App.handleCustomName()">
            SUBMIT
          </button>
        </div>
      </div>`,
    );

    // Store generated names for later reference
    this._generatedNames = names;

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

    // Generate backstory (this might take a moment)
    const backstory = await AIService.generateBackstory(state.character);
    CharacterState.updateCharacter({ backstory });

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

    // NOTE: We don't save here anymore - we wait for portrait to load first
    // This prevents creating duplicate characters in cloud storage

    // Show completion options
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card mt-lg" data-question-id="${question.id}">
        <button class="button-primary completion-export-btn" onclick="App.exportCharacter()">
          > EXPORT CHARACTER (JSON)
        </button>
        <button class="button-primary" onclick="App.startNew()">
          > CREATE ANOTHER CHARACTER
        </button>
      </div>`,
    );
    Utils.scrollToBottom(true);

    // Activate keyboard navigation
    KeyboardNav.activate();

    // Ensure the completed character is saved to shared storage so it shows
    // up in the manager view (cloud or local, depending on auth state).
    try {
      const state = CharacterState.get();
      const character = state.character;
      if (character && window.StorageService) {
        console.log('💾 Saving completed character to shared storage...');
        const saved = await window.StorageService.saveCharacter(character);
        // Update state with any ID or fields returned from backend/local save
        CharacterState.updateCharacter(saved);
        console.log('💾 Completed character saved successfully.');
      }
    } catch (error) {
      console.error('Error saving completed character:', error);
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
    const classData = DND_DATA.classes.find(
      (c) => c.id === state.character.class,
    );

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

    // Apply racial bonuses
    const race = DND_DATA.races.find((r) => r.id === state.character.race);
    Object.keys(race.abilityBonuses).forEach((ability) => {
      abilities[ability] += race.abilityBonuses[ability];
    });

    // Calculate HP (level 1)
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = classData.hitDie + conMod;

    // Store both base (level 1) abilities and current abilities
    CharacterState.updateCharacter({
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
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
    await this.showQuestion(this.currentQuestion.next);
  },

  async handleAbilityFromSelect() {
    const select = document.getElementById('ability-method-select');
    const method = select?.value || 'standard';
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

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}. Sure. Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async openSettings() {
    if (document.getElementById('settingsModal')) return; // Already open

    const settingsHTML = Components.renderSettings();
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', settingsHTML);

    // Check backend status
    this.checkBackendStatus();

    // ESC key to close
    this._settingsEscHandler = (e) => {
      if (e.key === 'Escape') this.closeSettings();
    };
    document.addEventListener('keydown', this._settingsEscHandler);
  },

  async checkBackendStatus() {
    const statusElement = document.getElementById('backend-status');
    if (!statusElement) return;

    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`);
      if (response.ok) {
        const data = await response.json();
        if (data.available) {
          statusElement.textContent = '● Connected & Ready';
          statusElement.style.color = '#0f0';
        } else {
          statusElement.textContent = '▲ Connected (No API Key)';
          statusElement.style.color = '#ff0';
        }
      } else {
        statusElement.textContent = '× Offline';
        statusElement.style.color = '#f00';
      }
    } catch (error) {
      statusElement.textContent = '× Cannot Connect';
      statusElement.style.color = '#f00';
      console.error('Backend status check failed:', error);
    }
  },

  closeSettings() {
    const modal = document.getElementById('settingsModal');
    if (modal) modal.remove();
    
    // Remove ESC key listener
    if (this._settingsEscHandler) {
      document.removeEventListener('keydown', this._settingsEscHandler);
      this._settingsEscHandler = null;
    }
  },

  saveSettings() {
    // Save narrator selection
    const narratorSelect = document.getElementById('narrator-select');
    if (narratorSelect) {
      StorageService.setNarratorId(narratorSelect.value);
    }

    this.showSystemMessage('Settings saved!');
    this.closeSettings();
  },

  async generateCustomAIPortrait() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select both a race and a class before generating a custom portrait.',
      );
      return;
    }

    // Check portrait generation limit (3 per character)
    const portraitCount = character.customPortraitCount || 0;
    if (portraitCount >= 3) {
      this.showSystemMessage(
        'Portrait limit reached. You can generate up to 3 custom AI portraits per character.',
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

  openPromptModal(character) {
    // Show only the character description to the user (not the rendering instructions)
    const defaultPrompt = AIService.buildCharacterDescription
      ? AIService.buildCharacterDescription(character)
      : ''; // backwards compat if renamed
    const modalHTML = `
      <div id="promptModal" class="modal show" onclick="App.closePromptModal(false)">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">★ Customize AI Portrait</h2>
            <button class="modal-close" onclick="App.closePromptModal(false)">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Describe your character's appearance. AI will generate a portrait optimized for ASCII art.
            </p>
            <p class="terminal-text-small terminal-text-dim">
              Be descriptive! (e.g., "a stoic dwarf fighter with a braided beard, holding a glowing axe")
            </p>
            <textarea
              class="terminal-textarea terminal-input"
              id="custom-prompt"
              rows="6"
            >${defaultPrompt}</textarea>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closePromptModal(false)">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmPromptModal()">GENERATE PORTRAIT</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // ESC key to close
    this._promptModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closePromptModal(false);
    };
    document.addEventListener('keydown', this._promptModalEscHandler);
  },

  closePromptModal(regenerate = false) {
    const modal = document.getElementById('promptModal');
    if (modal) modal.remove();

    // Remove ESC key listener
    if (this._promptModalEscHandler) {
      document.removeEventListener('keydown', this._promptModalEscHandler);
      this._promptModalEscHandler = null;
    }

    if (regenerate) {
      // Trigger portrait regeneration if confirmed
      const state = CharacterState.get();
      this.updateCharacterPanel(state.character);
    }
  },

  async confirmPromptModal() {
    const customPromptInput = document.getElementById('custom-prompt');
    const customPrompt = customPromptInput.value.trim();

    if (!customPrompt) {
      this.showSystemMessage('Portrait prompt cannot be empty.');
      return;
    }

    this.closePromptModal(false); // Close modal without regenerating yet

    const portraitEl = document.getElementById('character-portrait');

    // Show progressive loading state
    let portraitElapsed = 0;
    let portraitLoadingInterval = null;
    
    const updatePortraitLoading = () => {
      if (!portraitEl) return;
      
      if (portraitElapsed < 5) {
        portraitEl.innerHTML = `
[<span class="spinner">↻</span>] GENERATING PORTRAIT...


      . . . ( ._.)
      `;
      } else if (portraitElapsed < 15) {
        portraitEl.innerHTML = `
[<span class="spinner">↻</span>] CREATING IMAGE...


      . . . ( ._.)
      `;
      } else if (portraitElapsed < 30) {
        portraitEl.innerHTML = `
[<span class="spinner">↻</span>] CONVERTING TO ASCII...


      . . . ( ._.)
      `;
      } else {
        portraitEl.innerHTML = `
[<span class="spinner">↻</span>] ALMOST DONE...
      
      
      . . . ( ._.)
      `;
      }
      portraitElapsed++;
    };
    
    if (portraitEl) {
      updatePortraitLoading();
      portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
    }

    try {
      // Add rendering instructions to the user's character description
      const renderingInstructions = [
        'Fantasy D&D character portrait',
        'Create a high-contrast, grayscale illustration on a pure black background',
        'Use bold, graphic shapes with thick outlines and minimal fine detail',
        'The image should have bright highlights and deep shadows to maximize tonal separation',
        'Center the subject in the frame and avoid background texture',
        'Style should be simple, iconic, and optimized for ASCII art conversion',
      ];
      
      const fullPrompt = [...renderingInstructions, customPrompt].join(', ');
      
      // Generate custom portrait with full prompt (including hidden rendering instructions)
      const result =
        await AsciiArtService.generateCustomAIPortraitWithPrompt(
          fullPrompt,
        );

      // Store both the original image URL and custom ASCII art in character state
      // Also increment the custom portrait counter
      const currentCount = CharacterState.get().character.customPortraitCount || 0;
      CharacterState.updateCharacter({
        originalPortraitUrl: result.imageUrl,
        customPortraitAscii: result.asciiArt,
        customPortraitCount: currentCount + 1,
      });

      // Stop the loading animation
      if (portraitLoadingInterval) {
        clearInterval(portraitLoadingInterval);
      }

      // Update the last portrait art to trigger animation
      this._lastPortraitArt = null;

      // Re-render to show the toggle button and trigger animation
      const state = CharacterState.get();
      await this.updateCharacterPanel(state.character);
    } catch (error) {
      console.error('Error generating custom AI portrait with prompt:', error);
      
      // Stop the loading animation
      if (portraitLoadingInterval) {
        clearInterval(portraitLoadingInterval);
      }
      
      // Check if it's a rate limit error
      if (error.isRateLimit) {
        this.showSystemMessage(
          'Rate limit exceeded. Please wait a moment before generating another portrait. Try again in a few minutes.',
        );
      } else {
      this.showSystemMessage(
        'Failed to generate custom AI portrait. Falling back to template.',
      );
      }
      
      // Fallback to template
      const state = CharacterState.get();
      if (portraitEl) {
        portraitEl.textContent = AsciiArtService.getFullPortrait(
          state.character,
        );
      }
    }
  },

  togglePortraitView() {
    const asciiPortrait = document.getElementById('character-portrait');
    const originalPortrait = document.getElementById('original-portrait');
    const toggleBtn = document.getElementById('toggle-portrait-btn');

    if (!asciiPortrait || !originalPortrait || !toggleBtn) return;

    const isShowingAscii = asciiPortrait.style.display !== 'none';

    if (isShowingAscii) {
      // Switch to original
      asciiPortrait.style.display = 'none';
      originalPortrait.style.display = 'block';
      toggleBtn.textContent = '≡ View ASCII Art';
      toggleBtn.title = 'Toggle between ASCII and original art';
    } else {
      // Switch to ASCII
      asciiPortrait.style.display = 'block';
      originalPortrait.style.display = 'none';
      toggleBtn.textContent = '◉ View Original Art';
      toggleBtn.title = 'Toggle between ASCII and original art';
    }
  },

  exportCharacter() {
    console.log('🔥 EXPORT CALLED - Starting export process...');
    const state = CharacterState.get();
    console.log('🔥 Raw character state:', state.character);
    
    try {
      const completeCharacter = this.buildCompleteCharacter(state.character);
      console.log('🔥 Complete character built:', completeCharacter);
      console.log('🔥 Portrait data:', completeCharacter.portrait);
      
      const characterJson = JSON.stringify(completeCharacter, null, 2);
      console.log('🔥 JSON length:', characterJson.length);
      
      const blob = new Blob([characterJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${state.character.name || 'dnd-character'}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.innerHTML += Components.renderNarratorMessage(
        'Character exported as JSON with complete stats and ASCII art. Check your downloads!',
      );
      Utils.scrollToBottom(true);
    } catch (error) {
      console.error('🔥 EXPORT ERROR:', error);
      this.showSystemMessage('Export failed: ' + error.message);
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
    const armorClass = 10 + abilityMods.dex; // Base AC (can be enhanced with armor)
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

    // Get portrait data
    const portraitContainer = document.getElementById('character-portrait');
    console.log('🎨 Export Debug - portraitContainer:', portraitContainer);
    console.log('🎨 Export Debug - portraitContainer.textContent:', portraitContainer ? portraitContainer.textContent : 'NO CONTAINER');
    
    const portraitElement = portraitContainer ? portraitContainer.querySelector('pre') : null;
    const asciiArt = portraitElement ? portraitElement.textContent : (portraitContainer ? portraitContainer.textContent.trim() : null);
    console.log('🎨 Export Debug - asciiArt length:', asciiArt ? asciiArt.length : 0);
    console.log('🎨 Export Debug - asciiArt preview:', asciiArt ? asciiArt.substring(0, 100) : 'NULL');
    
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
            <div class="level-modal-row">
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

    // ESC key to close
    this._levelModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeLevelModal();
    };
    document.addEventListener('keydown', this._levelModalEscHandler);
  },

  closeLevelModal() {
    const modal = document.getElementById('levelModal');
    if (modal) modal.remove();
    
    // Remove ESC key listener
    if (this._levelModalEscHandler) {
      document.removeEventListener('keydown', this._levelModalEscHandler);
      this._levelModalEscHandler = null;
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

    CharacterState.updateCharacter({
      level: newLevel,
      abilities,
      hitPoints,
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
            <div class="name-modal-row">
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

    // Focus the input field
    setTimeout(() => {
      const input = document.getElementById('name-input');
      if (input) {
        input.focus();
        input.select();
      }
    }, 100);

    // ESC key to close
    this._nameModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeNameModal();
    };
    document.addEventListener('keydown', this._nameModalEscHandler);
  },

  closeNameModal() {
    const modal = document.getElementById('nameModal');
    if (modal) modal.remove();
    
    // Remove ESC key listener
    if (this._nameModalEscHandler) {
      document.removeEventListener('keydown', this._nameModalEscHandler);
      this._nameModalEscHandler = null;
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
  async quickCreateCharacter() {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;

    // Clear any existing content for a clean quick-create experience
    narratorPanel.innerHTML = '';
    
    // Reset portrait tracking to ensure animation happens
    this._lastPortraitArt = null;

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

    // Randomly choose race, class, background, alignment
    const race = Utils.randomChoice(DND_DATA.races);
    const cls = Utils.randomChoice(DND_DATA.classes);
    const background = Utils.randomChoice(DND_DATA.backgrounds);
    const alignment = Utils.randomChoice(DND_DATA.alignments);

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

    // Calculate HP for level 1
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = cls.hitDie + conMod;

    // Try to auto-generate a name
    let name = '';
    
    // Show thinking message for name generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(nameThinkingEl);
    
    try {
      const names = await AIService.generateNames(race.id, cls.id, 1);
      if (Array.isArray(names) && names[0]) {
        name = names[0];
      }
    } catch (e) {
      // Ignore AI errors; we'll fall back below
    }
    
    // Stop thinking and remove the message
    this.stopProgressiveThinking();
    nameThinkingEl.parentElement.remove();

    if (!name) {
      const fallbackNames = [
        'Ashen Vale',
        'Rin Thorn',
        'Kael Brightwind',
        'Lyra Nightbloom',
      ];
      name = Utils.randomChoice(fallbackNames);
    }

    // Update character state with all basic info at once to avoid multiple renders
    CharacterState.updateCharacter({
      race: race.id,
      class: cls.id,
      background: background.id,
      alignment: alignment.id,
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      name,
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
      narrator.quickCreateSummary(race.name, cls.name, background.name, alignment.name),
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

    // Try to auto-generate a backstory
    let backstory = '';
    
    // Show thinking message for backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(backstoryThinkingEl);
    
    try {
      const current = CharacterState.get();
      backstory = await AIService.generateBackstory(current.character);
    } catch (e) {
      // Simple fallback backstory
      backstory =
        'A mysterious past, a questionable present, and a future that depends entirely on your dice.';
    }
    CharacterState.updateCharacter({ backstory });

    // Stop thinking and clear the message
    this.stopProgressiveThinking();
    backstoryThinkingEl.textContent = '';
    
    // Show the actual backstory
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(1500);
    backstoryThinkingEl.classList.remove('is-waiting');

    // Jump straight to the completion screen
    const completeQuestion = QUESTIONS.find((q) => q.id === 'complete');
    if (completeQuestion) {
      await this.showComplete(completeQuestion);
    }
  },

  startNew() {
    // Show confirmation overlay
    this.showConfirmationOverlay(
      'Are you sure you want to start a new character? All unsaved progress will be lost.',
      () => {
        // User confirmed
        CharacterState.reset();
        OptionVariationsCache.reset();
        if (window.AIService && typeof AIService.resetNarratorSession === 'function') {
          AIService.resetNarratorSession();
        }
        this._lastPortraitArt = null; // Reset portrait tracking for new character
        document.getElementById('narrator-panel').innerHTML = ''; // Clear narrator
        document.getElementById('character-panel').innerHTML = ''; // Clear character sheet
        // Skip intro and go directly to entry-mode for returning users
        this.showQuestion('entry-mode');
      },
    );
  },

  showConfirmationOverlay(message, onConfirm, options = {}) {
    const targetSelector = options.targetSelector;

    // While a confirmation dialog is open, pause keyboard navigation so
    // arrow keys don't move focus behind the modal.
    KeyboardNav.deactivate();

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
            <button class="terminal-btn" id="confirm-no">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" id="confirm-yes">YES</button>
          </div>
        </div>
      </div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', overlayHTML);

    const overlay = document.getElementById('confirmationModal');
    const primaryBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-no');

    // Remove fade-out class to trigger fade-in
    overlay.classList.remove('fade-out');

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

    primaryBtn.addEventListener('click', () => {
      overlay.classList.add('fade-out');
      overlay.addEventListener(
        'animationend',
        () => {
          overlay.remove();
          onConfirm();
          // Reactivate keyboard navigation now that the modal is gone.
          KeyboardNav.activate();
        },
        { once: true },
      );
    });

    cancelBtn.addEventListener('click', () => {
      overlay.classList.add('fade-out');
      overlay.addEventListener(
        'animationend',
        () => {
          overlay.remove();
          // Resume keyboard navigation when the user cancels.
          KeyboardNav.activate();
        },
        { once: true },
      );
    });
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
    
    // If we have a race, always try to load a pre-generated portrait
    // (race+class combo or race-only). Fall back to the simple template.
    if (character.race) {
      try {
        // Load pre-generated or fallback portrait text
        const portraitArt = await AsciiArtService.generateAIPortrait(character);
        
        // Check again if animation is in progress (might have started while we were loading)
        if (this._portraitAnimating) {
          return;
        }
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate = !this._lastPortraitArt || this._lastPortraitArt !== portraitArt;
        
        // If we're about to animate, set the flag BEFORE rendering to prevent race conditions
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = portraitArt;

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
            portraitEl.textContent = portraitArt;
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
        const shouldAnimate = !this._lastPortraitArt || this._lastPortraitArt !== fallbackArt;
        
        // If we're about to animate, set the flag BEFORE rendering
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = fallbackArt;
        
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
            portraitEl.textContent = fallbackArt;
          }
        }
      }
      return;
    }

    // No race yet – just render without portrait
    panel.innerHTML = Components.renderCharacterSheet(
      character,
      null,
      false,
    );
  },

  // Animate ASCII portrait character-by-character, line-by-line
  async typePortrait(element, portraitText) {
    const lines = portraitText.split('\n');
    element.textContent = '';
    
    let currentText = '';
    const charsPerFrame = 15; // Type multiple characters per frame for speed
    let charCount = 0;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Type characters in batches
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        currentText += line[charIndex];
        charCount++;
        
        // Update DOM every N characters
        if (charCount >= charsPerFrame) {
          element.textContent = currentText;
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
    element.textContent = currentText;
  },

});

// ===== AUTHENTICATION & BOOTSTRAP (no splash in builder) =====

let loadingInterval = null;

function startLoadingAnimation() {
  const statusText = document.getElementById('status-text');
  let index = 0;
  const messages = [
    'INITIALIZING SYSTEM...',
    'LOADING D&D 5E RULESET...',
    'WARMING UP BACKEND...',
  ];

  loadingInterval = setInterval(() => {
    if (statusText) {
      statusText.textContent = messages[index];
      index = (index + 1) % messages.length;
    }
  }, 800);
}

// Exit back to the Character Manager app from builder mode
function exitToManager() {
  // Navigate back to the manager UI. Adjust the path if the entry point changes.
  window.location.href = '../character-manager.html?from=builder';
}


// Initialize on page load (no splash gate)
window.addEventListener('DOMContentLoaded', async () => {
  // Start loading animation
  startLoadingAnimation();
  
  // 🔥 Wake up the backend server early (Render cold start can take 30-50s)
  if (CONFIG.ENABLE_AI) {
    console.log('%c🚀 BOOT: Waking up backend server early...', 'color: #0ff; font-weight: bold');
    AIService.warmupBackend();
  }

  // Show main content immediately
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.remove('is-hidden');
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


