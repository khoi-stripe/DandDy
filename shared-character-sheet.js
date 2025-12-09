// ========================================
// SHARED CHARACTER SHEET COMPONENT
// ========================================
// Global component for rendering character sheets across DandDy apps
// Used by both Character Builder and Character Manager

// Portrait debugging - enable with: window.DEBUG_PORTRAITS = true
// To dump current debug log: window.CharacterSheet.dumpPortraitDebugLog()
const PORTRAIT_DEBUG_LOG = [];
const MAX_PORTRAIT_DEBUG_ENTRIES = 100;

function logPortraitDebug(action, characterId, characterName, details) {
  if (!window.DEBUG_PORTRAITS) return;
  
  const entry = {
    timestamp: new Date().toISOString(),
    action,
    characterId,
    characterName,
    ...details
  };
  
  PORTRAIT_DEBUG_LOG.push(entry);
  if (PORTRAIT_DEBUG_LOG.length > MAX_PORTRAIT_DEBUG_ENTRIES) {
    PORTRAIT_DEBUG_LOG.shift();
  }
  
  console.log(`🖼️ [PORTRAIT DEBUG] ${action}`, {
    characterId,
    characterName,
    ...details
  });
}

const CharacterSheet = (window.CharacterSheet = {
  /**
   * Dump the portrait debug log to console for reporting.
   * Call from console: CharacterSheet.dumpPortraitDebugLog()
   */
  dumpPortraitDebugLog() {
    console.group('🖼️ Portrait Debug Log');
    console.log('Total entries:', PORTRAIT_DEBUG_LOG.length);
    console.log('Enable debugging with: window.DEBUG_PORTRAITS = true');
    console.log('---');
    PORTRAIT_DEBUG_LOG.forEach((entry, i) => {
      console.log(`[${i}] ${entry.timestamp} - ${entry.action}`, entry);
    });
    console.groupEnd();
    return PORTRAIT_DEBUG_LOG;
  },

  /**
   * Get the current portrait debug log (for programmatic access).
   */
  getPortraitDebugLog() {
    return [...PORTRAIT_DEBUG_LOG];
  },

  /**
   * Clear the portrait debug log.
   */
  clearPortraitDebugLog() {
    PORTRAIT_DEBUG_LOG.length = 0;
    console.log('🖼️ Portrait debug log cleared');
  },

  /**
   * Compare portrait data between card and sheet for a character.
   * Call from console: CharacterSheet.comparePortraitSources(characterId)
   */
  comparePortraitSources(characterId) {
    const character = window.AppState?.characters?.find(c => String(c.id) === String(characterId));
    if (!character) {
      console.error('Character not found:', characterId);
      return null;
    }

    const result = {
      characterId,
      characterName: character.name,
      portraitMetadata: character.portraitMetadata ? {
        activeVersionId: character.portraitMetadata.activeVersionId,
        versionsCount: character.portraitMetadata.versions?.length || 0,
        versions: character.portraitMetadata.versions?.map(v => ({
          id: v.id,
          hasUrl: !!v.url,
          urlPreview: v.url ? v.url.substring(0, 80) + '...' : null,
          hasAscii: !!v.ascii,
          asciiLength: v.ascii?.length || 0
        }))
      } : null,
      legacyFields: {
        customPortraitAscii: character.customPortraitAscii ? `[${character.customPortraitAscii.length} chars]` : null,
        originalPortraitUrl: character.originalPortraitUrl || null,
        portraitAscii: character.portrait?.ascii ? `[${character.portrait.ascii.length} chars]` : null,
        portraitUrl: character.portrait?.url || null,
        asciiPortrait: character.asciiPortrait ? `[${character.asciiPortrait.length} chars]` : null,
        asciiPortraitKey: character.asciiPortraitKey || null
      },
      resolvedAscii: this.getAsciiPortrait(character) ? `[${this.getAsciiPortrait(character).length} chars]` : null,
      resolvedUrl: this.getOriginalPortraitUrl(character),
      raceClass: `${character.race}|${character.class}`
    };

    console.group(`🖼️ Portrait Sources Comparison: ${character.name}`);
    console.log('Character ID:', characterId);
    console.log('Portrait Metadata:', result.portraitMetadata);
    console.log('Legacy Fields:', result.legacyFields);
    console.log('Resolved ASCII:', result.resolvedAscii);
    console.log('Resolved URL:', result.resolvedUrl);
    console.log('Race|Class Key:', result.raceClass);
    console.groupEnd();

    return result;
  },

  /**
   * Check for portrait mismatch between card and sheet in the DOM.
   * Call from console: CharacterSheet.checkDomMismatch()
   * Returns details about what's shown in the card vs the sheet.
   */
  checkDomMismatch() {
    const selectedCard = document.querySelector('.character-card.is-selected');
    const characterSheet = document.getElementById('characterSheet');
    
    if (!selectedCard) {
      console.warn('🖼️ No character card is currently selected');
      return null;
    }

    const characterId = selectedCard.getAttribute('data-id');
    const character = window.AppState?.characters?.find(c => String(c.id) === String(characterId));
    
    // Get card thumbnail info
    const cardThumb = selectedCard.querySelector('.card-thumbnail');
    const cardImg = cardThumb?.querySelector('img');
    const cardAscii = cardThumb?.querySelector('pre');
    
    // Get sheet portrait info
    const sheetContainer = characterSheet?.querySelector('.portrait-container');
    const sheetImg = sheetContainer?.querySelector('.original-portrait');
    const sheetAscii = sheetContainer?.querySelector('.ascii-portrait pre');
    
    const cardInfo = {
      hasImage: !!cardImg,
      imageUrl: cardImg?.src || null,
      imageTruncated: cardImg?.src ? cardImg.src.substring(0, 80) + '...' : null,
      hasAscii: !!cardAscii,
      asciiLength: cardAscii?.textContent?.length || 0,
      asciiPreview: cardAscii?.textContent?.substring(0, 50) + '...' || null,
      isImageMode: cardThumb?.classList.contains('card-thumbnail--image') || false
    };

    const sheetInfo = {
      hasImage: !!sheetImg,
      imageUrl: sheetImg?.src || null,
      imageTruncated: sheetImg?.src ? sheetImg.src.substring(0, 80) + '...' : null,
      imageHidden: sheetImg?.classList.contains('is-hidden') || false,
      hasAscii: !!sheetAscii,
      asciiLength: sheetAscii?.textContent?.length || 0,
      asciiPreview: sheetAscii?.textContent?.substring(0, 50) + '...' || null,
      asciiHidden: sheetContainer?.querySelector('.ascii-portrait')?.classList.contains('is-hidden') || false
    };

    // Check for mismatches
    const urlMismatch = cardInfo.imageUrl !== sheetInfo.imageUrl;
    const asciiLengthMismatch = cardInfo.asciiLength !== sheetInfo.asciiLength;

    const result = {
      characterId,
      characterName: character?.name || 'Unknown',
      card: cardInfo,
      sheet: sheetInfo,
      mismatch: {
        url: urlMismatch,
        asciiLength: asciiLengthMismatch,
        summary: urlMismatch || asciiLengthMismatch ? '⚠️ MISMATCH DETECTED' : '✅ No mismatch'
      }
    };

    console.group(`🖼️ DOM Portrait Check: ${result.characterName}`);
    console.log('Character ID:', characterId);
    console.log('Card:', cardInfo);
    console.log('Sheet:', sheetInfo);
    console.log('Mismatch:', result.mismatch);
    if (urlMismatch) {
      console.warn('⚠️ URL MISMATCH: Card and sheet show different images!');
      console.log('Card URL:', cardInfo.imageUrl);
      console.log('Sheet URL:', sheetInfo.imageUrl);
    }
    if (asciiLengthMismatch) {
      console.warn('⚠️ ASCII LENGTH MISMATCH: Card and sheet have different ASCII art!');
    }
    console.groupEnd();

    return result;
  },

  /**
   * Enable portrait debugging mode. Call from console: CharacterSheet.enablePortraitDebug()
   */
  enablePortraitDebug() {
    window.DEBUG_PORTRAITS = true;
    console.log('🖼️ Portrait debugging ENABLED');
    console.log('Available commands:');
    console.log('  CharacterSheet.checkDomMismatch() - Check for visible mismatch');
    console.log('  CharacterSheet.comparePortraitSources(id) - Compare data sources');
    console.log('  CharacterSheet.dumpPortraitDebugLog() - Dump all debug entries');
    console.log('  CharacterSheet.clearPortraitDebugLog() - Clear debug log');
    console.log('  window.DEBUG_PORTRAITS = false - Disable debugging');
  },

  /**
   * Manages scroll locking when selector menus are open.
   * Uses a CSS class for robust scroll prevention.
   * @param {boolean} lock - true to lock, false to unlock
   */
  _updateScrollLock(lock) {
    if (lock) {
      // Lock: add class to body which triggers CSS rules
      document.body.classList.add('selector-menu-open');
    } else {
      // Unlock: only remove if no menus are still open
      // Small delay to let the menu close animation start
      setTimeout(() => {
        const stillOpen = document.querySelectorAll('.selector-shell.is-open');
        if (stillOpen.length === 0) {
          document.body.classList.remove('selector-menu-open');
        }
      }, 0);
    }
  },

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

    // Use the same helper as _renderPortrait to ensure header toggle button
    // visibility matches the actual portrait being displayed.
    const originalPortraitUrl = this.getOriginalPortraitUrl(character);

    // Read the global portrait view mode so the overflow toggle label/icon
    // matches the actual default view (ASCII vs Original). This mirrors the
    // logic used in _renderPortrait so builder + manager stay in sync.
    let portraitViewMode = 'original';
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

    // Manager-only: Add Edit to overflow menu (visible only on narrow viewports via CSS)
    if (context === 'manager' && onEdit && editFn) {
      headerActions.unshift({
        icon: '✎',
        label: 'Edit character',
        onclick: editFn,
        id: 'sheet-edit-overflow',
      });
    }

    // Append Delete last so it always appears at the bottom of the listbox
    if (deleteAction) {
      headerActions.push(deleteAction);
    }

    // Manager-only inline Edit button (to the left of the overflow menu)
    // Hidden on narrow viewports where it moves into the overflow menu
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
        <div class="sheet-title-buttons selector-shell selector-shell--actions">
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

    // Check if this is a demo character
    const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
    const demoTag = isDemo ? '<span class="demo-tag">SAMPLE</span>' : '';

    return `
      <div class="sheet-title-header">
        <div class="sheet-title">${safeTitle}${demoTag}</div>
        ${actionsBlock}
      </div>
    `;
  },

  _renderPortrait(character, parsed, context, callbacks) {
    const { onGeneratePortrait, onTogglePortrait } = callbacks;

    // Prefer the active portrait version from history (if any) so the sheet
    // always matches the grid card + history modal. Fall back to legacy
    // top-level fields when no history metadata is present.
    //
    // IMPORTANT: We must get BOTH ascii and url from the same source to avoid
    // mismatches (e.g., showing version A's image with version B's ASCII).
    // Use getAsciiPortrait() for ASCII since it has robust fallbacks, then
    // use getOriginalPortraitUrl() to get the matching URL.
    const asciiPortrait = this.getAsciiPortrait(character);
    const originalPortraitUrl = this.getOriginalPortraitUrl(character);

    // Log for debugging portrait mismatches
    logPortraitDebug('renderPortrait (sheet)', character.id, character.name, {
      context,
      hasAscii: !!asciiPortrait,
      asciiLength: asciiPortrait?.length || 0,
      url: originalPortraitUrl,
      portraitMetadataActiveId: character.portraitMetadata?.activeVersionId || null,
      portraitMetadataVersionsCount: character.portraitMetadata?.versions?.length || 0
    });

    // Global portrait view mode (ASCII vs Original). Builder + manager share
    // this preference via StorageService; fall back to config default.
    let portraitViewMode = 'original';
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
          ? `<img id="${originalPortraitId}" class="original-portrait${showOriginalByDefault ? '' : ' is-hidden'}" src="${originalPortraitUrl}" alt="Character portrait" onload="this.classList.add('is-loaded')">`
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
    const sex = parsed.sex
      ? this.escapeHtml(this.toSentenceCase(parsed.sex))
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
          <div class="stat-line"><span class="stat-label">Sex:</span> <span class="stat-value">${sex || '—'}</span></div>
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

      // Trigger close animation first
      btn.classList.remove('is-open');
      m.classList.remove('is-open');
      m.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      openShell.classList.remove('is-open');
      
      // Unlock scroll when menu closes
      CharacterSheet._updateScrollLock(false);

      // Restore menu to original parent AFTER the close animation completes
      // to prevent visual jumping. The CSS transition is ~200ms.
      if (m._originalParent) {
        const originalParent = m._originalParent;
        const detachedMenu = openShell._detachedMenu;
        // Clear references immediately to prevent double-restore
        delete m._originalParent;
        delete openShell._detachedMenu;

        setTimeout(() => {
          m.classList.remove('portrait-history-menu-detached');
          m.classList.remove('portrait-history-menu-detached--teal');
          m.classList.remove('selector-menu-detached');
          // Clear inline styles that were set for fixed positioning
          m.style.position = '';
          m.style.top = '';
          m.style.left = '';
          m.style.width = '';
          m.style.minWidth = '';
          m.style.maxWidth = '';
          m.style.maxHeight = '';
          originalParent.appendChild(m);
        }, 200);
      }
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

        // Move menu outside modal ancestors to prevent:
        // 1. overflow:hidden clipping
        // 2. CSS transform creating a new containing block (breaks fixed positioning)
        // This applies to ALL modals, not just portrait-history.
        if (inModal) {
          menu._originalParent = menu.parentElement;
          // Store reference in shell so handlers can find the menu later
          shell._detachedMenu = menu;

          // Add theming class based on modal type
          if (inPortraitModal) {
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
          } else {
            // For other modals (settings, etc.), add a generic detached class
            menu.classList.add('selector-menu-detached');
          }

          document.body.appendChild(menu);
        }

        try {
          const shellRect = shell.getBoundingClientRect();
          const triggerRect = triggerEl.getBoundingClientRect();
          const viewportWidth = window.innerWidth;

          // Decide whether to use viewport-based fixed positioning or local
          // absolute positioning relative to the selector shell.
          //
          // RULE: Always use fixed positioning so menus can escape overflow
          // containers (e.g. terminal-container with overflow:hidden).
          // EXCEPTION: Search/sort bar and header overflow use absolute positioning
          // so the dropdown stays anchored to its button during page scroll.
          const inSearchActions = !!triggerEl.closest('.search-actions');
          const inHeaderOverflow = !!triggerEl.closest('.header-overflow');
          const useFixedPositioning = !inSearchActions && !inHeaderOverflow;

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

          // Determine the bounding container for the menu:
          // - In a modal: use the modal-body bounds (so menu stays within modal content area)
          // - Not in a modal: use the terminal frame bounds
          // This ensures menus are visually contained within their logical parent.
          //
          // NOTE: We use .modal-body (not .modal-content) because modals with
          // overflow:visible would give us incorrect bounds when the menu overflows.
          let host;
          let hostBottom;
          let hostTop;
          const verticalSafeMargin = 12;

          if (inModal) {
            // For modals, find the modal-body as the content area constraint.
            // Also check for modal-footer to ensure we don't overlap it.
            const modalContent = triggerEl.closest('.modal-content');
            const modalBody = triggerEl.closest('.modal-body');
            const modalFooter = modalContent?.querySelector('.modal-footer');

            if (modalBody) {
              const bodyRect = modalBody.getBoundingClientRect();
              hostTop = bodyRect.top + padding;
              hostBottom = bodyRect.bottom - padding;
            } else if (modalContent) {
              const contentRect = modalContent.getBoundingClientRect();
              hostTop = contentRect.top + padding + verticalSafeMargin;
              hostBottom = contentRect.bottom - padding - verticalSafeMargin;
            } else {
              // Fallback to terminal frame
              host = triggerEl.closest('.terminal-frame, .terminal-container') || document.documentElement;
              const hostRect = host.getBoundingClientRect();
              hostTop = hostRect.top + padding + verticalSafeMargin;
              hostBottom = hostRect.bottom - padding - verticalSafeMargin;
            }

            // If there's a modal footer, ensure we don't extend past it
            if (modalFooter) {
              const footerRect = modalFooter.getBoundingClientRect();
              hostBottom = Math.min(hostBottom, footerRect.top - padding);
            }
          } else {
            host =
              triggerEl.closest('.terminal-frame, .terminal-container') ||
              document.documentElement;
            const hostRect = host.getBoundingClientRect();
            hostTop = hostRect.top + padding + verticalSafeMargin;
            hostBottom = hostRect.bottom - padding - verticalSafeMargin;
          }

          // Calculate available space above and below trigger within the host
          const spaceAbove = triggerRect.top - hostTop;
          const spaceBelow = hostBottom - triggerRect.bottom;

          // Determine if menu fits in each direction
          const fitsBelow = spaceBelow >= menuHeight + gapY;
          const fitsAbove = spaceAbove >= menuHeight + gapY;

          // Choose direction: prefer below for top-half triggers, above for bottom-half.
          // For match-width shells (like settings), we prefer below if both fit.
          const triggerCenterY = triggerRect.top + triggerRect.height / 2;
          const inTopHalf = triggerCenterY < viewportHeight / 2;

          let openBelow;
          if (fitsBelow && fitsAbove) {
            // Both fit: use viewport half as hint, but prefer below for match-width
            openBelow = forceMatchWidth ? true : inTopHalf;
          } else if (fitsBelow) {
            openBelow = true;
          } else if (fitsAbove) {
            openBelow = false;
          } else {
            // Neither fits perfectly: use the side with more space
            openBelow = spaceBelow >= spaceAbove;
          }

          if (useFixedPositioning) {
            // ===== Host-based fixed positioning (non-modal + portrait history) =====

            // Calculate available space in each direction BEFORE positioning.
            // This ensures we use the full available space, not just the
            // measured menu height (which might be pre-constrained by CSS).
            const spaceAboveTrigger = triggerRect.top - gapY - hostTop;
            const spaceBelowTrigger = hostBottom - triggerRect.bottom - gapY;

            let top;
            let availableHeight;

            menu.style.position = 'fixed';

            if (openBelow) {
              // Open below: anchor menu at its top edge, just under trigger
              const top = triggerRect.bottom + gapY;
              availableHeight = hostBottom - top;
              
              menu.style.top = `${top}px`;
              menu.style.bottom = 'auto';
            } else {
              // Open above: anchor menu at its BOTTOM edge, just above trigger.
              // This lets the menu "grow upward" naturally.
              const menuBottom = window.innerHeight - (triggerRect.top - gapY);
              availableHeight = spaceAboveTrigger;
              
              menu.style.top = 'auto';
              menu.style.bottom = `${menuBottom}px`;
            }

            // Set max-height to constrain within bounds (enables scrolling if needed)
            if (availableHeight > 0) {
              menu.style.maxHeight = `${availableHeight}px`;
              menu.style.overflowY = 'auto';
            }

            // Horizontal offset: keep menus inside the host frame. For the
            // portrait history modal specifically, open the menu to the *side*
            // of the card so it doesn't obscure the three-dot trigger; for all
            // other hosts fall back to the standard behavior.
            //
            // For horizontal bounds, we use the modal-content (not modal-body)
            // since we want the full width of the modal dialog.
            let hostLeft, hostRight;
            if (inModal) {
              const modalContent = triggerEl.closest('.modal-content');
              if (modalContent) {
                const contentRect = modalContent.getBoundingClientRect();
                hostLeft = contentRect.left + padding;
                hostRight = contentRect.right - padding;
              } else {
                // Fallback
                hostLeft = padding;
                hostRight = viewportWidth - padding;
              }
            } else if (host) {
              const hostRect = host.getBoundingClientRect();
              hostLeft = hostRect.left + padding;
              hostRight = hostRect.right - padding;
            } else {
              hostLeft = padding;
              hostRight = viewportWidth - padding;
            }

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
            // Modal overlay is z-index: 10000, so detached menus need to be above that.
            menu.style.zIndex = inModal ? '10001' : '1000';
          } else {
            // ===== Local absolute positioning (search/sort bar only) =====
            // The search bar needs absolute positioning so dropdown stays
            // anchored to its button during page scroll.

            menu.style.position = 'absolute';

            // Compute desired top in viewport space, clamped within the host,
            // then convert to shell-relative coordinates for absolute positioning.
            const maxTopViewport = hostBottom - menuHeight;
            let topViewport;

            if (openBelow) {
              topViewport = triggerRect.bottom + gapY;
              if (topViewport > maxTopViewport) {
                topViewport = Math.max(hostTop, maxTopViewport);
              }
            } else {
              topViewport = triggerRect.top - gapY - menuHeight;
              if (topViewport < hostTop) {
                topViewport = hostTop;
              }
            }

            const top = topViewport - shellRect.top;
            menu.style.top = `${top}px`;
            menu.style.bottom = 'auto';

            // Horizontal positioning for absolute menus
            if (inHeaderOverflow) {
              // Header overflow: right-align menu with trigger (opens leftward)
              const right = shellRect.right - triggerRect.right;
              menu.style.left = 'auto';
              menu.style.right = `${right}px`;
            } else {
              // Default: align left edge of menu with left edge of trigger.
              const left = triggerRect.left - shellRect.left;
              menu.style.left = `${left}px`;
              menu.style.right = 'auto';
            }

            // Cap height so long menus scroll instead of clipping.
            let availableHeight = hostBottom - topViewport;
            if (!openBelow) {
              availableHeight = Math.min(
                availableHeight,
                triggerRect.top - gapY - topViewport,
              );
            }

            if (menuHeight > availableHeight && availableHeight > 0) {
              menu.style.maxHeight = `${availableHeight}px`;
              menu.style.overflowY = 'auto';
            } else {
              menu.style.maxHeight = '';
              menu.style.overflowY = '';
            }

            menu.style.zIndex = '1000';
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
          // Modal overlay is z-index: 10000, so detached menus need to be above that.
          menu.style.zIndex = inModal ? '10001' : '1000';
        }

        shell.classList.add('is-open');
        triggerEl.classList.add('is-open');
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        triggerEl.setAttribute('aria-expanded', 'true');
        
        // Lock scroll when menu opens
        CharacterSheet._updateScrollLock(true);

        // Focus behavior differs by menu type:
        // - Listbox (--listbox): Focus the selected option for keyboard nav
        // - Actions (--actions): No focus, just show the menu
        const isActionsMenu = shell.classList.contains('selector-shell--actions');
        
        if (!isActionsMenu) {
          // Listbox: focus the selected option (or first if none selected)
          const selectedOption =
            menu.querySelector('.selector-option[aria-selected="true"]') ||
            menu.querySelector('.selector-option.is-selected') ||
            menu.querySelector('.selector-option');
          if (selectedOption) {
            selectedOption.focus();
          }
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
      sex: character.sex || null,
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
   * HTML-escape helper. Delegates to the shared Utils implementation.
   * Kept as a method on CharacterSheet for backwards compatibility.
   */
  escapeHtml(value) {
    return window.Utils && typeof Utils.escapeHtml === 'function'
      ? Utils.escapeHtml(value)
      : (value === null || value === undefined ? '' : String(value));
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

    const charId = character.id;
    const charName = character.name;
    let source = null;
    let result = null;

    // Prefer the active portrait version from history when available so
    // manager, builder, and history views all agree on "current" art.
    try {
      const metadata = character.portraitMetadata;
      if (
        metadata &&
        Array.isArray(metadata.versions) &&
        metadata.activeVersionId
      ) {
        const activeVersion = metadata.versions.find(
          (v) => v && v.id === metadata.activeVersionId,
        );
        if (activeVersion && activeVersion.ascii) {
          source = 'portraitMetadata.activeVersion';
          result = activeVersion.ascii;
          logPortraitDebug('getAsciiPortrait', charId, charName, {
            source,
            activeVersionId: metadata.activeVersionId,
            asciiLength: result.length,
            asciiPreview: result.substring(0, 50) + '...'
          });
          return result;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

    const key = `${character.race || ''}|${character.class || ''}`;

    // 1) Explicit custom portrait always wins
    if (character.customPortraitAscii) {
      source = 'customPortraitAscii';
      result = character.customPortraitAscii;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 2) If asciiPortrait is tagged for this race/class combo, trust it
    if (
      character.asciiPortrait &&
      character.asciiPortraitKey &&
      character.asciiPortraitKey === key
    ) {
      source = 'asciiPortrait (key-matched)';
      result = character.asciiPortrait;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiPortraitKey: character.asciiPortraitKey,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 3) Exported portrait object from builder
    if (character.portrait && character.portrait.ascii) {
      source = 'portrait.ascii';
      result = character.portrait.ascii;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    // 4) Legacy asciiPortrait without key tagging
    if (character.asciiPortrait) {
      source = 'asciiPortrait (legacy)';
      result = character.asciiPortrait;
      logPortraitDebug('getAsciiPortrait', charId, charName, {
        source,
        raceClassKey: key,
        asciiLength: result.length,
        asciiPreview: result.substring(0, 50) + '...'
      });
      return result;
    }

    logPortraitDebug('getAsciiPortrait', charId, charName, {
      source: 'none',
      raceClassKey: key,
      result: null
    });
    return null;
  },

  /**
   * Determine the best original portrait URL to use for a character.
   * Mirrors getAsciiPortrait() to ensure ASCII and URL come from the same source.
   * Prefers:
   * 1) Active portrait version's URL from history
   * 2) originalPortraitUrl (custom AI portrait URL)
   * 3) portrait.url (exported portrait object)
   */
  getOriginalPortraitUrl(character) {
    if (!character) return null;

    const charId = character.id;
    const charName = character.name;
    let source = null;
    let result = null;

    // Prefer the active portrait version from history when available so
    // manager, builder, and history views all agree on "current" art.
    try {
      const metadata = character.portraitMetadata;
      if (
        metadata &&
        Array.isArray(metadata.versions) &&
        metadata.activeVersionId
      ) {
        const activeVersion = metadata.versions.find(
          (v) => v && v.id === metadata.activeVersionId,
        );
        if (activeVersion && activeVersion.url) {
          source = 'portraitMetadata.activeVersion';
          result = activeVersion.url;
          logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
            source,
            activeVersionId: metadata.activeVersionId,
            url: result
          });
          return result;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

    // 1) Explicit custom portrait URL
    if (character.originalPortraitUrl) {
      source = 'originalPortraitUrl';
      result = character.originalPortraitUrl;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    // 2) Exported portrait object from builder
    if (character.portrait && character.portrait.url) {
      source = 'portrait.url';
      result = character.portrait.url;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
      source: 'none',
      result: null
    });
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

    // Store character ID on the portrait element for async validation
    // This prevents race conditions where async operations complete after
    // the user has selected a different character
    if (portraitEl && character.id) {
      portraitEl.setAttribute('data-character-id', character.id);
    }

    if (portraitEl && asciiPortrait) {
      this.setPortraitContent(portraitEl, asciiPortrait);
    }

    // Attempt a transparent upgrade to the best available pre-generated
    // portrait (race+class combo) when possible. This fixes older characters
    // that only have race-level art stored.
    this._maybeUpgradePortraitFromFiles(character, context, portraitEl);
  },

  /**
   * Set ASCII art content on a portrait element, wrapping in a <pre> for
   * proper centering via CSS flexbox. The parent .ascii-portrait uses
   * display:flex + justify-content:center, and the inner <pre> holds the
   * preformatted text.
   * @param {HTMLElement} portraitEl
   * @param {string} asciiArt
   */
  setPortraitContent(portraitEl, asciiArt) {
    if (!portraitEl) return;
    // Clear existing content and insert wrapped <pre>
    portraitEl.innerHTML = '';
    const pre = document.createElement('pre');
    pre.textContent = asciiArt;
    portraitEl.appendChild(pre);
  },

  /**
   * Safely center the horizontal scroll position of a portrait element.
   * Extracted so we can reuse it after async portrait upgrades.
   * @param {HTMLElement} portraitEl
   * @private
   * @deprecated CSS flexbox now handles centering; this is kept for backwards compat
   */
  _centerPortraitScrollSafely(portraitEl) {
    // CSS flexbox now handles centering - this is a no-op for backwards compat
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
      if (character.customPortraitAscii) {
        logPortraitDebug('_maybeUpgradePortraitFromFiles SKIPPED (has customPortraitAscii)', 
          character.id, character.name, { context });
        return;
      }

      // Never override if portrait history exists
      if (character.portraitMetadata?.versions?.length > 0) {
        logPortraitDebug('_maybeUpgradePortraitFromFiles SKIPPED (has portrait history)', 
          character.id, character.name, { 
            context, 
            versionsCount: character.portraitMetadata.versions.length,
            activeVersionId: character.portraitMetadata.activeVersionId
          });
        return;
      }

      const race = character.race;
      const classType = character.class;
      if (!race || !classType) return;

      const key = `${race || ''}|${classType || ''}`;

      // If we already have a portrait that is explicitly tagged for this
      // exact race/class combo, there's nothing to upgrade.
      if (character.asciiPortrait && character.asciiPortraitKey === key) {
        return;
      }

      // Log that we're attempting to upgrade (this could be the culprit!)
      logPortraitDebug('_maybeUpgradePortraitFromFiles ATTEMPTING upgrade', 
        character.id, character.name, { 
          context, 
          key,
          hasCustomPortraitAscii: !!character.customPortraitAscii,
          hasPortraitMetadata: !!character.portraitMetadata,
          versionsCount: character.portraitMetadata?.versions?.length || 0
        });

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
      logPortraitDebug('_applyUpgradedPortrait BLOCKED (has custom portrait)', 
        character.id, character.name, { 
          context, 
          key,
          hasCustomPortraitAscii: !!character.customPortraitAscii,
          versionsCount: character.portraitMetadata?.versions?.length || 0
        });
      return;
    }

    // Validate that the portrait element still belongs to this character.
    // This prevents race conditions where the user selected a different card
    // while the async portrait file fetch was in progress.
    if (portraitEl && character.id) {
      const elementCharacterId = portraitEl.getAttribute('data-character-id');
      if (elementCharacterId && elementCharacterId !== character.id) {
        // The DOM element now belongs to a different character; abort update
        logPortraitDebug('_applyUpgradedPortrait BLOCKED (element belongs to different character)', 
          character.id, character.name, { 
            context, 
            elementCharacterId,
            characterId: character.id
          });
        return;
      }
    }

    // Log that we're about to apply an upgraded portrait - this could overwrite a custom one!
    logPortraitDebug('_applyUpgradedPortrait APPLYING generic portrait', 
      character.id, character.name, { 
        context, 
        key,
        asciiLength: ascii?.length || 0
      });

    // In manager context, also check if the selected character has changed
    // This provides an additional safety check beyond the DOM attribute
    if (context === 'manager' && window.AppState && character.id) {
      if (AppState.selectedCharacterId && AppState.selectedCharacterId !== character.id) {
        // User has selected a different character; abort update
        return;
      }
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
      this.setPortraitContent(portraitEl, ascii);
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
   * @param {Object} extra - { source, prompt, style }
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
      style: extra.style || null,
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
            // Use <pre> wrapper for proper CSS flex centering
            el.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = cropped;
            el.appendChild(pre);
          } catch (e) {
            // Non-fatal: fall back to raw ASCII if cropping fails.
            el.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = v.ascii;
            el.appendChild(pre);
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

