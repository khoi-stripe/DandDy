// ========================================
// SHARED CHARACTER SHEET COMPONENT
// ========================================
// Global component for rendering character sheets across DandDy apps
// Used by both Character Builder and Character Manager

const CharacterSheet = (window.CharacterSheet = {
  /**
   * Main render function for character sheets
   * @param {Object} character - Character data object
   * @param {Object} options - Configuration options
   * @param {string} options.context - 'builder' or 'manager' to control which features to show
   * @param {boolean} options.showPortrait - Whether to show portrait section (default: true)
   * @param {Function} options.onGeneratePortrait - Callback for generating portraits (builder only)
   * @param {Function} options.onRename - Callback for renaming character (builder only)
   * @param {Function} options.onTogglePortrait - Callback for toggling portrait view (builder only)
   * @param {Function} options.onLevelChange - Callback for changing level (builder only)
   * @param {Function} options.onPrint - Callback for printing (builder only)
   * @param {Function} options.onEdit - Callback for editing (manager only)
   * @param {Function} options.onDuplicate - Callback for duplicating (manager only)
   * @param {Function} options.onExport - Callback for exporting (manager only)
   * @param {Function} options.onDelete - Callback for deleting (manager only)
   * @returns {string} HTML string for the character sheet
   */
  render(character, options = {}) {
    const {
      context = 'builder',
      showPortrait = true,
      onGeneratePortrait = null,
      onRename = null,
      onTogglePortrait = null,
      onLevelChange = null,
      onPrint = null,
      onEdit = null,
      onDuplicate = null,
      onExport = null,
      onDelete = null,
    } = options;

    // Parse character data (handle both old and new formats)
    const parsed = this._parseCharacterData(character);

    // Build HTML
    return `
      ${this._renderHeader(character, context, {
        onPrint,
        onRename,
        onDuplicate,
        onExport,
        onDelete,
        onLevelChange,
      })}
      
      ${showPortrait && parsed.hasRace
        ? this._renderPortrait(character, parsed, context, {
            onGeneratePortrait,
            onTogglePortrait,
          })
        : ''}
      
      ${this._renderBasicInfo(parsed, context, {})}
      
      ${parsed.hasCombatStats ? this._renderCombatStats(parsed) : ''}
      
      ${parsed.hasAbilities ? this._renderAbilities(parsed, context) : ''}
      
      ${parsed.hasSavingThrows ? this._renderSavingThrows(parsed) : ''}
      
      ${parsed.hasSkills ? this._renderSkills(parsed) : ''}
      
      ${parsed.hasRacialTraits ? this._renderRacialTraits(parsed) : ''}
      
      ${parsed.hasEquipment ? this._renderEquipment(parsed) : ''}
      
      ${parsed.hasToolProficiencies
        ? this._renderToolProficiencies(parsed)
        : ''}
      
      ${parsed.hasLanguages ? this._renderLanguages(parsed) : ''}
      
      ${parsed.hasBackgroundFeature
        ? this._renderBackgroundFeature(parsed)
        : ''}
      
      ${parsed.hasBackstory ? this._renderBackstory(parsed) : ''}
      
      ${context === 'manager' && parsed.hasExportInfo
        ? this._renderExportInfo(character)
        : ''}
    `;
  },

  // ========================================
  // SECTION RENDERERS
  // ========================================

  _renderHeader(character, context, callbacks) {
    const { onPrint, onRename, onDuplicate, onExport, onDelete, onLevelChange } = callbacks;
    
    // Function names differ by context
    const renameFn = context === 'builder' ? 'App.openNameModal()' : `renameCharacter('${character.id}')`;

    return `
      <div class="sheet-title-header">
        <div class="sheet-title">${character.name || '[ CHARACTER SHEET ]'}</div>
        <div class="sheet-title-buttons">
          ${character.name && onRename
            ? `
            <button class="button-secondary" onclick="${renameFn}" title="Rename character">
              ✎ RENAME
            </button>
          `
            : ''}
          ${context === 'builder' && onLevelChange
            ? `
            <button class="button-secondary" onclick="App.openLevelModal()" title="Change level and re-roll stats">
              ↕ CHANGE LEVEL
            </button>
          `
            : ''}
          ${context === 'builder' && onPrint
            ? `
            <button class="button-secondary sheet-print-btn" onclick="App.printCharacterSheet()" title="Print this character">
              ⎙ PRINT
            </button>
          `
            : ''}
          ${context === 'manager' && onDelete
            ? `
            <button class="button-secondary" onclick="deleteCharacter('${character.id}')" title="Delete character">
              × DELETE
            </button>
          `
            : ''}
        </div>
      </div>
    `;
  },

  _renderPortrait(character, parsed, context, callbacks) {
    const { onGeneratePortrait, onTogglePortrait } = callbacks;
    const asciiPortrait =
      character.portrait?.ascii ||
      character.customPortraitAscii ||
      character.asciiPortrait ||
      null;
    const originalPortraitUrl =
      character.portrait?.url || character.originalPortraitUrl || null;
    
    // Use different IDs for builder vs manager
    const portraitId = context === 'builder' ? 'character-portrait' : `character-portrait-${character.id || 'current'}`;
    
    // Function names differ by context
    const generateFn = context === 'builder' ? 'App.generateCustomAIPortrait()' : `generatePortraitForCharacter('${character.id}')`;

    return `
      <div class="portrait-container">
        <div class="ascii-portrait" id="${portraitId}"></div>
        ${context === 'builder'
          ? `<img id="original-portrait" class="original-portrait" style="display: none;" alt="Character portrait">`
          : ''}
        <div class="portrait-actions">
          ${parsed.hasRace && parsed.hasClass && onGeneratePortrait
            ? `
            <button class="button-secondary" onclick="${generateFn}" title="Generate a unique AI portrait (${3 - (character.customPortraitCount || 0)} remaining)">
              ★ Custom AI Portrait ${character.customPortraitCount ? `(${3 - character.customPortraitCount})` : '(3)'}
            </button>
          `
            : ''}
          ${context === 'builder' && originalPortraitUrl && onTogglePortrait
            ? `
            <button class="button-secondary" onclick="App.togglePortraitView()" id="toggle-portrait-btn" title="Toggle between ASCII and original art">
              ◉ Toggle View
            </button>
          `
            : ''}
          ${context === 'manager' && originalPortraitUrl
            ? `
            <a href="${originalPortraitUrl}" target="_blank" class="button-secondary" title="View original portrait art">
              👁 View Original
            </a>
          `
            : ''}
        </div>
      </div>
    `;
  },

  _renderBasicInfo(parsed, context, callbacks) {
    return `
      <div class="sheet-section">
        <div class="sheet-header"></div>
        <div class="sheet-content">
          ${parsed.raceName
            ? `<div class="stat-line"><span class="stat-label">Race:</span> <span class="stat-value">${parsed.raceName}</span></div>`
            : ''}
          ${parsed.className
            ? `<div class="stat-line"><span class="stat-label">Class:</span> <span class="stat-value">${parsed.className}</span></div>`
            : ''}
          ${parsed.backgroundName
            ? `<div class="stat-line"><span class="stat-label">Background:</span> <span class="stat-value">${parsed.backgroundName}</span></div>`
            : ''}
          ${parsed.alignment
            ? `<div class="stat-line"><span class="stat-label">Alignment:</span> <span class="stat-value">${parsed.alignment}</span></div>`
            : ''}
          <div class="stat-line">
            <span class="stat-label">Level:</span>
            <span class="stat-value">${parsed.level}</span>
          </div>
        </div>
      </div>
    `;
  },

  _renderCombatStats(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ COMBAT STATS ]</div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-box-label">HIT POINTS</div>
            <div class="stat-box-value">${parsed.hpCurrent} / ${parsed.hpMax}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">ARMOR CLASS</div>
            <div class="stat-box-value">${parsed.armorClass}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">INITIATIVE</div>
            <div class="stat-box-value">${this.formatModifier(parsed.initiative)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">SPEED</div>
            <div class="stat-box-value">${parsed.speed} ft</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">PROF BONUS</div>
            <div class="stat-box-value">+${parsed.proficiencyBonus}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">HIT DIE</div>
            <div class="stat-box-value">d${parsed.hitDie}</div>
          </div>
        </div>
      </div>
    `;
  },

  _renderAbilities(parsed, context) {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    // Use grid layout for both contexts (identical formatting)
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ ABILITY SCORES ]</div>
        </div>
        <div class="ability-grid">
          ${abilities
            .map((ability) => {
              const score = parsed.abilities[ability] || 10;
              const modifier =
                parsed.abilityModifiers[ability] !== undefined
                  ? parsed.abilityModifiers[ability]
                  : Math.floor((score - 10) / 2);
              return `
                <div class="ability-box">
                  <div class="ability-name">${ability.toUpperCase()}</div>
                  <div class="ability-score">${score} <span class="ability-modifier">(${this.formatModifier(modifier)})</span></div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },

  _renderSavingThrows(parsed) {
    if (!parsed.savingThrowModifiers) return '';

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ SAVING THROWS ]</div>
        </div>
        <div class="sheet-content">
          ${Object.entries(parsed.savingThrowModifiers)
            .map(([ability, value]) => {
              const isProficient = parsed.savingThrows?.includes(ability);
              return `
                <div class="stat-line">
                  <span class="stat-label">${ability.toUpperCase()}:</span>
                  <span class="stat-value">${this.formatModifier(value)}${isProficient ? ' ★' : ''}</span>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },

  _renderSkills(parsed) {
    const hasSkillModifiers = parsed.skillModifiers && Object.keys(parsed.skillModifiers).length > 0;
    const hasSkillProfs = parsed.skillProficiencies && parsed.skillProficiencies.length > 0;

    if (!hasSkillModifiers && !hasSkillProfs) return '';

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ ${hasSkillModifiers ? 'SKILLS' : 'SKILL PROFICIENCIES'} ]</div>
        </div>
        <div class="sheet-content">
          ${hasSkillModifiers
            ? Object.entries(parsed.skillModifiers)
                .map(
                  ([skill, value]) => `
                <div class="stat-line">
                  <span class="stat-label">${this.formatSkillName(skill)}:</span>
                  <span class="stat-value">${this.formatModifier(value)} ★</span>
                </div>
              `,
                )
                .join('')
            : parsed.skillProficiencies
                .map(
                  (skill) => `
                <div class="text-dim">• ${this.formatSkillName(skill)}</div>
              `,
                )
                .join('')}
        </div>
      </div>
    `;
  },

  _renderRacialTraits(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ RACIAL TRAITS ]</div>
        </div>
        <div class="sheet-content">
          ${parsed.racialTraits.map((trait) => `<div class="text-dim">• ${trait}</div>`).join('')}
        </div>
      </div>
    `;
  },

  _renderEquipment(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ ${parsed.hasClassEquipment ? 'EQUIPMENT' : 'CLASS EQUIPMENT'} ]</div>
        </div>
        <div class="sheet-content">
          ${parsed.equipment.map((item) => `<div class="text-dim">• ${item}</div>`).join('')}
        </div>
      </div>
    `;
  },

  _renderToolProficiencies(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ TOOL PROFICIENCIES ]</div>
        </div>
        <div class="sheet-content">
          ${parsed.toolProficiencies.map((tool) => `<div class="text-dim">• ${this.formatSkillName(tool)}</div>`).join('')}
        </div>
      </div>
    `;
  },

  _renderLanguages(parsed) {
    if (parsed.languageChoices > 0) {
      return `
        <div class="sheet-section">
          <div class="sheet-header">
            <div class="sheet-header-title">[ LANGUAGES ]</div>
          </div>
          <div class="sheet-content text-dim">
            Choose ${parsed.languageChoices} additional language${parsed.languageChoices > 1 ? 's' : ''}
          </div>
        </div>
      `;
    } else if (parsed.languages.length > 0) {
      return `
        <div class="sheet-section">
          <div class="sheet-header">
            <div class="sheet-header-title">[ LANGUAGES ]</div>
          </div>
          <div class="sheet-content">
            ${parsed.languages.map((lang) => `<div class="text-dim">• ${lang}</div>`).join('')}
          </div>
        </div>
      `;
    }
    return '';
  },

  _renderBackgroundFeature(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ BACKGROUND FEATURE ]</div>
        </div>
        <div class="sheet-content">
          <div class="stat-line"><span class="stat-label">${parsed.backgroundFeatureName}:</span></div>
          <div class="text-dim" style="margin-top: 8px;">${parsed.backgroundFeatureDescription}</div>
        </div>
      </div>
    `;
  },

  _renderBackstory(parsed) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ BACKSTORY ]</div>
        </div>
        <div class="sheet-content text-dim">
          ${parsed.backstory}
        </div>
      </div>
    `;
  },

  _renderExportInfo(character) {
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ EXPORT INFO ]</div>
        </div>
        <div class="sheet-content">
          <div class="stat-line">
            <span class="stat-label">Exported:</span>
            <span class="stat-value">${new Date(character.exportDate).toLocaleDateString()}</span>
          </div>
          ${character.exportedBy
            ? `
            <div class="stat-line">
              <span class="stat-label">Source:</span>
              <span class="stat-value">${character.exportedBy}</span>
            </div>
          `
            : ''}
          <div class="stat-line">
            <span class="stat-label">Version:</span>
            <span class="stat-value">${character.exportVersion || '1.0'}</span>
          </div>
        </div>
      </div>
    `;
  },

  // ========================================
  // DATA PARSING & HELPERS
  // ========================================

  _parseCharacterData(character) {
    // Handle HP (old and new formats)
    const hp = character.hitPoints || { current: 0, max: 0 };
    const hpMax = typeof hp === 'number' ? hp : hp.max || 0;
    const hpCurrent = typeof hp === 'number' ? hp : hp.current || hpMax;

    // Handle abilities (old 'abilityScores' and new 'abilities' format)
    const abilities = character.abilities || character.abilityScores || {};
    const abilityModifiers = character.abilityModifiers || {};
    
    // Check if abilities have been actually rolled/populated
    // baseAbilities is set when abilities are rolled in the builder
    const abilitiesPopulated = character.baseAbilities !== null && character.baseAbilities !== undefined;

    // Handle race/class/background names (enhanced export has nested data)
    const raceName = character.raceData?.name || character.race || null;
    const className = character.classData?.name || character.class || null;
    const backgroundName =
      character.backgroundData?.name || character.background || null;

    // Handle equipment
    const equipment = character.equipment || [];
    const classEquipment = character.classData?.equipment || [];
    const allEquipment = [...new Set([...equipment, ...classEquipment])];

    // Handle racial traits
    const race = window.DND_DATA?.races?.find((r) => r.id === character.race);
    const racialTraits =
      character.raceData?.traits || race?.traits || [];

    // Handle languages
    const languages = [
      ...(character.languages || []),
      ...(character.raceData?.languages || []),
    ];

    // Handle background feature
    const backgroundFeature =
      character.backgroundFeature || character.backgroundData?.feature || null;

    // Skill modifiers and proficiencies
    const skillModifiers = character.skillModifiers || character.skills || {};
    const skillProficiencies = character.skillProficiencies || [];

    return {
      // Basic info
      raceName,
      className,
      backgroundName,
      alignment: character.alignment || null,
      level: character.level || 1,

      // Combat stats
      hpMax,
      hpCurrent,
      armorClass: character.armorClass || 10,
      initiative: character.initiative || 0,
      speed: character.speed || 30,
      proficiencyBonus: character.proficiencyBonus || 2,
      hitDie: character.classData?.hitDie || 6,

      // Abilities
      abilities,
      abilityModifiers,

      // Saving throws
      savingThrows: character.savingThrows || [],
      savingThrowModifiers: character.savingThrowModifiers || null,

      // Skills
      skillModifiers,
      skillProficiencies,

      // Features & traits
      racialTraits,
      toolProficiencies: character.toolProficiencies || [],
      languages,
      languageChoices: character.languageChoices || 0,

      // Equipment
      equipment: allEquipment,

      // Background
      backgroundFeatureName:
        backgroundFeature?.name || 'Feature',
      backgroundFeatureDescription:
        backgroundFeature?.description || '',
      backstory: character.backstory || null,

      // Flags for conditional rendering
      hasRace: !!raceName,
      hasClass: !!className,
      hasAbilities: abilitiesPopulated && Object.keys(abilities).length > 0,
      hasCombatStats: hpMax > 0 || character.armorClass,
      hasSavingThrows:
        character.savingThrowModifiers &&
        Object.keys(character.savingThrowModifiers).length > 0,
      hasSkills:
        Object.keys(skillModifiers).length > 0 ||
        skillProficiencies.length > 0,
      hasRacialTraits: racialTraits.length > 0,
      hasEquipment: allEquipment.length > 0,
      hasClassEquipment: classEquipment.length > 0,
      hasToolProficiencies:
        character.toolProficiencies && character.toolProficiencies.length > 0,
      hasLanguages: languages.length > 0 || character.languageChoices > 0,
      hasBackgroundFeature: !!backgroundFeature,
      hasBackstory: !!character.backstory,
      hasExportInfo: !!character.exportDate,
    };
  },

  // ========================================
  // UTILITIES
  // ========================================

  /**
   * Determine the best ASCII portrait to use for a character.
   * Prefers:
   * 1) Custom AI portraits
   * 2) Stored asciiPortrait that matches the current race|class key
   * 3) Exported portrait.ascii
   * 4) Legacy asciiPortrait field
   */
  getAsciiPortrait(character) {
    if (!character) return null;

    const key = `${character.race || ''}|${character.class || ''}`;

    // 1) Explicit custom portrait always wins
    if (character.customPortraitAscii) {
      return character.customPortraitAscii;
    }

    // 2) If asciiPortrait is tagged for this race/class combo, trust it
    if (
      character.asciiPortrait &&
      character.asciiPortraitKey &&
      character.asciiPortraitKey === key
    ) {
      return character.asciiPortrait;
    }

    // 3) Exported portrait object from builder
    if (character.portrait && character.portrait.ascii) {
      return character.portrait.ascii;
    }

    // 4) Legacy asciiPortrait without key tagging
    if (character.asciiPortrait) {
      return character.asciiPortrait;
    }

    return null;
  },

  formatModifier(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  },

  formatSkillName(skill) {
    return skill
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  },

  /**
   * Helper function to populate ASCII portrait after rendering
   * Call this after inserting the HTML into the DOM
   * @param {Object} character - Character data object
   * @param {string} context - 'builder' or 'manager' to determine which ID to use
   */
  populatePortrait(character, context = 'manager') {
    const portraitId =
      context === 'builder'
        ? 'character-portrait'
        : `character-portrait-${character.id || 'current'}`;
    const portraitEl = document.getElementById(portraitId);
    const asciiPortrait = this.getAsciiPortrait(character);

    if (portraitEl && asciiPortrait) {
      portraitEl.textContent = asciiPortrait;
    }
  },
});

