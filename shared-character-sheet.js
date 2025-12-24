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

// Initialize FEATURE_SPELL_LOOKUP from localStorage (set via Admin panel)
// This allows the flag to persist across page loads
(function initSpellLookupFlag() {
  try {
    const flags = JSON.parse(localStorage.getItem('danddy_admin_feature_flags') || '{}');
    window.FEATURE_SPELL_LOOKUP = !!flags.spellLookup;
  } catch (e) {
    window.FEATURE_SPELL_LOOKUP = false;
  }
})();


// Built-in spell lookup table for displaying spell descriptions
// when character data only has spell names (strings) instead of full objects.
// This allows the manager to show descriptions for older characters or demo characters.
const SPELL_LOOKUP = {
  // Cantrips (baseDice: die type for level scaling, damageType for reference)
  'fire bolt': { school: 'Evocation', description: 'Hurl a mote of fire at a creature or object. {damage} fire damage.', baseDice: 'd10', damageType: 'fire' },
  'mage hand': { school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.' },
  'light': { school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.' },
  'ray of frost': { school: 'Evocation', description: 'Frigid beam dealing {damage} cold damage and reducing speed.', baseDice: 'd8', damageType: 'cold' },
  'shocking grasp': { school: 'Evocation', description: 'Lightning damage on touch ({damage}) and target cannot take reactions.', baseDice: 'd8', damageType: 'lightning' },
  'prestidigitation': { school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.' },
  'minor illusion': { school: 'Illusion', description: 'Create a sound or image of an object within range.' },
  'eldritch blast': { school: 'Evocation', description: 'Beam of crackling energy dealing {damage} force damage.', baseDice: 'd10', damageType: 'force', special: 'eldritch-blast' },
  'chill touch': { school: 'Necromancy', description: 'Ghostly hand dealing {damage} necrotic damage and preventing healing.', baseDice: 'd8', damageType: 'necrotic' },
  'vicious mockery': { school: 'Enchantment', description: 'Insult dealing {damage} psychic damage and imposing disadvantage.', baseDice: 'd4', damageType: 'psychic' },
  'sacred flame': { school: 'Evocation', description: 'Flame-like radiance dealing {damage} radiant damage (Dex save).', baseDice: 'd8', damageType: 'radiant' },
  'guidance': { school: 'Divination', description: 'Touch a creature to grant +1d4 to one ability check.' },
  'spare the dying': { school: 'Necromancy', description: 'Touch a dying creature to stabilize it.' },
  'thaumaturgy': { school: 'Transmutation', description: 'Minor wonder: amplify voice, flicker flames, open doors.' },
  'produce flame': { school: 'Conjuration', description: 'Flickering flame for light or to throw ({damage} fire damage).', baseDice: 'd8', damageType: 'fire' },
  'shillelagh': { school: 'Transmutation', description: 'Imbue a club or staff to use Wisdom for attacks (1d8 damage).' },
  'druidcraft': { school: 'Transmutation', description: 'Minor druidic effects: predict weather, bloom flowers, light fires.' },
  'toll the dead': { school: 'Necromancy', description: 'Toll a bell dealing {damage} necrotic damage (d12 if injured).', baseDice: 'd8', damageType: 'necrotic' },
  'acid splash': { school: 'Conjuration', description: 'Hurl acid at one or two creatures for {damage} acid damage.', baseDice: 'd6', damageType: 'acid' },
  'poison spray': { school: 'Conjuration', description: 'Spray poison dealing {damage} poison damage (Con save).', baseDice: 'd12', damageType: 'poison' },
  // 1st Level Spells
  'magic missile': { school: 'Evocation', description: 'Three darts of force, each dealing 1d4+1 damage (auto-hit).' },
  'shield': { school: 'Abjuration', description: 'Reaction: +5 AC until start of your next turn.' },
  'mage armor': { school: 'Abjuration', description: 'Set AC to 13 + Dex modifier for 8 hours.' },
  'detect magic': { school: 'Divination', description: 'Sense magic within 30 feet for 10 minutes (concentration).' },
  'identify': { school: 'Divination', description: 'Learn properties of a magical object or spell affecting a creature.' },
  'sleep': { school: 'Enchantment', description: 'Put 5d8 HP worth of creatures to sleep.' },
  'burning hands': { school: 'Evocation', description: 'Cone of fire dealing 3d6 fire damage (Dex save for half).' },
  'disguise self': { school: 'Illusion', description: 'Make yourself look different for 1 hour.' },
  'feather fall': { school: 'Transmutation', description: 'Reaction: Up to 5 creatures fall slowly, taking no damage.' },
  'grease': { school: 'Conjuration', description: 'Slick grease covers a 10-foot square (Dex save or fall prone).' },
  'chromatic orb': { school: 'Evocation', description: 'Hurl a sphere dealing 3d8 damage (choose: acid, cold, fire, lightning, poison, thunder).' },
  'hex': { school: 'Enchantment', description: 'Curse a creature to take +1d6 necrotic damage and disadvantage on checks.' },
  'armor of agathys': { school: 'Abjuration', description: 'Gain 5 temp HP; attackers take 5 cold damage when they hit you.' },
  'arms of hadar': { school: 'Conjuration', description: 'Tendrils deal 2d6 necrotic damage in 10-foot radius.' },
  'charm person': { school: 'Enchantment', description: 'Charm a humanoid (Wis save) for 1 hour.' },
  'hellish rebuke': { school: 'Evocation', description: 'Reaction: Attacker takes 2d10 fire damage (Dex save for half).' },
  'healing word': { school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.' },
  'cure wounds': { school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.' },
  'faerie fire': { school: 'Evocation', description: 'Outline creatures in light, granting advantage on attacks against them.' },
  'thunderwave': { school: 'Evocation', description: '15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures.' },
  'bless': { school: 'Enchantment', description: 'Up to 3 creatures add 1d4 to attacks and saves (concentration).' },
  'shield of faith': { school: 'Abjuration', description: 'Grant +2 AC to a creature (10 minutes, concentration).' },
  'guiding bolt': { school: 'Evocation', description: 'Ranged attack dealing 4d6 radiant damage; next attack has advantage.' },
  'inflict wounds': { school: 'Necromancy', description: 'Melee attack dealing 3d10 necrotic damage.' },
  'sanctuary': { school: 'Abjuration', description: 'Attackers must make Wis save or choose another target.' },
  'entangle': { school: 'Conjuration', description: 'Grasping vines restrain creatures in 20-foot square.' },
  'goodberry': { school: 'Transmutation', description: 'Create 10 berries that each restore 1 HP and provide nourishment.' },
  'speak with animals': { school: 'Divination', description: 'Communicate with beasts for 10 minutes.' },
  // Higher level spells (common ones that might appear on character sheets)
  'misty step': { school: 'Conjuration', description: 'Bonus action: Teleport up to 30 feet to an unoccupied space you can see.' },
  'hold person': { school: 'Enchantment', description: 'Paralyze a humanoid (Wis save) for up to 1 minute.' },
  'fireball': { school: 'Evocation', description: '20-foot radius explosion dealing 8d6 fire damage (Dex save for half).' },
  'counterspell': { school: 'Abjuration', description: 'Reaction: Interrupt a spell being cast (automatic for level 3 or lower).' },
  'lesser restoration': { school: 'Abjuration', description: 'End one disease or condition (blinded, deafened, paralyzed, poisoned).' },
  'spiritual weapon': { school: 'Evocation', description: 'Create a floating weapon that attacks for 1d8 + spellcasting modifier force damage.' },
  'prayer of healing': { school: 'Evocation', description: 'Up to 6 creatures regain 2d8 + spellcasting modifier HP (10 minute cast).' },
  'divine smite': { school: 'Evocation', description: 'Expend spell slot to deal +2d8 radiant damage on melee hit (+1d8 vs undead/fiend).' },
  'thunderous smite': { school: 'Evocation', description: 'Next melee hit deals +2d6 thunder damage and may push target.' },
  'command': { school: 'Enchantment', description: 'Speak a one-word command that a creature must follow (Wis save).' },
  'find steed': { school: 'Conjuration', description: 'Summon a loyal, intelligent mount (warhorse, pony, camel, elk, or mastiff).' },
};

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
   * Check if descriptions should be shown inline or hidden (shown as tooltips).
   * @returns {boolean} True if descriptions should be shown inline
   */
  shouldShowDescriptions() {
    if (typeof StorageService !== 'undefined' && StorageService.getShowDescriptions) {
      return StorageService.getShowDescriptions();
    }
    // Default to true if StorageService not available
    return true;
  },

  /**
   * Look up spell data (school, description) by spell name.
   * First checks SPELL_DATA (if available, e.g., in builder), then falls back to built-in lookup.
   * Feature flag: window.FEATURE_SPELL_LOOKUP (default: false)
   * @param {string} spellName - The name of the spell to look up
   * @returns {Object|null} - Object with school and description, or null if not found
   */
  _lookupSpellData(spellName) {
    // Feature flag - disabled by default
    if (!window.FEATURE_SPELL_LOOKUP) return null;
    
    if (!spellName) return null;
    const normalizedName = String(spellName).toLowerCase().trim();
    
    // First, try to find in SPELL_DATA (available in character builder)
    if (typeof window.SPELL_DATA !== 'undefined') {
      // Search through all classes' cantrips and first level spells
      const allClasses = ['wizard', 'sorcerer', 'warlock', 'bard', 'cleric', 'druid'];
      for (const cls of allClasses) {
        const cantrips = window.SPELL_DATA.cantrips?.[cls] || [];
        const firstLevel = window.SPELL_DATA.firstLevel?.[cls] || [];
        const allSpells = [...cantrips, ...firstLevel];
        
        for (const spell of allSpells) {
          if (spell && spell.name && spell.name.toLowerCase() === normalizedName) {
            return { school: spell.school, description: spell.description };
          }
        }
      }
    }
    
    // Fall back to built-in lookup table
    return SPELL_LOOKUP[normalizedName] || null;
  },

  /**
   * Calculate scaled cantrip damage based on character level.
   * Cantrips scale at levels 5, 11, and 17 in D&D 5e.
   * @param {number} level - Character level
   * @param {string} baseDice - Base die type (e.g., 'd10', 'd8')
   * @param {string} special - Optional special handling (e.g., 'eldritch-blast')
   * @returns {string} - Scaled damage string (e.g., '2d10')
   */
  _getScaledCantripDamage(level, baseDice, special) {
    if (!baseDice) return null;
    
    // Calculate number of dice based on level thresholds
    let numDice = 1;
    if (level >= 17) numDice = 4;
    else if (level >= 11) numDice = 3;
    else if (level >= 5) numDice = 2;
    
    // Eldritch Blast is special: additional beams, not dice
    if (special === 'eldritch-blast') {
      const beams = numDice;
      if (beams === 1) return `1${baseDice}`;
      return `1${baseDice} (${beams} beams)`;
    }
    
    return `${numDice}${baseDice}`;
  },

  /**
   * Apply cantrip damage scaling to a description string.
   * Replaces {damage} placeholder with scaled damage.
   * @param {string} description - Spell description with {damage} placeholder
   * @param {number} level - Character level
   * @param {string} baseDice - Base die type
   * @param {string} special - Optional special handling
   * @returns {string} - Description with scaled damage
   */
  _scaleCantripDescription(description, level, baseDice, special) {
    if (!description || !baseDice) return description;
    const scaledDamage = this._getScaledCantripDamage(level, baseDice, special);
    return description.replace('{damage}', scaledDamage);
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
   * @param {boolean} options.hideOverflowMenu - Whether to hide the overflow menu (builder: hide until creation complete)
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
      onShare = null,
      onLeave = null,  // For shared characters: option to leave/unsubscribe
      isShared = false,  // Whether this character is shared with current user
      hasCollaborators = false,  // Whether owner has shared with others
      collaboratorCount = 0,  // Number of collaborators (for owner's view)
      ownerEmail = null,  // Email of character owner (for shared characters)
      lastUpdatedByEmail = null,  // Email of user who last updated
      hideOverflowMenu = false,
      hideHeader = false,  // Hide the entire sheet-title-header (for modals with their own header)
    } = options;

    // Parse character data (handle both old and new formats)
    const parsed = this._parseCharacterData(character, context);

    // Build HTML
    return `
      ${hideHeader ? '' : this._renderHeader(character, parsed, context, {
        onPrint,
        onRename,
        onDuplicate,
        onExport,
        onDelete,
        onLevelChange,
        onEdit,
        onGeneratePortrait,
        onTogglePortrait,
        onShare,
        onLeave,
        isShared,
        hasCollaborators,
        collaboratorCount,
        ownerEmail,
        lastUpdatedByEmail,
        hideOverflowMenu,
      })}
      
      <div class="sheet-portrait-info-row">
        ${showPortrait
          ? this._renderPortrait(character, parsed, context, {
              onGeneratePortrait,
              onTogglePortrait,
              isShared,
              hasCollaborators,
              collaboratorCount,
              ownerEmail,
              lastUpdatedByEmail,
            })
          : ''}
        
        ${this._renderBasicInfo(parsed, context, { characterName: character.name })}
      </div>
      
      ${parsed.hasAbilities ? this._renderAbilities(parsed, context) : ''}
      
      ${parsed.hasCombatStats ? this._renderCombatStats(parsed, context) : ''}
      
      ${parsed.hasSavingThrows ? this._renderSavingThrows(parsed) : ''}
      
      ${parsed.hasClassResources ? this._renderClassResources(parsed) : ''}
      
      ${this._shouldShowClassFeatures(parsed) ? this._renderClassFeatures(parsed) : ''}
      
      ${parsed.hasSkills ? this._renderSkills(parsed) : ''}
      
      ${parsed.hasRacialTraits ? this._renderRacialTraits(parsed) : ''}
      
      ${parsed.hasToolProficiencies
        ? this._renderToolProficiencies(parsed)
        : ''}
      
      ${parsed.hasEquipment ? this._renderEquipment(parsed) : ''}
      
      ${parsed.hasLanguages ? this._renderLanguages(parsed) : ''}
      
      ${parsed.hasBackgroundFeature
        ? this._renderBackgroundFeature(parsed)
        : ''}
      
      ${parsed.hasBackstory ? this._renderBackstory(parsed) : ''}
      
      ${context === 'manager' && parsed.hasExportInfo
        ? this._renderExportInfo(character)
        : ''}
      
      ${parsed.hasSpells ? this._renderSpells(parsed, context, { characterId: character.id, onEdit }) : ''}
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
      onShare,
      onLeave,
      isShared,
      hasCollaborators,
      collaboratorCount,
      ownerEmail,
      lastUpdatedByEmail,
      hideOverflowMenu,
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
    const hasValidManagerId = !!character.id;
    const generateFn =
      context === 'builder'
        ? 'App.generateCustomAIPortrait()'
        : hasValidManagerId
          ? `generatePortraitForCharacter('${character.id}')`
          : null;
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

    if (
      parsed.hasRace &&
      parsed.hasClass &&
      onGeneratePortrait &&
      (context === 'builder' || hasValidManagerId) &&
      generateFn
    ) {
      // Check image quota status
      const imageQuotaRemaining = window._imageQuotaRemaining;
      const imageQuotaLimit = window._imageQuotaLimit;
      const imageQuotaExhausted = typeof imageQuotaRemaining === 'number' && imageQuotaRemaining === 0;
      
      // Build tooltip text based on quota status
      let imageQuotaTooltip = '';
      if (imageQuotaExhausted) {
        imageQuotaTooltip = 'Daily limit reached';
      } else if (typeof imageQuotaRemaining === 'number') {
        if (imageQuotaRemaining === 0) {
          imageQuotaTooltip = 'Daily limit reached';
        } else if (imageQuotaRemaining > 0) {
          if (typeof imageQuotaLimit === 'number') {
            imageQuotaTooltip = `${imageQuotaRemaining}/${imageQuotaLimit}${' '}remaining today`;
          } else {
            imageQuotaTooltip = `${imageQuotaRemaining}${' '}remaining today`;
          }
        }
        // -1 means unlimited, no tooltip
      }
      
      headerActions.push({
        icon: '★',
        label: 'Customize portrait',
        onclick: generateFn,
        disabled: imageQuotaExhausted,
        title: imageQuotaTooltip,
      });
    }

    if (hasCustomPortrait && historyFn) {
      headerActions.push({
        icon: '⧖',
        label: 'Portrait history',
        onclick: historyFn,
      });
    }

    // Manager-only: Pin character (above Share, only for saved characters)
    if (context === 'manager' && hasValidManagerId) {
      const isPinned = typeof window.isCharacterPinned === 'function' 
        && window.isCharacterPinned(character.id);
      headerActions.push({
        icon: isPinned ? '◇' : '◆',
        label: isPinned ? 'Unpin character' : 'Pin character',
        onclick: `togglePinCharacter('${character.id}')`,
      });
    }

    // Manager-only: Share character (only for saved characters with valid IDs, not for shared chars)
    if (context === 'manager' && onShare && hasValidManagerId && !isShared) {
      headerActions.push({
        icon: '↗',
        label: 'Share character',
        onclick: `openShareModal('${character.id}')`,
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

    // Manager-only: Edit Spells (only for spellcasting classes)
    if (context === 'manager' && onEdit && character.id && parsed.hasSpells) {
      headerActions.unshift({
        icon: '✦',
        label: 'Edit spells',
        onclick: `openSpellEditModal('${character.id}')`,
      });
    }

    // Manager-only: Leave shared character (for collaborators)
    if (context === 'manager' && onLeave && isShared && hasValidManagerId) {
      headerActions.push({
        icon: '✕',
        label: 'Leave shared character',
        onclick: `leaveSharedCharacter('${character.id}')`,
      });
    }

    // Append Delete last so it always appears at the bottom of the listbox
    if (deleteAction) {
      headerActions.push(deleteAction);
    }

    // Manager-only: Add Edit to overflow menu
    if (context === 'manager' && onEdit && editFn) {
      headerActions.unshift({
        icon: '✎',
        label: 'Edit character',
        onclick: editFn,
      });
    }

    // Manager-only: Navigation buttons in header
    // - "Collapse" to go back to grid view
    // - "Expand" to expand campaign panel (hidden in sheet-campaign view via CSS)
    // Desktop: icon-only, expands to show label on hover
    // Mobile: icon-only always
    const charactersButtonHtml =
      context === 'manager' && hasValidManagerId
        ? `
        <button
          class="terminal-btn terminal-btn-small terminal-btn-secondary sheet-edit-btn sheet-nav-btn sheet-nav-btn--to-characters sheet-nav-btn--expandable"
          type="button"
          onclick="ExpandedView.collapse()"
          title="Return to character grid"
        ><span class="sheet-nav-btn__icon">↙</span><span class="sheet-nav-btn__label">Collapse</span></button>
      `
        : '';

    const campaignButtonHtml =
      context === 'manager' && hasValidManagerId
        ? `
        <button
          class="terminal-btn terminal-btn-small terminal-btn-secondary sheet-edit-btn sheet-nav-btn sheet-nav-btn--to-campaign sheet-nav-btn--expandable"
          type="button"
          onclick="ExpandedView.expand()"
          title="View campaign info"
        ><span class="sheet-nav-btn__icon">↗</span><span class="sheet-nav-btn__label">Expand</span></button>
      `
        : '';

    const headerMenu =
      headerActions.length > 0 && !hideOverflowMenu
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
                (action) => {
                  const btnHtml = `
              <button
                class="selector-option${action.disabled ? ' is-disabled' : ''}"
                type="button"
                role="menuitem"
                ${action.disabled ? 'disabled' : `onclick="${action.onclick}"`}${
                  action.id ? ` id="${action.id}"` : ''
                }
              >
                <span class="selector-option-icon">${action.icon}</span>
                <span class="selector-option-label">${action.label}</span>
              </button>`;
                  // Wrap with custom tooltip if action has a title
                  if (action.title) {
                    return `<span class="has-tooltip selector-option-wrapper">${btnHtml}<span class="custom-tooltip"${' '}data-position="bottom">${action.title}</span></span>`;
                  }
                  return btnHtml;
                },
              )
              .join('')}
          </div>
        </div>
      `
        : '';

    const navActionsBlock =
      charactersButtonHtml || campaignButtonHtml
        ? `
        <div class="sheet-title-actions">
          ${charactersButtonHtml}
          ${campaignButtonHtml}
        </div>
      `
        : '';

    const safeTitle =
      character.name && typeof character.name === 'string'
        ? this.escapeHtml(character.name)
        : '[ CHARACTER SHEET ]';

    // Generate shared tag for inline display with title
    let sharedTagHtml = '';
    if (isShared || hasCollaborators) {
      // Format the last updated time
      const updatedAt = character.updatedAt || character.updated_at;
      let lastUpdatedText = '';
      if (updatedAt) {
        try {
          const date = new Date(updatedAt);
          lastUpdatedText = date.toLocaleString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          });
        } catch (e) {
          lastUpdatedText = '';
        }
      }
      
      // Format who last updated
      const lastUpdatedBy = lastUpdatedByEmail ? this.escapeHtml(lastUpdatedByEmail) : null;
      
      if (isShared) {
        // Collaborator's view
        const sharedByLine = `Shared by ${this.escapeHtml(ownerEmail || 'unknown')}`;
        let updatedLine = '';
        if (lastUpdatedText) {
          updatedLine = lastUpdatedBy 
            ? `Last updated: ${lastUpdatedText}<br>by ${lastUpdatedBy}`
            : `Last updated: ${lastUpdatedText}`;
        }
        const tooltipContent = updatedLine ? `${sharedByLine}<br>${updatedLine}` : sharedByLine;
        sharedTagHtml = `
          <span class="sheet-shared-tag has-tooltip">
            SHARED
            <span class="custom-tooltip" data-position="bottom-start">${tooltipContent}</span>
          </span>`;
      } else if (hasCollaborators) {
        // Owner's view
        const sharedWithLine = collaboratorCount === 1 ? 'Shared with 1 user' : `Shared with ${collaboratorCount} users`;
        let updatedLine = '';
        if (lastUpdatedText) {
          updatedLine = lastUpdatedBy 
            ? `Last updated: ${lastUpdatedText}<br>by ${lastUpdatedBy}`
            : `Last updated: ${lastUpdatedText}`;
        }
        const tooltipContent = updatedLine ? `${sharedWithLine}<br>${updatedLine}` : sharedWithLine;
        sharedTagHtml = `
          <span class="sheet-shared-tag has-tooltip">
            SHARED
            <span class="custom-tooltip" data-position="bottom-start">${tooltipContent}</span>
          </span>`;
      }
    }

    const headerClass = context === 'builder' ? 'sheet-title-header sheet-title-header--flush' : 'sheet-title-header';

    return `
      <div class="${headerClass}">
        ${headerMenu}
        <div class="sheet-title"><span class="sheet-title-name">${safeTitle}</span>${sharedTagHtml}</div>
        ${navActionsBlock}
      </div>
    `;
  },

  _renderPortrait(character, parsed, context, callbacks) {
    const { 
      onGeneratePortrait, 
      onTogglePortrait,
      isShared,
      hasCollaborators,
      collaboratorCount,
      ownerEmail,
      lastUpdatedByEmail,
    } = callbacks;

    // Check if this is a demo character - show tag on portrait
    const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);

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

    // Demo tag overlays portrait like on cards
    const demoTagHtml = isDemo ? '<span class="sheet-demo-tag">SAMPLE</span>' : '';

    return `
      <div class="portrait-container${showOriginalByDefault ? ' portrait-container--original-mode' : ''}">
        ${demoTagHtml}
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
    const { characterName } = callbacks || {};
    const safeName = characterName && typeof characterName === 'string'
      ? this.escapeHtml(characterName)
      : '';
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
      <div class="sheet-section sheet-section--basic-info">
        <div class="sheet-header"></div>
        ${safeName ? `<div class="print-only-name">${safeName}</div>` : ''}
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
          <div class="stat-line">
            <span class="stat-label">XP:</span>
            <span class="stat-value">${this._formatXP(parsed.experiencePoints, parsed.level)}</span>
          </div>
        </div>
      </div>
    `;
  },

  // D&D 5e XP thresholds for each level
  XP_THRESHOLDS: [
    0,       // Level 1
    300,     // Level 2
    900,     // Level 3
    2700,    // Level 4
    6500,    // Level 5
    14000,   // Level 6
    23000,   // Level 7
    34000,   // Level 8
    48000,   // Level 9
    64000,   // Level 10
    85000,   // Level 11
    100000,  // Level 12
    120000,  // Level 13
    140000,  // Level 14
    165000,  // Level 15
    195000,  // Level 16
    225000,  // Level 17
    265000,  // Level 18
    305000,  // Level 19
    355000,  // Level 20
  ],

  /**
   * Format XP display with progress to next level.
   * @param {number} xp - Current experience points
   * @param {number} level - Current character level
   * @returns {string} - Formatted XP string
   */
  _formatXP(xp, level) {
    const currentXP = xp || 0;
    const formattedXP = currentXP.toLocaleString();
    
    // At max level, just show XP
    if (level >= 20) {
      return `${formattedXP} (MAX)`;
    }
    
    // Calculate next level threshold
    const nextLevelXP = this.XP_THRESHOLDS[level] || 0;
    const formattedNext = nextLevelXP.toLocaleString();
    
    return `${formattedXP} / ${formattedNext}`;
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

    // Show death saves when HP is 0 or when any saves have been recorded
    // const showDeathSaves = parsed.hpCurrent === 0 ||
    //   parsed.deathSaveSuccesses > 0 ||
    //   parsed.deathSaveFailures > 0;
    const showDeathSaves = false; // Temporarily disabled

    return `
      <div class="sheet-section" id="combat-stats-section">
        <div class="sheet-header ${context === 'builder' ? 'sheet-header--no-divider' : ''}">
          <div class="sheet-header-title">[ COMBAT STATS ]</div>
          ${this._renderConditionTags(parsed)}
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
            <div class="stat-box-label">HIT DICE</div>
            <div class="stat-box-value">${isBuilder && !hasCombatStats ? '—' : `${parsed.hitDiceCurrent}/${parsed.hitDiceMax} d${parsed.hitDie}`}</div>
          </div>
        </div>
        ${showDeathSaves ? this._renderDeathSaves(parsed) : ''}
      </div>
    `;
  },

  // _renderDeathSaves(parsed) {
  //   const successes = parsed.deathSaveSuccesses || 0;
  //   const failures = parsed.deathSaveFailures || 0;

  //   const renderCheckboxes = (count, max, type) => {
  //     let html = '';
  //     for (let i = 0; i < max; i++) {
  //       const filled = i < count;
  //       html += `<span class="death-save-box ${filled ? 'is-filled' : ''}" data-type="${type}" data-index="${i}"></span>`;
  //     }
  //     return html;
  //   };

  //   return `
  //     <div class="death-saves">
  //       <div class="death-saves-label">DEATH SAVES</div>
  //       <div class="death-saves-row">
  //         <span class="death-saves-type death-saves-type--success">Successes</span>
  //         <div class="death-saves-boxes" data-save-type="successes">
  //           ${renderCheckboxes(successes, 3, 'successes')}
  //         </div>
  //       </div>
  //       <div class="death-saves-row">
  //         <span class="death-saves-type death-saves-type--failure">Failures</span>
  //         <div class="death-saves-boxes" data-save-type="failures">
  //           ${renderCheckboxes(failures, 3, 'failures')}
  //         </div>
  //       </div>
  //     </div>
  //   `;
  // },

  _renderConditionTags(parsed) {
    const conditions = parsed.conditions || [];
    if (conditions.length === 0) return '';

    const conditionDefinitions = {
      poisoned: 'Disadvantage on attack rolls and ability checks.',
      exhausted: 'Levels of exhaustion cause cumulative penalties to speed, ability checks, attacks, saving throws, and HP maximum.',
      diseased: 'Various effects depending on the disease. May cause ability score reduction, exhaustion, or other debilitating effects.',
      cursed: 'Supernatural affliction with effects varying by curse type. May affect abilities, attacks, or impose other penalties.',
    };

    const conditionTags = conditions.map(c => {
      const tooltip = conditionDefinitions[c.toLowerCase()] || 'Status condition';
      return `<span class="condition-tag condition-${c.toLowerCase()} has-tooltip" data-tooltip="${this.escapeHtml(tooltip)}">${c.toUpperCase()}</span>`;
    }).join('');

    return `<div class="conditions-tags">${conditionTags}</div>`;
  },

  _renderClassResources(parsed) {
    const resources = parsed.classResources || {};
    const resourceKeys = Object.keys(resources);
    
    if (resourceKeys.length === 0) return '';

    // Human-readable names and descriptions for resources
    const RESOURCE_DATA = {
      ki: {
        name: 'Ki Points',
        description: 'Fuel monk abilities: Flurry of Blows (2 unarmed strikes), Patient Defense (Dodge as bonus action), Step of the Wind (Dash or Disengage as bonus action, jump distance doubled)'
      },
      rage: {
        name: 'Rage',
        description: 'Bonus action to enter rage for 1 minute. Advantage on STR checks/saves, bonus rage damage on STR melee attacks, resistance to bludgeoning/piercing/slashing damage'
      },
      rageDamage: {
        name: 'Rage Damage',
        description: 'Extra damage added to STR-based melee weapon attacks while raging'
      },
      sorceryPoints: {
        name: 'Sorcery Points',
        description: 'Fuel Metamagic options and convert to/from spell slots. Create spell slot: 2 pts (1st), 3 pts (2nd), 5 pts (3rd), 6 pts (4th), 7 pts (5th)'
      },
      bardicInspiration: {
        name: 'Bardic Inspiration',
        description: 'Bonus action to grant an ally an inspiration die. They can add it to one ability check, attack roll, or saving throw within 10 minutes'
      },
      bardicInspirationDie: {
        name: 'Inspiration Die',
        description: 'Die size for Bardic Inspiration and Song of Rest'
      },
      channelDivinity: {
        name: 'Channel Divinity',
        description: 'Channel divine energy for Turn Undead (undead must flee) or domain-specific abilities'
      },
      layOnHands: {
        name: 'Lay on Hands',
        description: 'Touch to restore HP from your pool, or spend 5 HP to cure one disease or neutralize one poison'
      },
      divineSense: {
        name: 'Divine Sense',
        description: 'Action to detect celestials, fiends, and undead within 60 feet, and consecrated/desecrated locations'
      },
      wildShape: {
        name: 'Wild Shape',
        description: 'Action to transform into a beast you have seen. Max CR and movement types depend on druid level'
      },
      secondWind: {
        name: 'Second Wind',
        description: 'Bonus action to regain 1d10 + fighter level hit points'
      },
      actionSurge: {
        name: 'Action Surge',
        description: 'Take one additional action on your turn (on top of regular action and bonus action)'
      },
      indomitable: {
        name: 'Indomitable',
        description: 'Reroll a failed saving throw. You must use the new roll'
      },
      sneakAttack: {
        name: 'Sneak Attack',
        description: 'Extra damage once per turn when you hit with a finesse or ranged weapon and have advantage, or an enemy of your target is within 5 feet'
      },
      mysticArcanum: {
        name: 'Mystic Arcanum',
        description: 'Cast a high-level warlock spell once without expending a spell slot'
      },
      arcaneRecovery: {
        name: 'Arcane Recovery',
        description: 'During a short rest, recover expended spell slots with combined level up to half your wizard level (rounded up)'
      },
    };

    // Check if descriptions should be shown inline
    const showDescriptions = this.shouldShowDescriptions();

    const resourceItems = resourceKeys
      .filter(key => {
        const r = resources[key];
        // Filter out meta-resources that don't have current/max (like bardicInspirationDie)
        return r && (r.current !== undefined || r.value !== undefined);
      })
      .map(key => {
        const r = resources[key];
        const data = RESOURCE_DATA[key] || { name: key, description: '' };
        const name = data.name;
        const description = data.description;
        
        // Build the value display
        let valueDisplay = '';
        if (r.value !== undefined) {
          // Value-only resources (like sneakAttack, rageDamage)
          valueDisplay = `<span class="skill-prof-modifier">${this.escapeHtml(String(r.value))}</span>`;
        } else {
          // Resources with current/max
          const current = r.unlimited ? '∞' : r.current;
          const max = r.unlimited ? '∞' : r.max;
          const refreshIcon = r.refresh === 'short' ? '⟳' : r.refresh === 'long' ? '☽' : '';
          const note = r.note ? ` (${this.escapeHtml(r.note)})` : '';
          valueDisplay = `<span class="skill-prof-modifier">${current}/${max} ${refreshIcon}${note}</span>`;
        }
        
        // When descriptions are hidden, add tooltip attribute
        const tooltipAttr = (!showDescriptions && description)
          ? ` data-tooltip="${this.escapeHtml(description)}" class="skill-prof-item has-tooltip"`
          : ' class="skill-prof-item"';
        
        const descriptionHtml = (showDescriptions && description)
          ? `<span class="skill-prof-desc">${this.escapeHtml(description)}</span>` 
          : '';
        
        return `
          <li${tooltipAttr}>
            <div class="skill-prof-header">
              <span class="skill-prof-name">${this.escapeHtml(name)}</span>
              ${valueDisplay}
            </div>
            ${descriptionHtml}
          </li>
        `;
      })
      .join('');

    if (!resourceItems) return '';

    return `
      <div class="sheet-section sheet-section--collapsible" id="class-resources-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ CLASS RESOURCES ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <div class="resource-legend-box">
            <span class="resource-legend-icon">⟳</span>&nbsp;Short Rest &nbsp;&bull;&nbsp; <span class="resource-legend-icon">☽</span>&nbsp;Long Rest
          </div>
          <ul class="skill-prof-list">
            ${resourceItems}
          </ul>
        </div>
      </div>
    `;
  },

  /**
   * Check if class features should be shown based on user settings and data availability.
   * @param {object} parsed - Parsed character data
   * @returns {boolean} True if features should be rendered
   */
  _shouldShowClassFeatures(parsed) {
    // Check if the setting is enabled
    if (typeof StorageService !== 'undefined' && StorageService.getShowClassFeatures) {
      if (!StorageService.getShowClassFeatures()) {
        return false;
      }
    } else {
      // If StorageService not available, don't show (default off)
      return false;
    }

    // Check if we have the necessary data
    if (!parsed.className || !parsed.level) {
      return false;
    }

    // Check if ClassFeaturesData is available
    if (typeof ClassFeaturesData === 'undefined' || !ClassFeaturesData.hasClassFeatures) {
      return false;
    }

    // Check if this class has feature data
    return ClassFeaturesData.hasClassFeatures(parsed.className);
  },

  /**
   * Render the class features reference panel.
   * Shows features grouped by level up to the character's current level.
   * @param {object} parsed - Parsed character data
   * @returns {string} HTML for the class features section
   */
  _renderClassFeatures(parsed) {
    if (!parsed.className || !parsed.level) {
      return '';
    }

    // Get features data
    const featuresData = ClassFeaturesData.getFeaturesUpToLevel(parsed.className, parsed.level);
    
    if (!featuresData || featuresData.length === 0) {
      return '';
    }

    // Format class name for display
    const classDisplayName = this._formatClassName(parsed.className);

    // Build feature items grouped by level (reversed so current level is at top)
    const allGroups = [...featuresData].reverse();
    const visibleGroups = allGroups.slice(0, 3);
    const hiddenGroups = allGroups.slice(3);
    const hasHiddenGroups = hiddenGroups.length > 0;

    // Check if descriptions should be shown inline
    const showDescriptions = this.shouldShowDescriptions();

    const renderGroup = (levelData) => {
      const levelLabel = `<span class="class-features-group-label">Level ${levelData.level}</span>`;

      const featureItems = levelData.features.map(feature => {
        const choiceIndicator = feature.choice 
          ? '<span class="class-features-choice" title="Requires a choice">◆</span>' 
          : '';
        
        // When descriptions are hidden, add tooltip attribute
        const tooltipAttr = (!showDescriptions && feature.description)
          ? ` data-tooltip="${this.escapeHtml(feature.description)}"`
          : '';
        const tooltipClass = (!showDescriptions && feature.description) ? ' has-tooltip' : '';
        
        const description = (showDescriptions && feature.description) 
          ? `<span class="class-features-desc">${this.escapeHtml(feature.description)}</span>` 
          : '';
        
        return `
          <li class="class-features-item${levelData.isCurrentLevel ? ' class-features-item--new' : ''}${tooltipClass}"${tooltipAttr}>
            <span class="class-features-name">${choiceIndicator}${this.escapeHtml(feature.name)}</span>
            ${description}
          </li>
        `;
      }).join('');

      return `
        <div class="class-features-group">
          ${levelLabel}
          <ul class="class-features-list">
            ${featureItems}
          </ul>
        </div>
      `;
    };

    const visibleGroupsHtml = visibleGroups.map(renderGroup).join('');
    const hiddenGroupsHtml = hasHiddenGroups 
      ? `<div class="class-features-hidden" style="display: none;">${hiddenGroups.map(renderGroup).join('')}</div>`
      : '';
    const showAllLink = hasHiddenGroups
      ? `<span class="class-features-toggle-links">
           <a href="#" class="class-features-see-more" onclick="CharacterSheet.showAllClassFeatures(this, event)">See more</a>
           <a href="#" class="class-features-see-less" style="display: none;" onclick="CharacterSheet.hideClassFeatures(this, event)">See less</a>
         </span>`
      : '';

    return `
      <div class="sheet-section sheet-section--collapsible" id="class-features-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ CLASS FEATURES: ${this.escapeHtml(classDisplayName.toUpperCase())} ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <div class="class-features-legend">
            <span class="class-features-choice">◆</span> Requires Choice
          </div>
          <div class="class-features-groups">
            ${visibleGroupsHtml}
            ${hiddenGroupsHtml}
          </div>
          ${showAllLink}
        </div>
      </div>
    `;
  },

  /**
   * Format a class name for display (e.g., "fighter" -> "Fighter")
   * @param {string} className - Raw class name
   * @returns {string} Formatted class name
   */
  _formatClassName(className) {
    if (!className) return '';
    const str = String(className).trim().replace(/-/g, ' ');
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },

  /**
   * Toggle a collapsible section
   * @param {HTMLElement} headerEl - The header button element
   */
  toggleCollapsible(headerEl) {
    if (!headerEl) return;
    const section = headerEl.closest('.sheet-section--collapsible');
    if (!section) return;
    
    const content = section.querySelector('.sheet-collapsible-content');
    const toggle = headerEl.querySelector('.sheet-header-toggle');
    const isExpanded = headerEl.getAttribute('aria-expanded') === 'true';
    
    if (isExpanded) {
      // Collapse
      headerEl.setAttribute('aria-expanded', 'false');
      if (content) content.classList.add('is-collapsed');
      if (toggle) {
        toggle.classList.remove('is-expanded');
        toggle.classList.add('is-collapsed');
      }
    } else {
      // Expand
      headerEl.setAttribute('aria-expanded', 'true');
      if (content) content.classList.remove('is-collapsed');
      if (toggle) {
        toggle.classList.remove('is-collapsed');
        toggle.classList.add('is-expanded');
      }
    }
  },

  /**
   * Show all hidden class features
   * @param {HTMLElement} linkEl - The "see more" link element
   * @param {Event} event - Click event
   */
  showAllClassFeatures(linkEl, event) {
    if (event) event.preventDefault();
    if (!linkEl) return;
    const section = linkEl.closest('.sheet-collapsible-content');
    if (!section) return;
    
    const hiddenGroups = section.querySelector('.class-features-hidden');
    if (hiddenGroups) {
      hiddenGroups.style.display = 'flex';
    }
    linkEl.style.display = 'none';
    const seeLessLink = section.querySelector('.class-features-see-less');
    if (seeLessLink) seeLessLink.style.display = 'inline';
  },

  /**
   * Hide class features (collapse back)
   * @param {HTMLElement} linkEl - The "see less" link element
   * @param {Event} event - Click event
   */
  hideClassFeatures(linkEl, event) {
    if (event) event.preventDefault();
    if (!linkEl) return;
    const section = linkEl.closest('.sheet-collapsible-content');
    if (!section) return;
    
    const hiddenGroups = section.querySelector('.class-features-hidden');
    if (hiddenGroups) {
      hiddenGroups.style.display = 'none';
    }
    linkEl.style.display = 'none';
    const seeMoreLink = section.querySelector('.class-features-see-more');
    if (seeMoreLink) seeMoreLink.style.display = 'inline';
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
          // containers (e.g. app-root with overflow:hidden).
          // EXCEPTION: Search/sort bar and header overflow use absolute positioning
          // so the dropdown stays anchored to its button during page scroll.
          const inSearchActions = !!triggerEl.closest('.search-actions');
          const inHeaderOverflow = !!triggerEl.closest('.header-overflow');
          const inCampaignOverflow = !!triggerEl.closest('.campaign-overflow');
          const useFixedPositioning = !inSearchActions && !inHeaderOverflow && !inCampaignOverflow;

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
          menu.style.width = '';
          menu.style.minWidth = '';
          menu.style.maxWidth = '';
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
              // Fallback to app root
              host = triggerEl.closest('.app-root, .terminal-frame, .terminal-container') || document.documentElement;
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
            // In expanded view, character sheet menus should stay within their panel
            // (the left-panel), not overflow into the campaign panel on the right.
            host =
              triggerEl.closest('.app-panel--left, .left-panel') ||
              triggerEl.closest('.app-root, .terminal-frame, .terminal-container') ||
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
            // Declare at higher scope so it's accessible after the if/else block
            const isSheetActionsMenu = menu.classList.contains('sheet-actions-menu');
            
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

              // Sheet actions menu should always open to the right (left-aligned with trigger)
              if (isSheetActionsMenu) {
                // Use left positioning - this anchors the menu's left edge
                // to the trigger's left edge so it opens rightward
                menu.style.left = `${triggerRect.left}px`;
                menu.style.right = 'auto';
                // Set targetLeft to a dummy value since we won't use it
                targetLeft = 0;
              } else if (fitsRight && !fitsLeft) {
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

            // For sheet-actions-menu, we already set right positioning above, so skip left
            if (!isSheetActionsMenu) {
              menu.style.left = `${targetLeft}px`;
              menu.style.right = 'auto';
            }
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
            if (inHeaderOverflow || inCampaignOverflow) {
              // Header/campaign overflow: right-align menu with trigger (opens leftward)
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
        // Guard against non-element targets (text nodes, etc.)
        if (!event.target || typeof event.target.closest !== 'function') return;
        
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
        // Guard against non-element targets (text nodes, etc.)
        if (!event.target || typeof event.target.closest !== 'function') return;
        
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

    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    return `
      <div class="sheet-section" id="saving-throws-section">
        <div class="sheet-header">
          <div class="sheet-header-title">[ SAVING THROWS ]</div>
        </div>
        <div class="ability-grid">
          ${abilities
            .map((ability) => {
              const value = parsed.savingThrowModifiers[ability];
              const isProficient = parsed.savingThrows?.includes(ability);
              return `
                <div class="ability-box">
                  <div class="ability-name">${ability.toUpperCase()}${isProficient ? '★' : ''}</div>
                  <div class="ability-score">${this.formatModifier(value)}</div>
                </div>
              `;
            })
            .join('')}
        </div>
      </div>
    `;
  },

  /**
   * Skill definitions for D&D 5e with ability and description.
   */
  _skillDefinitions: {
    acrobatics: { ability: 'DEX', description: 'Balance, tumbling, diving, and acrobatic feats.' },
    'animal-handling': { ability: 'WIS', description: 'Calm, control, or intuit animal intentions.' },
    arcana: { ability: 'INT', description: 'Recall lore about spells, magic items, and planes.' },
    athletics: { ability: 'STR', description: 'Climb, jump, swim, and physical feats of strength.' },
    deception: { ability: 'CHA', description: 'Hide the truth through disguise, misdirection, or lies.' },
    history: { ability: 'INT', description: 'Recall lore about historical events and legends.' },
    insight: { ability: 'WIS', description: 'Determine true intentions and detect deception.' },
    intimidation: { ability: 'CHA', description: 'Threaten, coerce, or inspire fear in others.' },
    investigation: { ability: 'INT', description: 'Search for clues and deduce from evidence.' },
    medicine: { ability: 'WIS', description: 'Stabilize the dying and diagnose illnesses.' },
    nature: { ability: 'INT', description: 'Recall lore about terrain, plants, and animals.' },
    perception: { ability: 'WIS', description: 'Spot, hear, or detect presence of something.' },
    performance: { ability: 'CHA', description: 'Delight an audience with music, dance, or acting.' },
    persuasion: { ability: 'CHA', description: 'Influence others with tact or diplomacy.' },
    religion: { ability: 'INT', description: 'Recall lore about deities, rites, and holy symbols.' },
    'sleight-of-hand': { ability: 'DEX', description: 'Pick pockets, conceal objects, manual trickery.' },
    stealth: { ability: 'DEX', description: 'Hide, sneak, and avoid detection.' },
    survival: { ability: 'WIS', description: 'Track creatures, hunt, and navigate the wilderness.' },
  },

  /**
   * Tool definitions for D&D 5e with descriptions.
   */
  _toolDefinitions: {
    // Artisan's Tools
    "alchemist's-supplies": { description: "Create alchemical items like acid, alchemist's fire, and potions." },
    "brewer's-supplies": { description: "Brew alcoholic beverages and identify poisons in drinks." },
    "calligrapher's-supplies": { description: "Create beautiful writing and identify authenticity of documents." },
    "carpenter's-tools": { description: "Build and repair wooden structures, furniture, and objects." },
    "cartographer's-tools": { description: "Create and interpret maps of areas and terrains." },
    "cobbler's-tools": { description: "Craft, repair, and modify footwear and leather goods." },
    "cook's-utensils": { description: "Prepare food, identify ingredients, and detect poisoned meals." },
    "glassblower's-tools": { description: "Shape glass into bottles, containers, and decorative items." },
    "jeweler's-tools": { description: "Craft jewelry, cut gems, and identify valuable stones." },
    "leatherworker's-tools": { description: "Work with leather to create armor, bags, and accessories." },
    "mason's-tools": { description: "Cut and shape stone for building and sculpting." },
    "painter's-supplies": { description: "Create paintings, sketches, and visual artworks." },
    "potter's-tools": { description: "Create ceramic items like pots, vessels, and containers." },
    "smith's-tools": { description: "Forge and repair metal items, weapons, and armor." },
    "tinker's-tools": { description: "Repair and create small mechanical devices and gadgets." },
    "weaver's-tools": { description: "Create cloth, textiles, and fabric items." },
    "woodcarver's-tools": { description: "Carve intricate wooden objects and decorations." },
    // Gaming Sets
    "dice-set": { description: "Play games of chance and detect cheating." },
    "dragonchess-set": { description: "Play the strategic game of dragonchess." },
    "playing-card-set": { description: "Play card games and perform card tricks." },
    "three-dragon-ante-set": { description: "Play the popular gambling game Three-Dragon Ante." },
    // Musical Instruments
    bagpipes: { description: "Perform music with this wind instrument." },
    drum: { description: "Perform percussion music and keep rhythm." },
    dulcimer: { description: "Perform music with this stringed instrument." },
    flute: { description: "Perform music with this wind instrument." },
    horn: { description: "Perform music with this brass instrument." },
    lute: { description: "Perform music with this popular stringed instrument." },
    lyre: { description: "Perform music with this ancient stringed instrument." },
    "pan-flute": { description: "Perform music with this traditional wind instrument." },
    shawm: { description: "Perform music with this double-reed wind instrument." },
    viol: { description: "Perform music with this bowed stringed instrument." },
    // Other Tools
    "disguise-kit": { description: "Create disguises and alter your appearance." },
    "forgery-kit": { description: "Forge documents, identify forgeries, and copy handwriting." },
    "herbalism-kit": { description: "Identify plants, create antitoxins and potions of healing." },
    "navigator's-tools": { description: "Plot courses, navigate by stars, and determine location." },
    "poisoner's-kit": { description: "Create poisons, apply them to weapons, and identify toxins." },
    "thieves'-tools": { description: "Pick locks, disable traps, and bypass security." },
    // Vehicles
    "vehicles-land": { description: "Operate land vehicles like carts, wagons, and chariots." },
    "vehicles-water": { description: "Operate water vehicles like boats, ships, and galleys." },
  },

  _renderSkills(parsed) {
    const hasSkillModifiers =
      parsed.skillModifiers && Object.keys(parsed.skillModifiers).length > 0;
    const hasSkillProfs =
      parsed.skillProficiencies && parsed.skillProficiencies.length > 0;

    if (!hasSkillModifiers && !hasSkillProfs) return '';

    // Build a unified list of skills to display
    // When we have modifiers, those are the primary display
    // Extra proficiencies (not in modifiers) are shown separately
    const modifierKeys = hasSkillModifiers
      ? Object.keys(parsed.skillModifiers)
      : [];

    const extraProfs =
      hasSkillProfs && modifierKeys.length
        ? parsed.skillProficiencies.filter(
            (skill) => !modifierKeys.includes(skill),
          )
        : parsed.skillProficiencies || [];

    // Check if descriptions should be shown inline
    const showDescriptions = this.shouldShowDescriptions();

    // Render skill items with descriptions (inline or tooltip based on setting)
    const renderSkillItem = (skill, modifier = null) => {
      const skillDef = this._skillDefinitions[skill] || {};
      const name = this.formatSkillName(skill);
      const ability = skillDef.ability || '';
      const description = skillDef.description || '';
      
      const modifierDisplay = modifier !== null 
        ? `<span class="skill-prof-modifier">${this.formatModifier(modifier)}</span>` 
        : '';
      
      // When descriptions are hidden, add tooltip attribute
      const tooltipAttr = (!showDescriptions && description)
        ? ` data-tooltip="${this.escapeHtml(description)}" class="skill-prof-item has-tooltip"`
        : ' class="skill-prof-item"';
      
      return `
        <li${tooltipAttr}>
          <div class="skill-prof-header">
            <span class="skill-prof-name">${this.escapeHtml(name)}</span>
            ${ability ? `<span class="skill-prof-ability">(${ability})</span>` : ''}
            ${modifierDisplay}
          </div>
          ${showDescriptions && description ? `<span class="skill-prof-desc">${this.escapeHtml(description)}</span>` : ''}
        </li>
      `;
    };

    // Build main skills list (with modifiers if available)
    const mainSkillsHtml = hasSkillModifiers
      ? Object.entries(parsed.skillModifiers)
          .map(([skill, value]) => renderSkillItem(skill, value))
          .join('')
      : '';

    // Build extra proficiencies list (no modifiers)
    const extraProfsHtml = extraProfs.length > 0
      ? extraProfs.map(skill => renderSkillItem(skill)).join('')
      : '';

    // Combine both lists
    const allSkillsHtml = mainSkillsHtml + extraProfsHtml;

    const headerTitle = hasSkillModifiers
      ? 'SKILL PROFICIENCIES'
      : 'SKILL PROFICIENCIES';

    return `
      <div class="sheet-section sheet-section--collapsible" id="skill-proficiencies-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ ${headerTitle} ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <ul class="skill-prof-list">
            ${allSkillsHtml}
          </ul>
        </div>
      </div>
    `;
  },

  _renderSpells(parsed, context = 'builder', callbacks = {}) {
    const { characterId, onEdit } = callbacks;
    const cantrips = parsed.cantrips || [];
    const spellsKnown = parsed.spellsKnown || [];
    const spellsPrepared = parsed.spellsPrepared || [];
    const spellSlots = parsed.spellSlots || {};

    // Helper to look up spell description from SPELL_DATABASE
    const getSpellDescription = (spellName) => {
      if (!spellName || typeof window.SPELL_DATABASE !== 'object') return '';
      const normalizedName = spellName.toLowerCase().trim();
      // Search all spell levels (0-9)
      for (let level = 0; level <= 9; level++) {
        const spellsAtLevel = window.SPELL_DATABASE[level];
        if (!Array.isArray(spellsAtLevel)) continue;
        const found = spellsAtLevel.find(s => s.name && s.name.toLowerCase() === normalizedName);
        if (found && found.description) return found.description;
      }
      return '';
    };

    // Helper to render spell tags in a container
    const renderSpellTags = (spells) => {
      if (spells.length === 0) return '';
      
      const tags = spells
        .map((spell) => {
          const isObject = spell && typeof spell === 'object';
          const rawName = isObject ? spell.name : spell;
          const name = this.escapeHtml(rawName || '');
          // Try to get description from spell object first, then look up in database
          let description = isObject && spell.description ? spell.description : '';
          if (!description) {
            description = getSpellDescription(rawName);
          }
          const escapedDesc = description ? this.escapeHtml(description) : '';
          
          // Add tooltip if description exists
          if (escapedDesc) {
            return `<span class="sheet-spell-tag has-tooltip">${name}<span class="custom-tooltip" data-position="top">${escapedDesc}</span></span>`;
          }
          return `<span class="sheet-spell-tag">${name}</span>`;
        })
        .join('');
      return `<div class="sheet-spell-tag-list">${tags}</div>`;
    };

    let spellsContent = '';

    // Cantrips
    if (cantrips.length > 0) {
      spellsContent += `
        <div class="sheet-subsection">
          <div class="sheet-subsection-title">CANTRIPS (At-Will)</div>
          ${renderSpellTags(cantrips)}
        </div>
      `;
    }

    // Spell Slots Summary (show all levels with slots)
    const slotLevels = Object.keys(spellSlots)
      .map(k => parseInt(k))
      .filter(k => !isNaN(k) && spellSlots[k] > 0)
      .sort((a, b) => a - b);
    
    if (slotLevels.length > 0) {
      const slotBoxes = slotLevels.map(level => {
        const ordinal = level === 1 ? '1st' : level === 2 ? '2nd' : level === 3 ? '3rd' : `${level}th`;
        return `<div class="spell-slot-box"><div class="spell-slot-label">${ordinal}</div><div class="spell-slot-value">${spellSlots[level]}</div></div>`;
      }).join('');
      
      spellsContent += `
        <div class="sheet-subsection">
          <div class="sheet-subsection-title">SPELL SLOTS BY LEVEL</div>
          <div class="spell-slots-grid">${slotBoxes}</div>
        </div>
      `;
    }

    // Known/Prepared Spells
    if (spellsKnown.length > 0 || spellsPrepared.length > 0) {
      const spellList = spellsKnown.length > 0 ? spellsKnown : spellsPrepared;
      const preparedText = spellsPrepared.length > 0 && spellsKnown.length === 0 ? ' (Prepared)' : '';
      
      spellsContent += `
        <div class="sheet-subsection">
          <div class="sheet-subsection-title">SPELLS KNOWN${preparedText}</div>
          ${renderSpellTags(spellList)}
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

    // Edit link for manager context - opens dedicated spell edit modal
    const editLink = context === 'manager' && onEdit && characterId
      ? `<a href="#" class="sheet-section-edit-link sheet-header-edit-link" onclick="event.stopPropagation(); openSpellEditModal('${characterId}'); return false;">✎ Edit</a>`
      : '';

    return `
      <div class="sheet-section sheet-section--collapsible" id="spells-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ SPELLS ]</div>
          ${editLink}
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          ${spellsContent}
        </div>
      </div>
    `;
  },

  _renderRacialTraits(parsed) {
    // Check if descriptions should be shown inline
    const showDescriptions = this.shouldShowDescriptions();

    // Build trait items with descriptions from RacialTraitsData (inline or tooltip based on setting)
    const traitItems = parsed.racialTraits.map(traitName => {
      // Look up description from RacialTraitsData if available
      const traitData = window.RacialTraitsData?.getTrait(traitName);
      const descText = traitData?.description || '';
      
      // When descriptions are hidden, add tooltip attribute
      const tooltipAttr = (!showDescriptions && descText)
        ? ` data-tooltip="${this.escapeHtml(descText)}" class="skill-prof-item has-tooltip"`
        : ' class="skill-prof-item"';
      
      const description = (showDescriptions && descText)
        ? `<span class="skill-prof-desc">${this.escapeHtml(descText)}</span>`
        : '';
      
      return `
        <li${tooltipAttr}>
          <div class="skill-prof-header">
            <span class="skill-prof-name">${this.escapeHtml(traitName)}</span>
          </div>
          ${description}
        </li>
      `;
    }).join('');

    return `
      <div class="sheet-section sheet-section--collapsible" id="racial-traits-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ RACIAL TRAITS ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <ul class="skill-prof-list">
            ${traitItems}
          </ul>
        </div>
      </div>
    `;
  },

  _renderEquipment(parsed) {
    const equipmentMarkup = `<ul class="sheet-list text-dim">${parsed.equipment
      .map(
        (item) =>
          `<li>${this.escapeHtml(item)}</li>`,
      )
      .join('')}</ul>`;

    // Currency display - only show coins with non-zero values
    const { cp, sp, ep, gp, pp } = parsed.currency || {};
    const coinParts = [];
    if (pp > 0) coinParts.push(`${pp} PP`);
    if (gp > 0) coinParts.push(`${gp} GP`);
    if (ep > 0) coinParts.push(`${ep} EP`);
    if (sp > 0) coinParts.push(`${sp} SP`);
    if (cp > 0) coinParts.push(`${cp} CP`);
    
    const hasCurrency = coinParts.length > 0;
    const currencyMarkup = hasCurrency 
      ? `<div class="sheet-currency"><span class="currency-label">Coins:</span> <span class="currency-value">${coinParts.join(' · ')}</span></div>`
      : '';

    return `
      <div class="sheet-section sheet-section--collapsible" id="equipment-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ ${parsed.hasClassEquipment ? 'EQUIPMENT' : 'CLASS EQUIPMENT'} ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          ${equipmentMarkup}
          ${currencyMarkup}
        </div>
      </div>
    `;
  },

  _renderToolProficiencies(parsed) {
    // Check if descriptions should be shown inline
    const showDescriptions = this.shouldShowDescriptions();

    // Render tool items with descriptions (inline or tooltip based on setting)
    const renderToolItem = (tool) => {
      // Normalize tool name for lookup (lowercase, spaces to hyphens)
      const normalizedTool = tool.toLowerCase().replace(/\s+/g, '-').replace(/[']/g, "'");
      const toolDef = this._toolDefinitions[normalizedTool] || {};
      const name = this.formatSkillName(tool);
      const description = toolDef.description || '';
      
      // When descriptions are hidden, add tooltip attribute
      const tooltipAttr = (!showDescriptions && description)
        ? ` data-tooltip="${this.escapeHtml(description)}" class="tool-prof-item has-tooltip"`
        : ' class="tool-prof-item"';
      
      return `
        <li${tooltipAttr}>
          <div class="tool-prof-header">
            <span class="tool-prof-name">${this.escapeHtml(name)}</span>
          </div>
          ${showDescriptions && description ? `<span class="tool-prof-desc">${this.escapeHtml(description)}</span>` : ''}
        </li>
      `;
    };

    const toolsHtml = parsed.toolProficiencies
      .map(tool => renderToolItem(tool))
      .join('');

    return `
      <div class="sheet-section sheet-section--collapsible" id="tool-proficiencies-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ TOOL PROFICIENCIES ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <ul class="tool-prof-list">
            ${toolsHtml}
          </ul>
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
      <div class="sheet-section sheet-section--collapsible" id="languages-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ LANGUAGES ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          ${
            hasLanguages
              ? `<ul class="sheet-list text-dim">${parsed.languages
                  .map(
                    (lang) =>
                      `<li>${this.escapeHtml(lang)}</li>`,
                  )
                  .join('')}</ul>`
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
      <div class="sheet-section sheet-section--collapsible" id="background-feature-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ BACKGROUND FEATURE ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
          <div class="stat-line"><span class="stat-label">${name}</span></div>
          <div class="text-dim mt-sm">${description}</div>
        </div>
      </div>
    `;
  },

  _renderBackstory(parsed) {
    const backstory = this.escapeHtml(parsed.backstory || '');

    return `
      <div class="sheet-section sheet-section--collapsible" id="backstory-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ BACKSTORY ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content text-dim">
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
      <div class="sheet-section sheet-section--collapsible" id="export-info-section">
        <button class="sheet-header sheet-header--collapsible" onclick="CharacterSheet.toggleCollapsible(this)" aria-expanded="true">
          <div class="sheet-header-title">[ EXPORT INFO ]</div>
          <span class="sheet-header-toggle">^</span>
        </button>
        <div class="sheet-collapsible-content">
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
    const hpMax = typeof hp === 'number' ? hp : (hp.max ?? 0);
    const hpCurrent = typeof hp === 'number' ? hp : (hp.current ?? hpMax);

    // Handle abilities (old 'abilityScores' and new 'abilities' format)
    const abilities = character.abilities || character.abilityScores || {};
    
    // Calculate ability modifiers if not present but we have ability scores
    let abilityModifiers = character.abilityModifiers || {};
    if (Object.keys(abilityModifiers).length === 0 && Object.keys(abilities).length > 0) {
      abilityModifiers = {};
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        const score = abilities[ability] || 10;
        abilityModifiers[ability] = Math.floor((score - 10) / 2);
      });
    }
    
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
    const rawEquipment =
      explicitEquipment && explicitEquipment.length > 0
        ? explicitEquipment
        : [...new Set([...(character.equipment || []), ...classEquipment])];
    
    // Extract gold from equipment (e.g., "10 gp", "15 gp") and add to currency
    let equipmentGold = 0;
    const goldPattern = /^(\d+)\s*gp$/i;
    const allEquipment = rawEquipment.filter(item => {
      const match = item.match(goldPattern);
      if (match) {
        equipmentGold += parseInt(match[1], 10);
        return false; // Remove from equipment list
      }
      return true;
    });

    // Handle racial traits
    // Look up race by id or name (case-insensitive) since character.race may be display name
    const raceKey = (character.race || '').toLowerCase();
    const race = window.DND_DATA?.races?.find(
      (r) => r.id === raceKey || r.name.toLowerCase() === raceKey
    );
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

    // Calculate saving throw modifiers if not present but we have the data
    const proficiencyBonus = character.proficiencyBonus || 2;
    const savingThrowProficiencies = character.savingThrows || [];
    let savingThrowModifiers = character.savingThrowModifiers || null;
    
    // If modifiers aren't stored but we have ability modifiers, calculate them
    if (!savingThrowModifiers && Object.keys(abilityModifiers).length > 0) {
      savingThrowModifiers = {};
      ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
        const isProficient = savingThrowProficiencies.includes(ability);
        const mod = abilityModifiers[ability] || 0;
        savingThrowModifiers[ability] = mod + (isProficient ? proficiencyBonus : 0);
      });
    }

    return {
      // Basic info
      raceName,
      className,
      backgroundName,
      alignment: character.alignment || null,
      sex: character.sex || null,
      level: character.level || 1,
      experiencePoints: character.experiencePoints || 0,

      // Combat stats
      hpMax,
      hpCurrent,
      armorClass: character.armorClass || 10,
      initiative: character.initiative || 0,
      speed: character.speed || 30,
      proficiencyBonus: character.proficiencyBonus || 2,
      hitDie,
      hitDiceMax: character.hitDiceMax || character.level || 1,
      hitDiceCurrent: character.hitDiceCurrent ?? character.hitDiceMax ?? character.level ?? 1,

      // Abilities
      abilities,
      abilityModifiers,
      abilitiesSet: abilitiesPopulated,

      // Saving throws
      savingThrows: savingThrowProficiencies,
      savingThrowModifiers,

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

      // Currency (support both formats: currency.gp or gold, plus equipment gold)
      currency: {
        cp: character.currency?.cp ?? character.copper ?? 0,
        sp: character.currency?.sp ?? character.silver ?? 0,
        ep: character.currency?.ep ?? character.electrum ?? 0,
        gp: (character.currency?.gp ?? character.gold ?? 0) + equipmentGold,
        pp: character.currency?.pp ?? character.platinum ?? 0,
      },

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

      // Class Resources (Ki, Rage, etc.)
      classResources: character.classResources || {},

      // Death Saves
      // deathSaveSuccesses: character.death_save_successes ?? character.deathSaveSuccesses ?? 0,
      // deathSaveFailures: character.death_save_failures ?? character.deathSaveFailures ?? 0,
      deathSaveSuccesses: 0, // Temporarily disabled
      deathSaveFailures: 0, // Temporarily disabled

      // Status Conditions (poisoned, exhausted, diseased, cursed)
      conditions: character.conditions || [],

      // Flags for conditional rendering
      // In builder, always show sections (except spells until we know they're a caster)
      hasRace: !!raceName,
      hasClass: !!className,
      hasAbilities: isBuilder || Object.keys(abilities).length > 0,
      hasCombatStats: isBuilder || hpMax > 0 || character.armorClass,
      hasSavingThrows: isBuilder || (
        savingThrowModifiers &&
        Object.keys(savingThrowModifiers).length > 0
      ),
      hasSkills: isBuilder || (
        Object.keys(skillModifiers).length > 0 ||
        skillProficiencies.length > 0
      ),
      hasSpells:
        (character.cantrips && character.cantrips.length > 0) ||
        (character.spellsKnown && character.spellsKnown.length > 0) ||
        (character.spellsPrepared && character.spellsPrepared.length > 0),
      hasClassResources: 
        character.classResources && Object.keys(character.classResources).length > 0,
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

    // Guard: ignore legacy pre-generated "original art" URLs that were written
    // into character data. We only want user-generated portrait images to
    // display as original art.
    const isPregenUrl = (url) => {
      if (!url) return false;
      const u = String(url);
      return (
        u.includes('r2.dev/defaults/') ||
        u.includes('r2.dev/portraits/pregen/') ||
        u.includes('generated_portraits/images/')
      );
    };

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
    if (character.originalPortraitUrl && !isPregenUrl(character.originalPortraitUrl)) {
      source = 'originalPortraitUrl';
      result = character.originalPortraitUrl;
      logPortraitDebug('getOriginalPortraitUrl', charId, charName, {
        source,
        url: result
      });
      return result;
    }

    // 2) Exported portrait object from builder
    if (character.portrait && character.portrait.url && !isPregenUrl(character.portrait.url)) {
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
    // Remove placeholder/loading classes since we now have real content
    portraitEl.classList.remove('ascii-portrait--placeholder', 'ascii-portrait--loading');
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
   * @param {Object} extra - { source, prompt, style, model, quality, characterDescription }
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
      characterDescription: extra.characterDescription || null,
      style: extra.style || null,
      model: extra.model || null,
      quality: extra.quality || null,
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

