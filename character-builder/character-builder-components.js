// UI components for the DandDy terminal character builder.
// Exposes Components as a global on window.

const Components = (window.Components = {
  renderNarratorMessage(text) {
    return `
      <div class="narrator-message">
        <div class="narrator-text">${text}</div>
      </div>
    `;
  },

  renderQuestion(question) {
    const optionsHTML = question.options
      .map(
        (opt, index) => `
          <button class="button-primary" onclick="App.handleAnswer('${question.id}', ${index})">
            ${opt.text}
          </button>
        `,
      )
      .join('');

    return `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${optionsHTML}
        </div>
      </div>
    `;
  },

  renderTextInput(question) {
    return `
      <div class="question-card" data-question-id="${question.id}">
        <div class="question-text">${question.text}</div>
        <input type="text" class="input-field" id="text-input" placeholder="${question.placeholder || 'Type here...'}">
        <button class="button-primary mt-md" onclick="App.handleTextInput('${question.id}')">
          CONTINUE
        </button>
      </div>
    `;
  },

  renderCharacterSheet(
    character,
    portrait = null,
    showPortrait = true,
    extraOptions = {},
  ) {
    const { showGeneratePortraitButton = true } = extraOptions || {};

    // Use the shared CharacterSheet component
    return `
      <div class="character-sheet">
        ${CharacterSheet.render(character, {
          context: 'builder',
          showPortrait: showPortrait,
          // In quick-create mode we may want to suppress the custom AI portrait
          // button until the first custom image has actually been generated.
          onGeneratePortrait: showGeneratePortraitButton,
          onRename: true,
          onTogglePortrait: true,
          onLevelChange: true,
          onPrint: true,
        })}
      </div>
    `;
  },

  renderSettings() {
    const currentNarratorId = StorageService.getNarratorId();
    const narratorsList = getNarratorList();

    // Helper to truncate text for options
    const truncate = (text, maxLength) => {
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };

    // Text speed multiplier: defaults to 1x if not set or invalid.
    const getCurrentTextSpeed = () => {
      if (!StorageService || typeof StorageService.getTextSpeedMultiplier !== 'function') {
        return 1;
      }
      try {
        return StorageService.getTextSpeedMultiplier();
      } catch (e) {
        console.warn('Settings: failed to read text speed multiplier', e);
        return 1;
      }
    };

    const currentTextSpeedMultiplier = getCurrentTextSpeed();

    // Image model preference (for custom AI portraits)
    const getCurrentImageModel = () => {
      if (!StorageService || typeof StorageService.getImageModel !== 'function') {
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
      try {
        return StorageService.getImageModel();
      } catch (e) {
        console.warn('Settings: failed to read image model preference', e);
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
    };

    const currentNarrator =
      narratorsList.find((n) => n.id === currentNarratorId) || narratorsList[0];
    const currentNarratorLabel = currentNarrator
      ? truncate(
          `${currentNarrator.emoji} ${currentNarrator.name} - ${currentNarrator.description}`,
          60,
        )
      : 'Choose narrator';

    const narratorOptionsMenu = narratorsList
      .map((narrator) => {
        const optionText = `${narrator.emoji} ${narrator.name} - ${narrator.description}`;
        const truncatedText = truncate(optionText, 60);
        return `
          <button
            class="selector-option"
            type="button"
            role="option"
            data-value="${narrator.id}"
          >
            <span class="selector-option-label">
              ${truncatedText}
            </span>
          </button>
        `;
      })
      .join('');

    const textSpeedOptions = [
      { value: 1, label: 'Normal' },
      { value: 1.5, label: 'Fast (1.5×)' },
      { value: 2, label: 'Very Fast (2×)' },
    ];

    const currentTextSpeedOption =
      textSpeedOptions.find((opt) => opt.value === currentTextSpeedMultiplier) ||
      textSpeedOptions[0];
    const currentTextSpeedLabel = currentTextSpeedOption.label;

    const imageModelOptions = [
      { value: 'dall-e-3', label: 'DALL·E 3 (high detail)' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (new)' },
    ];

    const currentImageModelValue = getCurrentImageModel();
    const currentImageModelOption =
      imageModelOptions.find((opt) => opt.value === currentImageModelValue) ||
      imageModelOptions[0];
    const currentImageModelLabel = currentImageModelOption.label;

    return `
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">⚙ Settings</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">Narrator Voice</div>
                    <div class="selector-shell selector-shell--match-width">
                      <button
                        class="terminal-btn selector-trigger"
                        id="narrator-select-trigger"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                        onclick="CharacterSheet.toggleSelectorMenu(this)"
                      >
                        <span class="selector-trigger-label" id="narrator-select-label">
                          ${currentNarratorLabel}
                        </span>
                      </button>
                      <div
                        class="selector-menu"
                        role="listbox"
                        aria-label="Narrator voice"
                        aria-hidden="true"
                      >
                        ${narratorOptionsMenu}
                      </div>
                    </div>
                    <select
                      id="narrator-select"
                      class="terminal-select settings-select hidden"
                    >
                      ${narratorsList
                        .map((narrator) => {
                          const optionText = `${narrator.emoji} ${narrator.name} - ${narrator.description}`;
                          const truncatedText = truncate(optionText, 60);
                          return `
                            <option value="${narrator.id}" ${
                              narrator.id === currentNarratorId ? 'selected' : ''
                            }>
                              ${truncatedText}
                            </option>
                          `;
                        })
                        .join('')}
                    </select>
                  </div>
                </section>

                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">Narrator Text Speed</div>
                    <div class="selector-shell selector-shell--match-width">
                      <button
                        class="terminal-btn selector-trigger"
                        id="text-speed-select-trigger"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                        onclick="CharacterSheet.toggleSelectorMenu(this)"
                      >
                        <span class="selector-trigger-label" id="text-speed-select-label">
                          ${currentTextSpeedLabel}
                        </span>
                      </button>
                      <div
                        class="selector-menu"
                        role="listbox"
                        aria-label="Narrator text speed"
                        aria-hidden="true"
                      >
                        ${textSpeedOptions
                          .map(
                            (opt) => `
                            <button
                              class="selector-option"
                              type="button"
                              role="option"
                              data-value="${opt.value}"
                            >
                              <span class="selector-option-label">
                                ${opt.label}
                              </span>
                            </button>
                          `,
                          )
                          .join('')}
                      </div>
                    </div>
                    <select
                      id="text-speed-select"
                      class="terminal-select settings-select hidden"
                    >
                      ${textSpeedOptions
                        .map(
                          (opt) => `
                          <option value="${opt.value}" ${
                            opt.value === currentTextSpeedOption.value ? 'selected' : ''
                          }>
                            ${opt.label}
                          </option>
                        `,
                        )
                        .join('')}
                    </select>
                  </div>
                </section>

                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">AI model</div>
                    <div class="selector-shell selector-shell--match-width">
                      <button
                        class="terminal-btn selector-trigger"
                        id="image-model-select-trigger"
                        type="button"
                        aria-haspopup="listbox"
                        aria-expanded="false"
                        onclick="CharacterSheet.toggleSelectorMenu(this)"
                      >
                        <span class="selector-trigger-label" id="image-model-select-label">
                          ${currentImageModelLabel}
                        </span>
                      </button>
                      <div
                        class="selector-menu"
                        role="listbox"
                        aria-label="AI model"
                        aria-hidden="true"
                      >
                        ${imageModelOptions
                          .map(
                            (opt) => `
                            <button
                              class="selector-option"
                              type="button"
                              role="option"
                              data-value="${opt.value}"
                            >
                              <span class="selector-option-label">
                                ${opt.label}
                              </span>
                            </button>
                          `,
                          )
                          .join('')}
                      </div>
                    </div>
                    <select
                      id="image-model-select"
                      class="terminal-select settings-select hidden"
                    >
                      ${imageModelOptions
                        .map(
                          (opt) => `
                          <option value="${opt.value}" ${
                            opt.value === currentImageModelOption.value ? 'selected' : ''
                          }>
                            ${opt.label}
                          </option>
                        `,
                        )
                        .join('')}
                    </select>
                  </div>
                </section>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="SettingsModal.close()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="SettingsModal.save()">SAVE</button>
          </div>
        </div>
      </div>
    `;
  },
});

// Shared Settings modal used by both the builder and manager screens.
// Handles narrator, text speed, and AI image model preferences.
const SettingsModal = (window.SettingsModal = {
  _escHandler: null,

  open() {
    if (document.getElementById('settingsModal')) return; // Already open

    const settingsHTML = Components.renderSettings();

    // Prefer the main app container when available so the modal is scoped
    // correctly in both builder and manager layouts.
    const host =
      document.querySelector('.terminal-container') ||
      document.querySelector('.terminal-frame') ||
      document.body;

    host.insertAdjacentHTML('beforeend', settingsHTML);

    const modal = document.getElementById('settingsModal');
    if (modal && typeof window.Utils !== 'undefined' && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    this.initSelectors(modal);

    // ESC key to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        SettingsModal.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  /**
   * Initialize settings selectors: wire up option clicks to update the
   * hidden <select> elements and trigger labels.
   * The toggle behavior is handled by onclick="CharacterSheet.toggleSelectorMenu(this)" in the HTML.
   * @param {HTMLElement} modal
   */
  initSelectors(modal) {
    if (!modal) return;

    // Narrator selector
    const narratorTrigger = modal.querySelector('#narrator-select-trigger');
    const narratorLabel = modal.querySelector('#narrator-select-label');
    const narratorSelect = modal.querySelector('#narrator-select');
    const narratorOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator voice"] .selector-option',
    );

    if (narratorTrigger && narratorLabel && narratorSelect && narratorOptions.length) {
      narratorOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            narratorLabel.textContent = label.textContent.trim();
            narratorSelect.value = value;
          }
        });
      });
    }

    // Text speed selector
    const speedTrigger = modal.querySelector('#text-speed-select-trigger');
    const speedLabel = modal.querySelector('#text-speed-select-label');
    const speedSelect = modal.querySelector('#text-speed-select');
    const speedOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator text speed"] .selector-option',
    );

    if (speedTrigger && speedLabel && speedSelect && speedOptions.length) {
      speedOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            speedLabel.textContent = label.textContent.trim();
            speedSelect.value = value;
          }
        });
      });
    }

    // Image model selector
    const imageModelTrigger = modal.querySelector('#image-model-select-trigger');
    const imageModelLabel = modal.querySelector('#image-model-select-label');
    const imageModelSelect = modal.querySelector('#image-model-select');
    const imageModelOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="AI model"] .selector-option',
    );

    if (imageModelTrigger && imageModelLabel && imageModelSelect && imageModelOptions.length) {
      imageModelOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            imageModelLabel.textContent = label.textContent.trim();
            imageModelSelect.value = value;
          }
        });
      });
    }
  },

  close() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
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

  save() {
    // Save narrator selection
    const narratorSelect = document.getElementById('narrator-select');
    if (narratorSelect && window.StorageService && StorageService.setNarratorId) {
      StorageService.setNarratorId(narratorSelect.value);
    }

    // Save text speed selection
    const textSpeedSelect = document.getElementById('text-speed-select');
    if (textSpeedSelect && window.StorageService && StorageService.setTextSpeedMultiplier) {
      StorageService.setTextSpeedMultiplier(textSpeedSelect.value);
    }

    // Save portrait image model selection
    const imageModelSelect = document.getElementById('image-model-select');
    if (imageModelSelect && window.StorageService && StorageService.setImageModel) {
      StorageService.setImageModel(imageModelSelect.value);
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved!');
    } else if (typeof showNotification === 'function') {
      showNotification('Settings saved');
    }

    this.close();
  },
});

