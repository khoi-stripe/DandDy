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
      ${this._renderHeader(character, parsed, context, {
        onPrint,
        onRename,
        onDuplicate,
        onExport,
        onDelete,
        onLevelChange,
        onEdit,
        onGeneratePortrait,
        onTogglePortrait,
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
      
      ${parsed.hasSpells ? this._renderSpells(parsed) : ''}
      
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

  _renderHeader(character, parsed, context, callbacks) {
    const {
      onPrint,
      onRename,
      onDuplicate,
      onExport,
      onDelete,
      onLevelChange,
      onEdit,
      onGeneratePortrait,
      onTogglePortrait,
    } = callbacks;
    // Function names differ by context
    const renameFn = context === 'builder' ? 'App.openNameModal()' : `renameCharacter('${character.id}')`;
    const editFn = context === 'manager' ? `editCharacter('${character.id}')` : null;
    const printFn =
      onPrint && context === 'builder'
        ? 'App.printCharacterSheet()'
        : onPrint && context === 'manager'
          ? 'printCharacterSheet()'
          : null;

    const headerActions = [];
    let deleteAction = null;

    if (character.name && onRename && context === 'builder') {
      headerActions.push({
        icon: '✎',
        label: 'Rename',
        onclick: renameFn,
      });
    }

    if (context === 'builder' && onLevelChange) {
      headerActions.push({
        icon: '↕',
        label: 'Change level',
        onclick: 'App.openLevelModal()',
      });
    }

    if (context === 'manager' && onDelete) {
      deleteAction = {
        icon: '×',
        label: 'Delete character',
        onclick: `deleteCharacter('${character.id}')`,
      };
    }

    // Portrait-related actions (moved from below-ascii overflow)
    const safeIdForDom = character.id || 'current';
    const hasValidManagerId = !!character.id;
    const toggleBtnId =
      context === 'builder'
        ? 'toggle-portrait-btn'
        : `toggle-portrait-btn-${safeIdForDom}`;
    const generateFn =
      context === 'builder'
        ? 'App.generateCustomAIPortrait()'
        : hasValidManagerId
          ? `generatePortraitForCharacter('${character.id}')`
          : null;
    const toggleFn =
      context === 'builder'
        ? 'App.togglePortraitView()'
        : `togglePortraitView('${safeIdForDom}')`;
    const hasCustomPortrait = !!(
      character.customPortraitAscii ||
      character.originalPortraitUrl ||
      character.portrait?.url ||
      (character.portraitMetadata &&
        Array.isArray(character.portraitMetadata.versions) &&
        character.portraitMetadata.versions.length > 0)
    );
    const historyFn =
      context === 'builder'
        ? 'App.openPortraitHistory()'
        : hasValidManagerId
          ? `openPortraitHistory('${character.id}')`
          : null;

    const originalPortraitUrl =
      character.portrait?.url || character.originalPortraitUrl || null;

    if (
      parsed.hasRace &&
      parsed.hasClass &&
      onGeneratePortrait &&
      (context === 'builder' || hasValidManagerId) &&
      generateFn
    ) {
      headerActions.push({
        icon: '★',
        label: 'Custom AI Portrait',
        onclick: generateFn,
      });
    }

    if (originalPortraitUrl && (onTogglePortrait || context === 'manager')) {
      headerActions.push({
        icon: '◉',
        label: 'View original art',
        onclick: toggleFn,
        id: toggleBtnId,
      });
    }

    if (hasCustomPortrait && historyFn) {
      headerActions.push({
        icon: '⧖',
        label: 'Portrait history',
        onclick: historyFn,
      });
    }

    // Keep "Print sheet" near the bottom of the list, but always leave
    // room for destructive actions (like Delete) to appear last.
    if (printFn) {
      headerActions.push({
        icon: '⎙',
        label: 'Print sheet',
        onclick: printFn,
      });
    }

    // Append Delete last so it always appears at the bottom of the listbox
    if (deleteAction) {
      headerActions.push(deleteAction);
    }

    // Manager-only inline Edit button (to the left of the overflow menu)
    const editButtonHtml =
      context === 'manager' && onEdit && editFn
        ? `
        <button
          class="terminal-btn-small sheet-edit-btn"
          type="button"
          onclick="${editFn}"
        >
          ✎ Edit
        </button>
      `
        : '';

    const headerMenu =
      headerActions.length > 0
        ? `
        <div class="sheet-title-buttons selector-shell">
          <button
            class="terminal-btn-small selector-trigger sheet-actions-trigger"
            type="button"
            aria-haspopup="menu"
            aria-expanded="false"
            aria-label="More actions"
            onclick="CharacterSheet.toggleSelectorMenu(this)"
          >
            <span class="sheet-actions-icon" aria-hidden="true">
              <span class="sheet-actions-dot dot-1"></span>
              <span class="sheet-actions-dot dot-2"></span>
              <span class="sheet-actions-dot dot-3"></span>
            </span>
          </button>
          <div class="selector-menu sheet-actions-menu" role="menu" aria-hidden="true">
            ${headerActions
              .map(
                (action) => `
              <button
                class="selector-option"
                type="button"
                role="menuitem"
                onclick="${action.onclick}"${
                  action.id ? ` id="${action.id}"` : ''
                }
              >
                <span class="selector-option-icon">${action.icon}</span>
                <span class="selector-option-label">${action.label}</span>
              </button>
            `,
              )
              .join('')}
          </div>
        </div>
      `
        : '';

    const actionsBlock =
      editButtonHtml || headerMenu
        ? `
        <div class="sheet-title-actions">
          ${editButtonHtml}
          ${headerMenu}
        </div>
      `
        : '';

    const safeTitle =
      character.name && typeof character.name === 'string'
        ? this.escapeHtml(character.name)
        : '[ CHARACTER SHEET ]';

    return `
      <div class="sheet-title-header">
        <div class="sheet-title">${safeTitle}</div>
        ${actionsBlock}
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
    const safeIdForDom = character.id || 'current';
    const portraitId = context === 'builder' ? 'character-portrait' : `character-portrait-${safeIdForDom}`;
    const originalPortraitId =
      context === 'builder' ? 'original-portrait' : `original-portrait-${safeIdForDom}`;
    return `
      <div class="portrait-container">
        <div class="ascii-portrait" id="${portraitId}"></div>
        ${originalPortraitUrl
          ? `<img id="${originalPortraitId}" class="original-portrait is-hidden" src="${originalPortraitUrl}" alt="Character portrait">`
          : ''}
      </div>
    `;
  },

  _renderBasicInfo(parsed, context, callbacks) {
    const race = parsed.raceName ? this.escapeHtml(parsed.raceName) : '';
    const cls = parsed.className ? this.escapeHtml(parsed.className) : '';
    const background = parsed.backgroundName
      ? this.escapeHtml(parsed.backgroundName)
      : '';
    const alignment = parsed.alignment
      ? this.escapeHtml(parsed.alignment)
      : '';

    return `
      <div class="sheet-section">
        <div class="sheet-header"></div>
        <div class="sheet-content">
          ${race
            ? `<div class="stat-line"><span class="stat-label">Race:</span> <span class="stat-value">${race}</span></div>`
            : ''}
          ${cls
            ? `<div class="stat-line"><span class="stat-label">Class:</span> <span class="stat-value">${cls}</span></div>`
            : ''}
          ${background
            ? `<div class="stat-line"><span class="stat-label">Background:</span> <span class="stat-value">${background}</span></div>`
            : ''}
          ${alignment
            ? `<div class="stat-line"><span class="stat-label">Alignment:</span> <span class="stat-value">${alignment}</span></div>`
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

  /**
   * Generic toggle for selector-style overflow menus used in the sheet header
   * and portrait actions. Attaches to the nearest `.selector-shell` and
   * uses shared `.selector-menu` styles/animation.
   * @param {HTMLElement} triggerEl
   */
  toggleSelectorMenu(triggerEl) {
    if (!triggerEl) return;
    const shell = triggerEl.closest('.selector-shell');
    if (!shell) return;
    const menu = shell.querySelector('.selector-menu');
    if (!menu) return;

    const isOpen = shell.classList.contains('is-open');

    const setOpen = (open) => {
      if (open) {
        // Decide which horizontal side has more space, based on the trigger
        const shellRect = shell.getBoundingClientRect();
        const triggerRect = triggerEl.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        const spaceLeft = triggerRect.left;
        const spaceRight = viewportWidth - triggerRect.right;
        const side = spaceRight >= spaceLeft ? 'right' : 'left';

        // Measure menu height without affecting transform/animation
        const prevDisplay = menu.style.display;
        const prevVisibility = menu.style.visibility;

        menu.style.visibility = 'hidden';
        menu.style.display = 'block';

        const menuRect = menu.getBoundingClientRect();
        const menuHeight = menuRect.height || 0;

        menu.style.display = prevDisplay;
        menu.style.visibility = prevVisibility;

        // Vertically center menu relative to the trigger position
        const triggerCenterY = triggerRect.top + triggerRect.height / 2;
        const offsetTop =
          triggerCenterY - shellRect.top - menuHeight / 2;
        menu.style.top = `${offsetTop}px`;

        // Horizontal offset: sit just outside the trigger with a small gap
        const gap = 4;
        if (side === 'right') {
          const offsetLeft =
            triggerRect.right - shellRect.left + gap;
          menu.style.left = `${offsetLeft}px`;
          menu.style.right = '';
        } else {
          const offsetRight =
            shellRect.right - triggerRect.left + gap;
          menu.style.right = `${offsetRight}px`;
          menu.style.left = '';
        }

        shell.classList.add('is-open');
        triggerEl.classList.add('is-open');
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        triggerEl.setAttribute('aria-expanded', 'true');

        // Focus first option for immediate keyboard navigation
        const firstOption = menu.querySelector('.selector-option');
        if (firstOption) {
          firstOption.focus();
        }
      } else {
        shell.classList.remove('is-open');
        triggerEl.classList.remove('is-open');
        menu.classList.remove('is-open');
        menu.setAttribute('aria-hidden', 'true');
        triggerEl.setAttribute('aria-expanded', 'false');
      }
    };

    setOpen(!isOpen);

    if (!this._selectorOutsideHandler) {
      this._selectorOutsideHandler = (event) => {
        const openShells = document.querySelectorAll('.selector-shell.is-open');
        if (!openShells.length) return;
        if (event.target.closest('.selector-shell')) return;
        openShells.forEach((openShell) => {
          const btn = openShell.querySelector('.selector-trigger');
          const m = openShell.querySelector('.selector-menu');
          if (!btn || !m) return;
          btn.classList.remove('is-open');
          m.classList.remove('is-open');
          m.setAttribute('aria-hidden', 'true');
          btn.setAttribute('aria-expanded', 'false');
          openShell.classList.remove('is-open');
        });
      };
      document.addEventListener('click', this._selectorOutsideHandler);
    }

    if (!this._selectorKeyHandler) {
      this._selectorKeyHandler = (event) => {
        if (event.key !== 'Escape') return;
        const openShells = document.querySelectorAll('.selector-shell.is-open');
        if (!openShells.length) return;
        openShells.forEach((openShell) => {
          const btn = openShell.querySelector('.selector-trigger');
          const m = openShell.querySelector('.selector-menu');
          if (!btn || !m) return;
          btn.classList.remove('is-open');
          m.classList.remove('is-open');
          m.setAttribute('aria-hidden', 'true');
          btn.setAttribute('aria-expanded', 'false');
          openShell.classList.remove('is-open');
          btn.focus();
        });
      };
      document.addEventListener('keydown', this._selectorKeyHandler);
    }
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
    const hasSkillModifiers =
      parsed.skillModifiers && Object.keys(parsed.skillModifiers).length > 0;
    const hasSkillProfs =
      parsed.skillProficiencies && parsed.skillProficiencies.length > 0;

    if (!hasSkillModifiers && !hasSkillProfs) return '';

    // When we have both full skill modifiers and an explicit list of
    // proficiencies (e.g. edited in manager), show the numeric skills first
    // and then any *extra* proficiencies as a simple bullet list.
    const modifierKeys = hasSkillModifiers
      ? Object.keys(parsed.skillModifiers)
      : [];

    const extraProfs =
      hasSkillProfs && modifierKeys.length
        ? parsed.skillProficiencies.filter(
            (skill) => !modifierKeys.includes(skill),
          )
        : parsed.skillProficiencies || [];

    const skillsMarkup = hasSkillModifiers
      ? Object.entries(parsed.skillModifiers)
          .map(
            ([skill, value]) => `
          <div class="stat-line">
            <span class="stat-label">${this.escapeHtml(
              this.formatSkillName(skill),
            )}:</span>
            <span class="stat-value">${this.formatModifier(value)} ★</span>
          </div>
        `,
          )
          .join('')
      : '';

    const extraProfsMarkup =
      extraProfs && extraProfs.length
        ? extraProfs
            .map((skill) => {
              const label = this.escapeHtml(this.formatSkillName(skill));
              return `<div class="text-dim">• ${label}</div>`;
            })
            .join('')
        : '';

    const headerTitle = hasSkillModifiers
      ? 'SKILLS'
      : 'SKILL PROFICIENCIES';

    let contentMarkup;
    if (skillsMarkup && extraProfsMarkup) {
      contentMarkup = `
        ${skillsMarkup}
        <div class="sheet-divider"></div>
        ${extraProfsMarkup}
      `;
    } else {
      contentMarkup = skillsMarkup || extraProfsMarkup;
    }

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ ${headerTitle} ]</div>
        </div>
        <div class="sheet-content">
          ${contentMarkup}
        </div>
      </div>
    `;
  },

  _renderSpells(parsed) {
    const cantrips = parsed.cantrips || [];
    const spellsKnown = parsed.spellsKnown || [];
    const spellsPrepared = parsed.spellsPrepared || [];
    const spellSlots = parsed.spellSlots || {};

    // Helper to render spell list
    const renderSpellList = (spells) => {
      return spells
        .map((spell) => {
          const rawName = spell && typeof spell === 'object' ? spell.name : spell;
          const name = this.escapeHtml(rawName || '');
          const school =
            spell && spell.school
              ? ` <span class="text-dim">(${this.escapeHtml(
                  spell.school,
                )})</span>`
              : '';
          const desc =
            spell && spell.description
              ? `<div class="text-dim terminal-text-small" style="margin-left: 1rem;">${this.escapeHtml(
                  spell.description,
                )}</div>`
              : '';
        return `<div class="text-dim" style="margin-bottom: 0.25rem;">• ${name}${school}</div>${desc}`;
        })
        .join('');
    };

    let spellsContent = '';

    // Cantrips
    if (cantrips.length > 0) {
      spellsContent += `
        <div class="sheet-subsection">
          <div class="sheet-subsection-title">CANTRIPS (At-Will)</div>
          ${renderSpellList(cantrips)}
        </div>
      `;
    }

    // 1st Level Spells
    if (spellsKnown.length > 0 || spellsPrepared.length > 0) {
      const spellList = spellsKnown.length > 0 ? spellsKnown : spellsPrepared;
      const slotsText = spellSlots['1'] ? ` • Slots: ${spellSlots['1']}` : '';
      const preparedText = spellsPrepared.length > 0 && spellsKnown.length === 0 ? ' (Prepared)' : '';
      
      spellsContent += `
        <div class="sheet-subsection">
          <div class="sheet-subsection-title">1ST LEVEL${preparedText}${slotsText}</div>
          ${renderSpellList(spellList)}
        </div>
      `;
    }

    // Spellcasting ability note
    if (parsed.spellcastingAbility) {
      const abilityName = {
        int: 'Intelligence',
        wis: 'Wisdom',
        cha: 'Charisma',
      }[parsed.spellcastingAbility] || parsed.spellcastingAbility;
      
      spellsContent += `
        <div class="text-dim terminal-text-small" style="margin-top: 0.5rem;">
          Spellcasting Ability: ${this.escapeHtml(abilityName)}
        </div>
      `;
    }

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ SPELLS ]</div>
        </div>
        <div class="sheet-content">
          ${spellsContent}
        </div>
      </div>
    `;
  },

  _renderRacialTraits(parsed) {
    const traitsMarkup = parsed.racialTraits
      .map((trait) => `<div class="text-dim">• ${this.escapeHtml(trait)}</div>`)
      .join('');

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ RACIAL TRAITS ]</div>
        </div>
        <div class="sheet-content">
          ${traitsMarkup}
        </div>
      </div>
    `;
  },

  _renderEquipment(parsed) {
    const equipmentMarkup = parsed.equipment
      .map(
        (item) =>
          `<div class="text-dim">• ${this.escapeHtml(
            item,
          )}</div>`,
      )
      .join('');

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ ${parsed.hasClassEquipment ? 'EQUIPMENT' : 'CLASS EQUIPMENT'} ]</div>
        </div>
        <div class="sheet-content">
          ${equipmentMarkup}
        </div>
      </div>
    `;
  },

  _renderToolProficiencies(parsed) {
    const toolsMarkup = parsed.toolProficiencies
      .map((tool) => {
        const label = this.escapeHtml(this.formatSkillName(tool));
        return `<div class="text-dim">• ${label}</div>`;
      })
      .join('');

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ TOOL PROFICIENCIES ]</div>
        </div>
        <div class="sheet-content">
          ${toolsMarkup}
        </div>
      </div>
    `;
  },

  _renderLanguages(parsed) {
    const hasLanguages = parsed.languages.length > 0;
    const hasChoices = parsed.languageChoices > 0;
    
    if (!hasLanguages && !hasChoices) {
      return '';
    }
    
    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ LANGUAGES ]</div>
        </div>
        <div class="sheet-content">
          ${
            hasLanguages
              ? parsed.languages
                  .map(
                    (lang) =>
                      `<div class="text-dim">• ${this.escapeHtml(
                        lang,
                      )}</div>`,
                  )
                  .join('')
              : ''
          }
          ${hasChoices 
            ? `<div class="text-dim ${hasLanguages ? 'mt-sm' : ''}">+ Choose ${parsed.languageChoices} additional language${parsed.languageChoices > 1 ? 's' : ''}</div>` 
            : ''}
        </div>
      </div>
    `;
  },

  _renderBackgroundFeature(parsed) {
    const name = this.escapeHtml(parsed.backgroundFeatureName || 'Feature');
    const description = this.escapeHtml(
      parsed.backgroundFeatureDescription || '',
    );

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ BACKGROUND FEATURE ]</div>
        </div>
        <div class="sheet-content">
          <div class="stat-line"><span class="stat-label">${name}:</span></div>
          <div class="text-dim mt-sm">${description}</div>
        </div>
      </div>
    `;
  },

  _renderBackstory(parsed) {
    const backstory = this.escapeHtml(parsed.backstory || '');

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ BACKSTORY ]</div>
        </div>
        <div class="sheet-content text-dim">
          ${backstory}
        </div>
      </div>
    `;
  },

  _renderExportInfo(character) {
    const exportedBy = character.exportedBy
      ? this.escapeHtml(character.exportedBy)
      : null;
    const version = this.escapeHtml(character.exportVersion || '1.0');

    return `
      <div class="sheet-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ EXPORT INFO ]</div>
        </div>
        <div class="sheet-content">
          <div class="stat-line">
            <span class="stat-label">Exported:</span>
            <span class="stat-value">${new Date(
              character.exportDate,
            ).toLocaleDateString()}</span>
          </div>
          ${
            exportedBy
            ? `
            <div class="stat-line">
              <span class="stat-label">Source:</span>
              <span class="stat-value">${exportedBy}</span>
            </div>
          `
              : ''
          }
          <div class="stat-line">
            <span class="stat-label">Version:</span>
            <span class="stat-value">${version}</span>
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
    
    // Check if abilities have been actually rolled/populated.
    // - In the builder, baseAbilities is set when abilities are rolled.
    // - In manager/cloud-sourced characters, baseAbilities may be undefined,
    //   but we still want to show abilities when they exist.
    const hasAbilityKeys = abilities && Object.keys(abilities).length > 0;
    const abilitiesPopulated =
      (character.baseAbilities !== null && character.baseAbilities !== undefined) ||
      hasAbilityKeys;

    // Handle race/class/background names (enhanced export has nested data)
    const raceName = character.raceData?.name || character.race || null;
    const className = character.classData?.name || character.class || null;
    const backgroundName =
      character.backgroundData?.name || character.background || null;

    // Handle equipment
    const classEquipment = character.classData?.equipment || [];
    const explicitEquipment = character.equipment || [];
    // If player has explicitly edited equipment, treat that as the source of truth.
    // Otherwise, fall back to class equipment + any existing equipment array.
    const allEquipment =
      explicitEquipment && explicitEquipment.length > 0
        ? explicitEquipment
        : [...new Set([...(character.equipment || []), ...classEquipment])];

    // Handle racial traits
    const race = window.DND_DATA?.races?.find((r) => r.id === character.race);
    const racialTraits =
      character.raceData?.traits || race?.traits || [];

    // Handle languages
    // If character.languages has been explicitly edited, use it as-is.
    // Otherwise, merge race languages for convenience.
    let languages = [...(character.languages || [])];
    if (languages.length === 0) {
      languages = [
        ...languages,
        ...(character.raceData?.languages || []),
      ];
    }

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

      // Spells
      spellcastingAbility: character.spellcastingAbility || null,
      cantrips: character.cantrips || [],
      spellsKnown: character.spellsKnown || [],
      spellsPrepared: character.spellsPrepared || [],
      spellSlots: character.spellSlots || {},

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
      hasSpells:
        (character.cantrips && character.cantrips.length > 0) ||
        (character.spellsKnown && character.spellsKnown.length > 0) ||
        (character.spellsPrepared && character.spellsPrepared.length > 0),
      hasRacialTraits: racialTraits.length > 0,
      hasEquipment: allEquipment.length > 0,
      hasClassEquipment:
        (!explicitEquipment || explicitEquipment.length === 0) &&
        classEquipment.length > 0,
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
   * Basic HTML-escape helper for safely interpolating text into template
   * strings. Converts &, <, >, ", and ' to their corresponding entities.
   */
  escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

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
      this._centerPortraitScrollSafely(portraitEl);
    }

    // Attempt a transparent upgrade to the best available pre-generated
    // portrait (race+class combo) when possible. This fixes older characters
    // that only have race-level art stored.
    this._maybeUpgradePortraitFromFiles(character, context, portraitEl);
  },

  /**
   * Safely center the horizontal scroll position of a portrait element.
   * Extracted so we can reuse it after async portrait upgrades.
   * @param {HTMLElement} portraitEl
   * @private
   */
  _centerPortraitScrollSafely(portraitEl) {
    if (!portraitEl) return;
    try {
      // When the sheet is narrower than the portrait, center the visible
      // viewport horizontally so the "image" doesn't appear pinned left.
      const scrollableWidth = portraitEl.scrollWidth - portraitEl.clientWidth;
      if (scrollableWidth > 0) {
        portraitEl.scrollLeft = scrollableWidth / 2;
      }
    } catch (e) {
      // Non-fatal: if anything goes wrong, leave default scroll position
      console.warn(
        'CharacterSheet._centerPortraitScrollSafely: scroll centering failed',
        e,
      );
    }
  },

  /**
   * If the character doesn't already have a race+class-tagged ASCII portrait,
   * try to upgrade it using the pre-generated files under generated_portraits/.
   *
   * This runs transparently in the background and, if successful, will:
   * - update the in-memory character object
   * - persist the new portrait (CharacterStorage / CharacterState)
   * - refresh the visible portrait element
   *
   * @param {Object} character
   * @param {string} context
   * @param {HTMLElement|null} portraitEl
   * @private
   */
  _maybeUpgradePortraitFromFiles(character, context, portraitEl) {
    try {
      if (!character) return;

      // Never override an explicit custom AI portrait
      if (character.customPortraitAscii) return;

      const race = character.race;
      const classType = character.class;
      if (!race || !classType) return;

      const key = `${race || ''}|${classType || ''}`;

      // If we already have a portrait that is explicitly tagged for this
      // exact race/class combo, there's nothing to upgrade.
      if (character.asciiPortrait && character.asciiPortraitKey === key) {
        return;
      }

      // Lightweight in-memory cache so we only fetch each combo once per page load
      if (!this._portraitFileCache) {
        this._portraitFileCache = {};
      }
      const cacheKey = `${String(race).toLowerCase()}|${String(
        classType,
      ).toLowerCase()}`;

      if (this._portraitFileCache[cacheKey]) {
        this._applyUpgradedPortrait(
          character,
          context,
          portraitEl,
          this._portraitFileCache[cacheKey],
          key,
        );
        return;
      }

      // Async fetch so we don't block rendering
      (async () => {
        try {
          const raceSlug = String(race)
            .toLowerCase()
            .replace(/\s+/g, '-');
          const classSlug = String(classType)
            .toLowerCase()
            .replace(/\s+/g, '-');
          const basePath = 'generated_portraits/ascii';

          let best = null;

          // Try race-class combo first
          if (raceSlug && classSlug) {
            try {
              const resp = await fetch(
                `${basePath}/${raceSlug}-${classSlug}.txt`,
              );
              if (resp.ok) {
                best = await resp.text();
              }
            } catch (e) {
              // Network or fetch issue – we'll try race-only next
              console.warn(
                'CharacterSheet._maybeUpgradePortraitFromFiles: race-class fetch failed',
                e,
              );
            }
          }

          // Fallback to race-only portrait
          if (!best && raceSlug) {
            try {
              const resp = await fetch(`${basePath}/${raceSlug}.txt`);
              if (resp.ok) {
                best = await resp.text();
              }
            } catch (e) {
              console.warn(
                'CharacterSheet._maybeUpgradePortraitFromFiles: race-only fetch failed',
                e,
              );
            }
          }

          if (!best) {
            return;
          }

          this._portraitFileCache[cacheKey] = best;
          await this._applyUpgradedPortrait(character, context, portraitEl, best, key);
        } catch (e) {
          console.warn(
            'CharacterSheet._maybeUpgradePortraitFromFiles: unexpected error',
            e,
          );
        }
      })();
    } catch (e) {
      console.warn(
        'CharacterSheet._maybeUpgradePortraitFromFiles: setup error',
        e,
      );
    }
  },

  /**
   * Apply an upgraded ASCII portrait to the character, persist it, and
   * refresh the DOM element if provided.
   *
   * @param {Object} character
   * @param {string} context
   * @param {HTMLElement|null} portraitEl
   * @param {string} ascii
   * @param {string} key
   * @private
   */
  async _applyUpgradedPortrait(character, context, portraitEl, ascii, key) {
    if (!character || !ascii) return;

    character.asciiPortrait = ascii;
    character.asciiPortraitKey = key;

    // Persist the upgraded portrait so future loads are instant
    // Use silent mode so automatic portrait upgrades don't mark character as "modified"
    try {
      if (context === 'manager' && window.CharacterStorage && character.id) {
        window.CharacterStorage.update(character.id, {
          asciiPortrait: ascii,
          asciiPortraitKey: key,
        }, { silent: true });  // Silent mode: don't update modified timestamp
      } else if (context === 'builder' && window.CharacterState) {
        // In builder context, update local state only. We no longer auto-save
        // new characters here; the player explicitly saves from the builder UI.
        window.CharacterState.updateCharacter({
          asciiPortrait: ascii,
          asciiPortraitKey: key,
        });
      }
    } catch (e) {
      console.warn(
        'CharacterSheet._applyUpgradedPortrait: failed to persist upgraded portrait',
        e,
      );
    }

    // Refresh the visible portrait
    if (portraitEl) {
      portraitEl.textContent = ascii;
      this._centerPortraitScrollSafely(portraitEl);
    }
  },
});

// ========================================
// SHARED PORTRAIT VERSIONING HELPERS
// ========================================

const PortraitHistory = (window.PortraitHistory = {
  MAX_VERSIONS: 5,

  /**
   * Append a new portrait version to a character's metadata.
   * Returns the updated portraitMetadata object (does not mutate character).
   *
   * @param {Object} character
   * @param {string} asciiArt
   * @param {string|null} imageUrl
   * @param {Object} extra - { source, prompt }
   */
  addVersion(character, asciiArt, imageUrl, extra = {}) {
    if (!character) {
      return character?.portraitMetadata || {};
    }

    const existingMetadata = character.portraitMetadata || {};
    const existingVersions = Array.isArray(existingMetadata.versions)
      ? existingMetadata.versions
      : [];

    const id = `v_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 5)}`;

    const version = {
      id,
      createdAt: new Date().toISOString(),
      ascii: asciiArt || '',
      url: imageUrl || null,
      source: extra.source || 'custom-ai',
      prompt: extra.prompt || null,
    };

    const versions = [version, ...existingVersions].slice(0, this.MAX_VERSIONS);

    return {
      ...existingMetadata,
      versions,
      activeVersionId: id,
    };
  },
});

