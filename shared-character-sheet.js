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
    const parsed = this._parseCharacterData(character, context);

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
      
      ${showPortrait
        ? this._renderPortrait(character, parsed, context, {
            onGeneratePortrait,
            onTogglePortrait,
          })
        : ''}
      
      ${this._renderBasicInfo(parsed, context, {})}
      
      ${parsed.hasCombatStats ? this._renderCombatStats(parsed, context) : ''}
      
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

    // Read the global portrait view mode so the overflow toggle label/icon
    // matches the actual default view (ASCII vs Original). This mirrors the
    // logic used in _renderPortrait so builder + manager stay in sync.
    let portraitViewMode = 'ascii';
    try {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        portraitViewMode = StorageService.getPortraitViewMode();
      } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
        portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
      }
    } catch (e) {
      // Non‑fatal: keep default
    }

    const showOriginalByDefault =
      !!originalPortraitUrl && portraitViewMode === 'original';

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
      const toggleIcon = showOriginalByDefault ? '≡' : '◉';
      const toggleLabel = showOriginalByDefault ? 'View ASCII Art' : 'View original art';
      headerActions.push({
        icon: toggleIcon,
        label: toggleLabel,
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

    // Global portrait view mode (ASCII vs Original). Builder + manager share
    // this preference via StorageService; fall back to config default.
    let portraitViewMode = 'ascii';
    try {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        portraitViewMode = StorageService.getPortraitViewMode();
      } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
        portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
      }
    } catch (e) {
      // Non-fatal: keep default
    }
    
    // Use different IDs for builder vs manager
    const safeIdForDom = character.id || 'current';
    const portraitId = context === 'builder' ? 'character-portrait' : `character-portrait-${safeIdForDom}`;
    const originalPortraitId =
      context === 'builder' ? 'original-portrait' : `original-portrait-${safeIdForDom}`;
    
    // Check if we need to show placeholder (no ASCII portrait content yet)
    const needsPlaceholder = !asciiPortrait && !originalPortraitUrl;

    const showOriginalByDefault =
      !!originalPortraitUrl &&
      portraitViewMode === 'original' &&
      !needsPlaceholder;

    return `
      <div class="portrait-container${showOriginalByDefault ? ' portrait-container--original-mode' : ''}">
        <div class="ascii-portrait ${needsPlaceholder ? 'ascii-portrait--placeholder' : ''} ${showOriginalByDefault ? 'is-hidden' : ''}" id="${portraitId}">
          ${needsPlaceholder ? `
            <div class="portrait-placeholder-content">
              <div class="portrait-placeholder-cube-container">
                <div class="portrait-placeholder-cube">
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                  <i></i>
                </div>
              </div>
              <div class="portrait-placeholder-text">Waiting for character data…</div>
            </div>
          ` : ''}
        </div>
        ${originalPortraitUrl
          ? `<img id="${originalPortraitId}" class="original-portrait${showOriginalByDefault ? '' : ' is-hidden'}" src="${originalPortraitUrl}" alt="Character portrait">`
          : ''}
      </div>
    `;
  },

  _renderBasicInfo(parsed, context, callbacks) {
    const isBuilder = context === 'builder';
    const race = parsed.raceName
      ? this.escapeHtml(this.toSentenceCase(parsed.raceName))
      : '';
    const cls = parsed.className
      ? this.escapeHtml(this.toSentenceCase(parsed.className))
      : '';
    const background = parsed.backgroundName
      ? this.escapeHtml(this.toSentenceCase(parsed.backgroundName))
      : '';
    const alignment = parsed.alignment
      ? this.escapeHtml(
          this.toSentenceCase(this.formatAlignment(parsed.alignment)),
        )
      : '';

    return `
      <div class="sheet-section">
        <div class="sheet-header"></div>
        <div class="sheet-content">
          ${
            isBuilder || race
              ? `<div class="stat-line"><span class="stat-label">Race:</span> <span class="stat-value">${race || '—'}</span></div>`
              : ''
          }
          ${
            isBuilder || cls
              ? `<div class="stat-line"><span class="stat-label">Class:</span> <span class="stat-value">${cls || '—'}</span></div>`
              : ''
          }
          ${
            isBuilder || background
              ? `<div class="stat-line"><span class="stat-label">Background:</span> <span class="stat-value">${background || '—'}</span></div>`
              : ''
          }
          ${
            isBuilder || alignment
              ? `<div class="stat-line"><span class="stat-label">Alignment:</span> <span class="stat-value">${alignment || '—'}</span></div>`
              : ''
          }
          <div class="stat-line">
            <span class="stat-label">Level:</span>
            <span class="stat-value">${parsed.level}</span>
          </div>
        </div>
      </div>
    `;
  },

  _renderCombatStats(parsed, context) {
    const headerClass =
      context === 'builder'
        ? 'sheet-header sheet-header--no-divider'
        : 'sheet-header';
    
    // In builder context, check if combat stats have been populated
    // Show dashes for empty/default values until they're set
    const isBuilder = context === 'builder';
    const hasCombatStats = parsed.hpMax > 0;

    return `
      <div class="sheet-section">
        <div class="${headerClass}">
          <div class="sheet-header-title">[ COMBAT STATS ]</div>
        </div>
        <div class="stat-grid">
          <div class="stat-box">
            <div class="stat-box-label">HIT POINTS</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `${parsed.hpCurrent} / ${parsed.hpMax}`}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">ARMOR CLASS</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : parsed.armorClass}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">INITIATIVE</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : this.formatModifier(parsed.initiative)}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">SPEED</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `${parsed.speed} ft`}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">PROF BONUS</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `+${parsed.proficiencyBonus}`}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">HIT DIE</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `d${parsed.hitDie}`}</div>
          </div>
        </div>
      </div>
    `;
  },

  _renderAbilities(parsed, context) {
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    const headerClass =
      context === 'builder'
        ? 'sheet-header sheet-header--no-divider'
        : 'sheet-header';

    // Use grid layout for both contexts (identical formatting)
    return `
      <div class="sheet-section">
        <div class="${headerClass}">
          <div class="sheet-header-title">[ ABILITY SCORES ]</div>
        </div>
        <div class="ability-grid">
          ${abilities
            .map((ability) => {
              // Show dashes if abilities haven't been set yet (baseAbilities is null)
              if (!parsed.abilitiesSet) {
                return `
                  <div class="ability-box">
                    <div class="ability-name">${ability.toUpperCase()}</div>
                    <div class="ability-score">— <span class="ability-modifier">(—)</span></div>
                  </div>
                `;
              }
              
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
    // Use detached menu if present (portrait history), otherwise fall back
    // to the inline selector-menu element so toggling works in both cases.
    const menu = shell._detachedMenu || shell.querySelector('.selector-menu');
    if (!menu) return;

    const isOpen = shell.classList.contains('is-open');

    // Helper to close a given selector shell and restore any detached menu.
    // Also ensures focus is never left inside a menu that has aria-hidden="true"
    // to avoid accessibility violations in modern browsers.
    const closeShell = (openShell) => {
      if (!openShell) return;
      const btn = openShell.querySelector('.selector-trigger');
      const m = openShell._detachedMenu || openShell.querySelector('.selector-menu');
      if (!btn || !m) return;

      // Restore menu to original parent if it was moved (portrait history)
      if (m._originalParent) {
        m.classList.remove('portrait-history-menu-detached');
        m.classList.remove('portrait-history-menu-detached--teal');
        m._originalParent.appendChild(m);
        delete m._originalParent;
        delete openShell._detachedMenu;
      }

      // If focus is currently inside the menu we're about to hide, move it
      // back to the trigger first so that no focused element is inside an
      // aria-hidden subtree. This prevents warnings like:
      // "Blocked aria-hidden on an element because its descendant retained focus."
      try {
        const activeEl = document.activeElement;
        if (activeEl && m.contains(activeEl)) {
          btn.focus();
        }
      } catch (e) {
        // Non-fatal; if anything goes wrong, continue closing the shell.
      }

      btn.classList.remove('is-open');
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      openShell.classList.remove('is-open');
    };

    // Close all other open menus first (only one menu open at a time)
    if (!isOpen) {
      const openShells = document.querySelectorAll('.selector-shell.is-open');
      openShells.forEach((openShell) => {
        if (openShell === shell) return; // skip the one we're about to open
        closeShell(openShell);
      });
    }

    const setOpen = (open) => {
      if (open) {
        // Check if trigger is inside any modal (portrait history, settings, etc.)
        const inModal = !!triggerEl.closest('.modal');
        const inPortraitModal = !!triggerEl.closest('.portrait-history-modal');

        // Move menu outside clipping ancestors to prevent overflow:hidden clipping
        if (inPortraitModal) {
          menu._originalParent = menu.parentElement;
          // Store reference in shell so handlers can find the menu later
          shell._detachedMenu = menu;
          // Base class to preserve modal-style theming when moved to body
          menu.classList.add('portrait-history-menu-detached');

          // If the trigger lives inside a focused/selected history card, also
          // opt the detached menu into the teal theme so it matches the card.
          const card = triggerEl.closest('.character-card');
          const isTealCard =
            card &&
            (card.classList.contains('is-selected') ||
              card.classList.contains('is-keyboard-focused'));
          if (isTealCard) {
            menu.classList.add('portrait-history-menu-detached--teal');
          } else {
            menu.classList.remove('portrait-history-menu-detached--teal');
          }

          document.body.appendChild(menu);
        }

        try {
          const shellRect = shell.getBoundingClientRect();
          const triggerRect = triggerEl.getBoundingClientRect();
          const viewportWidth = window.innerWidth;

          // Decide whether to use viewport-based fixed positioning (sheet header,
          // portrait history modal, etc.) or local absolute positioning relative
          // to the selector shell (settings modal and search/sort bar).
          //
          // - Non‑modal selectors default to fixed positioning so menus can
          //   escape overflow/scroll containers (sheet headers, manager grid).
          // - Selectors inside the search/sort actions bar use local absolute
          //   positioning so the sort dropdown stays anchored under its button.
          const inSearchActions = !!triggerEl.closest('.search-actions');
          const useFixedPositioning = inPortraitModal || (!inModal && !inSearchActions);

          // Measure menu size without affecting final animation. Temporarily
          // neutralize transforms so we get the *full* height instead of the
          // scaled (collapsed) height from CSS.
          const prevDisplay = menu.style.display;
          const prevVisibility = menu.style.visibility;
          const prevTransform = menu.style.transform;

          // Clear any previous inline sizing from earlier openings so we always
          // measure from a clean baseline. Use fixed/absolute positioning during
          // measurement so getBoundingClientRect returns consistent values.
          menu.style.maxHeight = '';
          menu.style.position = useFixedPositioning ? 'fixed' : 'absolute';
          menu.style.top = '0';
          menu.style.left = '0';
          menu.style.visibility = 'hidden';
          menu.style.display = 'block';
          menu.style.transform = 'none';

          const menuRect = menu.getBoundingClientRect();
          let menuHeight = menuRect.height || 0;
          let menuWidth = menuRect.width || 0;

          // Ensure the listbox width works well relative to its trigger.
          // - For most selectors, we only guarantee the menu is at least as wide
          //   as the trigger so wide buttons don't "overhang" a narrow menu.
          // - For special cases (like the narrator selector in settings), we can
          //   force the menu to *exactly* match the trigger width by adding
          //   `.selector-shell--match-width` to the shell.
          const triggerWidth = triggerRect.width || 0;
          const menuMaxWidth = 360; // matches .selector-menu max-width in CSS
          const minMenuWidth = 200; // keep in sync with .selector-menu min-width
          const forceMatchWidth = shell.classList.contains('selector-shell--match-width');

          if (triggerWidth > 0) {
            if (forceMatchWidth) {
              // For match-width shells (like narrator voice/text speed in settings),
              // force the menu to match the trigger width but never drop below the
              // global 200px min-width so very small triggers still get a readable menu.
              const targetWidth = Math.max(triggerWidth, minMenuWidth);
              menu.style.width = `${targetWidth}px`;
              menu.style.minWidth = `${targetWidth}px`;
              menu.style.maxWidth = `${targetWidth}px`;
              const remeasureRect = menu.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            } else if (triggerWidth <= menuMaxWidth && menuWidth < triggerWidth) {
              // Default behavior: ensure the menu is at least as wide as the trigger,
              // but don't exceed the global max width.
              menu.style.minWidth = `${triggerWidth}px`;
              const remeasureRect = menu.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            }
          }

          menu.style.display = prevDisplay;
          menu.style.visibility = prevVisibility;
          menu.style.transform = prevTransform;

          // Shared vertical positioning logic (decide whether to open above/below)
          const viewportHeight = window.innerHeight;
          const padding = 8; // breathing room from host edges
          const gapY = 4; // small gap between trigger and menu

          // Treat the nearest terminal frame/container as the visual "viewport"
          // so menus stay within the green app frame instead of the browser
          // viewport. Fall back to the real viewport if no frame is found.
          const host =
            triggerEl.closest('.terminal-frame, .terminal-container') ||
            document.documentElement;
          const hostRect = host.getBoundingClientRect();

          const hostTop = hostRect.top + padding;
          const hostBottom = hostRect.bottom - padding;

          // Calculate available space above and below trigger within the host
          const spaceAbove = triggerRect.top - hostTop;
          const spaceBelow = hostBottom - triggerRect.bottom;

          // Determine if menu fits in each direction
          const fitsBelow = spaceBelow >= menuHeight + gapY;
          const fitsAbove = spaceAbove >= menuHeight + gapY;

          // Choose direction: prefer below for top-half triggers, above for bottom-half
          const triggerCenterY = triggerRect.top + triggerRect.height / 2;
          const inTopHalf = triggerCenterY < viewportHeight / 2;

          let openBelow;
          if (fitsBelow && fitsAbove) {
            // Both fit: use viewport half as hint
            openBelow = inTopHalf;
          } else if (fitsBelow) {
            openBelow = true;
          } else if (fitsAbove) {
            openBelow = false;
          } else {
            // Neither fits perfectly: use the side with more space
            openBelow = spaceBelow >= spaceAbove;
          }

          // For match-width shells (like the narrator settings selectors), always
          // prefer opening below so the trigger stays visible above the listbox.
          if (forceMatchWidth) {
            openBelow = true;
          }

          if (useFixedPositioning) {
            // ===== Host-based fixed positioning (non-modal + portrait history) =====

            // Position the menu using a single top coordinate (no bottom), and
            // clamp so it always stays within the padded host vertically.
            const maxTop = hostBottom - menuHeight;
            let top;

            if (openBelow) {
              // Open below: start directly under trigger, then clamp if needed.
              top = triggerRect.bottom + gapY;
              if (top > maxTop) {
                top = Math.max(hostTop, maxTop);
              }
            } else {
              // Open above: start with bottom of menu sitting just above trigger.
              top = triggerRect.top - gapY - menuHeight;
              if (top < hostTop) {
                top = hostTop;
              }
            }

            menu.style.position = 'fixed';
            menu.style.top = `${top}px`;
            menu.style.bottom = 'auto';

            // If menu would extend past host, cap its height so it scrolls
            // instead of clipping off-screen.
            const availableHeight = hostBottom - top;
            if (menuHeight > availableHeight) {
              menu.style.maxHeight = `${availableHeight}px`;
              menu.style.overflowY = 'auto';
            } else {
              menu.style.maxHeight = '';
              menu.style.overflowY = '';
            }

            // Horizontal offset: keep menus inside the host frame. For the
            // portrait history modal specifically, open the menu to the *side*
            // of the card so it doesn't obscure the three-dot trigger; for all
            // other hosts fall back to the standard behavior.
            const hostLeft = hostRect.left + padding;
            const hostRight = hostRect.right - padding;

            let targetLeft;
            if (inPortraitModal) {
              const sideGapX = 8;
              const spaceRight = hostRight - triggerRect.right;
              const spaceLeft = triggerRect.left - hostLeft;
              const openRight = spaceRight >= spaceLeft;

              if (openRight && spaceRight >= menuWidth + sideGapX) {
                // Place menu to the right of the trigger/card
                targetLeft = triggerRect.right + sideGapX;
              } else {
                // Place menu to the left of the trigger/card
                targetLeft = triggerRect.left - sideGapX - menuWidth;
              }

              // Clamp within host bounds
              if (targetLeft < hostLeft) {
                targetLeft = hostLeft;
              }
              if (targetLeft + menuWidth > hostRight) {
                targetLeft = Math.max(hostLeft, hostRight - menuWidth);
              }
            } else {
              const minLeft = hostLeft;
              const maxLeft = Math.max(minLeft, hostRight - menuWidth);

              const fitsRight =
                triggerRect.left + menuWidth <= hostRight;
              const fitsLeft =
                triggerRect.right - menuWidth >= hostLeft;

              if (fitsRight && !fitsLeft) {
                // Enough room to the right but not to the left: open to the right.
                targetLeft = triggerRect.left;
              } else if (!fitsRight && fitsLeft) {
                // Not enough room to the right but enough to the left: right-align
                // menu with trigger so it grows back to the left.
                targetLeft = triggerRect.right - menuWidth;
              } else {
                // Both sides viable or both tight: start with left-aligned and then
                // clamp within host padding.
                targetLeft = triggerRect.left;
              }

              // Clamp horizontal position so the menu stays within host padding.
              if (targetLeft < minLeft) {
                targetLeft = minLeft;
              }
              if (targetLeft > maxLeft) {
                targetLeft = maxLeft;
              }
            }

            menu.style.left = `${targetLeft}px`;
            menu.style.right = 'auto';
            // Ensure the menu appears above modals and other content.
            // Use higher z-index when inside any modal to appear above modal backdrop.
            menu.style.zIndex = inModal ? '1100' : '1000';
          } else {
            // ===== Local absolute positioning inside modal / search bar =====

            menu.style.position = 'absolute';

            // Vertical: position relative to the selector shell so the menu
            // visually hugs the trigger, ignoring viewport-based clamping.
            let top;
            if (openBelow) {
              if (forceMatchWidth) {
                // For match-width shells, align the menu so it starts directly
                // under the trigger, independent of shell offsets.
                top = triggerRect.height + gapY;
              } else {
                top = triggerRect.bottom - shellRect.top + gapY;
              }
            } else {
              top = triggerRect.top - shellRect.top - menuHeight - gapY;
            }
            menu.style.top = `${top}px`;
            menu.style.bottom = 'auto';

            // Horizontal: align left edge of menu with left edge of trigger.
            const left = triggerRect.left - shellRect.left;
            menu.style.left = `${left}px`;
            menu.style.right = 'auto';

            // Inside the settings modal / search bar, the container is already
            // constrained, so we generally don't need extra viewport clamping.
            menu.style.maxHeight = '';
            menu.style.overflowY = '';
            menu.style.zIndex = inModal ? '1100' : '1000';
          }
        } catch (err) {
          // In case anything above fails (e.g., unexpected DOM state), fall back
          // to a very simple "open below trigger" layout so the menu still opens.
          menu.style.position = 'absolute';
          menu.style.top = `${triggerEl.offsetHeight + 4}px`;
          menu.style.left = '0';
          menu.style.right = 'auto';
          menu.style.maxHeight = '';
          menu.style.overflowY = '';
          menu.style.zIndex = inModal ? '1100' : '1000';
        }

        shell.classList.add('is-open');
        triggerEl.classList.add('is-open');
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        triggerEl.setAttribute('aria-expanded', 'true');

        // Focus the currently selected option for immediate keyboard navigation.
        // This prefers any option with aria-selected="true" (e.g. alignment/sort),
        // and falls back to the first option when none is marked selected.
        const selectedOption =
          menu.querySelector('.selector-option[aria-selected="true"]') ||
          menu.querySelector('.selector-option');
        if (selectedOption) {
          selectedOption.focus();
        }
      } else {
        closeShell(shell);
      }
    };

    setOpen(!isOpen);

    if (!this._selectorOutsideHandler) {
      this._selectorOutsideHandler = (event) => {
        // Small delay to let the toggle complete first
        setTimeout(() => {
          const openShells = document.querySelectorAll('.selector-shell.is-open');
          if (!openShells.length) return;
          // Don't close if clicking trigger (let toggle handle it), inside menu, or inside another shell
          const clickedTrigger = event.target.closest('.selector-trigger');
          const clickedMenu = event.target.closest('.selector-menu');
          const clickedShell = event.target.closest('.selector-shell');
          
          if (clickedTrigger || clickedMenu || clickedShell) return;
          
          openShells.forEach((openShell) => {
            closeShell(openShell);
          });
        }, 0);
      };
      // Use capture phase to catch clicks before stopPropagation in modals
      document.addEventListener('click', this._selectorOutsideHandler, true);
    }

    if (!this._selectorKeyHandler) {
      this._selectorKeyHandler = (event) => {
        if (event.key !== 'Escape') return;
        const openShells = document.querySelectorAll('.selector-shell.is-open');
        if (!openShells.length) return;
        openShells.forEach((openShell) => {
          const btn = openShell.querySelector('.selector-trigger');
          // Check for detached menu first, fall back to querySelector
          const m = openShell._detachedMenu || openShell.querySelector('.selector-menu');
          if (!btn || !m) return;
          closeShell(openShell);
          btn.focus();
        });
      };
      document.addEventListener('keydown', this._selectorKeyHandler);
    }

    // Close selector menus when an option is activated (click inside the menu)
    if (!this._selectorOptionHandler) {
      this._selectorOptionHandler = (event) => {
        const option = event.target.closest('.selector-option');
        if (!option) return;
        // First, try to find the shell in the normal DOM tree
        let shell = option.closest('.selector-shell');

        // If the menu has been detached to <body> (portrait history modal),
        // walk up to the selector-menu and use its original parent as shell.
        if (!shell) {
          const menuEl = option.closest('.selector-menu');
          if (menuEl && menuEl._originalParent) {
            shell = menuEl._originalParent;
          }
        }

        if (!shell || !shell.classList.contains('is-open')) return;
        closeShell(shell);
      };
      // Use capture so this still fires even if option handlers stopPropagation
      document.addEventListener('click', this._selectorOptionHandler, true);
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
              ? `<div class="text-dim terminal-text-small spell-list-description">${this.escapeHtml(
                  spell.description,
                )}</div>`
              : '';
        return `<div class="text-dim spell-list-item">• ${name}${school}</div>${desc}`;
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
        <div class="text-dim terminal-text-small spellcasting-ability-note">
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
          <div class="stat-line"><span class="stat-label">${name}</span></div>
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

  _parseCharacterData(character, context = 'manager') {
    // In builder context, show all sections from the start (except spells)
    const isBuilder = context === 'builder';
    // Minimal built-in mapping of standard 5e class hit dice so the sheet
    // can render correct values even when DND_DATA is not loaded (e.g. manager).
    const HIT_DIE_BY_CLASS = {
      barbarian: 12,
      fighter: 10,
      paladin: 10,
      ranger: 10,
      cleric: 8,
      druid: 8,
      monk: 8,
      rogue: 8,
      bard: 8,
      warlock: 8,
      wizard: 6,
      sorcerer: 6,
    };
    
    // Handle HP (old and new formats)
    const hp = character.hitPoints || { current: 0, max: 0 };
    const hpMax = typeof hp === 'number' ? hp : hp.max || 0;
    const hpCurrent = typeof hp === 'number' ? hp : hp.current || hpMax;

    // Handle abilities (old 'abilityScores' and new 'abilities' format)
    const abilities = character.abilities || character.abilityScores || {};
    const abilityModifiers = character.abilityModifiers || {};
    
    // Check if abilities have been actually rolled/populated.
    // - In the builder, baseAbilities is set when abilities are rolled.
    // - For builder context (when baseAbilities exists in the character object structure),
    //   only show actual values when baseAbilities has been set (not null).
    // - In manager/cloud-sourced characters, baseAbilities may be undefined,
    //   so we check if any ability score differs from the default 10.
    const hasNonDefaultAbilities = abilities && 
      Object.values(abilities).some(score => score !== 10 && score !== 0);
    const abilitiesPopulated =
      (character.baseAbilities !== null && character.baseAbilities !== undefined) ||
      (character.baseAbilities === undefined && hasNonDefaultAbilities);

    // Handle race/class/background names (enhanced export has nested data)
    const raceName = character.raceData?.name || character.race || null;
    const className = character.classData?.name || character.class || null;
    const backgroundName =
      character.backgroundData?.name || character.background || null;

    // Derive hit die:
    // - Prefer any explicit character-level override (manager edits)
    // - Then fall back to nested classData if present
    // - Then try to infer from a built-in class → hitDie map
    // - Then, if DND_DATA is available (builder context), use its classes list
    // - Finally, use a conservative default of d6 if nothing else is available
    let hitDie = character.hitDie || character.classData?.hitDie || null;
    if (!hitDie) {
      const rawClass = character.class || className || '';
      const normalized = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
      if (normalized && HIT_DIE_BY_CLASS[normalized]) {
        hitDie = HIT_DIE_BY_CLASS[normalized];
      }
    }
    if (!hitDie && window.DND_DATA && Array.isArray(window.DND_DATA.classes)) {
      const classIdOrName = character.class || className;
      if (classIdOrName) {
        const cls = window.DND_DATA.classes.find(
          (c) => c.id === classIdOrName || c.name === classIdOrName,
        );
        if (cls && cls.hitDie) {
          hitDie = cls.hitDie;
        }
      }
    }
    if (!hitDie) {
      hitDie = 6;
    }

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
      hitDie,

      // Abilities
      abilities,
      abilityModifiers,
      abilitiesSet: abilitiesPopulated,

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
      // In builder, always show sections (except spells until we know they're a caster)
      hasRace: !!raceName,
      hasClass: !!className,
      hasAbilities: isBuilder || Object.keys(abilities).length > 0,
      hasCombatStats: isBuilder || hpMax > 0 || character.armorClass,
      hasSavingThrows: isBuilder || (
        character.savingThrowModifiers &&
        Object.keys(character.savingThrowModifiers).length > 0
      ),
      hasSkills: isBuilder || (
        Object.keys(skillModifiers).length > 0 ||
        skillProficiencies.length > 0
      ),
      hasSpells:
        (character.cantrips && character.cantrips.length > 0) ||
        (character.spellsKnown && character.spellsKnown.length > 0) ||
        (character.spellsPrepared && character.spellsPrepared.length > 0),
      hasRacialTraits: isBuilder || racialTraits.length > 0,
      hasEquipment: isBuilder || allEquipment.length > 0,
      hasClassEquipment:
        (!explicitEquipment || explicitEquipment.length === 0) &&
        classEquipment.length > 0,
      hasToolProficiencies: isBuilder || (
        character.toolProficiencies && character.toolProficiencies.length > 0
      ),
      hasLanguages: isBuilder || languages.length > 0 || character.languageChoices > 0,
      hasBackgroundFeature: isBuilder || !!backgroundFeature,
      hasBackstory: isBuilder || !!character.backstory,
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
   * Convert a string to sentence case: first letter uppercase, rest lowercase.
   * Used for basic info fields like race, class, background, and alignment so
   * that older characters with lowercase values still render consistently.
   */
  toSentenceCase(value) {
    if (value === null || value === undefined) return '';
    const str = String(value).trim();
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /**
   * Convert alignment abbreviation to full name
   * @param {string} alignmentId - Abbreviation like 'lg', 'ce', etc.
   * @returns {string} Full alignment name like 'Lawful Good', 'Chaotic Evil', etc.
   */
  formatAlignment(alignmentId) {
    const alignmentMap = {
      'lg': 'Lawful Good',
      'ng': 'Neutral Good',
      'cg': 'Chaotic Good',
      'ln': 'Lawful Neutral',
      'n': 'True Neutral',
      'cn': 'Chaotic Neutral',
      'le': 'Lawful Evil',
      'ne': 'Neutral Evil',
      'ce': 'Chaotic Evil'
    };
    
    if (!alignmentId) return '';
    
    // If it's already a full name (not an abbreviation), return as-is
    if (alignmentId.length > 3) return alignmentId;
    
    // Convert to lowercase for case-insensitive lookup
    const key = alignmentId.toLowerCase();
    return alignmentMap[key] || alignmentId;
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

    // If a custom AI portrait has been created (or version history exists),
    // never let a late-arriving "upgrade from files" overwrite it. This guards
    // against races where `_maybeUpgradePortraitFromFiles` was kicked off
    // before the player generated a custom portrait, but finishes afterward.
    const hasCustomPortrait =
      !!character.customPortraitAscii ||
      (character.portraitMetadata &&
        Array.isArray(character.portraitMetadata.versions) &&
        character.portraitMetadata.versions.length > 0);
    if (hasCustomPortrait) {
      return;
    }

    character.asciiPortrait = ascii;
    character.asciiPortraitKey = key;

    // Persist the upgraded portrait so future loads are instant.
    // Use silent mode so automatic portrait upgrades don't mark character
    // as "modified" in manager views.
    try {
      if (context === 'manager' && window.CharacterStorage && character.id) {
        window.CharacterStorage.update(
          character.id,
          {
            asciiPortrait: ascii,
            asciiPortraitKey: key,
          },
          { silent: true },
        );
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

  /**
   * Normalize a character's portrait metadata for display in history modals.
   * Ensures:
   * - versions is always an array
   * - the active version (if any) appears first
   * - hasCustomPortraitWithoutHistory matches both builder + manager semantics
   *
   * @param {Object} character
   * @returns {{ metadata: Object, versions: Array, hasVersions: boolean, hasCustomPortraitWithoutHistory: boolean }}
   */
  normalizeForDisplay(character) {
    const safeCharacter = character || {};
    const metadata = safeCharacter.portraitMetadata || {};
    const rawVersions = Array.isArray(metadata.versions)
      ? metadata.versions
      : [];

    const hasVersions = rawVersions.length > 0;

    // Ensure the current active portrait appears first so the existing art is
    // both visually first and keyboard-focused when the modal opens.
    let versions = rawVersions;
    if (hasVersions && metadata.activeVersionId) {
      const active = rawVersions.find((v) => v.id === metadata.activeVersionId);
      if (active) {
        const others = rawVersions.filter((v) => v.id !== active.id);
        versions = [active, ...others];
      }
    }

    // Match both Character Builder and Manager semantics: if the character
    // already has a custom portrait but no history yet, show a helpful empty
    // state instead of the generic "no saved portraits" message.
    const hasCustomPortraitWithoutHistory =
      !hasVersions &&
      (safeCharacter.customPortraitAscii ||
        safeCharacter.originalPortraitUrl ||
        (safeCharacter.portrait && safeCharacter.portrait.url));

    return {
      metadata,
      versions,
      hasVersions,
      hasCustomPortraitWithoutHistory,
    };
  },

  /**
   * Populate ASCII thumbnails + prompt text for portrait history cards in
   * small batches on animation frames so we don't block the main thread when
   * versions contain large ASCII payloads.
   *
   * This helper is shared by both Character Builder and Character Manager.
   *
   * @param {Array} versions
   * @param {Function} cropFn - function(ascii: string) => string
   */
  batchPopulateAsciiPreviews(versions, cropFn) {
    if (!Array.isArray(versions) || versions.length === 0) return;

    const batchSize = 2;
    let index = 0;

    const processBatch = () => {
      const end = Math.min(versions.length, index + batchSize);
      for (let i = index; i < end; i++) {
        const v = versions[i];
        if (!v) continue;

        const el = document.querySelector(
          `.portrait-history-preview.ascii-portrait[data-version-id="${v.id}"]`,
        );
        if (el && v.ascii) {
          try {
            const cropped =
              typeof cropFn === 'function' ? cropFn(v.ascii) : v.ascii;
            el.textContent = cropped;
          } catch (e) {
            // Non-fatal: fall back to raw ASCII if cropping fails.
            el.textContent = v.ascii;
          }
        }

        const promptEl = document.querySelector(
          `.portrait-history-prompt[data-version-id="${v.id}"]`,
        );
        if (promptEl && v.prompt) {
          promptEl.textContent = v.prompt;
        }
      }

      index = end;
      if (
        index < versions.length &&
        typeof window !== 'undefined' &&
        typeof window.requestAnimationFrame === 'function'
      ) {
        window.requestAnimationFrame(processBatch);
      }
    };

    if (
      typeof window !== 'undefined' &&
      typeof window.requestAnimationFrame === 'function'
    ) {
      window.requestAnimationFrame(processBatch);
    } else {
      // Fallback: process synchronously if rAF is not available
      processBatch();
    }
  },
});

