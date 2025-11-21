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
      <div id="settingsModal" class="modal show" onclick="App.closeSettings()">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">⚙ Settings</h2>
            <button class="modal-close" onclick="App.closeSettings()">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-row">
              <div class="settings-label">Narrator Voice</div>
              <select id="narrator-select" class="terminal-select settings-select">
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
              <div class="settings-help">
                Choose your narrator's personality. This affects all commentary during character creation.
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


