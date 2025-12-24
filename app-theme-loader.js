/**
 * DandDy Theme Loader
 * Reads theme configuration from localStorage and applies themes to app sections.
 * Include this script in both character-manager and character-builder.
 */
(function(global) {
  'use strict';

  const THEME_CONFIG_KEY = 'danddy_theme_config';
  
  // Default theme configuration
  const DEFAULT_CONFIG = {
    global: 'yellow',
    syncAll: true,
    sections: {
      narrator: null,
      sheet: null,
      grid: null,
      campaign: null,
      glow: null,
    },
  };

  // All available themes
  const VALID_THEMES = ['green', 'teal', 'yellow', 'orange', 'red', 'pink', 'violet', 'blue', 'white'];

  /**
   * Get the current theme configuration from localStorage
   */
  function getThemeConfig() {
    try {
      const stored = localStorage.getItem(THEME_CONFIG_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...DEFAULT_CONFIG, ...parsed };
      }
    } catch (e) {
      console.warn('[ThemeLoader] Error reading theme config:', e);
    }
    return { ...DEFAULT_CONFIG };
  }

  /**
   * Remove all theme classes from an element
   */
  function clearThemeClasses(el) {
    if (!el) return;
    VALID_THEMES.forEach(theme => {
      el.classList.remove(`theme-${theme}`, `ui-theme-${theme}`);
    });
  }

  /**
   * Apply a theme to an element
   * @param {Element} el - The element to theme
   * @param {string} themeName - Theme name (green, teal, yellow, etc.)
   */
  function applyTheme(el, themeName) {
    if (!el || !themeName || !VALID_THEMES.includes(themeName)) return;
    clearThemeClasses(el);
    el.classList.add(`theme-${themeName}`, `ui-theme-${themeName}`);
  }

  /**
   * Get the effective theme for a section
   * @param {object} config - Theme configuration
   * @param {string} section - Section name (narrator, sheet, grid, campaign, glow)
   * @returns {string} Theme name
   */
  function getEffectiveTheme(config, section) {
    if (!config) config = getThemeConfig();
    if (config.syncAll) {
      return config.global;
    }
    return config.sections?.[section] || config.global;
  }

  /**
   * Apply theme to a specific section by name
   * Call this when dynamically creating panels
   * @param {Element} el - The element to theme
   * @param {string} section - Section name (narrator, sheet, grid, campaign, glow)
   */
  function applyThemeToSection(el, section) {
    if (!el || !section) return;
    const config = getThemeConfig();
    const theme = getEffectiveTheme(config, section);
    applyTheme(el, theme);
  }

  /**
   * Apply themes to all app sections
   */
  function applyAllThemes() {
    const config = getThemeConfig();
    
    // Determine effective themes
    const globalTheme = config.global || 'yellow';
    const glowTheme = getEffectiveTheme(config, 'glow');
    const narratorTheme = getEffectiveTheme(config, 'narrator');
    const sheetTheme = getEffectiveTheme(config, 'sheet');
    const gridTheme = getEffectiveTheme(config, 'grid');
    const campaignTheme = getEffectiveTheme(config, 'campaign');

    // Apply to <html> element (affects global styles and background glow)
    const htmlEl = document.documentElement;
    applyTheme(htmlEl, glowTheme);

    // Character Manager elements
    const gridPanel = document.querySelector('.panel-character-grid, #characterGridPanel');
    const sheetPanel = document.querySelector('.panel-character-sheet, #characterSheetPanel');
    const characterSheet = document.querySelector('#characterSheet');
    const sheetContent = document.querySelector('.sheet__content');
    const campaignSidebar = document.querySelector('.sheet__sidebar');
    const campaignSlot = document.querySelector('.campaign-panel-slot');
    const mobileSheetContainer = document.querySelector('.grid__mobile-sheet');

    // Character Builder elements
    const narratorPanel = document.querySelector('.app-panel--narrator, #narrator-panel');
    const builderPanel = document.querySelector('.app-panel--builder, #character-panel');

    // Apply grid theme
    if (gridPanel) {
      applyTheme(gridPanel, gridTheme);
    }

    // Apply sheet theme
    if (sheetPanel) {
      applyTheme(sheetPanel, sheetTheme);
    }
    if (characterSheet) {
      applyTheme(characterSheet, sheetTheme);
    }
    if (sheetContent) {
      applyTheme(sheetContent, sheetTheme);
    }
    if (mobileSheetContainer) {
      applyTheme(mobileSheetContainer, sheetTheme);
    }

    // Apply campaign theme
    if (campaignSidebar) {
      applyTheme(campaignSidebar, campaignTheme);
    }
    if (campaignSlot) {
      applyTheme(campaignSlot, campaignTheme);
    }

    // Apply narrator theme (character builder)
    if (narratorPanel) {
      applyTheme(narratorPanel, narratorTheme);
    }

    // Apply sheet theme to builder panel
    if (builderPanel) {
      applyTheme(builderPanel, sheetTheme);
    }

    // Dispatch event so app components can react
    window.dispatchEvent(new CustomEvent('danddy:themesApplied', {
      detail: {
        global: globalTheme,
        glow: glowTheme,
        narrator: narratorTheme,
        sheet: sheetTheme,
        grid: gridTheme,
        campaign: campaignTheme,
      }
    }));

    console.log('[ThemeLoader] Applied themes:', {
      global: globalTheme,
      glow: glowTheme,
      narrator: narratorTheme,
      sheet: sheetTheme,
      grid: gridTheme,
      campaign: campaignTheme,
    });
  }

  /**
   * Initialize the theme loader
   */
  function init() {
    // Apply themes on load
    applyAllThemes();

    // Listen for theme changes from admin panel
    window.addEventListener('danddy:themeConfigChanged', (e) => {
      console.log('[ThemeLoader] Theme config changed:', e.detail);
      applyAllThemes();
    });

    // Also listen for storage changes (for cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_CONFIG_KEY) {
        console.log('[ThemeLoader] Theme config changed in another tab');
        applyAllThemes();
      }
    });

    // Re-apply themes periodically to catch dynamically added elements
    // This is a simple approach; apps can also call applyAllThemes() directly
    setTimeout(applyAllThemes, 1000);
    setTimeout(applyAllThemes, 3000);
  }

  // Export for manual re-application
  global.DanddyThemeLoader = {
    applyAllThemes,
    applyTheme,
    applyThemeToSection,
    getThemeConfig,
    getEffectiveTheme,
    VALID_THEMES,
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

