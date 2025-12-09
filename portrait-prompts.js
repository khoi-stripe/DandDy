// Shared helpers for building AI portrait prompt style instructions.
// Exposes PortraitPrompt on window so both builder and manager can use
// the same base text for image generation.

(function (global) {
  /**
   * Centralized portrait prompt helper.
   *
   * Concepts:
   * - "Base" instructions: shared structure that always keeps
   *   characterDescription, posePrompt, and cameraPrompt.
   * - "Theme": a named style preset that controls the experimental
   *   description block (ink style, rendering notes, background, etc).
   *
   * This lets you test different prompt wordings by adding/editing
   * theme definitions below, then switching themes from the Settings UI.
   */

  const DEFAULT_THEME_ID = 'cinematic-inks';
  const ADMIN_STORAGE_KEY = 'dnd_portrait_prompt_entries_v1';

  // In-memory cache of admin-configured variables (race/class/scene/style).
  let adminCache = null;
  // Track if we've already tried to sync from API this session
  let apiSyncAttempted = false;

  function normalize(str) {
    return (str || '').toString().trim();
  }

  // ========================================
  // API SYNC (for authenticated users)
  // ========================================
  
  function getApiBase() {
    return (global.DanddyConfig && global.DanddyConfig.API_BASE_URL) || 'http://localhost:8000/api';
  }

  function getAuthToken() {
    return global.AuthService && global.AuthService.getToken ? global.AuthService.getToken() : null;
  }

  function isAuthenticated() {
    return global.AuthService && global.AuthService.isAuthenticated ? global.AuthService.isAuthenticated() : false;
  }

  /**
   * Parse an array of entry objects (from API or localStorage) into
   * the structured adminCache format.
   */
  function parseEntriesToCache(entries) {
    const races = {};
    const classes = {};
    const scenes = {};
    const poses = {};
    const cameras = {};
    const styles = {};

    (entries || []).forEach((entry) => {
      if (!entry || !entry.kind || !entry.key) return;
      const kind = normalize(entry.kind).toLowerCase();
      const key = normalize(entry.key).toLowerCase();
      if (!key) return;

      if (kind === 'race') {
        const desc = normalize(entry.description);
        if (desc) {
          if (!Array.isArray(races[key])) races[key] = [];
          races[key].push(desc);
        }
      } else if (kind === 'class') {
        const desc = normalize(entry.description);
        if (desc) {
          if (!Array.isArray(classes[key])) classes[key] = [];
          classes[key].push(desc);
        }
      } else if (kind === 'scene' || kind === 'background') {
        const desc = normalize(entry.description);
        if (desc) {
          if (!Array.isArray(scenes[key])) scenes[key] = [];
          scenes[key].push(desc);
        }
      } else if (kind === 'pose') {
        const desc = normalize(entry.description);
        if (desc) {
          if (!Array.isArray(poses[key])) poses[key] = [];
          poses[key].push(desc);
        }
      } else if (kind === 'camera') {
        const desc = normalize(entry.description);
        if (desc) {
          if (!Array.isArray(cameras[key])) cameras[key] = [];
          cameras[key].push(desc);
        }
      } else if (kind === 'style') {
        // Handle both API format (style_description) and local format (styleDescription)
        const styleDesc = normalize(entry.style_description || entry.styleDescription || entry.description);
        const sceneDesc = normalize(entry.background_description || entry.backgroundDescription);
        if (!styles[key]) {
          styles[key] = {};
        }
        if (styleDesc) styles[key].styleDescription = styleDesc;
        if (sceneDesc) styles[key].sceneDescription = sceneDesc;
      }
    });

    return { races, classes, scenes, styles, poses, cameras };
  }

  /**
   * Fetch prompt entries directly from the API (for authenticated users).
   * Stores result in memory cache - no localStorage needed.
   * Returns a promise that resolves when sync is complete.
   */
  async function syncFromAPI() {
    if (apiSyncAttempted) return; // Only try once per session

    // Don't mark as attempted until we know the user is actually authenticated
    // Otherwise we'd skip the sync entirely if auth isn't ready yet
    if (!isAuthenticated()) return;
    
    apiSyncAttempted = true;

    const token = getAuthToken();
    if (!token) return;

    try {
      const response = await fetch(`${getApiBase()}/prompt-entries`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        console.warn('PortraitPrompt: API fetch failed with status', response.status);
        return;
      }

      const apiEntries = await response.json();
      if (!Array.isArray(apiEntries)) {
        console.warn('PortraitPrompt: API returned non-array');
        return;
      }

      // Parse API entries directly into memory cache (skip localStorage)
      adminCache = parseEntriesToCache(apiEntries);
      
      console.log('PortraitPrompt: Loaded', apiEntries.length, 'entries from API (cloud)');
    } catch (e) {
      console.warn('PortraitPrompt: API fetch error', e);
    }
  }

  function loadAdminCache() {
    // If we already have a cache (from API or previous load), use it
    if (adminCache) return adminCache;

    const empty = {
      races: {},
      classes: {},
      scenes: {},
      styles: {},
      poses: {},
      cameras: {},
    };

    // For non-authenticated users, fall back to localStorage
    try {
      const raw = global.localStorage
        ? global.localStorage.getItem(ADMIN_STORAGE_KEY)
        : null;
      if (!raw) {
        adminCache = empty;
        return adminCache;
      }
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        adminCache = empty;
        return adminCache;
      }
      
      // Parse localStorage entries into cache
      adminCache = parseEntriesToCache(parsed);
      return adminCache;
    } catch (e) {
      adminCache = empty;
      return adminCache;
    }
  }

  function getVariableSnippet(kind, key) {
    const cache = loadAdminCache();
    const k = normalize(key).toLowerCase();
    if (!k) return null;

    if (kind === 'race') {
      const variants = cache.races[k];
      if (Array.isArray(variants) && variants.length) {
        const idx = Math.floor(Math.random() * variants.length);
        return variants[idx];
      }
      return null;
    }
    if (kind === 'class') {
      const variants = cache.classes[k];
      if (Array.isArray(variants) && variants.length) {
        const idx = Math.floor(Math.random() * variants.length);
        return variants[idx];
      }
      return null;
    }
    if (kind === 'scene') {
      const variants = cache.scenes[k];
      if (Array.isArray(variants) && variants.length) {
        const idx = Math.floor(Math.random() * variants.length);
        return variants[idx];
      }
      return null;
    }
    if (kind === 'pose') {
      const variants = cache.poses[k];
      if (Array.isArray(variants) && variants.length) {
        const idx = Math.floor(Math.random() * variants.length);
        return variants[idx];
      }
      return null;
    }
    if (kind === 'camera') {
      const variants = cache.cameras[k];
      if (Array.isArray(variants) && variants.length) {
        const idx = Math.floor(Math.random() * variants.length);
        return variants[idx];
      }
      return null;
    }
    return null;
  }

  /**
   * Get all pose variants for a given class key.
   * Returns an array of pose descriptions, or null if none configured.
   * @param {string} classKey
   * @returns {string[]|null}
   */
  function getPoseVariants(classKey) {
    const cache = loadAdminCache();
    const k = normalize(classKey).toLowerCase();
    if (!k) return null;
    const variants = cache.poses[k];
    if (Array.isArray(variants) && variants.length) {
      return variants;
    }
    return null;
  }

  /**
   * Get all camera variants for a given class key.
   * Returns an array of camera descriptions, or null if none configured.
   * @param {string} classKey
   * @returns {string[]|null}
   */
  function getCameraVariants(classKey) {
    const cache = loadAdminCache();
    const k = normalize(classKey).toLowerCase();
    if (!k) return null;
    const variants = cache.cameras[k];
    if (Array.isArray(variants) && variants.length) {
      return variants;
    }
    return null;
  }

  function getStyleOverrides(themeId) {
    const cache = loadAdminCache();
    const k = normalize(themeId);
    if (!k) return null;
    const entry = cache.styles[k];
    if (!entry) return null;
    return {
      styleDescription: entry.styleDescription || '',
      sceneDescription: entry.sceneDescription || '',
    };
  }

  /**
   * Theme registry.
   *
   * Each theme defines:
   * - id: stable key used in localStorage / settings
   * - label: user-facing name
   * - description: short explanation (shown in settings)
   * - buildStyleLines(options): returns an array of style instructions
   *   that will be inserted between the characterDescription line and
   *   the pose/camera lines.
   *
   * NOTE: This is the main place to freely experiment with wording.
   */
  const THEMES = {
    'cinematic-inks': {
      id: 'cinematic-inks',
      label: 'Cinematic Inks (default)',
      description:
        'More cinematic lighting and framing while staying in black-and-white ink.',
      buildStyleLines(options) {
        const lines = [];
        lines.push(
          'Render in dramatic black-and-white ink with deep shadows and sharp rim lighting.',
        );
        lines.push(
          'Treat the illustration like a film still: strong focal point, clear subject separation, and layered depth.',
        );
        lines.push(
          'Use a limited range of mid-tone hatching to suggest volume without muddying the forms.',
        );
        lines.push(
          'Keep the background abstract and mostly dark so the character silhouette and face read instantly.',
        );
        lines.push(
          'Overall mood: cinematic fantasy portrait, serious and iconic, suitable for a character sheet.',
        );
        lines.push('Aspect ratio 3:4.');
        return lines;
      },
    },
    'classic-high-fantasy': {
      id: 'classic-high-fantasy',
      label: 'Classic High-Fantasy',
      description:
        'Vibrant, colorful fantasy art inspired by classic book covers and RPG illustrations.',
      buildStyleLines(options) {
        const lines = [];
        lines.push(
          'Render in rich, vibrant colors with a painterly quality reminiscent of classic fantasy book covers.',
        );
        lines.push(
          'Use warm, golden lighting with dramatic highlights and deep, saturated shadows.',
        );
        lines.push(
          'Create an epic, heroic atmosphere with attention to fine details in armor, weapons, and magical effects.',
        );
        lines.push(
          'Background should suggest a fantastical setting - ancient ruins, mystical forests, or dramatic skies.',
        );
        lines.push(
          'Overall mood: classic high-fantasy illustration, grand and adventurous, like a Dungeons & Dragons cover.',
        );
        lines.push('Aspect ratio 3:4.');
        return lines;
      },
    },
  };

  /**
   * Resolve a theme by id, falling back to the default.
   */
  function getThemeById(themeId) {
    if (themeId && THEMES[themeId]) {
      return THEMES[themeId];
    }
    return THEMES[DEFAULT_THEME_ID];
  }

  /**
   * Build the base list of style instructions for a portrait prompt.
   *
   * Historically this returned a flat list of sentences that included both
   * style and background notes plus pose/camera. Newer callers that want a
   * structured template should prefer `buildStyleAndBackgroundDescriptions`.
   */
  function buildBasePortraitInstructions(options) {
    const {
      characterDescription,
      posePrompt,
      cameraPrompt,
      themeId,
    } = options || {};

    const parts = [];

    // Legacy subject line for compatibility with older callers.
    if (characterDescription) {
      parts.push(
        `Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,
      );
    } else {
      parts.push('Create a high-contrast black-and-white fantasy illustration.');
    }

    // Theme-specific experimental block
    const theme = getThemeById(themeId);
    if (theme && typeof theme.buildStyleLines === 'function') {
      try {
        const styleLines = theme.buildStyleLines({
          characterDescription,
          posePrompt,
          cameraPrompt,
        });
        if (Array.isArray(styleLines)) {
          styleLines.forEach((line) => {
            if (line && typeof line === 'string') {
              parts.push(line);
            }
          });
        }
      } catch (e) {
        // Non-fatal: if a custom theme throws, fall back to classic ink block.
        const fallback = THEMES[DEFAULT_THEME_ID];
        if (fallback && typeof fallback.buildStyleLines === 'function') {
          const fallbackLines = fallback.buildStyleLines({
            characterDescription,
            posePrompt,
            cameraPrompt,
          });
          if (Array.isArray(fallbackLines)) {
            fallbackLines.forEach((line) => {
              if (line && typeof line === 'string') {
                parts.push(line);
              }
            });
          }
        }
      }
    }

    // Pose and camera instructions (always preserved)
    if (posePrompt) {
      parts.push(`Pose: ${posePrompt}`);
    }

    // Camera temporarily disabled - may interfere with pose
    // if (cameraPrompt) {
    //   parts.push(cameraPrompt);
    // }

    return parts;
  }

  /**
   * Build compact style + background descriptions for use in higher-level
   * prompt templates.
   *
   * Returns:
   *   { styleDescription: string, backgroundDescription: string | null }
   */
  function buildStyleAndBackgroundDescriptions(options) {
    const { themeId } = options || {};

    // 1) Prefer explicit overrides from the admin UI when available.
    const overrides = getStyleOverrides(themeId);
    let styleDescription = '';
    let backgroundDescription = null;
    if (overrides && overrides.styleDescription) {
      styleDescription = overrides.styleDescription;
    }
    // Use sceneDescription from style overrides if present.
    if (overrides && overrides.sceneDescription) {
      backgroundDescription = overrides.sceneDescription;
    }

    // 2) If no admin-provided scene description, try a randomized scene snippet.
    // First try theme-specific key, then fall back to "default" key.
    if (backgroundDescription == null) {
      let sceneSnippet = getVariableSnippet('scene', themeId);
      if (!sceneSnippet) {
        sceneSnippet = getVariableSnippet('scene', 'default');
      }
      if (sceneSnippet) {
        backgroundDescription = sceneSnippet;
      }
    }

    // 3) Fall back to theme-defined style lines only when no admin entries exist.
    if (!styleDescription || backgroundDescription == null) {
      const theme = getThemeById(themeId);

      let styleLines = [];
      if (theme && typeof theme.buildStyleLines === 'function') {
        try {
          const lines = theme.buildStyleLines(options || {});
          if (Array.isArray(lines)) {
            styleLines = lines.filter(
              (l) => typeof l === 'string' && l.trim(),
            );
          }
        } catch (e) {
          // Non-fatal: fall back to default theme
          const fallback = THEMES[DEFAULT_THEME_ID];
          if (fallback && typeof fallback.buildStyleLines === 'function') {
            const lines = fallback.buildStyleLines(options || {});
            if (Array.isArray(lines)) {
              styleLines = lines.filter(
                (l) => typeof l === 'string' && l.trim(),
              );
            }
          }
        }
      }

      const backgroundLines = [];
      const otherLines = [];

      styleLines.forEach((line) => {
        if (/background/i.test(line)) {
          backgroundLines.push(line);
        } else {
          otherLines.push(line);
        }
      });

      if (!styleDescription) {
        styleDescription = otherLines.join(' ');
      }
      if (backgroundDescription == null) {
        backgroundDescription = backgroundLines.length
          ? backgroundLines.join(' ')
          : null;
      }
    }

    return {
      styleDescription,
      backgroundDescription,
    };
  }

  /**
   * Build a compact list of rendering instructions for custom-portrait flows.
   *
   * This is the shared helper used by both the Character Builder and Manager
   * when the player supplies their own text prompt. It keeps:
   *
   * - Pose: {posePrompt}
   * - {cameraPrompt}
   * - STYLE: {styleDescription}
   * - Scene: {backgroundDescription}
   *
   * and pulls style/background text from:
   * - Admin-defined styles in the prompt style editor (per theme)
   * - Theme defaults in this file
   *
   * Callers are responsible for resolving the active theme id (via
   * StorageService.getPortraitPromptTheme / CONFIG, etc.) and passing it in.
   *
   * @param {{ posePrompt?: string, cameraPrompt?: string, themeId?: string }} options
   * @returns {string[]} array of instruction lines
   */
  function buildCustomPortraitInstructions(options) {
    const opts = options || {};
    const posePrompt = opts.posePrompt || '';
    const cameraPrompt = opts.cameraPrompt || '';
    const themeId = opts.themeId;

    let styleDescription = '';
    let backgroundDescription = '';

    try {
      const sections =
        buildStyleAndBackgroundDescriptions({
          posePrompt,
          cameraPrompt,
          themeId,
        }) || {};
      styleDescription = sections.styleDescription || '';
      backgroundDescription = sections.backgroundDescription || '';
    } catch (e) {
      // Non-fatal – fall through to simple defaults below.
    }

    if (!styleDescription) {
      styleDescription =
        'High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';
    }
    if (!backgroundDescription) {
      backgroundDescription =
        'Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';
    }

    const lines = [];
    if (posePrompt) {
      lines.push(`Pose: ${posePrompt}`);
    }
    // Camera temporarily disabled - may interfere with pose
    // if (cameraPrompt) {
    //   lines.push(cameraPrompt);
    // }
    if (styleDescription) {
      lines.push(`STYLE: ${styleDescription}`);
    }
    if (backgroundDescription) {
      lines.push(`Scene: ${backgroundDescription}`);
    }

    return lines;
  }

  /**
   * Public API
   */
  const PortraitPrompt = (global.PortraitPrompt = global.PortraitPrompt || {});

  PortraitPrompt.buildBasePortraitInstructions = buildBasePortraitInstructions;
  PortraitPrompt.buildStyleAndBackgroundDescriptions =
    buildStyleAndBackgroundDescriptions;
   // Shared helper for builder + manager custom-portrait flows
  PortraitPrompt.buildCustomPortraitInstructions =
    buildCustomPortraitInstructions;
  PortraitPrompt.getVariableSnippet = getVariableSnippet;
  
  // Pose and camera variant accessors for admin-configured data
  PortraitPrompt.getPoseVariants = getPoseVariants;
  PortraitPrompt.getCameraVariants = getCameraVariants;
  
  // Force reload of admin cache (useful after admin UI changes)
  PortraitPrompt.invalidateCache = function invalidateCache() {
    adminCache = null;
  };

  // Sync entries from API to memory cache (for authenticated users)
  // Call this during app init to ensure cloud data is available for prompt generation
  PortraitPrompt.syncFromAPI = syncFromAPI;

  // Allow resetting the sync flag (useful for testing or re-auth)
  PortraitPrompt.resetAPISync = function resetAPISync() {
    apiSyncAttempted = false;
  };

  PortraitPrompt.getDefaultThemeId = function getDefaultThemeId() {
    return DEFAULT_THEME_ID;
  };

  PortraitPrompt.getThemes = function getThemes() {
    // Built-in themes first
    const baseThemes = Object.keys(THEMES).map((id) => {
      const theme = THEMES[id];
      return {
        id: theme.id,
        label: theme.label,
        description: theme.description,
      };
    });

    // Then any additional style entries defined via the admin UI that do not
    // already correspond to a built-in theme id.
    let customThemes = [];
    try {
      const cache = loadAdminCache();
      const styleKeys = cache && cache.styles ? Object.keys(cache.styles) : [];
      const extraIds = styleKeys.filter((id) => !THEMES[id]);

      customThemes = extraIds.map((id) => {
        const styleEntry = cache.styles[id] || {};
        const rawDesc = styleEntry.styleDescription || '';
        const trimmed =
          rawDesc && rawDesc.length > 120
            ? rawDesc.slice(0, 117) + '...'
            : rawDesc;
        return {
          id,
          label: `Custom: ${id}`,
          description: trimmed || 'Custom portrait style',
        };
      });
    } catch (e) {
      // Non-fatal – if anything goes wrong, just return the base themes.
      customThemes = [];
    }

    return baseThemes.concat(customThemes);
  };

  // ========================================
  // CHARACTER DESCRIPTION DATA
  // ========================================
  // Shared race/class/magic description mappings for portrait prompts.
  // Used by AIService.buildCharacterDescription.

  const RACE_DESCRIPTIONS = {
    human: 'human with average features',
    elf: 'elf with pointed ears and graceful features',
    dwarf: 'dwarf with a thick beard and stocky build',
    halfling: 'halfling, small and cheerful',
    dragonborn: 'dragonborn with scaled skin and dragon-like features',
    gnome: 'gnome, small with clever eyes',
    'half-elf': 'half-elf with slightly pointed ears',
    'half-orc': 'half-orc with tusks and powerful build',
    tiefling: 'tiefling with horns and a tail',
  };

  const CLASS_DESCRIPTIONS = {
    fighter: 'wearing heavy armor and holding a sword',
    wizard: 'in flowing robes holding a staff',
    rogue: 'in dark leather armor with daggers',
    cleric: 'in holy vestments with a sacred symbol',
    ranger: 'with a bow and forest attire',
    paladin: 'in shining armor with a holy shield',
    barbarian: 'with wild hair wielding a massive axe',
    bard: 'with a lute and colorful clothing',
    druid: 'with nature-themed robes and wooden staff',
    monk: 'in simple robes in a martial stance',
    sorcerer: 'with crackling magical energy',
    warlock: 'with dark robes and eldritch symbols',
  };

  const MAGIC_SPECIALIZATIONS = {
    wizard: 'specializing in elemental magic like fire and ice',
    sorcerer: 'channeling raw elemental arcane power',
    warlock: 'wielding shadowy eldritch magic',
    cleric: 'focused on radiant and healing magic',
    druid: 'calling on primal nature and elemental magic',
    bard: 'weaving subtle enchantments and support magic through music',
    paladin: 'enhancing strikes with holy, radiant magic',
  };

  /**
   * Get a description for a race.
   * Falls back to the race name if not found.
   */
  PortraitPrompt.getRaceDescription = function getRaceDescription(race) {
    const key = (race || '').toLowerCase();
    return RACE_DESCRIPTIONS[key] || race || '';
  };

  /**
   * Get a description for a class.
   * Falls back to the class name if not found.
   */
  PortraitPrompt.getClassDescription = function getClassDescription(classType) {
    const key = (classType || '').toLowerCase();
    return CLASS_DESCRIPTIONS[key] || classType || '';
  };

  /**
   * Get a magic specialization description for a class (if applicable).
   * Returns null for non-spellcasting classes.
   */
  PortraitPrompt.getMagicSpecialization = function getMagicSpecialization(classType) {
    const key = (classType || '').toLowerCase();
    return MAGIC_SPECIALIZATIONS[key] || null;
  };

  /**
   * Get all description data objects (for testing/debugging).
   */
  PortraitPrompt.getDescriptionData = function getDescriptionData() {
    return {
      races: RACE_DESCRIPTIONS,
      classes: CLASS_DESCRIPTIONS,
      magic: MAGIC_SPECIALIZATIONS,
    };
  };

  // ========================================
  // AUTO-SYNC ON PAGE LOAD
  // ========================================
  // When the page loads and user is authenticated, sync entries from API
  // to memory cache so they're available for prompt generation.
  function initAutoSync() {
    // Wait a moment for AuthService to initialize
    setTimeout(async () => {
      if (isAuthenticated()) {
        try {
          await syncFromAPI();
        } catch (e) {
          console.warn('PortraitPrompt: Auto-sync failed', e);
        }
      }
    }, 500);
  }

  // Run auto-sync when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initAutoSync);
    } else {
      initAutoSync();
    }
  }
})(window);



