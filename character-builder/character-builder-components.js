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
        <div class="sheet-title-header">
          <div class="sheet-title">${character.name ? character.name : '[ CHARACTER SHEET ]'}</div>
          <div style="display: flex; gap: 8px; align-items: center;">
            ${character.name ? `
              <button class="button-secondary" onclick="App.openNameModal()" title="Change character name" style="font-size: 12px; padding: 4px 12px;">
                ✏ RENAME
              </button>
            ` : ''}
          <button class="generate-ai-btn sheet-print-btn" onclick="App.printCharacterSheet()" title="Print this character">
            🖨 Print
          </button>
          </div>
        </div>
        
        ${(character.race && showPortrait)
          ? `
          <div class="portrait-container">
            <div class="ascii-portrait" id="character-portrait"></div>
            <img id="original-portrait" class="original-portrait" style="display: none;" alt="Character portrait">
            <div class="portrait-actions">
              ${(race && classData) ? `
                <button class="generate-ai-btn" onclick="App.generateCustomAIPortrait()" title="Generate a unique AI portrait (${3 - (character.customPortraitCount || 0)} remaining)">
                  ✨ Custom AI Portrait ${character.customPortraitCount ? `(${3 - character.customPortraitCount})` : '(3)'}
                </button>
              ` : ''}
              ${character.originalPortraitUrl ? `
                <button class="generate-ai-btn" onclick="App.togglePortraitView()" id="toggle-portrait-btn" title="Toggle between ASCII and original art">
                  👁 View Original Art
                </button>
              ` : ''}
            </div>
          </div>
        `
          : ''}
        
        <div class="sheet-section">
          <div class="sheet-header">
          </div>
          <div class="sheet-content">
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
              <div class="sheet-header-title">[ CLASS EQUIPMENT ]</div>
            </div>
            <div class="sheet-content">
              ${classData.equipment.map((e) => `<div class="text-dim">• ${e}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${character.skillProficiencies && character.skillProficiencies.length > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ SKILL PROFICIENCIES ]</div>
            </div>
            <div class="sheet-content">
              ${character.skillProficiencies.map((s) => `<div class="text-dim">• ${s.charAt(0).toUpperCase() + s.slice(1).replace(/-/g, ' ')}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${character.toolProficiencies && character.toolProficiencies.length > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ TOOL PROFICIENCIES ]</div>
            </div>
            <div class="sheet-content">
              ${character.toolProficiencies.map((t) => `<div class="text-dim">• ${t.charAt(0).toUpperCase() + t.slice(1).replace(/-/g, ' ')}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${character.equipment && character.equipment.length > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ STARTING EQUIPMENT ]</div>
            </div>
            <div class="sheet-content">
              ${character.equipment.map((e) => `<div class="text-dim">• ${e}</div>`).join('')}
            </div>
          </div>
        `
          : ''}
        
        ${character.languageChoices > 0
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ LANGUAGES ]</div>
            </div>
            <div class="sheet-content text-dim">
              Choose ${character.languageChoices} additional language${character.languageChoices > 1 ? 's' : ''}
            </div>
          </div>
        `
          : ''}
        
        ${character.backgroundFeature
          ? `
          <div class="sheet-section">
            <div class="sheet-header">
              <div class="sheet-header-title">[ BACKGROUND FEATURE ]</div>
            </div>
            <div class="sheet-content">
              <div class="stat-line"><span class="stat-label">${character.backgroundFeature.name}:</span></div>
              <div class="text-dim" style="margin-top: 8px;">${character.backgroundFeature.description}</div>
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
          <label class="settings-label" style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" id="ai-portraits-checkbox" ${aiPortraitsEnabled ? 'checked' : ''} style="margin-right: 8px; cursor: pointer;">
            <span>Enable AI-Generated Portraits (Experimental)</span>
          </label>
          <div class="settings-help">Uses AI to generate unique character portraits. Falls back to pre-generated ASCII templates if disabled or if generation fails.</div>
        </div>
        
        <div class="settings-row">
          <button class="button-primary" onclick="App.saveSettings()">SAVE</button>
          <button class="button-secondary" onclick="App.closeSettings()" style="margin-left: 8px;">CANCEL</button>
        </div>
      </div>
    `;
  },
});


