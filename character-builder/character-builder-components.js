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

  renderCharacterSheet(character, portrait = null, showPortrait = true) {
    // Use the shared CharacterSheet component
    return `
      <div class="character-sheet">
        ${CharacterSheet.render(character, {
          context: 'builder',
          showPortrait: showPortrait,
          onGeneratePortrait: true,
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

    return `
      <div class="prompt-modal-overlay settings-overlay" onclick="App.closeSettings()"></div>
      <div class="prompt-modal settings-panel" onclick="event.stopPropagation();">
        <div class="prompt-modal-header">
          <span>⚙ SETTINGS</span>
          <button class="prompt-modal-close" onclick="App.closeSettings()">×</button>
        </div>
        
        <div class="settings-row">
          <div class="settings-label">Narrator Voice</div>
          <select id="narrator-select" class="settings-select">
            ${narratorsList.map(narrator => {
              const optionText = `${narrator.emoji} ${narrator.name} - ${narrator.description}`;
              const truncatedText = truncate(optionText, 60);
              return `
                <option value="${narrator.id}" ${narrator.id === currentNarratorId ? 'selected' : ''}>
                  ${truncatedText}
                </option>
              `;
            }).join('')}
          </select>
          <div class="settings-help">Choose your narrator's personality. This affects all commentary during character creation.</div>
        </div>
        
        <div class="prompt-modal-buttons">
          <button class="button-secondary" onclick="App.closeSettings()">CANCEL</button>
          <button class="button-primary" onclick="App.saveSettings()">SAVE</button>
        </div>
      </div>
    `;
  },
});


