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
            > ${opt.text}
          </button>
        `,
      )
      .join('');

    return `
      <div class="question-card" data-question-id="${question.id}">
        <div class="question-text">${question.text}</div>
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
          > CONTINUE
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

    return `
      <div id="settingsModal" class="modal show" onclick="App.closeSettings()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">⚙ Settings</h2>
            <button class="modal-close" onclick="App.closeSettings()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-row">
              <div class="settings-label">Narrator Voice</div>
              <div class="selector-shell">
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
                  <span class="selector-caret">⌄</span>
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
                class="terminal-select settings-select"
                style="display: none;"
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
              <div class="settings-help">
                Choose your narrator's personality. This affects all commentary during character creation.
              </div>
            </div>

            <div class="settings-row">
              <div class="settings-label">Narrator Text Speed</div>
              <div class="selector-shell">
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
                  <span class="selector-caret">⌄</span>
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
                class="terminal-select settings-select"
                style="display: none;"
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
              <div class="settings-help">
                Controls how quickly the narrator types. Higher values finish lines faster.
              </div>
            </div>

            <div id="backend-status" class="terminal-text-small terminal-text-dim mt-md"></div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closeSettings()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.saveSettings()">SAVE</button>
          </div>
        </div>
      </div>
    `;
  },
});


