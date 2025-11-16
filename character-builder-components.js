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
    const race = DND_DATA.races.find((r) => r.id === character.race);
    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const background = DND_DATA.backgrounds.find(
      (b) => b.id === character.background,
    );
    const alignment = DND_DATA.alignments.find(
      (a) => a.id === character.alignment,
    );

    return `
      <div class="character-sheet">
        ${(character.race && showPortrait)
          ? `
          <div class="ascii-portrait" id="character-portrait"></div>
        `
          : ''}
        
        <div class="sheet-section">
          <div class="sheet-header">
            <div class="sheet-header-title">[ CHARACTER INFO ]</div>
            ${(race && classData)
              ? `
              <div class="sheet-header-action">
                <button class="generate-ai-btn" onclick="App.generateCustomAIPortrait()" title="Generate a unique AI portrait with DALL-E">
                  ✨ Generate Custom AI Portrait
                </button>
              </div>
            `
              : ''}
          </div>
          <div class="sheet-content">
            ${character.name ? `<div class="stat-line"><span class="stat-label">Name:</span> <span class="stat-value">${character.name}</span></div>` : ''}
            ${race ? `<div class="stat-line"><span class="stat-label">Race:</span> <span class="stat-value">${race.name}</span></div>` : ''}
            ${classData ? `<div class="stat-line"><span class="stat-label">Class:</span> <span class="stat-value">${classData.name}</span></div>` : ''}
            ${background ? `<div class="stat-line"><span class="stat-label">Background:</span> <span class="stat-value">${background.name}</span></div>` : ''}
            ${alignment ? `<div class="stat-line"><span class="stat-label">Alignment:</span> <span class="stat-value">${alignment.name}</span></div>` : ''}
            <div class="stat-line">
              <span class="stat-label">
                Level:
                <button
                  class="button-secondary"
                  style="margin-left: 8px; padding: 2px 8px; font-size: 12px;"
                  onclick="App.openLevelModal()"
                  title="Change level and re-roll stats"
                >
                  CHANGE
                </button>
              </span>
              <span class="stat-value">${character.level}</span>
            </div>
          </div>
        </div>
        
        ${character.class
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ ABILITIES ]</div>
            </div>
            <div class="sheet-content">
              <div class="stat-line"><span class="stat-label">STR:</span> <span class="stat-value">${character.abilities.str} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.str))})</span></div>
              <div class="stat-line"><span class="stat-label">DEX:</span> <span class="stat-value">${character.abilities.dex} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.dex))})</span></div>
              <div class="stat-line"><span class="stat-label">CON:</span> <span class="stat-value">${character.abilities.con} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.con))})</span></div>
              <div class="stat-line"><span class="stat-label">INT:</span> <span class="stat-value">${character.abilities.int} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.int))})</span></div>
              <div class="stat-line"><span class="stat-label">WIS:</span> <span class="stat-value">${character.abilities.wis} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.wis))})</span></div>
              <div class="stat-line"><span class="stat-label">CHA:</span> <span class="stat-value">${character.abilities.cha} (${Utils.formatModifier(Utils.abilityModifier(character.abilities.cha))})</span></div>
              ${character.hitPoints > 0 ? `<div class="stat-line"><span class="stat-label">HP:</span> <span class="stat-value">${character.hitPoints}</span></div>` : ''}
            </div>
          </div>
        `
          : ''}
        
        ${race && race.traits.length > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ RACIAL TRAITS ]</div>
            </div>
            <div class="sheet-content">
              ${race.traits.map((t) => `<div class="text-dim">• ${t}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${classData && classData.equipment.length > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ EQUIPMENT ]</div>
            </div>
            <div class="sheet-content">
              ${classData.equipment.map((e) => `<div class="text-dim">• ${e}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${character.backstory
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ BACKSTORY ]</div>
            </div>
            <div class="sheet-content text-dim">
              ${character.backstory}
            </div>
          </div>
        `
          : ''}
      </div>
    `;
  },

  renderSettings() {
    const apiKey = StorageService.getAPIKey() || '';
    const aiPortraitsEnabled = StorageService.getAIPortraitsEnabled();
    const demoModeEnabled = StorageService.getDemoModeEnabled();

    return `
      <div class="prompt-modal-overlay settings-overlay" onclick="App.closeSettings()"></div>
      <div class="prompt-modal settings-panel" onclick="event.stopPropagation();">
        <div class="prompt-modal-header">
          <span>⚙ SETTINGS</span>
          <button class="prompt-modal-close" onclick="App.closeSettings()">×</button>
        </div>
        
        <div class="prompt-modal-instructions">
          Configure how the narrator uses AI and how portraits are generated.
        </div>
        
        <div class="settings-row">
          <label class="settings-label">OpenAI API Key:</label>
          <input type="password" class="input-field" id="api-key-input" value="${apiKey}" placeholder="sk-...">
          <div class="settings-help">Required for AI-generated dialogue and names. Get yours at platform.openai.com</div>
        </div>
        
        <div class="settings-row" style="margin-top: 16px;">
          <label class="settings-label" style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="ai-portraits-checkbox" ${aiPortraitsEnabled ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
            <span>Enable AI-Generated Portraits (Experimental)</span>
          </label>
          <div class="settings-help">Uses DALL-E 3 to generate unique character portraits. Costs ~$0.04 per character. Falls back to ASCII templates if disabled or if generation fails.</div>
        </div>
        
        <div class="settings-row" style="margin-top: 16px;">
          <label class="settings-label" style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="demo-mode-checkbox" ${demoModeEnabled ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
            <span>Demo Mode (No API Key Required)</span>
          </label>
          <div class="settings-help">Uses pre-generated portraits for common character combinations. Perfect for sharing without an API key. No cost, limited character options.</div>
        </div>
        
        <div class="settings-row">
          <button class="button-primary" onclick="App.saveSettings()">SAVE</button>
          <button class="button-secondary" onclick="App.closeSettings()" style="margin-left: 8px;">CANCEL</button>
        </div>
        
        <div class="settings-row mt-lg">
          <div class="text-dim text-small">
            Your API key is stored locally in your browser only.
            <br>Without an API key, fallback responses will be used.
          </div>
        </div>
      </div>
    `;
  },
});


