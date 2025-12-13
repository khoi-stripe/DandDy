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

    // Check if current user is admin (decode JWT)
    let isUserAdmin = false;
    try {
      if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
        const token = AuthService.getToken ? AuthService.getToken() : null;
        if (token) {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          isUserAdmin = decoded.role?.toLowerCase() === 'admin';
        }
      }
    } catch (e) {
      // Silent fail - user is not admin
    }

    // Image quality options per model
    const modelQualityOptions = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      // Flux models don't have quality options
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Get default quality for a model
    const getDefaultQuality = (model) => {
      const options = modelQualityOptions[model] || [];
      return options.length > 0 ? options[0].value : null;
    };

    // Get current quality setting for selected model
    const getCurrentImageQuality = (model) => {
      if (!StorageService || typeof StorageService.getImageQuality !== 'function') {
        return getDefaultQuality(model);
      }
      try {
        const quality = StorageService.getImageQuality(model);
        if (quality) return quality;
        // For gpt-image-1, check legacy setting
        if (model === 'gpt-image-1' && StorageService.getHighQualityGPTImage) {
          return StorageService.getHighQualityGPTImage() ? 'high' : 'medium';
        }
        return getDefaultQuality(model);
      } catch (e) {
        return getDefaultQuality(model);
      }
    };

    // Helper to truncate text for options
    const truncate = (text, maxLength) => {
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };

    // Helper to format narrator titles: strip emoji/description and use a clean title.
    const formatNarratorTitle = (narrator) => {
      if (!narrator) return '';
      const base = String(narrator.name || narrator.id || '').trim();
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
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
      ? formatNarratorTitle(currentNarrator)
      : 'Choose narrator';

    const narratorOptionsMenu = narratorsList
      .map((narrator) => {
        const label = formatNarratorTitle(narrator);
        const isSelected = narrator.id === currentNarratorId;
        return `
          <button
            class="selector-option${isSelected ? ' is-selected' : ''}"
            type="button"
            role="option"
            data-value="${narrator.id}"
            aria-selected="${isSelected ? 'true' : 'false'}"
          >
            <span class="selector-option-label">
              ${label}
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
      { value: 'gpt-image-1', label: 'GPT Image 1 (OpenAI)' },
      { value: 'flux-1.1-pro', label: 'Flux Pro (high quality)' },
      { value: 'flux-schnell', label: 'Flux Schnell (fast)' },
    ];

    const currentImageModelValue = getCurrentImageModel();
    const currentImageModelOption =
      imageModelOptions.find((opt) => opt.value === currentImageModelValue) ||
      imageModelOptions[0];
    const currentImageModelLabel = currentImageModelOption.label;

    // Quality options for current model
    const currentQualityOptions = modelQualityOptions[currentImageModelValue] || [];
    const currentQualityValue = getCurrentImageQuality(currentImageModelValue);
    const currentQualityOption = currentQualityOptions.find(
      (opt) => opt.value === currentQualityValue,
    ) || currentQualityOptions[0];
    const currentQualityLabel = currentQualityOption?.label || '';
    // Only show quality options to admin users
    const hasQualityOptions = currentQualityOptions.length > 0 && isUserAdmin;

    // Portrait view mode (ASCII vs Original)
    const getPortraitViewMode = () => {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        return StorageService.getPortraitViewMode();
      }
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
    };

    const currentPortraitViewMode = getPortraitViewMode();

    // Portrait prompt theme (for AI-generated portraits)
    const getPortraitPromptTheme = () => {
      try {
        if (window.StorageService && StorageService.getPortraitPromptTheme) {
          return StorageService.getPortraitPromptTheme();
        }
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt theme', e);
      }

      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getDefaultThemeId === 'function'
      ) {
        try {
          return window.PortraitPrompt.getDefaultThemeId();
        } catch (e) {
          // Non-fatal
        }
      }

      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
    };

    const currentPromptThemeId = getPortraitPromptTheme();

    // Trigger API sync if not already done (in case settings opened before auto-sync)
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.syncFromAPI === 'function'
    ) {
      // Fire and forget - will populate cache for next render
      window.PortraitPrompt.syncFromAPI();
    }

    let promptThemes = [];
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.getThemes === 'function'
    ) {
      try {
        promptThemes = window.PortraitPrompt.getThemes() || [];
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt themes', e);
      }
    }

    // Fallback to a single default theme when the helper is unavailable.
    if (!Array.isArray(promptThemes) || !promptThemes.length) {
      promptThemes = [
        {
          id: 'cinematic-inks',
          label: 'Cinematic Inks (default)',
          description:
            'More cinematic lighting and framing while staying in black-and-white ink.',
        },
      ];
    }

    // Sort themes alphabetically by id
    promptThemes = promptThemes.slice().sort((a, b) => {
      const nameA = (a.id || '').toLowerCase();
      const nameB = (b.id || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const activePromptTheme =
      promptThemes.find((t) => t.id === currentPromptThemeId) ||
      promptThemes[0];

    // Helper to format a theme id/label into Title Case name.
    const formatThemeName = (theme) => {
      const rawId = (theme && theme.id) || '';
      // Prefer id so custom themes don't inherit any legacy "(default)" suffixes.
      const base = String(rawId || '').trim() || String(theme.label || '');
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    const currentPromptThemeLabel = activePromptTheme
      ? formatThemeName(activePromptTheme)
      : 'Cinematic Inks';

    return `
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">Settings</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <div class="settings-group">
                  <div class="settings-group-label">[ Builder ]</div>
                  <section class="settings-section">
                    <div class="settings-row-inline">
                      <div class="settings-inline-field">
                        <div class="settings-label">Narrator Voice</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
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
                            const label = formatNarratorTitle(narrator);
                            return `
                            <option value="${narrator.id}" ${
                              narrator.id === currentNarratorId ? 'selected' : ''
                            }>
                              ${label}
                            </option>
                          `;
                          })
                          .join('')}
                      </select>
                    </div>
                    <div class="settings-inline-field">
                      <div class="settings-label">Text Speed</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
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
                            .map((opt) => {
                              const isSelected =
                                opt.value === currentTextSpeedOption.value;
                              return `
                              <button
                                class="selector-option${isSelected ? ' is-selected' : ''}"
                                type="button"
                                role="option"
                                data-value="${opt.value}"
                                aria-selected="${isSelected ? 'true' : 'false'}"
                              >
                                <span class="selector-option-label">
                                  ${opt.label}
                                </span>
                              </button>
                            `;
                            })
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
                              opt.value === currentTextSpeedOption.value
                                ? 'selected'
                                : ''
                            }>
                              ${opt.label}
                            </option>
                          `,
                          )
                          .join('')}
                      </select>
                      </div>
                    </div>
                  </section>
                </div>

                <div class="settings-group">
                  <div class="settings-group-label">[ Image generation ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked mb-lg">
                      <div class="settings-label">Style</div>
                      <div class="settings-field">
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="portrait-theme-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span
                              class="selector-trigger-label"
                              id="portrait-theme-select-label"
                            >
                              ${currentPromptThemeLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Portrait prompt theme"
                            aria-hidden="true"
                          >
                            ${promptThemes
                              .map((theme) => {
                                const isSelected = theme.id === activePromptTheme.id;
                                const label = formatThemeName(theme);
                                return `
                                <button
                                  class="selector-option${
                                    isSelected ? ' is-selected' : ''
                                  }"
                                  type="button"
                                  role="option"
                                  data-value="${theme.id}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="portrait-theme-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${promptThemes
                            .map((theme) => {
                              const label = formatThemeName(theme);
                              return `
                              <option value="${theme.id}" ${
                                theme.id === activePromptTheme.id ? 'selected' : ''
                              }>
                                ${label}
                              </option>
                            `;
                            })
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row-inline mb-lg">
                      <div class="settings-inline-field">
                        <div class="settings-label">AI model</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
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
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentImageModelOption.value;
                                return `
                                <button
                                  class="selector-option${isSelected ? ' is-selected' : ''}"
                                  type="button"
                                  role="option"
                                  data-value="${opt.value}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${opt.label}
                                  </span>
                                </button>
                              `;
                              })
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
                      <div class="settings-inline-field settings-inline-field--quality ${hasQualityOptions ? '' : 'hidden'}" id="quality-selector-container">
                        <div class="settings-label">Quality</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="image-quality-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span class="selector-trigger-label" id="image-quality-select-label">
                              ${currentQualityLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Image quality"
                            aria-hidden="true"
                            id="image-quality-options-menu"
                          >
                            ${currentQualityOptions
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentQualityOption?.value;
                                return `
                                <button
                                  class="selector-option${isSelected ? ' is-selected' : ''}"
                                  type="button"
                                  role="option"
                                  data-value="${opt.value}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${opt.label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="image-quality-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${currentQualityOptions
                            .map(
                              (opt) => `
                              <option value="${opt.value}" ${
                                opt.value === currentQualityOption?.value ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row settings-row--stacked">
                      <div class="settings-label">Default portrait view</div>
                      <div class="settings-field">
                        <div class="settings-radio-group" role="radiogroup" aria-label="Default portrait view">
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="original"
                              ${currentPortraitViewMode === 'original' ? 'checked' : ''}
                            >
                            <span class="settings-radio-label">Image</span>
                          </label>
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="ascii"
                              ${currentPortraitViewMode === 'original' ? '' : 'checked'}
                            >
                            <span class="settings-radio-label">ASCII</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
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
            // Keep menu selection state in sync with the trigger
            narratorOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
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
            // Keep menu selection state in sync with the trigger
            speedOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Quality options per model (duplicated here for initSelectors)
    const modelQualityOptionsMap = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Helper to update quality selector options based on selected model
    const updateQualityOptions = (modelValue) => {
      const qualityContainer = modal.querySelector('#quality-selector-container');
      const qualityLabel = modal.querySelector('#image-quality-select-label');
      const qualitySelect = modal.querySelector('#image-quality-select');
      const qualityMenu = modal.querySelector('#image-quality-options-menu');

      const options = modelQualityOptionsMap[modelValue] || [];

      // Check if current user is admin (decode JWT)
      let isAdmin = false;
      try {
        if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
          const token = AuthService.getToken ? AuthService.getToken() : null;
          if (token) {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            isAdmin = decoded.role?.toLowerCase() === 'admin';
          }
        }
      } catch (e) {
        // Silent fail - user is not admin
      }

      if (!options.length || !isAdmin) {
        // Hide quality selector if model has no quality options or user is not admin
        if (qualityContainer) qualityContainer.classList.add('hidden');
        return;
      }

      // Show quality selector (admin only)
      if (qualityContainer) qualityContainer.classList.remove('hidden');

      // Get saved quality for this model, or default to first option
      let currentQuality = null;
      if (window.StorageService && StorageService.getImageQuality) {
        currentQuality = StorageService.getImageQuality(modelValue);
      }
      if (!currentQuality) {
        currentQuality = options[0].value;
      }

      // Update menu options
      if (qualityMenu) {
        qualityMenu.innerHTML = options
          .map((opt) => {
            const isSelected = opt.value === currentQuality;
            return `
              <button
                class="selector-option${isSelected ? ' is-selected' : ''}"
                type="button"
                role="option"
                data-value="${opt.value}"
                aria-selected="${isSelected ? 'true' : 'false'}"
              >
                <span class="selector-option-label">
                  ${opt.label}
                </span>
              </button>
            `;
          })
          .join('');

        // Re-wire quality option clicks
        const newQualityOptions = qualityMenu.querySelectorAll('.selector-option');
        newQualityOptions.forEach((qOpt) => {
          qOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            const qValue = qOpt.getAttribute('data-value');
            const qLabel = qOpt.querySelector('.selector-option-label');
            if (qValue && qLabel && qualityLabel && qualitySelect) {
              qualityLabel.textContent = qLabel.textContent.trim();
              qualitySelect.value = qValue;
              newQualityOptions.forEach((o) => {
                const isSelected = o === qOpt;
                o.classList.toggle('is-selected', isSelected);
                o.setAttribute('aria-selected', isSelected ? 'true' : 'false');
              });
            }
          });
        });
      }

      // Update hidden select options
      if (qualitySelect) {
        qualitySelect.innerHTML = options
          .map(
            (opt) => `
            <option value="${opt.value}" ${opt.value === currentQuality ? 'selected' : ''}>
              ${opt.label}
            </option>
          `,
          )
          .join('');
      }

      // Update label
      const activeOption = options.find((o) => o.value === currentQuality) || options[0];
      if (qualityLabel && activeOption) {
        qualityLabel.textContent = activeOption.label;
      }
    };

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
            // Keep menu selection state in sync with the trigger
            imageModelOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            // Update quality options when model changes
            updateQualityOptions(value);
          }
        });
      });
    }

    // Image quality selector (initial setup)
    const qualityTrigger = modal.querySelector('#image-quality-select-trigger');
    const qualityLabel = modal.querySelector('#image-quality-select-label');
    const qualitySelect = modal.querySelector('#image-quality-select');
    const qualityOptions = modal.querySelectorAll(
      '#image-quality-options-menu .selector-option',
    );

    if (qualityTrigger && qualityLabel && qualitySelect && qualityOptions.length) {
      qualityOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            qualityLabel.textContent = label.textContent.trim();
            qualitySelect.value = value;
            qualityOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Portrait prompt theme selector
    const themeTrigger = modal.querySelector(
      '#portrait-theme-select-trigger',
    );
    const themeLabel = modal.querySelector('#portrait-theme-select-label');
    const themeSelect = modal.querySelector('#portrait-theme-select');
    const themeOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Portrait prompt theme"] .selector-option',
    );

    if (themeTrigger && themeLabel && themeSelect && themeOptions.length) {
      themeOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            themeLabel.textContent = label.textContent.trim();
            themeSelect.value = value;
            // Keep menu selection state in sync with the trigger
            themeOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
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

    // Save global portrait view mode (ASCII vs Original)
    // Track if mode changed to trigger UI refresh
    let portraitModeChanged = false;
    const portraitModeInput = document.querySelector(
      'input[name="portrait-view-mode"]:checked',
    );
    if (portraitModeInput && window.StorageService && StorageService.setPortraitViewMode) {
      const oldMode = StorageService.getPortraitViewMode ? StorageService.getPortraitViewMode() : null;
      const newMode = portraitModeInput.value;
      if (oldMode !== newMode) {
        portraitModeChanged = true;
      }
      StorageService.setPortraitViewMode(newMode);
    }

    // Save portrait prompt theme selection
    const portraitThemeSelect = document.getElementById('portrait-theme-select');
    if (
      portraitThemeSelect &&
      window.StorageService &&
      StorageService.setPortraitPromptTheme
    ) {
      StorageService.setPortraitPromptTheme(portraitThemeSelect.value);
    }

    // Save image quality setting for the selected model
    const imageQualitySelect = document.getElementById('image-quality-select');
    const imageModelForQuality = imageModelSelect?.value;
    if (imageQualitySelect && imageModelForQuality && window.StorageService && StorageService.setImageQuality) {
      StorageService.setImageQuality(imageModelForQuality, imageQualitySelect.value);
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved');
    } else if (typeof showNotification === 'function') {
      showNotification('Settings saved');
    }

    this.close();

    // If portrait view mode changed, refresh the UI to update images
    if (portraitModeChanged) {
      // Character Manager context: re-render grid and current sheet
      if (typeof UI !== 'undefined' && UI && typeof UI.renderCharacterGrid === 'function') {
        UI.renderCharacterGrid();
        // Re-render the current character sheet if one is selected
        if (typeof AppState !== 'undefined' && AppState && AppState.selectedCharacterId) {
          const selectedChar = AppState.filteredCharacters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          ) || AppState.characters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          );
          if (selectedChar) {
            UI.showCharacterSheet(selectedChar);
          }
        }
      }
      // Character Builder context: re-render completion screen if on that step
      if (typeof App !== 'undefined' && App && typeof CharacterState !== 'undefined') {
        const state = CharacterState.get ? CharacterState.get() : null;
        if (state && state.step === 'complete' && state.character) {
          // Re-render the character panel to reflect the new view mode
          const panel = document.getElementById('character-panel');
          if (panel && typeof Components !== 'undefined' && Components.renderCharacterSheet) {
            panel.innerHTML = Components.renderCharacterSheet(state.character);
            // Populate the ASCII portrait after rendering
            if (typeof CharacterSheet !== 'undefined' && CharacterSheet.populatePortrait) {
              CharacterSheet.populatePortrait(state.character);
            }
          }
        }
      }
    }
  },
});

