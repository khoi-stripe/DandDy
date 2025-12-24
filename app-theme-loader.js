/**
 * DandDy Theme Loader
 * Reads theme configuration from server (with localStorage fallback) and applies themes to app sections.
 * Include this script in both character-manager and character-builder.
 * 
 * Theme config flow:
 * 1. On init, fetch from server (public endpoint) to get the authoritative config
 * 2. Cache in localStorage for offline use and faster subsequent loads
 * 3. Listen for localStorage changes for cross-tab sync
 * 4. Listen for custom events for same-tab live preview
 */
(function(global) {
  'use strict';

  const THEME_CONFIG_KEY = 'danddy_theme_config';
  
  // Get API base URL from config or use default
  const cfg = global.DanddyConfig || {};
  const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  
  // Default theme configuration
  const DEFAULT_CONFIG = {
    global: 'yellow',
    syncAll: true,
    sections: {
      terminal: null,  // base UI (header, buttons, inputs)
      narrator: null,
      sheet: null,
      grid: null,
      campaign: null,
      modal: null,     // modal dialogs
      glow: null,      // background glow only
    },
  };

  // All available themes
  const VALID_THEMES = ['green', 'teal', 'yellow', 'orange', 'red', 'pink', 'violet', 'blue', 'white'];

  // HSL values for each theme (for glow override)
  const THEME_HSL = {
    green:  { h: 120, s: '100%', l: '50%' },
    teal:   { h: 181, s: '100%', l: '41%' },
    yellow: { h: 48,  s: '100%', l: '64%' },
    orange: { h: 25,  s: '100%', l: '55%' },
    red:    { h: 0,   s: '100%', l: '55%' },
    pink:   { h: 330, s: '85%',  l: '65%' },
    violet: { h: 270, s: '80%',  l: '65%' },
    blue:   { h: 225, s: '100%', l: '60%' },
    white:  { h: 0,   s: '0%',   l: '90%' },
  };

  // Cache for server-fetched config (prevents redundant fetches)
  let serverConfigCache = null;
  let serverFetchPromise = null;

  /**
   * Fetch theme config from server (public endpoint)
   * @returns {Promise<object>} Theme configuration
   */
  async function fetchThemeConfigFromServer() {
    // Return cached promise if fetch is in progress
    if (serverFetchPromise) {
      return serverFetchPromise;
    }
    
    serverFetchPromise = (async () => {
      try {
        const response = await fetch(`${API_BASE}/config/themes`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
        });
        
        if (response.ok) {
          const serverConfig = await response.json();
          
          // Convert server format to local format
          const config = {
            global: serverConfig.globalTheme || 'yellow',
            syncAll: serverConfig.syncAllSections !== false,
            sections: {
              terminal: serverConfig.sections?.terminal === 'global' ? null : serverConfig.sections?.terminal,
              narrator: serverConfig.sections?.narrator === 'global' ? null : serverConfig.sections?.narrator,
              sheet: serverConfig.sections?.sheet === 'global' ? null : serverConfig.sections?.sheet,
              grid: serverConfig.sections?.grid === 'global' ? null : serverConfig.sections?.grid,
              campaign: serverConfig.sections?.campaign === 'global' ? null : serverConfig.sections?.campaign,
              modal: serverConfig.sections?.modal === 'global' ? null : serverConfig.sections?.modal,
              glow: serverConfig.sections?.glow === 'global' ? null : serverConfig.sections?.glow,
            },
          };
          
          // Cache it
          serverConfigCache = config;
          
          // Save to localStorage for offline use
          try {
            localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
          } catch (e) {
            console.warn('[ThemeLoader] Could not save to localStorage:', e);
          }
          
          console.log('[ThemeLoader] Fetched theme config from server:', config);
          return config;
        }
      } catch (e) {
        console.warn('[ThemeLoader] Error fetching from server, using cached/local:', e);
      }
      
      // Fallback to localStorage
      return getThemeConfigFromStorage();
    })();
    
    const result = await serverFetchPromise;
    serverFetchPromise = null;
    return result;
  }

  /**
   * Get the current theme configuration from localStorage (sync)
   */
  function getThemeConfigFromStorage() {
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
   * Get the current theme configuration (uses cache if available)
   */
  function getThemeConfig() {
    // Use cached server config if available
    if (serverConfigCache) {
      return serverConfigCache;
    }
    // Otherwise fall back to localStorage
    return getThemeConfigFromStorage();
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
   * Apply glow theme (background radial gradient only) via CSS variables
   * This is separate from the UI theme to allow different colors
   * 
   * NOTE: We set these on BODY (not html) because:
   * 1. body::before uses these variables for the radial gradient
   * 2. The terminal theme class is also applied to body
   * 3. Inline styles on body override the theme class on body
   * 4. body::before inherits from body, getting the correct glow color
   */
  function applyGlowTheme(themeName) {
    const bodyEl = document.body;
    const hsl = THEME_HSL[themeName];
    if (!hsl || !bodyEl) return;

    // Set glow-specific CSS variables on body (so body::before inherits them correctly)
    bodyEl.style.setProperty('--bg-glow-h', hsl.h);
    bodyEl.style.setProperty('--bg-glow-s', hsl.s);
    bodyEl.style.setProperty('--bg-glow-l', hsl.l);
    bodyEl.style.setProperty('--terminal-glow-color', `hsla(${hsl.h}, ${hsl.s}, ${hsl.l}, 0.28)`);
  }

  /**
   * Apply themes to all app sections
   */
  function applyAllThemes() {
    const config = getThemeConfig();
    
    // Determine effective themes
    const globalTheme = config.global || 'yellow';
    const terminalTheme = getEffectiveTheme(config, 'terminal');
    const glowTheme = getEffectiveTheme(config, 'glow');
    const narratorTheme = getEffectiveTheme(config, 'narrator');
    const sheetTheme = getEffectiveTheme(config, 'sheet');
    const gridTheme = getEffectiveTheme(config, 'grid');
    const campaignTheme = getEffectiveTheme(config, 'campaign');
    const modalTheme = getEffectiveTheme(config, 'modal');

    // Apply terminal theme to <html> element (affects base UI: header, buttons, inputs)
    const htmlEl = document.documentElement;
    applyTheme(htmlEl, terminalTheme);

    // Apply glow theme separately (background radial gradient only)
    applyGlowTheme(glowTheme);

    // Apply terminal theme to body and app-root for base styling
    const body = document.body;
    const appRoot = document.querySelector('.app-root');
    if (body) {
      applyTheme(body, terminalTheme);
    }
    if (appRoot) {
      applyTheme(appRoot, terminalTheme);
    }

    // Terminal header
    const terminalHeader = document.querySelector('.terminal-header');
    if (terminalHeader) {
      applyTheme(terminalHeader, terminalTheme);
    }

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

    // Apply modal theme to all modals
    const modals = document.querySelectorAll('.modal');
    modals.forEach(modal => {
      applyTheme(modal, modalTheme);
    });

    // Dispatch event so app components can react
    window.dispatchEvent(new CustomEvent('danddy:themesApplied', {
      detail: {
        global: globalTheme,
        terminal: terminalTheme,
        glow: glowTheme,
        narrator: narratorTheme,
        sheet: sheetTheme,
        grid: gridTheme,
        campaign: campaignTheme,
        modal: modalTheme,
      }
    }));

    console.log('[ThemeLoader] Applied themes:', {
      global: globalTheme,
      terminal: terminalTheme,
      glow: glowTheme,
      narrator: narratorTheme,
      sheet: sheetTheme,
      grid: gridTheme,
      campaign: campaignTheme,
      modal: modalTheme,
    });
  }

  /**
   * Initialize the theme loader
   */
  async function init() {
    // First, apply themes from localStorage for instant feedback
    applyAllThemes();
    
    // Then fetch from server (in background) to get authoritative config
    try {
      await fetchThemeConfigFromServer();
      // Re-apply with server config
      applyAllThemes();
    } catch (e) {
      console.warn('[ThemeLoader] Server fetch failed, using local config');
    }

    // Listen for theme changes from admin panel (same tab)
    window.addEventListener('danddy:themeConfigChanged', (e) => {
      console.log('[ThemeLoader] Theme config changed:', e.detail);
      // Update cache with the new config
      if (e.detail) {
        serverConfigCache = e.detail;
      }
      applyAllThemes();
    });

    // Also listen for storage changes (for cross-tab sync)
    window.addEventListener('storage', (e) => {
      if (e.key === THEME_CONFIG_KEY) {
        console.log('[ThemeLoader] Theme config changed in another tab');
        // Clear server cache to pick up new localStorage value
        serverConfigCache = null;
        applyAllThemes();
      }
    });

    // Re-apply themes periodically to catch dynamically added elements
    // This is a simple approach; apps can also call applyAllThemes() directly
    setTimeout(applyAllThemes, 1000);
    setTimeout(applyAllThemes, 3000);
  }

  /**
   * Force refresh theme config from server
   * Call this to manually re-fetch from server
   */
  async function refreshFromServer() {
    serverConfigCache = null;
    const config = await fetchThemeConfigFromServer();
    applyAllThemes();
    return config;
  }

  // Export for manual re-application
  global.DanddyThemeLoader = {
    applyAllThemes,
    applyTheme,
    applyThemeToSection,
    applyGlowTheme,
    getThemeConfig,
    getEffectiveTheme,
    fetchThemeConfigFromServer,
    refreshFromServer,
    VALID_THEMES,
    THEME_HSL,
  };

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);

