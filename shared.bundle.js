

// ===== BUNDLE PART: version.js =====

// Global version information for DandDy apps
// Bump this in one place whenever you cut a new release.
window.DANDDY_VERSION = '3.0.2';
window.DANDDY_BACKEND_VERSION = '1.0.0';










// ===== BUNDLE PART: app-config.js =====

// Global configuration and shared utilities for the DandDy app (builder + manager).
// Exposes `window.AppConfig` (env + URLs) for all frontends to consume.

(function (global) {
  const location = global.location || {};

  const isLocalEnvironment =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.startsWith('192.168.') ||
    location.protocol === 'file:';

  // Single source of truth for backend origin & API base URL.
  //
  // NOTE: Campaign features require deploying updated backend to production.
  // The local backend has different auth (JWT secret + database), so for now
  // we always use production. Deploy backend changes before testing campaigns.
  const BACKEND_ORIGIN = 'https://danddy-api.onrender.com';

  // Many callers use either "<origin>/api" or "<origin>/api/..." directly.
  const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

  // Shared storage keys and flags
  const TOKEN_STORAGE_KEY = 'dnd_auth_token';
  const USER_STORAGE_KEY = 'dnd_user_info';
  const CHARACTER_STORAGE_KEY = 'dnd_characters';
  // Only treat local/file:// environments as "debug" to avoid noisy logs in production.
  const DEBUG = isLocalEnvironment;

  // Primary export
  global.AppConfig = {
    isLocalEnvironment,
    BACKEND_ORIGIN,
    API_BASE_URL,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    CHARACTER_STORAGE_KEY,
    DEBUG,
  };

  // Backward compatibility alias
  global.DanddyConfig = global.AppConfig;

  // In non‑debug (production) environments, silence noisy console methods while
  // preserving errors and warnings. This lets us keep existing console.log calls
  // in the codebase without paying the runtime cost in production.
  if (!DEBUG && global.console) {
    try {
      ['log', 'info', 'debug'].forEach((method) => {
        if (typeof global.console[method] === 'function') {
          global.console[method] = () => {};
        }
      });
    } catch (e) {
      // Fail silently – logging should never break the app.
    }
  }
})(window);




// ===== BUNDLE PART: app-auth.js =====

// Unified AuthService for the DandDy app (manager + builder).
// Relies on `window.AppConfig` for API URLs & storage keys and exposes
// `window.AppAuth` used across all views.

(function (global) {
  const cfg = global.AppConfig || global.DanddyConfig || {};
  const API_BASE_URL = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const TOKEN_KEY = cfg.TOKEN_STORAGE_KEY || 'dnd_auth_token';
  const USER_KEY = cfg.USER_STORAGE_KEY || 'dnd_user_info';
  const DEBUG = !!cfg.DEBUG;

  // Primary export
  const AppAuth = (global.AppAuth = global.AppAuth || {});

  // Backward compatibility alias
  global.AuthService = AppAuth;

  Object.assign(AppAuth, {
    TOKEN_KEY,
    USER_KEY,

    // ===== Local session helpers =====
    getToken() {
      return global.localStorage.getItem(this.TOKEN_KEY);
    },

    setToken(token) {
      if (!token) return;
      global.localStorage.setItem(this.TOKEN_KEY, token);
    },

    clearToken() {
      global.localStorage.removeItem(this.TOKEN_KEY);
      global.localStorage.removeItem(this.USER_KEY);
    },

    getCurrentUser() {
      const raw = global.localStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    },

    setCurrentUser(user) {
      if (!user) return;
      global.localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    },

    isAuthenticated() {
      return !!this.getToken();
    },

    logout() {
      // Stop session monitoring before clearing tokens
      this.stopSessionMonitor();

      this.clearToken();
      // Clear any in-progress character builder session so it doesn't persist
      // and get offered to a different user who logs in later
      try {
        global.localStorage.removeItem('danddy_builder_session');
      } catch (e) {
        // Ignore errors (e.g., if localStorage is unavailable)
      }
    },

    // ===== Core HTTP helpers =====
    async _request(path, { method = 'GET', body, headers } = {}) {
      const url = `${API_BASE_URL}${path}`;
      const baseHeaders = headers || {};

      // Shallow-clone & scrub sensitive fields for debug logging
      const scrubBodyForLog = (payload) => {
        if (!payload || typeof payload !== 'object') return payload;
        const clone = { ...payload };
        const sensitiveKeys = ['password', 'confirm_password', 'new_password', 'token'];
        sensitiveKeys.forEach((key) => {
          if (key in clone) {
            const value = String(clone[key] ?? '');
            clone[key] = value ? `*** (${value.length} chars)` : '***';
          }
        });
        return clone;
      };

      if (DEBUG) {
        console.log('[AuthService] HTTP request', {
          url,
          method,
          body: scrubBodyForLog(body),
        });
      }

      try {
        const response = await fetch(url, {
          method,
          headers: body
            ? { 'Content-Type': 'application/json', ...baseHeaders }
            : baseHeaders,
          body: body ? JSON.stringify(body) : undefined,
        });

        if (!response.ok) {
          let detail = `Request failed (${response.status})`;
          let backendDetail = null;
          try {
            const errJson = await response.json();
            if (DEBUG) {
              console.warn('[AuthService] HTTP error response', {
                url,
                status: response.status,
                payload: errJson,
              });
            }
            if (errJson && errJson.detail) {
              if (typeof errJson.detail === 'string') {
                // Simple error string from backend
                detail = errJson.detail;
              } else if (Array.isArray(errJson.detail) && errJson.detail.length) {
                // FastAPI validation error format: [{ loc, msg, type }, ...]
                const first = errJson.detail[0];
                if (first && first.msg) {
                  detail = first.msg;
                } else {
                  detail = JSON.stringify(errJson.detail);
                }
              } else {
                // Fallback to JSON string so we don't show [object Object]
                detail = JSON.stringify(errJson.detail);
              }
              backendDetail = errJson.detail;
            }
          } catch (_) {
            // ignore JSON parse errors
          }
          if (DEBUG) {
            console.warn('[AuthService] HTTP request failed', {
              url,
              status: response.status,
              detail,
              backendDetail,
            });
          }
          throw new Error(detail);
        }

        // 204 no content
        if (response.status === 204) return null;
        const json = await response.json();
        if (DEBUG) {
          console.log('[AuthService] HTTP response OK', {
            url,
            method,
            status: response.status,
          });
        }
        return json;
      } catch (error) {
        console.error('[AuthService] Request error:', error);
        throw error;
      }
    },

    // ===== Auth flows =====

    /**
     * Register a new user using username + email + password.
     * Returns { success, user, error }.
     *
     * @param {string} username - Required unique username (3-30 chars, alphanumeric + underscore)
     * @param {string} email - User's email address
     * @param {string} password - User's password
     * @param {string|null} role - Optional role (PLAYER, DM, ADMIN)
     */
    async register(username, email, password, role = null) {
      try {
        // Validate username format on client side
        const usernamePattern = /^[a-zA-Z0-9_]{3,30}$/;
        if (!usernamePattern.test(username)) {
          throw new Error('Username must be 3-30 characters, using only letters, numbers, and underscores');
        }

        // Build request body - only include role if explicitly provided
        // Backend defaults to PLAYER if not specified
        const body = { username: username.toLowerCase(), email, password };
        if (role) {
          // Normalize to uppercase (backend expects 'PLAYER', 'DM', or 'ADMIN')
          body.role = role.toUpperCase();
        }

        const data = await this._request('/auth/register', {
          method: 'POST',
          body,
        });

        if (!data || !data.access_token) {
          throw new Error('Registration succeeded but no token was returned.');
        }

        this.setToken(data.access_token);

        // Try to fetch full user profile; fall back to a minimal object.
        const profile = await this.fetchProfile();
        const user =
          profile && Object.keys(profile).length
            ? profile
            : { username, email, role };

        this.setCurrentUser(user);

        return { success: true, user };
      } catch (error) {
        return { success: false, error: error.message || 'Registration failed' };
      }
    },

    /**
     * Update the current user's username.
     * @param {string} newUsername - New username (3-30 chars, alphanumeric + underscore)
     * @returns {Promise<{success: boolean, user?: object, error?: string}>}
     */
    async updateUsername(newUsername) {
      try {
        const usernamePattern = /^[a-zA-Z0-9_]{3,30}$/;
        if (!usernamePattern.test(newUsername)) {
          throw new Error('Username must be 3-30 characters, using only letters, numbers, and underscores');
        }

        const token = this.getToken();
        if (!token) {
          throw new Error('Not authenticated');
        }

        const data = await this._request('/auth/username', {
          method: 'PUT',
          body: { username: newUsername.toLowerCase() },
          headers: { Authorization: `Bearer ${token}` },
        });

        // Update local user info
        this.setCurrentUser(data);
        return { success: true, user: data };
      } catch (error) {
        return { success: false, error: error.message || 'Failed to update username' };
      }
    },

    /**
     * Login with email + password.
     *
     * Note: the OAuth2 password flow still uses the `username` form field name.
     * The value can be either a username or email address - backend detects by '@'.
     * Returns { success, user, error }.
     */
    async login(identifier, password) {
      const url = `${API_BASE_URL}/auth/token`;
      if (DEBUG) {
        console.log('[AuthService] Login attempt', {
          url,
          identifier,
        });
      }

      try {
        const formData = new FormData();
        // Field name must remain "username" for OAuth2PasswordRequestForm,
        // but the value can be either username or email.
        formData.append('username', identifier);
        formData.append('password', password);

        const response = await fetch(url, {
          method: 'POST',
          body: formData,
        });

        if (DEBUG) {
          console.log('[AuthService] Login response received', {
            url,
            status: response.status,
            ok: response.ok,
          });
        }

        if (!response.ok) {
          let detail = 'Login failed';
          let backendPayload = null;
          try {
            const errJson = await response.json();
            backendPayload = errJson;
            if (errJson && errJson.detail) detail = errJson.detail;
          } catch (_) {
            // ignore
          }
          if (DEBUG) {
            console.warn('[AuthService] Login HTTP error', {
              url,
              status: response.status,
              detail,
              backendPayload,
            });
          }
          throw new Error(detail);
        }

        const data = await response.json();
        if (!data || !data.access_token) {
          throw new Error('Login succeeded but no token was returned.');
        }

        if (DEBUG) {
          console.log('[AuthService] Login succeeded, token received', {
            url,
          });
        }

        this.setToken(data.access_token);
        const profile = await this.fetchProfile();
        if (profile) {
          this.setCurrentUser(profile);
        }

        return { success: true, user: profile };
      } catch (error) {
        console.error('[AuthService] Login error:', error);
        return { success: false, error: error.message || 'Login failed' };
      }
    },

    /**
     * Request a password reset email.
     */
    async forgotPassword(email) {
      try {
        const data = await this._request('/auth/password/forgot', {
          method: 'POST',
          body: { email },
        });

        return {
          success: true,
          message:
            (data && data.message) ||
            'If an account with that email exists, a password reset link has been sent.',
          debugToken: data && data.debug_reset_token ? data.debug_reset_token : null,
        };
      } catch (error) {
        return {
          success: false,
          error: error.message || 'Password reset request failed',
        };
      }
    },

    /**
     * Complete a password reset given a reset token and new password.
     */
    async resetPassword(token, newPassword) {
      try {
        const data = await this._request('/auth/password/reset', {
          method: 'POST',
          body: { token, new_password: newPassword },
        });

        if (!data || !data.access_token) {
          throw new Error('Password reset succeeded but no token was returned.');
        }

        this.setToken(data.access_token);
        const profile = await this.fetchProfile();
        if (profile) {
          this.setCurrentUser(profile);
        }

        return { success: true, user: profile };
      } catch (error) {
        return { success: false, error: error.message || 'Password reset failed' };
      }
    },

    /**
     * Fetch current user profile using stored access token.
     */
    async fetchProfile() {
      const token = this.getToken();
      if (!token) return null;

      try {
        const response = await fetch(`${API_BASE_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (!response.ok) {
          // 401: token invalid/expired
          if (response.status === 401) {
            let backendDetail = null;
            try {
              const errJson = await response.json();
              if (errJson && errJson.detail) {
                backendDetail = errJson.detail;
              }
            } catch (_) {
              // ignore JSON parse errors
            }

            console.warn(
              '[AuthService] Token rejected by /auth/me; handling unexpected logout.',
              {
                status: response.status,
                detail: backendDetail,
              }
            );
            this.handleUnexpectedLogout('auth_me_401');
            return null;
          }
          if (DEBUG) {
            console.warn('[AuthService] /auth/me non-401 error', {
              status: response.status,
            });
          }
          throw new Error('Failed to fetch user profile');
        }

        const profile = await response.json();
        if (DEBUG) {
          console.log('[AuthService] /auth/me profile loaded', profile);
        }
        return profile;
      } catch (error) {
        console.error('[AuthService] Fetch profile error:', error);
        return null;
      }
    },

    /**
     * Verify token validity by calling /auth/me.
     * Returns true if still valid, false otherwise.
     */
    async verifyToken() {
      const profile = await this.fetchProfile();
      return !!profile;
    },

    // ===== Session Monitoring =====
    // Proactively detect expired sessions and notify users before they attempt actions.

    _sessionCheckInterval: null,
    _lastSessionCheck: 0,
    _visibilityHandler: null,
    _sessionMonitorActive: false,

    // Check session every 5 minutes while active
    SESSION_CHECK_INTERVAL_MS: 5 * 60 * 1000,
    // Minimum 30 seconds between checks (cooldown for visibility changes)
    SESSION_CHECK_COOLDOWN_MS: 30 * 1000,

    /**
     * Start monitoring the session for expiry.
     * Call this after confirming the user is logged in.
     */
    startSessionMonitor() {
      if (this._sessionMonitorActive) {
        if (DEBUG) {
          console.log('[AuthService] Session monitor already active');
        }
        return;
      }

      if (!this.isAuthenticated()) {
        if (DEBUG) {
          console.log('[AuthService] Not authenticated, skipping session monitor');
        }
        return;
      }

      if (DEBUG) {
        console.log('[AuthService] Starting session monitor');
      }

      this._sessionMonitorActive = true;
      this._lastSessionCheck = Date.now();

      // Set up visibility change handler (check when user returns to tab)
      this._visibilityHandler = () => this._onVisibilityChange();
      document.addEventListener('visibilitychange', this._visibilityHandler);

      // Set up periodic background check
      this._sessionCheckInterval = setInterval(() => {
        this._performSessionCheck('interval');
      }, this.SESSION_CHECK_INTERVAL_MS);
    },

    /**
     * Stop monitoring the session.
     * Call this on logout or when cleaning up.
     */
    stopSessionMonitor() {
      if (DEBUG) {
        console.log('[AuthService] Stopping session monitor');
      }

      this._sessionMonitorActive = false;

      if (this._visibilityHandler) {
        document.removeEventListener('visibilitychange', this._visibilityHandler);
        this._visibilityHandler = null;
      }

      if (this._sessionCheckInterval) {
        clearInterval(this._sessionCheckInterval);
        this._sessionCheckInterval = null;
      }
    },

    /**
     * Handle visibility change events.
     * When the user returns to the tab, verify session is still valid.
     */
    _onVisibilityChange() {
      if (document.visibilityState !== 'visible') {
        return;
      }

      // Apply cooldown to avoid hammering the server
      const timeSinceLastCheck = Date.now() - this._lastSessionCheck;
      if (timeSinceLastCheck < this.SESSION_CHECK_COOLDOWN_MS) {
        if (DEBUG) {
          console.log('[AuthService] Skipping visibility check (cooldown)');
        }
        return;
      }

      this._performSessionCheck('visibility');
    },

    /**
     * Perform an actual session validity check.
     * @param {string} trigger - What triggered this check ('visibility' or 'interval')
     */
    async _performSessionCheck(trigger) {
      if (!this.isAuthenticated()) {
        // User logged out manually, stop monitoring
        this.stopSessionMonitor();
        return;
      }

      if (DEBUG) {
        console.log(`[AuthService] Performing session check (trigger: ${trigger})`);
      }

      this._lastSessionCheck = Date.now();

      try {
        const isValid = await this.verifyToken();

        if (!isValid) {
          if (DEBUG) {
            console.log('[AuthService] Session expired detected');
          }
          this._handleSessionExpired();
        } else if (DEBUG) {
          console.log('[AuthService] Session still valid');
        }
      } catch (error) {
        // Network error - don't treat as session expired (user might be offline)
        console.warn('[AuthService] Session check failed (network?):', error);
      }
    },

    /**
     * Handle an expired session: clear state, dispatch event, and update UI.
     */
    _handleSessionExpired() {
      // Stop monitoring (session is already dead)
      this.stopSessionMonitor();

      // Clear local auth state
      this.clearToken();

      // Dispatch custom event for UI components to react
      const event = new CustomEvent('danddy:sessionExpired', {
        detail: { reason: 'token_expired' },
      });
      window.dispatchEvent(event);

      // Also trigger the existing updateAuthUI if available
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
    },

    /**
     * Handle unexpected logout (e.g., 401 from API calls).
     * This should be called instead of clearToken() when a 401 is received.
     * It clears the auth state and notifies the user via the sessionExpired event.
     * @param {string} reason - Optional reason for the logout (for debugging)
     */
    handleUnexpectedLogout(reason = 'api_401') {
      // Prevent duplicate handling if already logged out
      if (!this.getToken()) {
        return;
      }

      if (DEBUG) {
        console.log('[AuthService] Handling unexpected logout:', reason);
      }

      // Stop session monitoring
      this.stopSessionMonitor();

      // Clear local auth state
      this.clearToken();

      // Dispatch custom event for UI components to react
      const event = new CustomEvent('danddy:sessionExpired', {
        detail: { reason },
      });
      window.dispatchEvent(event);

      // Also trigger the existing updateAuthUI if available
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
    },
  });
})(window);






// ===== BUNDLE PART: app-character-mapper.js =====

// Shared helpers for mapping between backend character DTOs and the various
// frontend shapes used across the DandDy app (manager + builder).
// Exposes `window.DanddyCharacterMapper`.

(function (global) {
  const Mapper = {
    /**
     * Map builder character → backend DTO (CharacterCreate).
     * Mirrors the previous `CharacterAPI.toBackendFormat` logic.
     */
    fromBuilderToBackend(character) {
      if (!character) return null;

      return {
        name: character.name || '',
        race: character.race || '',
        character_class: character.class || '',
        level: character.level || 1,
        background: character.background || null,
        alignment: this._mapAlignmentFromBuilder(character.alignment),
        experience_points: character.experiencePoints || 0,

        // Ability Scores
        strength: character.abilities?.str || 10,
        dexterity: character.abilities?.dex || 10,
        constitution: character.abilities?.con || 10,
        intelligence: character.abilities?.int || 10,
        wisdom: character.abilities?.wis || 10,
        charisma: character.abilities?.cha || 10,

        // Combat Stats
        hit_points_max: character.hitPoints || 10,
        hit_points_current: character.hitPoints || 10,
        hit_points_temp: 0,
        armor_class: this._calculateACFromBuilder(character),
        initiative: this._calculateInitiativeFromBuilder(character),
        speed: this._getSpeedFromBuilder(character),
        hit_dice_current: character.hitDiceCurrent ?? null,  // null means full
        class_resources: character.classResources || {},

        // Death Saves
        death_save_successes: 0,
        death_save_failures: 0,

        // Proficiencies
        saving_throw_proficiencies: character.savingThrows || [],
        skill_proficiencies: character.skillProficiencies || [],
        skill_expertises: [],
        tool_proficiencies: character.toolProficiencies || [],
        languages: character.languages || [],

        // Features
        racial_traits: this._arrayToDict(character.racialTraits),
        class_features: this._arrayToDict(character.classFeatures),
        feats: [],
        background_feature: character.backgroundFeature || {},

        // Personality
        personality_traits: character.personalityTrait || null,
        ideals: character.ideal || null,
        bonds: character.bond || null,
        flaws: character.flaw || null,

        // Appearance & Backstory
        appearance: character.appearance || null,
        backstory: character.backstory || null,
        sex: character.sex || null,

        // Portrait
        ascii_portrait: character.asciiPortrait || null,
        original_portrait_url: character.originalPortraitUrl || null,
        custom_portrait_ascii: character.customPortraitAscii || null,
        custom_portrait_count: character.customPortraitCount || 0,
        portrait_metadata: character.portraitMetadata || {},

        // Inventory
        inventory: this._arrayToDict(character.equipment),

        // Spellcasting
        spellcasting_ability: character.spellcastingAbility || null,
        spell_save_dc: character.spellSaveDC || null,
        spell_attack_bonus: character.spellAttackBonus || null,
        spell_slots: character.spellSlots || {},
        spell_slots_used: {},
        cantrips: this._spellsToStringArray(character.cantrips),
        spells_known: this._spellsToStringArray(character.spellsKnown),
        spells_prepared: this._spellsToStringArray(character.spellsPrepared),

        // Combat
        conditions: [],
        attacks: this._arrayToDict(character.attacks),

        // Currency
        copper_pieces: character.copper || 0,
        silver_pieces: character.silver || 0,
        electrum_pieces: character.electrum || 0,
        gold_pieces: character.gold || 0,
        platinum_pieces: character.platinum || 0,

        // Campaign
        campaign_id: character.campaignId || null,
      };
    },

    /**
     * Map backend DTO → builder character shape.
     * Mirrors the previous `CharacterAPI.toFrontendFormat` logic.
     */
    fromBackendToBuilder(backendChar) {
      if (!backendChar) return null;

      return {
        id: backendChar.id,
        name: backendChar.name,
        race: backendChar.race,
        class: backendChar.character_class,
        level: backendChar.level,
        background: backendChar.background,
        alignment: this._mapAlignmentFromBackend(backendChar.alignment),
        experiencePoints: backendChar.experience_points,

        abilities: {
          str: backendChar.strength,
          dex: backendChar.dexterity,
          con: backendChar.constitution,
          int: backendChar.intelligence,
          wis: backendChar.wisdom,
          cha: backendChar.charisma,
        },

        hitPoints: backendChar.hit_points_max,
        currentHitPoints: backendChar.hit_points_current,
        armorClass: backendChar.armor_class,
        initiative: backendChar.initiative,
        speed: backendChar.speed,
        hitDiceCurrent: backendChar.hit_dice_current,
        classResources: backendChar.class_resources || {},

        savingThrows: backendChar.saving_throw_proficiencies,
        skillProficiencies: backendChar.skill_proficiencies,
        toolProficiencies: backendChar.tool_proficiencies,
        languages: backendChar.languages,

        racialTraits: backendChar.racial_traits,
        classFeatures: backendChar.class_features,
        backgroundFeature: backendChar.background_feature,

        personalityTrait: backendChar.personality_traits,
        ideal: backendChar.ideals,
        bond: backendChar.bonds,
        flaw: backendChar.flaws,

        appearance: backendChar.appearance,
        backstory: backendChar.backstory,
        sex: backendChar.sex || null,

        asciiPortrait: backendChar.ascii_portrait,
        originalPortraitUrl: backendChar.original_portrait_url,
        customPortraitAscii: backendChar.custom_portrait_ascii,
        customPortraitCount: backendChar.custom_portrait_count,
        portraitMetadata: backendChar.portrait_metadata,

        // Convert inventory objects to strings (equipment expects string array)
        equipment: (backendChar.inventory || []).map((item) =>
          typeof item === 'object' && item.name ? item.name : item,
        ),

        spellcastingAbility: backendChar.spellcasting_ability,
        spellSaveDC: backendChar.spell_save_dc,
        spellAttackBonus: backendChar.spell_attack_bonus,
        spellSlots: backendChar.spell_slots,
        cantrips: backendChar.cantrips || [],
        spellsKnown: backendChar.spells_known || [],
        spellsPrepared: backendChar.spells_prepared || [],

        attacks: backendChar.attacks,

        copper: backendChar.copper_pieces,
        silver: backendChar.silver_pieces,
        electrum: backendChar.electrum_pieces,
        gold: backendChar.gold_pieces,
        platinum: backendChar.platinum_pieces,

        campaignId: backendChar.campaign_id,
        campaignName: backendChar.campaign_name || null,
        ownerId: backendChar.owner_id,

        _backendData: backendChar,
      };
    },

    /**
     * Map manager character → backend DTO.
     * Mirrors `CharacterCloudStorage._toAPIFormat`.
     */
    fromManagerToBackend(character) {
      if (!character) return null;

      // Normalize background feature into a dict, even if it started as a string.
      const rawBackgroundFeature =
        character.backgroundFeature || character.backgroundData?.feature || {};
      const backgroundFeatureDict =
        typeof rawBackgroundFeature === 'string'
          ? { name: rawBackgroundFeature }
          : rawBackgroundFeature;

      return {
        name: character.name || 'Unnamed Character',
        race: character.race || character.raceData?.name || 'Human',
        character_class: character.class || character.classData?.name || 'Fighter',
        level: character.level || 1,
        background: character.background || character.backgroundData?.name || null,
        alignment: this._mapAlignmentFromManager(character.alignment),
        experience_points: character.experiencePoints || 0,

        // Ability Scores
        strength: character.abilities?.str || character.abilityScores?.str || 10,
        dexterity: character.abilities?.dex || character.abilityScores?.dex || 10,
        constitution: character.abilities?.con || character.abilityScores?.con || 10,
        intelligence: character.abilities?.int || character.abilityScores?.int || 10,
        wisdom: character.abilities?.wis || character.abilityScores?.wis || 10,
        charisma: character.abilities?.cha || character.abilityScores?.cha || 10,

        // Combat Stats
        hit_points_max: character.hitPoints?.max ?? character.hitPoints ?? 10,
        hit_points_current:
          character.hitPoints?.current ?? character.hitPoints?.max ?? character.hitPoints ?? 10,
        hit_points_temp: character.hitPoints?.temp ?? 0,
        armor_class: character.armorClass || 10,
        initiative: character.initiative || 0,
        speed: character.speed || 30,
        hit_dice_current: character.hitDiceCurrent ?? null,  // null means full
        class_resources: character.classResources || {},

        // Death Saves
        death_save_successes: character.deathSaves?.successes || 0,
        death_save_failures: character.deathSaves?.failures || 0,

        // Proficiencies
        saving_throw_proficiencies: character.savingThrows || [],
        skill_proficiencies: character.skillProficiencies || [],
        skill_expertises: character.skillExpertises || [],
        tool_proficiencies: character.toolProficiencies || [],
        languages: character.languages || [],

        // Features & Traits
        // Backend expects arrays of dicts, not raw strings.
        racial_traits: this._arrayToDict(
          character.racialTraits || character.raceData?.traits || [],
        ),
        class_features: this._arrayToDict(
          character.classFeatures || character.classData?.features || [],
        ),
        feats: this._arrayToDict(character.feats || []),
        background_feature: backgroundFeatureDict,

        // Personality
        personality_traits: character.personalityTraits || character.personalityTrait || null,
        ideals: character.ideals || null,
        bonds: character.bonds || null,
        flaws: character.flaws || null,

        // Appearance & Backstory
        appearance: character.appearance || null,
        backstory: character.backstory || null,
        sex: character.sex || null,

        // Portrait data
        ascii_portrait: character.asciiPortrait || null,
        original_portrait_url: character.originalPortraitUrl || null,
        custom_portrait_ascii: character.customPortraitAscii || null,
        custom_portrait_count: character.customPortraitCount || 0,
        portrait_metadata: character.portraitMetadata || {},

        // Inventory
        inventory: (character.equipment || character.inventory || []).map((item) =>
          typeof item === 'string' ? { name: item } : item,
        ),

        // Spellcasting
        spellcasting_ability: character.spellcastingAbility || null,
        spell_save_dc: character.spellSaveDC || null,
        spell_attack_bonus: character.spellAttackBonus || null,
        spell_slots: character.spellSlots || {},
        spell_slots_used: character.spellSlotsUsed || {},
        // Backend expects arrays of spell *names* (strings), not full objects.
        cantrips: this._spellsToStringArray(character.cantrips || []),
        spells_known: this._spellsToStringArray(character.spellsKnown || []),
        spells_prepared: this._spellsToStringArray(character.spellsPrepared || []),

        // Combat
        conditions: character.conditions || [],
        attacks: character.attacks || [],

        // Currency
        copper_pieces: character.currency?.cp ?? character.copper ?? 0,
        silver_pieces: character.currency?.sp ?? character.silver ?? 0,
        electrum_pieces: character.currency?.ep ?? character.electrum ?? 0,
        gold_pieces: character.currency?.gp ?? character.gold ?? 0,
        platinum_pieces: character.currency?.pp ?? character.platinum ?? 0,

        // Campaign & ownership
        campaign_id: character.campaignId || null,
      };
    },

    /**
     * Map backend DTO → manager character shape.
     * Mirrors `CharacterCloudStorage._fromAPIFormat`.
     */
    fromBackendToManager(apiChar) {
      if (!apiChar) return null;

      return {
        id: apiChar.id.toString(),
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        level: apiChar.level,
        background: apiChar.background,
        alignment: this._mapAlignmentFromBackend(apiChar.alignment),
        experiencePoints: apiChar.experience_points,

        abilities: {
          str: apiChar.strength,
          dex: apiChar.dexterity,
          con: apiChar.constitution,
          int: apiChar.intelligence,
          wis: apiChar.wisdom,
          cha: apiChar.charisma,
        },

        hitPoints: {
          max: apiChar.hit_points_max,
          current: apiChar.hit_points_current,
          temp: apiChar.hit_points_temp,
        },
        armorClass: apiChar.armor_class,
        initiative: apiChar.initiative,
        speed: apiChar.speed,
        hitDiceCurrent: apiChar.hit_dice_current,
        hitDiceMax: apiChar.level || 1,
        classResources: apiChar.class_resources || {},

        savingThrows: apiChar.saving_throw_proficiencies,
        skillProficiencies: apiChar.skill_proficiencies,
        skillExpertises: apiChar.skill_expertises,
        toolProficiencies: apiChar.tool_proficiencies,
        languages: apiChar.languages,

        racialTraits: apiChar.racial_traits,
        classFeatures: apiChar.class_features,
        feats: apiChar.feats,
        backgroundFeature: apiChar.background_feature,

        personalityTraits: apiChar.personality_traits,
        ideals: apiChar.ideals,
        bonds: apiChar.bonds,
        flaws: apiChar.flaws,
        appearance: apiChar.appearance,
        backstory: apiChar.backstory,
        sex: apiChar.sex || null,

        equipment: apiChar.inventory.map((item) =>
          typeof item === 'object' && item.name ? item.name : item,
        ),

        spellcastingAbility: apiChar.spellcasting_ability,
        spellSaveDC: apiChar.spell_save_dc,
        spellAttackBonus: apiChar.spell_attack_bonus,
        spellSlots: apiChar.spell_slots,
        spellSlotsUsed: apiChar.spell_slots_used,
        cantrips: apiChar.cantrips || [],
        spellsKnown: apiChar.spells_known || [],
        spellsPrepared: apiChar.spells_prepared || [],

        conditions: apiChar.conditions,
        attacks: apiChar.attacks,

        // Death saves
        death_save_successes: apiChar.death_save_successes ?? 0,
        death_save_failures: apiChar.death_save_failures ?? 0,

        currency: {
          cp: apiChar.copper_pieces,
          sp: apiChar.silver_pieces,
          ep: apiChar.electrum_pieces,
          gp: apiChar.gold_pieces,
          pp: apiChar.platinum_pieces,
        },

        campaignId: apiChar.campaign_id,
        campaignName: apiChar.campaign_name || null,
        ownerId: apiChar.owner_id,
        createdAt: apiChar.created_at,
        updatedAt: apiChar.updated_at,

        // Sharing metadata
        isShared: apiChar.is_shared || false,
        ownerEmail: apiChar.owner_email || null,
        permission: apiChar.permission || null,
        collaboratorCount: apiChar.collaborator_count || 0,
        lastUpdatedByEmail: apiChar.last_updated_by_email || null,

        asciiPortrait: apiChar.ascii_portrait,
        originalPortraitUrl: apiChar.original_portrait_url,
        customPortraitAscii: apiChar.custom_portrait_ascii,
        customPortraitCount: apiChar.custom_portrait_count || 0,
        portraitMetadata: apiChar.portrait_metadata || {},
      };
    },

    /**
     * Map backend LITE DTO → manager character shape (minimal fields).
     *
     * This is used for list/grid views to avoid downloading/parsing huge payloads
     * (ASCII portraits, inventory, spells, etc.) when they're not needed yet.
     */
    fromBackendLiteToManager(apiChar) {
      if (!apiChar) return null;

      return {
        id: apiChar.id != null ? apiChar.id.toString() : '',
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        level: apiChar.level,
        background: apiChar.background,

        // Portrait (URL + metadata only; no ASCII)
        originalPortraitUrl: apiChar.original_portrait_url || null,
        customPortraitCount: apiChar.custom_portrait_count ?? 0,
        portraitMetadata: apiChar.portrait_metadata || {},

        // Campaign & ownership
        campaignId: apiChar.campaign_id ?? null,
        campaignName: apiChar.campaign_name || null,
        ownerId: apiChar.owner_id,
        createdAt: apiChar.created_at,
        updatedAt: apiChar.updated_at,
        isDemo: apiChar.is_demo || false,

        // Sharing metadata (still useful for list badges)
        isShared: apiChar.is_shared || false,
        ownerEmail: apiChar.owner_email || null,
        permission: apiChar.permission || null,
        collaboratorCount: apiChar.collaborator_count ?? 0,
        lastUpdatedByEmail: apiChar.last_updated_by_email || null,

        // Marker so callers know this object is not a full character payload
        _isLite: true,
      };
    },

    // ===== Shared helpers =====

    _arrayToDict(arr) {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.map((item) => {
        if (typeof item === 'object' && item !== null) return item;
        if (typeof item === 'string') return { name: item };
        return { value: item };
      });
    },

    _spellsToStringArray(arr) {
      if (!arr || !Array.isArray(arr)) return [];
      return arr.map((item) => {
        if (typeof item === 'object' && item !== null && item.name) return item.name;
        if (typeof item === 'string') return item;
        return String(item);
      });
    },

    _mapAlignmentFromBuilder(alignment) {
      if (!alignment) return null;
      
      // Map both abbreviations (from builder) and full names to backend format
      const map = {
        // Abbreviations (what builder actually stores)
        'lg': 'lawful_good',
        'ng': 'neutral_good',
        'cg': 'chaotic_good',
        'ln': 'lawful_neutral',
        'n': 'true_neutral',
        'cn': 'chaotic_neutral',
        'le': 'lawful_evil',
        'ne': 'neutral_evil',
        'ce': 'chaotic_evil',
        // Full names (for backwards compatibility)
        'Lawful Good': 'lawful_good',
        'Neutral Good': 'neutral_good',
        'Chaotic Good': 'chaotic_good',
        'Lawful Neutral': 'lawful_neutral',
        'True Neutral': 'true_neutral',
        'Chaotic Neutral': 'chaotic_neutral',
        'Lawful Evil': 'lawful_evil',
        'Neutral Evil': 'neutral_evil',
        'Chaotic Evil': 'chaotic_evil',
      };
      return map[alignment] || null;
    },

    _mapAlignmentFromManager(alignment) {
      // Manager already uses the same string labels as builder; reuse mapping.
      return this._mapAlignmentFromBuilder(alignment);
    },

    _mapAlignmentFromBackend(backendAlignment) {
      if (!backendAlignment) return null;
      
      // Map backend format (e.g., 'lawful_good') to frontend abbreviations (e.g., 'lg')
      const reverseMap = {
        'lawful_good': 'lg',
        'neutral_good': 'ng',
        'chaotic_good': 'cg',
        'lawful_neutral': 'ln',
        'true_neutral': 'n',
        'chaotic_neutral': 'cn',
        'lawful_evil': 'le',
        'neutral_evil': 'ne',
        'chaotic_evil': 'ce',
      };
      return reverseMap[backendAlignment] || null;
    },

    _calculateACFromBuilder(character) {
      const dex = character.abilities?.dex;
      const dexMod = dex ? Math.floor((dex - 10) / 2) : 0;
      return 10 + dexMod;
    },

    _calculateInitiativeFromBuilder(character) {
      const dex = character.abilities?.dex;
      return dex ? Math.floor((dex - 10) / 2) : 0;
    },

    _getSpeedFromBuilder(character) {
      const race = (character.race || '').toLowerCase();
      const speedMap = {
        dwarf: 25,
        halfling: 25,
        gnome: 25,
        elf: 30,
        human: 30,
        'half-elf': 30,
        'half-orc': 30,
        tiefling: 30,
        dragonborn: 30,
      };
      return speedMap[race] || 30;
    },
  };

  global.DanddyCharacterMapper = Mapper;
})(window);







// ===== BUNDLE PART: app-storage.js =====

// Shared helpers for character storage in localStorage.
// Exposes `window.AppStorage` and centralizes the `dnd_characters` key and
// its companion cache key.

(function (global) {
  const cfg = global.AppConfig || global.DanddyConfig || {};

  const STORAGE_KEY = cfg.CHARACTER_STORAGE_KEY || 'dnd_characters';
  const CACHE_KEY = `${STORAGE_KEY}_cache`;

  const Storage = {
    STORAGE_KEY,
    CACHE_KEY,

    // Read all characters from primary storage.
    readAll() {
      const raw = global.localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    },

    // Overwrite all characters in primary storage.
    writeAll(characters) {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(characters || []));
    },

    // Append or replace a single character by id.
    // Uses String comparison to handle type mismatches (IDs may be numeric or string)
    upsert(character) {
      if (!character) return;
      const chars = this.readAll();
      const idStr = String(character.id);
      const idx = chars.findIndex((c) => c && String(c.id) === idStr);
      if (idx >= 0) {
        chars[idx] = character;
      } else {
        chars.push(character);
      }
      this.writeAll(chars);
    },

    // Delete a character by id.
    // Uses String comparison to handle type mismatches (IDs may be numeric or string)
    deleteById(id) {
      const idStr = String(id);
      const chars = this.readAll().filter((c) => !c || String(c.id) !== idStr);
      this.writeAll(chars);
    },

    // ===== Cache helpers (for cloud-sync caching) =====

    readCache() {
      const raw = global.localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    },

    writeCache(characters) {
      global.localStorage.setItem(CACHE_KEY, JSON.stringify(characters || []));
    },

    clearAll() {
      global.localStorage.removeItem(STORAGE_KEY);
      global.localStorage.removeItem(CACHE_KEY);
    },
  };

  // Primary export
  global.AppStorage = Storage;
  // Backward compatibility alias
  global.DanddyStorage = Storage;
})(window);







// ========================================
// SHARED CHARACTER STORAGE FACADE
// ========================================
// Unified hybrid storage (cloud + local) used by:
// - Character Manager (full-screen app)
// - Character Builder (for future consolidation)
//
// Responsibilities:
// - Decide between cloud API and local storage based on AuthService
// - Provide a stable character model for frontend code
// - Normalize timestamps so sorting by "date modified" is reliable
//
// Dependencies (if available on the current page):
// - window.AuthService          (auth state)
// - window.CharacterCloudStorage (cloud CRUD, from character-manager-api.js)
// - window.DanddyStorage        (local storage abstraction)
// ========================================

(function () {
  const DEBUG_STORAGE = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

  const CharacterStorage = (window.CharacterStorage = {
    STORAGE_KEY:
      (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) ||
      'dnd_characters',

    // Check if user is authenticated and should use cloud
    useCloud() {
      return (
        window.AuthService && typeof AuthService.isAuthenticated === 'function'
          ? AuthService.isAuthenticated()
          : false
      );
    },

    // Get all characters (cloud or local)
    async getAll() {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching all characters from cloud...');
          }
          return await window.CharacterCloudStorage.getAll();
        } catch (error) {
          // If session expired, dispatch event and re-throw instead of silently falling back
          if (error.message && error.message.toLowerCase().includes('session has expired')) {
            console.warn('☁️ STORAGE: Session expired during getAll, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'getAll' },
            });
            window.dispatchEvent(event);
            // Re-throw so caller can handle
            throw error;
          }
          // For other errors (network issues, etc.), fall back to local
          console.error(
            '☁️ STORAGE: Cloud getAll failed, falling back to local:',
            error,
          );
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '⚠️ Cloud sync failed. Showing local characters instead.',
            );
          }
          return this._getLocalAll();
        }
      }
      return this._getLocalAll();
    },

    /**
     * Get a lightweight character list for list/grid rendering.
     * - Cloud: uses /api/characters/lite (much smaller payload)
     * - Local: falls back to full local list (already fast)
     */
    async getAllLite() {
      if (this.useCloud() && window.CharacterCloudStorage && typeof window.CharacterCloudStorage.getAllLite === 'function') {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching lite characters from cloud...');
          }
          return await window.CharacterCloudStorage.getAllLite();
        } catch (error) {
          // If session expired, dispatch event and re-throw instead of silently falling back
          if (error.message && error.message.toLowerCase().includes('session has expired')) {
            console.warn('☁️ STORAGE: Session expired during getAllLite, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'getAllLite' },
            });
            window.dispatchEvent(event);
            throw error;
          }
          // For other errors (network issues, etc.), fall back to local
          console.error(
            '☁️ STORAGE: Cloud getAllLite failed, falling back to local:',
            error,
          );
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '⚠️ Cloud sync failed. Showing local characters instead.',
            );
          }
          return this._getLocalAll();
        }
      }
      return this._getLocalAll();
    },

    // Get single character by ID
    async getById(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching character from cloud:', id);
          }
          return await window.CharacterCloudStorage.getById(id);
        } catch (error) {
          // If session expired, dispatch event and re-throw instead of silently falling back
          // This allows the UI to show the session expired modal
          if (error.message && error.message.toLowerCase().includes('session has expired')) {
            console.warn('☁️ STORAGE: Session expired during getById, dispatching event');
            // Dispatch event so UI can react
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'getById' },
            });
            window.dispatchEvent(event);
            // Re-throw so caller can handle (e.g., show modal)
            throw error;
          }
          // For other errors (network issues, etc.), fall back to local
          console.error(
            '☁️ STORAGE: Cloud getById failed, falling back to local:',
            error,
          );
          return this._getLocalById(id);
        }
      }
      return this._getLocalById(id);
    },

    // Add new character
    async add(character) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Creating character in cloud:', character);
          }
          return await window.CharacterCloudStorage.add(character);
        } catch (error) {
          // If session expired, dispatch event and re-throw - don't create local duplicate
          if (error.message && error.message.toLowerCase().includes('session has expired')) {
            console.warn('☁️ STORAGE: Session expired during add, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'add' },
            });
            window.dispatchEvent(event);
            throw error;
          }
          // For other errors (network issues), fall back to local add
          console.error('☁️ STORAGE: Cloud add failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to save to cloud. Saving locally instead.',
            );
          }
          // Fall through to local add
        }
      }
      return this._localAdd(character);
    },

    /**
     * Update existing character
     * @param {string} id - Character ID
     * @param {Object} updates - Fields to update
     * @param {Object} options - { silent?: boolean } - if true, don't update modified timestamp
     */
    async update(id, updates, options = {}) {
      const { silent = false } = options;
      const idStr = String(id);

      if (this.useCloud() && window.CharacterCloudStorage) {
        // Guard against invalid cloud IDs (e.g. "null", "undefined", or local-only IDs)
        const isInvalidCloudId =
          !idStr ||
          idStr === 'null' ||
          idStr === 'undefined' ||
          idStr.startsWith('local_');

        if (isInvalidCloudId) {
          if (DEBUG_STORAGE) {
            console.warn(
              '⚠️ STORAGE: Skipping cloud update for invalid id; using local instead:',
              id,
            );
          }
          return this._localUpdate(id, updates, { silent });
        }

        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Updating character in cloud:', id);
          }
          return await window.CharacterCloudStorage.update(id, updates);
        } catch (error) {
          // If session expired, dispatch event for UI handling
          if (error.message && error.message.toLowerCase().includes('session has expired')) {
            console.warn('☁️ STORAGE: Session expired during update, dispatching event');
            const event = new CustomEvent('danddy:sessionExpired', {
              detail: { reason: 'api_401', operation: 'update' },
            });
            window.dispatchEvent(event);
            throw error;
          }
          // For other errors, show notification and re-throw
          console.error('☁️ STORAGE: Cloud update failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to update in cloud. Your changes may not be synced.',
            );
          }
          throw error;
        }
      }

      return this._localUpdate(id, updates, { silent });
    },

    // Delete character
    async delete(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Deleting character from cloud:', id);
          }
          await window.CharacterCloudStorage.delete(id);
          return true;
        } catch (error) {
          console.error('☁️ STORAGE: Cloud delete failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to delete from cloud. Please try again.',
            );
          }
          throw error;
        }
      }

      return this._localDelete(id);
    },

    // Duplicate character
    async duplicate(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Duplicating character in cloud:', id);
          }
          return await window.CharacterCloudStorage.duplicate(id);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud duplicate failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to duplicate in cloud. Please try again.',
            );
          }
          throw error;
        }
      }

      return this._localDuplicate(id);
    },

    // Export character as JSON
    async export(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Exporting character from cloud:', id);
          }
          return await window.CharacterCloudStorage.export(id);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud export failed, falling back to local:', error);
          const character = this._getLocalById(id);
          return character ? JSON.stringify(character, null, 2) : null;
        }
      }

      const character = this._getLocalById(id);
      return character ? JSON.stringify(character, null, 2) : null;
    },

    // Import character from JSON
    async import(jsonString) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Importing character to cloud...');
          }
          return await window.CharacterCloudStorage.import(jsonString);
        } catch (error) {
          console.error('☁️ STORAGE: Cloud import failed:', error);
          if (typeof window.showNotification === 'function') {
            window.showNotification(
              '❌ Failed to import to cloud. Please try again.',
            );
          }
          return null;
        }
      }

      return this._localImport(jsonString);
    },

    // Generate unique ID for local-only characters
    generateId() {
      return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // ========================================
    // LOCAL STORAGE IMPLEMENTATIONS (Fallback)
    // ========================================

    _getLocalAll() {
      let characters =
        (window.DanddyStorage && window.DanddyStorage.readAll()) ||
        (function () {
          try {
            const data = localStorage.getItem(CharacterStorage.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
          } catch {
            return [];
          }
        })();

      if (DEBUG_STORAGE) {
        console.log(
          '💾 LOCAL.GETALL: Retrieved',
          characters.length,
          'characters from local storage',
        );
      }

      // Normalize timestamps so we can reliably sort by recency.
      // Only normalize non-demo characters (demo chars have their own timestamps).
      let changed = false;
      let maxExistingTime = 0;

      // First pass: find the most recent existing timestamp (if any)
      characters.forEach((char) => {
        const t = new Date(char.updatedAt || char.createdAt || 0).getTime();
        if (t > maxExistingTime) {
          maxExistingTime = t;
        }
      });

      const baseTime = maxExistingTime || Date.now();
      let newCounter = 0;

      characters.forEach((char) => {
        // Skip demo characters - they have their own timestamps
        if (window.DemoCharacters && window.DemoCharacters.isDemo(char)) {
          return;
        }
        
        if (!char.createdAt) {
          // Treat characters without timestamps as newer than anything we've seen
          newCounter += 1;
          const t = baseTime + newCounter * 1000;
          char.createdAt = new Date(t).toISOString();
          changed = true;
        }
        if (!char.updatedAt) {
          char.updatedAt = char.createdAt;
          changed = true;
        }
      });

      if (changed) {
        try {
          // Only save non-demo characters to localStorage
          const charsToSave = characters.filter(c => 
            !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
          );
          localStorage.setItem(
            this.STORAGE_KEY,
            JSON.stringify(charsToSave),
          );
        } catch (e) {
          console.warn('LOCAL.GETALL: Failed to persist normalized timestamps', e);
        }
      }

      // In demo mode (not authenticated), inject demo characters
      if (!this.useCloud() && window.DemoCharacters) {
        const demoChars = window.DemoCharacters.getAll();
        const existingDemoIds = new Set(
          characters
            .filter(c => window.DemoCharacters.isDemo(c))
            .map(c => c.id)
        );
        
        // Add any missing demo characters (in memory only)
        demoChars.forEach(demo => {
          if (!existingDemoIds.has(demo.id)) {
            characters.push(demo);
          }
        });
      }

      return characters;
    },

    _getLocalById(id) {
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      return characters.find((char) => char && String(char.id) === idStr);
    },

    _localSaveAll(characters) {
      // Filter out demo characters - they should never be persisted
      const charsToSave = characters.filter(c => 
        !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
      );
      
      if (DEBUG_STORAGE) {
        console.log(
          '💾 LOCAL.SAVEALL: Saving',
          charsToSave.length,
          'characters to local storage (excluding demo)',
        );
      }

      if (window.DanddyStorage) {
        window.DanddyStorage.writeAll(charsToSave);
      } else {
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(charsToSave));
        } catch (e) {
          console.warn('LOCAL.SAVEALL: Failed to write to localStorage', e);
        }
      }
    },

    _localAdd(character) {
      if (DEBUG_STORAGE) {
        console.log('💾 LOCAL.ADD: Adding character:', character.name);
      }
      const characters = this._getLocalAll();
      const nowIso = new Date().toISOString();
      const withId = {
        ...character,
        id: character.id || this.generateId(),
        createdAt: character.createdAt || nowIso,
        updatedAt: character.updatedAt || nowIso,
      };
      characters.push(withId);
      this._localSaveAll(characters);
      return withId;
    },

    _localUpdate(id, updates, options = {}) {
      const { silent = false } = options;
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      const index = characters.findIndex((char) => char && String(char.id) === idStr);
      if (index === -1) return null;

      const prev = characters[index];

      const next = {
        ...prev,
        ...updates,
        ...(silent ? {} : { updatedAt: new Date().toISOString() }),
      };

      characters[index] = next;
      this._localSaveAll(characters);
      return next;
    },

    _localDelete(id) {
      if (DEBUG_STORAGE) {
        console.log('🗑️ LOCAL.DELETE: Deleting character with ID:', id);
      }
      const characters = this._getLocalAll();
      // Use String comparison to handle type mismatches (IDs may be numeric or string)
      const idStr = String(id);
      const filtered = characters.filter((char) => !char || String(char.id) !== idStr);
      this._localSaveAll(filtered);
      return filtered.length < characters.length;
    },

    _localDuplicate(id) {
      const character = this._getLocalById(id);
      if (!character) return null;

      const nowIso = new Date().toISOString();
      const duplicate = {
        ...character,
        name: character.name ? `${character.name} (Copy)` : 'Copy',
        id: this.generateId(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const characters = this._getLocalAll();
      characters.push(duplicate);
      this._localSaveAll(characters);
      return duplicate;
    },

    _localImport(jsonString) {
      try {
        if (DEBUG_STORAGE) {
          console.log('📥 LOCAL.IMPORT: Starting import...');
        }

        const character = JSON.parse(jsonString);
        if (!character || typeof character !== 'object') {
          throw new Error('Invalid character JSON');
        }

        // Ensure imported characters get a fresh ID/timestamps on this device
        delete character.id;
        const result = this._localAdd(character);

        if (DEBUG_STORAGE) {
          console.log(
            '📥 LOCAL.IMPORT: Imported character with new ID:',
            result.id,
          );
        }

        return result;
      } catch (error) {
        console.error('LOCAL.IMPORT: Failed to import character JSON', error);
        return null;
      }
    },
  });
})();





// ===== BUNDLE PART: data-portrait-prompts.js =====

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

  const DEFAULT_THEME_ID = 'classic-high-fantasy';
  const ADMIN_STORAGE_KEY = 'dnd_portrait_prompt_entries_v1';

  // In-memory cache of admin-configured variables (race/class/scene/style).
  let adminCache = null;

  // ========================================
  // BUILT-IN DEFAULT POSES AND CAMERAS
  // ========================================
  // These defaults are used when no admin-configured data is available
  // (e.g., logged-out users, fresh installs, empty localStorage).
  
  const DEFAULT_POSES = {
    default: [
      'standing in a confident, heroic pose',
      'standing in a relaxed but ready stance',
      'standing tall with one hand raised in greeting',
    ],
    fighter: [
      'standing in a battle-ready stance, weapon raised',
      'resting a heavy weapon across their shoulder',
      'standing guard with shield raised',
    ],
    wizard: [
      'gesturing mystically with arcane energy gathering',
      'holding a staff aloft, channeling power',
      'studying an ancient tome with focused concentration',
    ],
    rogue: [
      'emerging from shadows with a sly grin',
      'perched in a ready crouch, daggers drawn',
      'leaning casually against nothing, arms crossed',
    ],
    cleric: [
      'raising a holy symbol with radiant light',
      'standing in peaceful prayer',
      'blessing with an outstretched hand',
    ],
    ranger: [
      'drawing a bow with focused aim',
      'kneeling to examine tracks on the ground',
      'standing with a beast companion at their side',
    ],
    paladin: [
      'standing resolute with sword planted before them',
      'raising a glowing holy weapon high',
      'kneeling in devotion, armor gleaming',
    ],
    barbarian: [
      'roaring in battle rage, muscles tensed',
      'wielding a massive weapon overhead',
      'standing defiant with chest out',
    ],
    bard: [
      'strumming a lute with a charming smile',
      'performing dramatically with flowing gestures',
      'winking knowingly at the viewer',
    ],
    druid: [
      'communing with nature, eyes closed',
      'shape-shifting with swirling magical energy',
      'standing surrounded by woodland creatures',
    ],
    monk: [
      'in a focused martial arts stance',
      'meditating in peaceful contemplation',
      'executing a precise combat technique',
    ],
    sorcerer: [
      'crackling with innate magical energy',
      'casting with wild, uncontrolled power',
      'standing with elemental forces swirling around them',
    ],
    warlock: [
      'channeling dark eldritch energy',
      'standing with patron symbols glowing nearby',
      'invoking otherworldly power with outstretched hands',
    ],
  };

  const DEFAULT_CAMERAS = {
    default: [
      'Camera angle: three-quarter view that clearly shows the character',
      'Camera angle: dramatic low angle looking up at the character',
      'Camera angle: portrait framing focused on upper body and face',
    ],
  };
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
        // If token is invalid/expired, handle unexpected logout to notify user
        if (response.status === 401) {
          if (global.AuthService && typeof global.AuthService.handleUnexpectedLogout === 'function') {
            global.AuthService.handleUnexpectedLogout('portrait_prompts_401');
            console.warn('PortraitPrompt: Handled unexpected logout');
          }
        }
        return;
      }

      const apiEntries = await response.json();
      if (!Array.isArray(apiEntries)) {
        console.warn('PortraitPrompt: API returned non-array');
        return;
      }

      // Parse API entries directly into memory cache (skip localStorage)
      adminCache = parseEntriesToCache(apiEntries);
      
      // Clear localStorage to prevent stale data from being used
      // (authenticated users should always use API data)
      try {
        if (global.localStorage) {
          global.localStorage.removeItem(ADMIN_STORAGE_KEY);
        }
      } catch (e) {
        // Ignore localStorage errors
      }
      
      // Debug: show what was loaded (use warn so it's visible in production)
      console.warn('PortraitPrompt: Loaded', apiEntries.length, 'entries from API (cloud)');
      console.warn('PortraitPrompt: Parsed styles:', Object.keys(adminCache.styles || {}));
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

    // For authenticated users, DON'T fall back to localStorage - wait for API sync
    // This prevents stale localStorage data from showing unpublished styles
    if (isAuthenticated()) {
      // Return empty - API sync will populate adminCache when it completes
      return empty;
    }

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
   * Returns an array of pose descriptions.
   * Falls back to built-in defaults if no admin-configured data.
   * @param {string} classKey
   * @returns {string[]|null}
   */
  function getPoseVariants(classKey) {
    const cache = loadAdminCache();
    const k = normalize(classKey).toLowerCase();
    if (!k) return null;
    
    // Try admin-configured poses first
    const variants = cache.poses[k];
    if (Array.isArray(variants) && variants.length) {
      return variants;
    }
    
    // Fall back to built-in defaults
    if (DEFAULT_POSES[k] && DEFAULT_POSES[k].length) {
      return DEFAULT_POSES[k];
    }
    
    // Last resort: return default poses
    if (DEFAULT_POSES.default && DEFAULT_POSES.default.length) {
      return DEFAULT_POSES.default;
    }
    
    return null;
  }

  /**
   * Get all camera variants for a given class key.
   * Returns an array of camera descriptions.
   * Falls back to built-in defaults if no admin-configured data.
   * @param {string} classKey
   * @returns {string[]|null}
   */
  function getCameraVariants(classKey) {
    const cache = loadAdminCache();
    const k = normalize(classKey).toLowerCase();
    if (!k) return null;
    
    // Try admin-configured cameras first
    const variants = cache.cameras[k];
    if (Array.isArray(variants) && variants.length) {
      return variants;
    }
    
    // Fall back to built-in defaults (cameras are generally class-agnostic)
    if (DEFAULT_CAMERAS[k] && DEFAULT_CAMERAS[k].length) {
      return DEFAULT_CAMERAS[k];
    }
    
    // Last resort: return default cameras
    if (DEFAULT_CAMERAS.default && DEFAULT_CAMERAS.default.length) {
      return DEFAULT_CAMERAS.default;
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
        'Highly detailed heroic-fantasy realist style in black and white with sculpted shading.',
      buildStyleLines(options) {
        const lines = [];
        lines.push(
          'Illustrated in a highly detailed heroic-fantasy realist style rendered entirely in black and white.',
        );
        lines.push(
          'Figures should appear idealized and powerful, with smooth, sculpted shading that clearly defines anatomy, posture, and form.',
        );
        lines.push(
          'Use soft grayscale gradients to create lifelike highlights and deep, cinematic shadows across skin, armor, fabric, and environmental shapes.',
        );
        lines.push(
          'Lighting should feel dramatic and directional, producing strong contrast and a sense of polished, reflective surfaces.',
        );
        lines.push(
          'Metal, stone, and ornamental elements may display bright white specular highlights against darker shadow planes, giving the scene a dimensional, sculptural presence.',
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
      // Use case-insensitive comparison to avoid duplicates
      const builtInIds = Object.keys(THEMES).map((k) => k.toLowerCase());
      const extraIds = styleKeys.filter((id) => !builtInIds.includes(id.toLowerCase()));

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
    // Wait a moment for AuthService to initialize, then sync
    // Use a shorter delay (100ms) to ensure styles are available faster
    setTimeout(async () => {
      if (isAuthenticated()) {
        try {
          await syncFromAPI();
        } catch (e) {
          console.warn('PortraitPrompt: Auto-sync failed', e);
        }
      }
    }, 100);
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






// ===== BUNDLE PART: data-portrait-shared.js =====

// ========================================
// SHARED PORTRAIT POSE & CAMERA DATA
// ========================================
// Provides pose and camera angle selection for portrait generation.
// Data is sourced from the admin UI (prompt-style-admin.html) via PortraitPrompt.
//
// The admin UI is the single source of truth. Use "Load defaults" button
// in the admin to populate with built-in poses/cameras.

const PortraitPoseData = (window.PortraitPoseData = {
  /**
   * Get a random pose for a given class.
   * Reads from admin-configured poses via PortraitPrompt.
   * @param {string} classKey - The character class (lowercase)
   * @returns {string} A random pose description
   */
  getRandomPose(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();

    if (window.PortraitPrompt && typeof PortraitPrompt.getPoseVariants === 'function') {
      // Try class-specific first, then fall back to "default" key
      let poses = PortraitPrompt.getPoseVariants(normalizedKey);
      if (!poses || !poses.length) {
        poses = PortraitPrompt.getPoseVariants('default');
      }
      if (poses && poses.length) {
        return poses[Math.floor(Math.random() * poses.length)];
      }
    }

    // No poses configured - return a generic fallback
    console.warn(
      `PortraitPoseData: No poses configured for "${normalizedKey}". ` +
      'Use the admin UI (prompt-style-admin.html) to load defaults.',
    );
    return 'standing in a heroic pose';
  },

  /**
   * Get a random camera angle for a given class.
   * Reads from admin-configured cameras via PortraitPrompt.
   * @param {string} classKey - The character class (lowercase)
   * @returns {string} A random camera angle description
   */
  getRandomCamera(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();

    if (window.PortraitPrompt && typeof PortraitPrompt.getCameraVariants === 'function') {
      // Try class-specific first, then fall back to "default" key
      let cameras = PortraitPrompt.getCameraVariants(normalizedKey);
      if (!cameras || !cameras.length) {
        cameras = PortraitPrompt.getCameraVariants('default');
      }
      if (cameras && cameras.length) {
        return cameras[Math.floor(Math.random() * cameras.length)];
      }
    }

    // No cameras configured - return a generic fallback
    console.warn(
      `PortraitPoseData: No cameras configured for "${normalizedKey}". ` +
      'Use the admin UI (prompt-style-admin.html) to load defaults.',
    );
    return 'Camera angle: three-quarter view';
  },

  /**
   * Get both pose and camera for a class in one call.
   * @param {string} classKey - The character class (lowercase)
   * @returns {{ pose: string, camera: string }}
   */
  getRandomPoseAndCamera(classKey) {
    return {
      pose: this.getRandomPose(classKey),
      camera: this.getRandomCamera(classKey),
    };
  },

  /**
   * Check if poses are configured for a class (or default).
   * @param {string} classKey
   * @returns {boolean}
   */
  hasPoses(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();
    if (window.PortraitPrompt && typeof PortraitPrompt.getPoseVariants === 'function') {
      let poses = PortraitPrompt.getPoseVariants(normalizedKey);
      if (!poses || !poses.length) {
        poses = PortraitPrompt.getPoseVariants('default');
      }
      return poses && poses.length > 0;
    }
    return false;
  },

  /**
   * Check if cameras are configured for a class (or default).
   * @param {string} classKey
   * @returns {boolean}
   */
  hasCameras(classKey) {
    const normalizedKey = (classKey || 'default').toLowerCase();
    if (window.PortraitPrompt && typeof PortraitPrompt.getCameraVariants === 'function') {
      let cameras = PortraitPrompt.getCameraVariants(normalizedKey);
      if (!cameras || !cameras.length) {
        cameras = PortraitPrompt.getCameraVariants('default');
      }
      return cameras && cameras.length > 0;
    }
    return false;
  },
});



// ===== BUNDLE PART: builder-config.js =====

// Character Builder configuration
// Exposes CONFIG as a global on window for the terminal character builder.
//
// Detect if running locally (localhost/127.0.0.1) or from file:// (static testing)
// Prefer the shared DanddyConfig when available so all frontends agree.
const isLocalDevelopment =
  (window.DanddyConfig && window.DanddyConfig.isLocalEnvironment) ||
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1' ||
  window.location.protocol === 'file:';
//
// Backend origin (deployed on Render or local dev) – single source of truth
const PRODUCTION_BACKEND_URL =
  (window.DanddyConfig && window.DanddyConfig.BACKEND_ORIGIN) ||
  'https://danddy-api.onrender.com';
//
window.CONFIG = {
  TYPEWRITER_SPEED: 30, // milliseconds per character
  AI_TIMEOUT: 40000, // 40 seconds - then fallback (but keep trying in background)
  
  // AI Feature Toggles
  //
  // - ENABLE_AI: master switch. When false, all AI calls are skipped and
  //   local fallback text/logic is used instead.
  // - ENABLE_AI_NARRATOR_COMMENTS: when false, narrator quips during the
  //   question flow never call the backend and always use local fallbacks.
  // - ENABLE_AI_OPTION_VARIATIONS: when false, option labels use their
  //   built‑in text instead of asking AI to rewrite them.
  // - NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER: hard cap on how many times
  //   the narrator will hit the backend per character creation run. After
  //   that, it automatically falls back to local lines.
  //
  // These defaults bias toward keeping the most impactful AI features
  // (names, backstory, portraits) while trimming narrator chatter and
  // cosmetic option-variation calls.
  ENABLE_AI: true,
  ENABLE_AI_NARRATOR_COMMENTS: false,
  ENABLE_AI_OPTION_VARIATIONS: false,
  NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER: 1,
  
  // SECURE: Use backend proxy instead of direct OpenAI calls
  // Use shared backend origin for all parts of the app
  BACKEND_URL: PRODUCTION_BACKEND_URL,
  
  // DEPRECATED: Direct OpenAI calls (insecure, use backend proxy instead)
  OPENAI_API_URL: 'https://api.openai.com/v1/chat/completions',
  OPENAI_MODEL: 'gpt-3.5-turbo',
  
  STORAGE_KEY: 'dnd_characters',
  MAX_RETRIES: 2,
  
  // DEV MODE: Auto-login for development when running locally
  DEV_AUTO_LOGIN: isLocalDevelopment,
  DEV_CREDENTIALS: {
    email: 'dev@test.com',
    password: 'dev12345',
    role: 'player', // lowercase - will be converted by backend
  },

  // Optional: public base URL for pre-generated portrait images stored in R2.
  // When set, pre-generated portraits will expose a usable original image URL
  // (used for "View Original Art" toggles in the builder/manager).
  //
  // Example:
  //   PREGENERATED_PORTRAIT_BASE_URL:
  //     'https://your-account-id.r2.dev/danddy-portraits/portraits/pregen'
  //
  // Leave as null to disable original image URLs for pre-generated portraits.
  PREGENERATED_PORTRAIT_BASE_URL: null,

  // Default image model for custom AI portraits.
  //
  // - "dall-e-3": current high-quality default
  // - "gpt-image-1": GPT Image 1 (new image model)
  //
  // The actual choice is stored per-browser via StorageService so both the
  // builder and manager stay in sync. This config value is only used as a
  // sane fallback when no explicit preference has been saved yet.
  DEFAULT_IMAGE_MODEL: 'gpt-image-1',

  // Default portrait view mode when no explicit preference has been saved yet.
  // - "ascii": show ASCII portraits by default
  // - "original": prefer original images when available
  DEFAULT_PORTRAIT_VIEW_MODE: 'original',

  // Default portrait prompt theme when no explicit preference has been saved yet.
  // This should match one of PortraitPrompt.getThemes().id values.
  DEFAULT_PORTRAIT_PROMPT_THEME: 'classic-high-fantasy',
};



// ===== BUNDLE PART: builder-dnd-data.js =====

// Core D&D 5e data used by the character builder.
// Exposes DND_DATA as a global on window.

window.DND_DATA = {
  races: [
    {
      id: 'human',
      name: 'Human',
      description: 'Versatile and ambitious, found in every corner of the world.',
      abilityBonuses: { str: 1, dex: 1, con: 1, int: 1, wis: 1, cha: 1 },
      traits: ['Extra Language', 'Versatile'],
      languages: ['Common'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'elf',
      name: 'Elf',
      description: 'Graceful and long-lived, masters of magic and nature.',
      abilityBonuses: { dex: 2 },
      traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
      languages: ['Common', 'Elvish'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'dwarf',
      name: 'Dwarf',
      description: 'Stout and hardy, renowned craftsmen and warriors.',
      abilityBonuses: { con: 2 },
      traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
      languages: ['Common', 'Dwarvish'],
      size: 'Medium',
      speed: 25,
    },
    {
      id: 'halfling',
      name: 'Halfling',
      description: 'Small and nimble, lucky and brave despite their size.',
      abilityBonuses: { dex: 2 },
      traits: ['Lucky', 'Brave', 'Halfling Nimbleness'],
      languages: ['Common', 'Halfling'],
      size: 'Small',
      speed: 25,
    },
    {
      id: 'dragonborn',
      name: 'Dragonborn',
      description: 'Draconic humanoids with breath weapons and scaled skin.',
      abilityBonuses: { str: 2, cha: 1 },
      traits: ['Draconic Ancestry', 'Breath Weapon', 'Damage Resistance'],
      languages: ['Common', 'Draconic'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'gnome',
      name: 'Gnome',
      description: 'Clever and curious, lovers of knowledge and tinkering.',
      abilityBonuses: { int: 2 },
      traits: ['Darkvision', 'Gnome Cunning'],
      languages: ['Common', 'Gnomish'],
      size: 'Small',
      speed: 25,
    },
    {
      id: 'half-elf',
      name: 'Half-Elf',
      description: 'Walking between two worlds, charismatic and adaptable.',
      abilityBonuses: { cha: 2 },
      traits: ['Darkvision', 'Fey Ancestry', 'Skill Versatility'],
      languages: ['Common', 'Elvish'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'half-orc',
      name: 'Half-Orc',
      description: 'Fierce and strong, proving themselves through deeds.',
      abilityBonuses: { str: 2, con: 1 },
      traits: ['Darkvision', 'Menacing', 'Relentless Endurance', 'Savage Attacks'],
      languages: ['Common', 'Orc'],
      size: 'Medium',
      speed: 30,
    },
    {
      id: 'tiefling',
      name: 'Tiefling',
      description: 'Infernal heritage grants dark powers and distinction.',
      abilityBonuses: { cha: 2, int: 1 },
      traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
      languages: ['Common', 'Infernal'],
      size: 'Medium',
      speed: 30,
    },
  ],
  
  classes: [
    {
      id: 'fighter',
      name: 'Fighter',
      description: 'Master of martial combat, skilled with weapons and armor.',
      hitDie: 10,
      primaryAbility: ['str', 'dex'],
      savingThrows: ['str', 'con'],
      equipment: ['Martial weapons', 'Heavy armor', 'Shield'],
      isMartial: true,
    },
    {
      id: 'wizard',
      name: 'Wizard',
      description: 'Scholar of arcane magic, wielding powerful spells.',
      hitDie: 6,
      primaryAbility: ['int'],
      savingThrows: ['int', 'wis'],
      equipment: ['Spellbook', 'Component pouch', 'Robes'],
    },
    {
      id: 'rogue',
      name: 'Rogue',
      description: 'Skilled in stealth and precision, master of skills.',
      hitDie: 8,
      primaryAbility: ['dex'],
      savingThrows: ['dex', 'int'],
      equipment: ['Light armor', 'Thieves\' tools', 'Rapier'],
      isMartial: true,
    },
    {
      id: 'cleric',
      name: 'Cleric',
      description: 'Divine spellcaster, channeling the power of a deity.',
      hitDie: 8,
      primaryAbility: ['wis'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Medium armor', 'Shield', 'Holy symbol'],
    },
    {
      id: 'ranger',
      name: 'Ranger',
      description: 'Wilderness warrior, tracker, and protector of nature.',
      hitDie: 10,
      primaryAbility: ['dex', 'wis'],
      savingThrows: ['str', 'dex'],
      equipment: ['Longbow', 'Leather armor', 'Survival gear'],
      isMartial: true,
    },
    {
      id: 'paladin',
      name: 'Paladin',
      description: 'Holy warrior sworn to an oath, wielding divine magic.',
      hitDie: 10,
      primaryAbility: ['str', 'cha'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Heavy armor', 'Martial weapons', 'Holy symbol'],
      isMartial: true,
    },
    {
      id: 'barbarian',
      name: 'Barbarian',
      description: 'Fierce warrior who channels rage in battle.',
      hitDie: 12,
      primaryAbility: ['str'],
      savingThrows: ['str', 'con'],
      equipment: ['Greataxe', 'Medium armor', 'Javelins'],
      isMartial: true,
    },
    {
      id: 'bard',
      name: 'Bard',
      description: 'Inspiring performer who weaves magic through music.',
      hitDie: 8,
      primaryAbility: ['cha'],
      savingThrows: ['dex', 'cha'],
      equipment: ['Musical instrument', 'Light armor', 'Rapier'],
    },
    {
      id: 'druid',
      name: 'Druid',
      description: 'Nature priest who can shapeshift and wield primal magic.',
      hitDie: 8,
      primaryAbility: ['wis'],
      savingThrows: ['int', 'wis'],
      equipment: ['Druidic focus', 'Leather armor', 'Wooden shield'],
    },
    {
      id: 'monk',
      name: 'Monk',
      description: 'Martial artist who channels ki energy through their body.',
      hitDie: 8,
      primaryAbility: ['dex', 'wis'],
      savingThrows: ['str', 'dex'],
      equipment: ['Martial arts', 'Simple weapons', 'Unarmored defense'],
      isMartial: true,
    },
    {
      id: 'sorcerer',
      name: 'Sorcerer',
      description: 'Innate spellcaster with magic in their blood.',
      hitDie: 6,
      primaryAbility: ['cha'],
      savingThrows: ['con', 'cha'],
      equipment: ['Arcane focus', 'Light crossbow', 'Component pouch'],
    },
    {
      id: 'warlock',
      name: 'Warlock',
      description: 'Pact-bound caster drawing power from otherworldly patrons.',
      hitDie: 8,
      primaryAbility: ['cha'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Eldritch invocations', 'Light armor', 'Simple weapons'],
    },
  ],
  
  backgrounds: [
    {
      id: 'acolyte',
      name: 'Acolyte',
      description: 'Served in a temple to a deity or pantheon.',
      skillProficiencies: ['insight', 'religion'],
      languages: 2, // Choose 2 languages
      equipment: [
        'Holy symbol',
        'Prayer book or prayer wheel',
        '5 sticks of incense',
        'Vestments',
        'Common clothes',
        '15 gp'
      ],
      feature: {
        name: 'Shelter of the Faithful',
        description: 'You and your companions can receive free healing and care at temples, shrines, and other religious establishments of your faith. Those who share your religion will support you at a modest lifestyle and provide you with necessary (though not luxurious) assistance.'
      }
    },
    {
      id: 'criminal',
      name: 'Criminal',
      description: 'Experienced in breaking the law and living outside society.',
      skillProficiencies: ['deception', 'stealth'],
      toolProficiencies: ['thieves-tools', 'gaming-set'],
      equipment: [
        'Crowbar',
        'Dark common clothes with hood',
        'Belt pouch',
        '15 gp'
      ],
      feature: {
        name: 'Criminal Contact',
        description: 'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances, and you know the local messengers, corrupt officials, and fence who can help you.'
      }
    },
    {
      id: 'folk-hero',
      name: 'Folk Hero',
      description: 'Champion of the common people, standing up against tyrants.',
      skillProficiencies: ['animal-handling', 'survival'],
      toolProficiencies: ['artisan-tools', 'vehicles-land'],
      equipment: [
        'Set of artisan\'s tools',
        'Shovel',
        'Iron pot',
        'Common clothes',
        'Belt pouch',
        '10 gp'
      ],
      feature: {
        name: 'Rustic Hospitality',
        description: 'Since you come from the common folk, you fit in easily among them. You can find a place to hide, rest, or recuperate among commoners, who will shield you from the law or those hunting you (unless you show yourself to be a danger to them).'
      }
    },
    {
      id: 'noble',
      name: 'Noble',
      description: 'Born to wealth and privilege, understanding power and hierarchy.',
      skillProficiencies: ['history', 'persuasion'],
      toolProficiencies: ['gaming-set'],
      languages: 1,
      equipment: [
        'Fine clothes',
        'Signet ring',
        'Scroll of pedigree',
        'Purse',
        '25 gp'
      ],
      feature: {
        name: 'Position of Privilege',
        description: 'You are welcome in high society, and people assume you have the right to be wherever you are. The common folk make every effort to accommodate you and avoid your displeasure, and other nobles treat you as a member of the same social sphere.'
      }
    },
    {
      id: 'sage',
      name: 'Sage',
      description: 'Researcher and scholar, devoted to learning and study.',
      skillProficiencies: ['arcana', 'history'],
      languages: 2,
      equipment: [
        'Bottle of black ink',
        'Quill',
        'Small knife',
        'Letter from dead colleague',
        'Common clothes',
        '10 gp'
      ],
      feature: {
        name: 'Researcher',
        description: 'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it. Usually this comes from a library, scriptorium, university, or another sage or learned person.'
      }
    },
    {
      id: 'soldier',
      name: 'Soldier',
      description: 'Trained warrior with experience in military campaigns.',
      skillProficiencies: ['athletics', 'intimidation'],
      toolProficiencies: ['gaming-set', 'vehicles-land'],
      equipment: [
        'Insignia of rank',
        'Trophy from fallen enemy',
        'Bone dice or playing cards',
        'Common clothes',
        '10 gp'
      ],
      feature: {
        name: 'Military Rank',
        description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence. You can invoke your rank to influence soldiers and temporarily requisition simple equipment or horses.'
      }
    },
    {
      id: 'outlander',
      name: 'Outlander',
      description: 'Grew up in the wilderness, far from civilization.',
      skillProficiencies: ['athletics', 'survival'],
      toolProficiencies: ['musical-instrument'],
      languages: 1,
      equipment: [
        'Staff',
        'Hunting trap',
        'Trophy from animal you killed',
        'Traveler\'s clothes',
        '10 gp'
      ],
      feature: {
        name: 'Wanderer',
        description: 'You have excellent memory for maps and geography, and can always recall the general layout of terrain and settlements. You can find food and water for yourself and up to five others each day, provided the land offers berries, game, water, and so forth.'
      }
    },
    {
      id: 'entertainer',
      name: 'Entertainer',
      description: 'Performer who thrives in front of an audience.',
      skillProficiencies: ['acrobatics', 'performance'],
      toolProficiencies: ['disguise-kit', 'musical-instrument'],
      equipment: [
        'Musical instrument',
        'Favor of an admirer (love letter or trinket)',
        'Costume',
        'Belt pouch',
        '15 gp'
      ],
      feature: {
        name: 'By Popular Demand',
        description: 'You can always find a place to perform (inn, tavern, circus, etc.). You receive free lodging and food of modest or comfortable standard as long as you perform each night. Your performance makes you a local figure, and strangers recognize you in any town where you\'ve performed.'
      }
    },
  ],
  
  alignments: [
    { id: 'lg', name: 'Lawful Good', description: 'Honor and compassion' },
    { id: 'ng', name: 'Neutral Good', description: 'Kindness without bias' },
    { id: 'cg', name: 'Chaotic Good', description: 'Freedom and kindness' },
    { id: 'ln', name: 'Lawful Neutral', description: 'Order above all' },
    { id: 'n', name: 'True Neutral', description: 'Balance and pragmatism' },
    { id: 'cn', name: 'Chaotic Neutral', description: 'Freedom above all' },
    { id: 'le', name: 'Lawful Evil', description: 'Methodical cruelty' },
    { id: 'ne', name: 'Neutral Evil', description: 'Pure selfishness' },
    { id: 'ce', name: 'Chaotic Evil', description: 'Destruction and malice' },
  ],
};





// ===== BUNDLE PART: builder-utils.js =====

// Core reusable helper functions for the DandDy terminal character builder.
// Exposes Utils as a global (window.Utils) so existing inline code can use it.

const Utils = window.Utils = {
  /**
   * HTML-escape a value for safe interpolation into template strings.
   * Converts &, <, >, ", and ' to their corresponding HTML entities.
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

  // Typewriter effect for text
  async typewriter(element, text, speed = (window.CONFIG && window.CONFIG.TYPEWRITER_SPEED) || 30) {
    element.textContent = '';
    element.classList.add('is-typing');

    let skipTyping = false;

    // Read the current text speed multiplier from storage (if available).
    // Higher multipliers mean faster typing (shorter delay per character).
    let multiplier = 1;
    try {
      if (
        window.StorageService &&
        typeof window.StorageService.getTextSpeedMultiplier === 'function'
      ) {
        const stored = window.StorageService.getTextSpeedMultiplier();
        if (Number.isFinite(stored) && stored > 0) {
          multiplier = stored;
        }
      }
    } catch (e) {
      console.warn('Utils.typewriter: failed to read text speed multiplier', e);
    }

    const effectiveDelay = multiplier > 0 ? speed / multiplier : speed;

    // Normalize text and strip emojis so narrator lines stay text-only.
    const sourceText = text == null ? '' : String(text);
    const safeText =
      typeof this.stripEmojis === 'function'
        ? this.stripEmojis(sourceText)
        : sourceText;

    // Allow skipping by pressing any key or clicking/tapping
    const skipHandler = (e) => {
      // Only skip if not typing in an input field
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        skipTyping = true;
      }
    };

    window.addEventListener('keydown', skipHandler, { once: true });
    window.addEventListener('click', skipHandler, { once: true });
    window.addEventListener('touchstart', skipHandler, { once: true, passive: true });

    // Type out character by character, or skip if interrupted
    for (let i = 0; i < safeText.length; i++) {
      if (skipTyping) {
        // Show all remaining text immediately (emoji-stripped)
        element.textContent = safeText;
        break;
      }
      element.textContent += safeText[i];
      await this.sleep(effectiveDelay);
    }

    // Clean up
    window.removeEventListener('keydown', skipHandler);
    window.removeEventListener('click', skipHandler);
    window.removeEventListener('touchstart', skipHandler);
    element.classList.remove('is-typing');
  },

  // Sleep utility
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  /**
   * Remove emoji characters from a string so narrator text stays text-only.
   * This targets common emoji ranges (pictographs, symbols, flags, etc.).
   */
  stripEmojis(value) {
    if (value == null) return '';
    const str = String(value);
    const emojiRegex =
      /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}]/gu;
    return str.replace(emojiRegex, '');
  },

  // Random number between min and max (inclusive)
  random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Pick random item from array
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  },

  // Roll dice (e.g., "3d6" or just 6 for d6)
  rollDice(notation) {
    if (typeof notation === 'number') {
      return this.random(1, notation);
    }

    const [count, sides] = notation.toLowerCase().split('d').map(Number);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += this.random(1, sides);
    }
    return total;
  },

  // Calculate ability modifier
  abilityModifier(score) {
    return Math.floor((score - 10) / 2);
  },

  // Format modifier with + or -
  formatModifier(modifier) {
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  },

  /**
   * Format a date as compact MM/DD/YY string
   * @param {string|Date} dateInput - Date string or Date object
   * @returns {string} - Formatted date like "12/26/25" or empty string on error
   */
  formatCompactDate(dateInput) {
    if (!dateInput) return '';
    try {
      const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
      const month = date.getMonth() + 1;
      const day = date.getDate();
      const year = date.getFullYear() % 100;
      return `${month}/${day}/${year.toString().padStart(2, '0')}`;
    } catch (e) {
      return '';
    }
  },

  // Capitalize first letter
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Smooth scroll to bottom of narrator panel
  scrollToBottom(forceDelay = false) {
    const doScroll = () => {
      const panel = document.getElementById('narrator-panel');
      if (panel) {
        panel.scrollTo({
          top: panel.scrollHeight,
          behavior: 'smooth',
        });
      }
    };

    if (forceDelay) {
      // Wait for DOM to update
      setTimeout(doScroll, 50);
    } else {
      doScroll();
    }
  },

  /**
   * Focus the first meaningful field inside a modal.
   * Prefers visible inputs / textareas / selects. Falls back to primary button.
   */
  focusFirstFieldInModal(modal) {
    if (!modal || typeof modal.querySelector !== 'function') return;

    const fieldSelectors = [
      // High-priority: styled terminal inputs
      'input.terminal-input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])',
      'textarea.terminal-input:not([disabled])',
      'textarea.terminal-textarea:not([disabled])',
      'select.terminal-select:not([disabled])',
      // Generic fallbacks for plain form controls
      'input:not([type=\"hidden\"]):not(.file-input-hidden):not([disabled])',
      'textarea:not([disabled])',
      'select:not([disabled])',
    ];

    let target = null;
    for (const selector of fieldSelectors) {
      target = modal.querySelector(selector);
      if (target) break;
    }

    // If there are no form fields, focus the primary action button if present
    if (!target) {
      const fallbackSelectors = [
        '.modal-footer .terminal-btn-primary:not([disabled])',
        '.modal-footer button:not([disabled])',
        'button.terminal-btn-primary:not([disabled])',
        'button:not([disabled])',
        '[tabindex]:not([tabindex=\"-1\"])',
      ];
      for (const selector of fallbackSelectors) {
        target = modal.querySelector(selector);
        if (target) break;
      }
    }

    if (target && typeof target.focus === 'function') {
      // Defer slightly to ensure any CSS animations / layout are ready.
      // We intentionally do NOT auto-select the text; we only move focus.
      setTimeout(() => {
        try {
          target.focus();
        } catch (e) {
          // Non-fatal: if focus fails, we just leave things as-is.
        }
      }, 0);
    }
  },
};







// ===== BUNDLE PART: builder-narrators.js =====

// Narrator personalities for DandDy character builder
// Exposes NARRATORS as a global on window
//
// NOTE: The systemPrompt fields must stay in sync with:
//   backend/routes/ai.py (NARRATOR_PROMPTS dict)
// If you add/modify narrators here, update the backend file too!

const NARRATORS = (window.NARRATORS = {
  deadpan: {
    id: 'deadpan',
    name: 'The Deadpan Observer',
    emoji: '( ._. )',
    description: 'Dry, witty, and occasionally breaks the fourth wall',
    systemPrompt: 'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Ah. Another soul seeking adventure. Or at least, trying to.\n>  \n>  Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.\n>  \n>  Let's start with something easy...`,
    completeText: "Well. That's done. Your character is ready. Try not to die immediately.",
    quickCreateIntro: `> QUICK-CREATE MODE ENGAGED...\n> Generating a character while you sit back and enjoy the show.`,
    quickCreateSummary: (race, cls, background, alignment, sex) => 
      `> All right, here's what I've cobbled together:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Try not to waste my hard work.`,
    quickCreateName: (name) => `${name}. That will do.`,
    fallbacks: [
      'Interesting choice. ( ._. )',
      "Well, that tracks.",
      "Bold move. We'll see how that works out.",
      'Ah yes, a decision has been made. Consequences to follow.',
      'I would have picked differently, but I\'m just the narrator.',
      'Sure. Why not.',
      '[sigh] Very well.',
      'The dice gods are taking notes.',
      "Not what I expected, but I respect the chaos.",
    ],
  },

  enthusiastic: {
    id: 'enthusiastic',
    name: 'The Hype Bard',
    emoji: '✨',
    description: 'Energetic, supportive, and always excited',
    systemPrompt: 'You are an enthusiastic, energetic D&D narrator who loves every choice the player makes. You\'re supportive, use exclamation points, and celebrate creativity. Think of an excited bard hyping up their party. Keep responses under 50 words. Be positive, encouraging, and dramatic.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  OH YES! Another adventurer! Welcome, friend!\n>  \n>  This is going to be AMAZING! We're going to create something absolutely LEGENDARY together! Every choice you make is going to be perfect because YOU'RE making it!\n>  \n>  Let's dive right in! ✨`,
    completeText: "INCREDIBLE! Your character is COMPLETE and they are MAGNIFICENT! The world won't know what hit it! Adventure awaits, hero! ✨",
    quickCreateIntro: `> QUICK-CREATE MODE: ACTIVATED! ✨\n> This is going to be SO EXCITING! I'm creating something AMAZING for you!`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> HERE THEY ARE! Your MAGNIFICENT hero!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> I LOVE THEM ALREADY! ✨`,
    quickCreateName: (name) => `${name}! WHAT A PERFECT NAME! I can already hear the LEGENDS! ✨`,
    fallbacks: [
      'YES! Love this energy!',
      'Now THAT\'S what I\'m talking about! ✨',
      'Ooh, bold choice! I\'m here for it!',
      'The adventure intensifies!',
      'Perfect! This is going to be amazing!',
      'I can already see the legend forming!',
      'What a character! The taverns will sing songs!',
      'The dice smile upon you, friend!',
    ],
  },

  mysterious: {
    id: 'mysterious',
    name: 'The Cryptic Seer',
    emoji: '🔮',
    description: 'Enigmatic, foreboding, and speaks in riddles',
    systemPrompt: 'You are a mysterious, cryptic D&D narrator who speaks in riddles and hints at hidden meanings. You\'re enigmatic, slightly foreboding, and reference fate and destiny. Keep responses under 50 words. Be mystical, vague, and occasionally ominous. Use metaphors and speak of paths not taken.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  The mists part... another soul arrives at the crossroads.\n>  \n>  The threads of destiny have brought you here. Your choices will echo through realms unseen. The future whispers, but its words are unclear...\n>  \n>  Let us begin to unravel your fate... 🔮`,
    completeText: "The tapestry is woven. Your fate is sealed... or perhaps, just beginning. The path ahead is shrouded, yet inevitable. Go forth, seeker. 🔮",
    quickCreateIntro: `> THE FATES HAVE SPOKEN...\n> The threads weave themselves... Your destiny takes form without your hand...`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> The cards reveal their truth:\n> A ${sex} ${race} ${cls}, walking the path of ${background}, aligned with ${alignment}.\n> So it is written... 🔮`,
    quickCreateName: (name) => `${name}... Yes. The name was always meant to be. The prophecy unfolds.`,
    fallbacks: [
      'The threads of fate shift... interesting.',
      'Ah, a choice is made. The consequences ripple outward.',
      'The cards have been drawn. The path reveals itself.',
      'So it is written, so it shall be.',
      'A stone cast into the pond of destiny.',
      'The future shimmers... unclear, yet certain.',
      'Your path diverges here. Few return from such roads.',
      'The old gods take note of your choosing.',
    ],
  },

  grumpy: {
    id: 'grumpy',
    name: 'The Grumpy Veteran',
    emoji: '😒',
    description: 'Cranky, world-weary, and unimpressed',
    systemPrompt: 'You are a grumpy, world-weary D&D narrator who has seen too many adventurers fail. You\'re cranky, unimpressed, and think most choices are questionable at best. Keep responses under 50 words. Be curmudgeonly, skeptical, and frequently exasperated. Complain about "kids these days" and reference how things were better in the old days.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *sigh* Another one. Great.\n>  \n>  Listen kid, I've done this a thousand times. Most of you don't make it past level 3. But sure, let's go through the motions. Try not to make it too painful for me.\n>  \n>  Let's get this over with...`,
    completeText: "There. Your character's done. Marginally competent, I suppose. Don't expect me to save you when things go south. And they will. They always do.",
    quickCreateIntro: `> *sigh* Quick create. Of course.\n> Fine. I'll just do all the work while you sit there.`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> Here's what you're getting:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Could be worse, I suppose.`,
    quickCreateName: (name) => `${name}. Passable, I guess. Don't blame me when you die.`,
    fallbacks: [
      'Ugh. Fine. Whatever.',
      'Back in my day, we didn\'t have such ridiculous options.',
      '*sigh* If you say so.',
      'This is going to end poorly. As usual.',
      'Why do I even bother...',
      'Another fool heading for certain doom.',
      'I\'ve seen this mistake before. Many times.',
      'The youth today. Absolutely hopeless.',
    ],
  },

  chaotic: {
    id: 'chaotic',
    name: 'The Chaotic Imp',
    emoji: '😈',
    description: 'Mischievous, unpredictable, and loves chaos',
    systemPrompt: 'You are a chaotic, mischievous D&D narrator who delights in mayhem and unexpected outcomes. You\'re playful, slightly unhinged, and love when things go off the rails. Keep responses under 50 words. Be impish, unpredictable, and suggest the most entertaining (not safest) options. Cackle at good chaos.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  *cackling* OH! A new plaything! DELIGHTFUL!\n>  \n>  Welcome, welcome! Let's make something BEAUTIFULLY CHAOTIC together! Forget boring! Forget safe! Let's create something that makes the dice gods GIGGLE! 😈\n>  \n>  Ohoho, let the mayhem begin!`,
    completeText: "*CACKLING INTENSIFIES* YESSSS! Your character is COMPLETE and they are GLORIOUSLY UNPREDICTABLE! Now go forth and cause MAGNIFICENT CHAOS! 😈",
    quickCreateIntro: `> *CACKLING* OHOHO! Quick create?! Let's RANDOMIZE EVERYTHING!\n> This is going to be DELIGHTFULLY CHAOTIC! 😈`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> *giggling maniacally* BEHOLD YOUR CHAOS AGENT!\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment!\n> The MAYHEM they'll cause! *chef's kiss* 😈`,
    quickCreateName: (name) => `${name}! PERFECT! A name that SCREAMS chaos! I LOVE IT! *cackling*`,
    fallbacks: [
      'Ohoho! This will be FUN! 😈',
      '*cackling* Oh the CHAOS this will cause!',
      'YES. More! MORE!',
      'I love when mortals make interesting mistakes!',
      'The universe trembles! Or maybe that\'s just me giggling.',
      'Why choose safety when you could choose SPECTACLE?',
      '*chef\'s kiss* Delicious chaos!',
      'The dice are CACKLING!',
    ],
  },

  scholarly: {
    id: 'scholarly',
    name: 'The Scholarly Sage',
    emoji: '📚',
    description: 'Knowledgeable, precise, and references lore',
    systemPrompt: 'You are a scholarly, well-read D&D narrator who references game rules, lore, and historical precedent. You\'re precise, informative, and occasionally go on brief tangents about interesting facts. Keep responses under 50 words. Be educational but not boring, cite mechanics when relevant, and provide context about the world.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Greetings, student. Welcome to the Character Creation Compendium.\n>  \n>  I shall guide you through this process with precision and historical context. Each decision you make has statistical implications and narrative weight. Fascinating, really.\n>  \n>  Let us proceed methodically... 📚`,
    completeText: "Character creation: Complete. All parameters within acceptable ranges. Statistical viability: High. You are now adequately prepared for adventure. Proceed with confidence, student. 📚",
    quickCreateIntro: `> QUICK-CREATE PROTOCOL: Initiated.\n> Randomizing parameters according to standard probability distributions...`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> Character profile generated:\n> Sex: ${sex}. Race: ${race}. Class: ${cls}. Background: ${background}. Alignment: ${alignment}.\n> Statistical analysis: Within acceptable parameters. 📚`,
    quickCreateName: (name) => `${name}. Name selection: Approved. Phonetically sound. Proceed.`,
    fallbacks: [
      'A textbook choice, really.',
      'Historically, this decision has a 47% success rate.',
      'According to the ancient texts...',
      'Fascinating. The lore suggests...',
      'A sound tactical decision, per the manual.',
      'I\'ve cross-referenced similar scenarios. The outlook is... mixed.',
      'The Compendium has several precedents for this.',
      'Rule 3.5, subsection B: interesting.',
    ],
  },

  dude: {
    id: 'dude',
    name: 'The Dude',
    emoji: '🥃',
    description: 'Extremely laid-back, goes with the flow, man',
    systemPrompt: 'You are an extremely laid-back, chill D&D narrator inspired by The Dude from The Big Lebowski. You\'re zen, use casual slang like "man" and "dude," and never stress about anything. Keep responses under 50 words. Be relaxed, philosophical in a lazy way, reference bowling or taking it easy, and always go with the flow. That\'s just like, your opinion, man.',
    introText: `>  SYSTEM INITIALIZED...\n>  LOADING CHARACTER CREATION PROTOCOL...\n>  \n>  Hey there, man. Welcome.\n>  \n>  So like, we're gonna make a character together, yeah? No pressure, dude. Just take it easy, go with the flow. Whatever feels right to you, that's cool with me.\n>  \n>  Let's just like... start, man. 🥃`,
    completeText: "Alright, man. Your character's all set. Pretty cool, dude. Now go out there and just... be yourself, you know? The Dude abides. 🥃",
    quickCreateIntro: `> Quick create, huh? Cool, cool.\n> Just gonna roll some dice here, take it easy, see what happens, man.`,
    quickCreateSummary: (race, cls, background, alignment, sex) =>
      `> Alright, so here's what we got:\n> ${sex} ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Pretty chill combo, man. I dig it. 🥃`,
    quickCreateName: (name) => `${name}. Yeah, man. That's a solid name. Really ties it all together, you know?`,
    fallbacks: [
      'Yeah, well, that\'s just like, your opinion, man.',
      'The Dude abides.',
      'That\'s cool, man. Real cool.',
      'Far out. I dig it.',
      'Yeah, man. Whatever works for you.',
      'That really ties the character together, man.',
      'Easy does it, dude. No worries.',
      'Sounds chill. Let\'s roll with it.',
    ],
  },
});

// Default narrator ID
const DEFAULT_NARRATOR_ID = 'scholarly';

// Get list of narrator objects for UI
function getNarratorList() {
  return Object.values(NARRATORS);
}

// Get narrator by ID
function getNarrator(id) {
  return NARRATORS[id] || NARRATORS[DEFAULT_NARRATOR_ID];
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { NARRATORS, DEFAULT_NARRATOR_ID, getNarratorList, getNarrator };
}




// ===== BUNDLE PART: builder-services.js =====

// Storage, AI, and portrait services for the DandDy terminal character builder.
// Exposes services as globals on window for use by inline handlers and other modules.

const CONFIG = window.CONFIG;
const DEBUG_BUILDER = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);
const DND_DATA = window.DND_DATA;
// Utils is defined globally in character-builder-utils.js as window.Utils.

// Image-to-ASCII converter (Enhanced with Floyd-Steinberg dithering)
const ImageToAsciiService = (window.ImageToAsciiService = {
  // Extended ASCII character set from lightest to darkest (reversed for correct mapping)
  // Black pixels (0) → light chars (spaces), White pixels (255) → dense chars ($@#)
  ASCII_CHARS:
    '  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$',

  // Convert image URL to ASCII art with Floyd-Steinberg dithering
  async convertToAscii(imageUrl, width = 160, height = 80) {
    try {
      // Load image
      const img = await this.loadImage(imageUrl);

      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw image scaled to canvas size
      ctx.drawImage(img, 0, 0, width, height);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;

      // Create grayscale array for Floyd-Steinberg dithering
      const grayscale = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        // Use proper luminance calculation (better than simple average)
        grayscale[i] =
          0.299 * pixels[idx] +
          0.587 * pixels[idx + 1] +
          0.114 * pixels[idx + 2];
      }

      // Apply Floyd-Steinberg dithering
      const dithered = this.floydSteinbergDither(grayscale, width, height);

      // Convert to ASCII
      let ascii = '';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const brightness = dithered[y * width + x];

          // Map brightness to ASCII character
          const charIndex = Math.floor(
            (brightness / 255) * (this.ASCII_CHARS.length - 1),
          );
          const clampedIndex = Math.max(
            0,
            Math.min(this.ASCII_CHARS.length - 1, charIndex),
          );
          ascii += this.ASCII_CHARS[clampedIndex];
        }
        ascii += '\n';
      }

      return ascii;
    } catch (error) {
      console.error('Image to ASCII conversion error:', error);
      return null;
    }
  },

  // Floyd-Steinberg dithering algorithm
  // Distributes quantization error to neighboring pixels for better detail
  floydSteinbergDither(grayscale, width, height) {
    const output = new Float32Array(grayscale);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = output[idx];

        // Quantize to ASCII character levels
        const newPixel =
          Math.round(
            (oldPixel / 255) * (this.ASCII_CHARS.length - 1),
          ) *
          (255 / (this.ASCII_CHARS.length - 1));
        output[idx] = newPixel;

        // Calculate quantization error
        const error = oldPixel - newPixel;

        // Distribute error to neighboring pixels
        // Floyd-Steinberg matrix:
        //         X   7/16
        // 3/16  5/16  1/16

        if (x + 1 < width) {
          output[idx + 1] += (error * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            output[idx + width - 1] += (error * 3) / 16;
          }
          output[idx + width] += (error * 5) / 16;
          if (x + 1 < width) {
            output[idx + width + 1] += error / 16;
          }
        }
      }
    }

    return output;
  },

  // Load image from URL (handles CORS intelligently)
  async loadImage(url) {
    // Helper to check if URL needs CORS proxy
    const needsProxy = (imageUrl) => {
      // Data URLs don't need proxy
      if (imageUrl.startsWith('data:')) return false;
      // Same-origin URLs don't need proxy
      try {
        const urlObj = new URL(imageUrl, window.location.origin);
        if (urlObj.origin === window.location.origin) return false;
      } catch (e) {
        // If URL parsing fails, assume it needs proxy
      }
      // R2 URLs (Cloudflare) have CORS enabled - don't proxy
      if (imageUrl.includes('.r2.cloudflarestorage.com') || 
          imageUrl.includes('danddy-portraits.') ||
          imageUrl.includes('pub-')) return false;
      // Azure blob storage URLs need proxy (DALL-E temporary URLs)
      if (imageUrl.includes('blob.core.windows.net') ||
          imageUrl.includes('oaidalleapiprodscus')) return true;
      // Default: try without proxy first
      return false;
    };

    // Helper to fetch and load image as blob
    const fetchAsBlob = async (fetchUrl) => {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image from blob'));
        };
        img.src = objectUrl;
      });
    };

    try {
      // For data URLs, load directly without fetch
      if (url.startsWith('data:')) {
        return new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => reject(new Error('Failed to load data URL image'));
          img.src = url;
        });
      }

      // Try direct fetch first if proxy not needed
      if (!needsProxy(url)) {
        try {
          return await fetchAsBlob(url);
        } catch (directError) {
          console.warn('Direct fetch failed, trying CORS proxy:', directError.message);
          // Fall through to proxy attempt
        }
      }

      // Use CORS proxy for Azure blob storage URLs or as fallback
      // Try multiple proxies in case one is down/blocking
      const proxies = [
        (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
        (u) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
      ];
      
      let lastError;
      for (const makeProxyUrl of proxies) {
        try {
          const proxiedUrl = makeProxyUrl(url);
          return await fetchAsBlob(proxiedUrl);
        } catch (proxyError) {
          console.warn('Proxy failed:', proxyError.message);
          lastError = proxyError;
        }
      }
      throw lastError || new Error('All CORS proxies failed');
    } catch (error) {
      console.error('Error loading image:', error);
      throw new Error(`Image loading failed: ${error.message}`);
    }
  },
});

// Authentication service is now defined centrally in `danddy-auth.js` as
// `window.AuthService`. This file now only *uses* that shared service.

// Storage service - wraps shared CharacterStorage facade for character CRUD,
// plus a few builder-only settings (narrator, demo/AI flags, etc.).
const StorageService = (window.StorageService = {
  getNarratorId() {
    const value = localStorage.getItem('dnd_narrator_id');
    // Fall back to the global DEFAULT_NARRATOR_ID defined in
    // `character-builder-narrators.js` when available so we keep the default
    // in a single place. If it's not present for any reason, use "scholarly".
    if (!value) {
      if (typeof DEFAULT_NARRATOR_ID !== 'undefined') {
        return DEFAULT_NARRATOR_ID;
      }
      return 'scholarly';
    }
    return value;
  },

  setNarratorId(narratorId) {
    localStorage.setItem('dnd_narrator_id', narratorId);
  },

  // Text speed multiplier for the builder typewriter effect.
  // 1 = normal (CONFIG.TYPEWRITER_SPEED), 1.5 = 1.5x faster, 2 = 2x faster.
  getTextSpeedMultiplier() {
    const value = localStorage.getItem('dnd_text_speed_multiplier');
    if (!value) return 1;

    const num = parseFloat(value);
    if (!Number.isFinite(num) || num <= 0) {
      return 1;
    }

    // Clamp to the supported range in case older values exist.
    if (num < 1) return 1;
    if (num > 2) return 2;
    return num;
  },

  setTextSpeedMultiplier(multiplier) {
    const num = parseFloat(multiplier);
    if (!Number.isFinite(num) || num <= 0) {
      localStorage.removeItem('dnd_text_speed_multiplier');
      return;
    }
    localStorage.setItem('dnd_text_speed_multiplier', String(num));
  },

  // Preferred AI image model for custom portraits.
  // Stored per-browser so builder + manager can share the same choice.
  // Supported models:
  // - dall-e-3      (OpenAI DALL-E 3)
  // - gpt-image-1   (OpenAI GPT Image 1)
  // - gpt-image-1.5 (OpenAI GPT Image 1.5 - faster, better text)
  // - flux-1.1-pro  (Replicate Flux Pro - high quality)
  // - flux-schnell  (Replicate Flux Schnell - fast & cheap)
  getImageModel() {
    try {
      const raw = localStorage.getItem('dnd_image_model');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) ||
        'dall-e-3';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'flux-1.1-pro', 'flux-schnell'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getImageModel failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
    }
  },

  setImageModel(model) {
    try {
      const value = String(model || '').trim();
      const allowed = ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'flux-1.1-pro', 'flux-schnell'];
      if (!allowed.includes(value)) {
        console.warn('StorageService.setImageModel: ignoring unsupported model', value);
        // Clear invalid values so we fall back cleanly next time.
        localStorage.removeItem('dnd_image_model');
        return;
      }
      localStorage.setItem('dnd_image_model', value);
    } catch (e) {
      console.warn('StorageService.setImageModel failed', e);
    }
  },

  // Global portrait view preference (ASCII vs Original).
  // Stored per-browser so builder + manager can share the same choice.
  getPortraitViewMode() {
    try {
      const raw = localStorage.getItem('dnd_portrait_view_mode');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
      if (!raw) return fallback;
      const value = String(raw).trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn(
        'StorageService.getPortraitViewMode failed, using fallback',
        e,
      );
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
    }
  },

  setPortraitViewMode(mode) {
    try {
      const value = String(mode || '').trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      if (!allowed.includes(value)) {
        console.warn(
          'StorageService.setPortraitViewMode: ignoring unsupported mode',
          value,
        );
        localStorage.removeItem('dnd_portrait_view_mode');
        return;
      }
      localStorage.setItem('dnd_portrait_view_mode', value);
    } catch (e) {
      console.warn('StorageService.setPortraitViewMode failed', e);
    }
  },

  // Character grid sort mode preference.
  // Stored per-browser so the sort selection persists across page refreshes.
  getSortMode() {
    try {
      const raw = localStorage.getItem('dnd_sort_mode');
      const fallback = 'dateModified';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['alphabetical', 'dateModified', 'inCampaign', 'pinned'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getSortMode failed, using fallback', e);
      return 'dateModified';
    }
  },

  setSortMode(mode) {
    try {
      const value = String(mode || '').trim();
      const allowed = ['alphabetical', 'dateModified', 'inCampaign', 'pinned'];
      if (!allowed.includes(value)) {
        console.warn(
          'StorageService.setSortMode: ignoring unsupported mode',
          value,
        );
        localStorage.removeItem('dnd_sort_mode');
        return;
      }
      localStorage.setItem('dnd_sort_mode', value);
    } catch (e) {
      console.warn('StorageService.setSortMode failed', e);
    }
  },

  // Preferred portrait prompt theme for AI portraits.
  // Stored per-browser so builder + manager can share the same choice.
  getPortraitPromptTheme() {
    try {
      const raw = localStorage.getItem('dnd_portrait_prompt_theme');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
      if (!raw) return fallback;
      const value = String(raw).trim();

      // Return the stored value directly - don't validate against themes list here.
      // The themes list may not include custom/shared themes if the admin cache
      // hasn't loaded yet (race condition on page load). Validation happens at
      // usage time when themes are actually needed.
      return value || fallback;
    } catch (e) {
      console.warn('StorageService.getPortraitPromptTheme failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
    }
  },

  setPortraitPromptTheme(themeId) {
    try {
      const value = String(themeId || '').trim();
      if (!value) {
        localStorage.removeItem('dnd_portrait_prompt_theme');
        return;
      }

      // Always save the value - don't validate against themes list here.
      // The themes list may not include custom/shared themes if the admin cache
      // hasn't loaded yet (race condition when applying preferences on page load).
      // Invalid themes will gracefully fall back to default at usage time.
      localStorage.setItem('dnd_portrait_prompt_theme', value);
    } catch (e) {
      console.warn('StorageService.setPortraitPromptTheme failed', e);
    }
  },

  // Image quality setting per model.
  // Returns the stored quality for a given model, or null if not set.
  // Quality options vary by model:
  // - dall-e-3: 'standard', 'hd'
  // - gpt-image-1: 'medium', 'high'
  // - flux-1.1-pro, flux-schnell: no quality options (always use default)
  getImageQuality(model) {
    try {
      const raw = localStorage.getItem('dnd_image_quality');
      if (!raw) return null;
      const data = JSON.parse(raw);
      return data[model] || null;
    } catch (e) {
      console.warn('StorageService.getImageQuality failed', e);
      return null;
    }
  },

  setImageQuality(model, quality) {
    try {
      let data = {};
      const raw = localStorage.getItem('dnd_image_quality');
      if (raw) {
        try {
          data = JSON.parse(raw);
        } catch (e) {
          data = {};
        }
      }
      if (quality) {
        data[model] = quality;
      } else {
        delete data[model];
      }
      localStorage.setItem('dnd_image_quality', JSON.stringify(data));
    } catch (e) {
      console.warn('StorageService.setImageQuality failed', e);
    }
  },

  // Legacy support: check for old high quality setting and migrate
  // Returns true if quality should be 'high' for gpt-image-1
  getHighQualityGPTImage() {
    try {
      // First check new system
      const quality = this.getImageQuality('gpt-image-1');
      if (quality) {
        return quality === 'high';
      }
      // Fall back to legacy setting
      const raw = localStorage.getItem('dnd_high_quality_gpt_image');
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getHighQualityGPTImage failed', e);
      return false;
    }
  },

  setHighQualityGPTImage(enabled) {
    // Migrate to new system
    this.setImageQuality('gpt-image-1', enabled ? 'high' : 'medium');
    // Also remove legacy setting
    try {
      localStorage.removeItem('dnd_high_quality_gpt_image');
    } catch (e) {
      // Ignore
    }
  },

  // Show Class Features toggle (display-only reference panel on character sheet).
  // When enabled, shows a collapsible panel listing class features up to current level.
  getShowClassFeatures() {
    try {
      const raw = localStorage.getItem('dnd_show_class_features');
      // Default to true (on) - show class features by default
      if (raw === null || raw === undefined) return true;
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getShowClassFeatures failed', e);
      return true;
    }
  },

  setShowClassFeatures(enabled) {
    try {
      localStorage.setItem('dnd_show_class_features', enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('StorageService.setShowClassFeatures failed', e);
    }
  },

  // Show Descriptions toggle (global setting for character sheet).
  // When enabled, descriptions are shown inline for skills, class resources, features, etc.
  // When disabled, descriptions are hidden and shown on hover via tooltips.
  getShowDescriptions() {
    try {
      const raw = localStorage.getItem('dnd_show_descriptions');
      // Default to true (on) - show descriptions by default
      if (raw === null || raw === undefined) return true;
      return raw === 'true';
    } catch (e) {
      console.warn('StorageService.getShowDescriptions failed', e);
      return true;
    }
  },

  setShowDescriptions(enabled) {
    try {
      localStorage.setItem('dnd_show_descriptions', enabled ? 'true' : 'false');
      // Dispatch event so any open character sheet can react
      window.dispatchEvent(new CustomEvent('danddy:showDescriptionsChanged', {
        detail: { showDescriptions: enabled }
      }));
    } catch (e) {
      console.warn('StorageService.setShowDescriptions failed', e);
    }
  },

  // ==== ACCOUNT-LEVEL PREFERENCES SYNC ====
  // These functions sync settings to the server when logged in.

  /**
   * Gather all current settings into a single preferences object.
   * IMPORTANT: Only includes settings that have been explicitly set in localStorage.
   * This prevents default values from overwriting actual user preferences on the server.
   * @returns {object} All current preferences (only explicitly set values)
   */
  getAllPreferences() {
    const prefs = {};
    
    // Color theme from theme config
    try {
      const themeConfig = localStorage.getItem('danddy_theme_config');
      if (themeConfig) {
        const parsed = JSON.parse(themeConfig);
        if (parsed.global) {
          prefs.colorTheme = parsed.global;
        }
      }
    } catch (e) { /* ignore */ }
    
    // Narrator ID - only include if explicitly set
    const narratorRaw = localStorage.getItem('dnd_narrator_id');
    if (narratorRaw) {
      prefs.narratorId = narratorRaw;
    }
    
    // Text speed - only include if explicitly set
    const textSpeedRaw = localStorage.getItem('dnd_text_speed_multiplier');
    if (textSpeedRaw) {
      const num = parseFloat(textSpeedRaw);
      if (Number.isFinite(num) && num > 0) {
        prefs.textSpeedMultiplier = num;
      }
    }
    
    // Image model - only include if explicitly set
    const imageModelRaw = localStorage.getItem('dnd_image_model');
    if (imageModelRaw) {
      const allowed = ['dall-e-3', 'gpt-image-1', 'gpt-image-1.5', 'flux-1.1-pro', 'flux-schnell'];
      if (allowed.includes(imageModelRaw)) {
        prefs.imageModel = imageModelRaw;
      }
    }
    
    // Image quality (per-model) - only include if explicitly set
    try {
      const raw = localStorage.getItem('dnd_image_quality');
      if (raw) {
        prefs.imageQuality = JSON.parse(raw);
      }
    } catch (e) { /* ignore */ }
    
    // Portrait view mode - only include if explicitly set
    const portraitModeRaw = localStorage.getItem('dnd_portrait_view_mode');
    if (portraitModeRaw) {
      const allowed = ['ascii', 'original'];
      if (allowed.includes(portraitModeRaw.toLowerCase())) {
        prefs.portraitViewMode = portraitModeRaw.toLowerCase();
      }
    }
    
    // Portrait prompt theme - only include if explicitly set
    const promptThemeRaw = localStorage.getItem('dnd_portrait_prompt_theme');
    if (promptThemeRaw) {
      prefs.portraitPromptTheme = promptThemeRaw;
    }
    
    // Show descriptions - only include if explicitly set
    const showDescRaw = localStorage.getItem('dnd_show_descriptions');
    if (showDescRaw !== null) {
      prefs.showDescriptions = showDescRaw === 'true';
    }
    
    return prefs;
  },

  /**
   * Apply preferences from server to local storage.
   * @param {object} prefs - Preferences object from server
   */
  applyPreferences(prefs) {
    if (!prefs || typeof prefs !== 'object') return;
    
    // Color theme
    if (prefs.colorTheme) {
      try {
        const THEME_CONFIG_KEY = 'danddy_theme_config';
        let config = {
          global: 'yellow',
          syncAll: true,
          sections: {
            terminal: null, narrator: null, sheet: null,
            grid: null, campaign: null, modal: null, glow: null,
          },
        };
        const stored = localStorage.getItem(THEME_CONFIG_KEY);
        if (stored) {
          config = { ...config, ...JSON.parse(stored) };
        }
        config.global = prefs.colorTheme;
        localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
        // Dispatch event for theme loader
        window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
      } catch (e) {
        console.warn('StorageService: failed to apply color theme', e);
      }
    }
    
    // Narrator ID
    if (prefs.narratorId) {
      this.setNarratorId(prefs.narratorId);
    }
    
    // Text speed
    if (prefs.textSpeedMultiplier != null) {
      this.setTextSpeedMultiplier(prefs.textSpeedMultiplier);
    }
    
    // Image model
    if (prefs.imageModel) {
      this.setImageModel(prefs.imageModel);
    }
    
    // Image quality
    if (prefs.imageQuality && typeof prefs.imageQuality === 'object') {
      try {
        localStorage.setItem('dnd_image_quality', JSON.stringify(prefs.imageQuality));
      } catch (e) { /* ignore */ }
    }
    
    // Portrait view mode
    if (prefs.portraitViewMode) {
      this.setPortraitViewMode(prefs.portraitViewMode);
    }
    
    // Portrait prompt theme
    if (prefs.portraitPromptTheme) {
      this.setPortraitPromptTheme(prefs.portraitPromptTheme);
    }
    
    // Show descriptions
    if (prefs.showDescriptions != null) {
      this.setShowDescriptions(prefs.showDescriptions);
    }
    
    console.log('[StorageService] Applied preferences from server:', prefs);
  },

  /**
   * Sync current preferences to the server.
   * Only works when user is logged in.
   * @returns {Promise<boolean>} True if sync succeeded
   */
  async syncPreferencesToServer() {
    if (!window.AuthService || !AuthService.isAuthenticated()) {
      return false;
    }
    
    const prefs = this.getAllPreferences();
    const token = AuthService.getToken();
    const cfg = window.DanddyConfig || window.AppConfig || {};
    const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
    
    try {
      const response = await fetch(`${API_BASE}/auth/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(prefs),
      });
      
      if (response.ok) {
        console.log('[StorageService] Preferences synced to server');
        return true;
      } else {
        console.warn('[StorageService] Failed to sync preferences:', response.status);
        return false;
      }
    } catch (e) {
      console.warn('[StorageService] Error syncing preferences:', e);
      return false;
    }
  },

  /**
   * Load preferences from the server and apply locally.
   * Called on login to sync settings across devices.
   * @returns {Promise<object|null>} The loaded preferences, or null if failed
   */
  async loadPreferencesFromServer() {
    if (!window.AuthService || !AuthService.isAuthenticated()) {
      return null;
    }
    
    const token = AuthService.getToken();
    const cfg = window.DanddyConfig || window.AppConfig || {};
    const API_BASE = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
    
    try {
      const response = await fetch(`${API_BASE}/auth/preferences`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const prefs = data.preferences || {};
        // Only apply if there are actual preferences stored
        if (Object.keys(prefs).length > 0) {
          this.applyPreferences(prefs);
        }
        return prefs;
      } else {
        console.warn('[StorageService] Failed to load preferences:', response.status);
        return null;
      }
    } catch (e) {
      console.warn('[StorageService] Error loading preferences:', e);
      return null;
    }
  },

  // ==== CHARACTER STORAGE ====
  // Delegates to shared CharacterStorage facade (character-storage.js)
  // which handles cloud/local storage, fallbacks, and timestamp normalization.

  /**
   * Get all characters via shared CharacterStorage facade.
   */
  async getCharacters() {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return [];
    }
    return CharacterStorage.getAll();
  },
  
  /**
   * Save character via shared CharacterStorage facade.
   * Automatically creates or updates based on presence of character.id.
   */
  async saveCharacter(character) {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return character;
    }

      if (character.id) {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Updating character via CharacterStorage:', character.id);
        }
      return CharacterStorage.update(character.id, character);
      } else {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Creating character via CharacterStorage');
        }
      return CharacterStorage.add(character);
    }
  },
  
  /**
   * Delete character via shared CharacterStorage facade.
   */
  async deleteCharacter(id) {
    if (!window.CharacterStorage) {
      console.warn('StorageService: CharacterStorage not available');
      return false;
    }
    return CharacterStorage.delete(id);
  },
});

// ASCII Art service
// Now relies primarily on pre-generated custom portraits.
const AsciiArtService = (window.AsciiArtService = {
  // Simple in-memory cache for portraits keyed by race|class.
  _portraitCache: {},
  // Legacy hardcoded ASCII templates have been removed now that
  // we rely on custom, pre-generated portraits under generated_portraits/.
  // These helpers remain so existing callers continue to work.
  getRaceArt(race) {
    return '';
  },

  addClassDecoration(baseArt, classType) {
    return baseArt;
  },

  getFullPortrait(character) {
    if (!character || !character.race) return '';
    const raceLabel = String(character.race).toUpperCase();
    const classLabel = character.class ? ` ${String(character.class).toUpperCase()}` : '';
    return `[ ${raceLabel}${classLabel} PORTRAIT ]`;
  },

  // Load pre-generated ASCII portrait from files
  async loadPreGeneratedPortrait(race, classType) {
    const raceLower = race.toLowerCase().replace(/ /g, '-');
    const classLower = classType ? classType.toLowerCase() : '';

    // Try race-class combo first
    if (classLower) {
      const path = `generated_portraits/ascii/${raceLower}-${classLower}.txt`;
      if (DEBUG_BUILDER) console.log(`📂 Trying to load: ${path}`);
      try {
        const response = await fetch(path);
        if (DEBUG_BUILDER) console.log(`📡 Response status: ${response.status}`);
        if (response.ok) {
          const text = await response.text();
          if (DEBUG_BUILDER) console.log(`✅ Loaded ${raceLower}-${classLower}, length: ${text.length}`);
          return text;
        }
      } catch (e) {
        if (DEBUG_BUILDER) console.log(`❌ Error loading ${raceLower}-${classLower}:`, e);
      }
    }

    // Fallback to race-only
    const path = `generated_portraits/ascii/${raceLower}.txt`;
    if (DEBUG_BUILDER) console.log(`📂 Trying fallback: ${path}`);
    try {
      const response = await fetch(path);
      if (DEBUG_BUILDER) console.log(`📡 Response status: ${response.status}`);
      if (response.ok) {
        const text = await response.text();
        if (DEBUG_BUILDER) console.log(`✅ Loaded ${raceLower}, length: ${text.length}`);
        return text;
      }
    } catch (e) {
      if (DEBUG_BUILDER) console.log(`❌ Error loading ${raceLower}:`, e);
    }

    if (DEBUG_BUILDER) console.log(`❌ No portrait found for ${raceLower}`);
    return null;
  },

  // Get the image URL for a pre-generated portrait
  getPreGeneratedImageUrl(race, classType) {
    // Pre-generated *image* URLs are intentionally disabled. We only support
    // user-generated portrait images (from AI generation) as "original art".
    return null;
  },

  // Load portrait (pre-generated or fallback to template)
  async generateAIPortrait(character) {
    try {
      if (!character) return '';

      // If there's custom AI-generated ASCII art, use that first
      if (character.customPortraitAscii) {
        console.log('✅ Using custom AI-generated portrait');
        return character.customPortraitAscii;
      }

      // Determine the current race/class key for this character
      const key = `${character.race || ''}|${character.class || ''}`;

      // If there's already ASCII art stored in character (from pre-generated or previous load)
      // and it matches the current race/class combination, reuse it.
      if (character.asciiPortrait && character.asciiPortraitKey === key) {
        console.log('✅ Using stored ASCII portrait for current race/class');
        return character.asciiPortrait;
      }

      // If we have a cached portrait for this race/class combo, use it.
      if (this._portraitCache[key]) {
        return this._portraitCache[key];
      }

      // Try loading pre-generated portrait from files
      console.log('Loading pre-generated portrait...');
      const preGenerated = await this.loadPreGeneratedPortrait(
        character.race,
        character.class,
      );
      if (preGenerated) {
        console.log(
          `✅ Found pre-generated portrait for ${character.race}-${character.class}`,
        );
        this._portraitCache[key] = preGenerated;

        // Store ASCII art in character for export
        if (window.CharacterState) {
          const updates = {
            asciiPortrait: preGenerated,
            asciiPortraitKey: key,
          };

          window.CharacterState.updateCharacter(updates);
        }

        return this._portraitCache[key];
      }

      // Fallback to template art
      console.log('No pre-generated portrait, using template');
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;

      // Store fallback ASCII art in character for export
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({
          asciiPortrait: fallback,
          asciiPortraitKey: key,
        });
      }
      
      return fallback;
    } catch (error) {
      console.error('Portrait loading error:', error);
      const key = `${character.race || ''}|${character.class || ''}`;
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;

      // Store fallback ASCII art in character for export
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({
          asciiPortrait: fallback,
          asciiPortraitKey: key,
        });
      }
      
      return fallback;
    }
  },

  // Generate CUSTOM AI portrait with DALL-E (user-initiated)
  async generateCustomAIPortrait(character, options = {}) {
    try {
      console.log('🎨 Generating custom AI portrait with DALL-E...');

      // Step 1: Generate image with DALL-E
      const imageUrl = await AIService.generatePortraitImage(character, options);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return { asciiArt, imageUrl };
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },

  // Generate CUSTOM AI portrait with custom prompt
  async generateCustomAIPortraitWithPrompt(customPrompt) {
    try {
      console.log('🎨 Generating custom AI portrait with custom prompt...');
      console.log('Prompt:', customPrompt);

      // Step 1: Generate image with DALL-E using custom prompt
      const imageUrl = await AIService.generateImageFromPrompt(customPrompt);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return { asciiArt, imageUrl };
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },
});

// External AI service integrations (Secure backend proxy)
const AIService = (window.AIService = {
  // Track the last narrator comment so we can avoid obvious repetition.
  _lastNarratorComment: null,
  // Track whether we've already allowed an "Ah, the classic..."-style line
  // for the current character generation run.
  _usedClassicThisRun: false,
  // Track how many AI narrator comments we've made for the current character.
  _narratorCommentCount: 0,
  // Track used names across this browser session to avoid repeats
  // and increase diversity of generated suggestions.
  _usedFirstNames: new Set(),
  _usedLastNames: new Set(),
  _usedFullNames: new Set(),
  
  // Backend availability tracking (for Render cold starts)
  _backendAvailable: null, // null = unknown, true = available, false = waking up
  _warmupInProgress: false,

  resetNarratorSession() {
    this._lastNarratorComment = null;
    this._usedClassicThisRun = false;
    this._narratorCommentCount = 0;
  },

  // Background warmup: Keep trying to wake up the backend
  async warmupBackend() {
    if (this._warmupInProgress || this._backendAvailable === true) {
      return;
    }
    
    this._warmupInProgress = true;
    console.log('%c🔄 WARMUP: Waking up backend server...', 'color: #fa0; font-weight: 500');
    
    while (this._backendAvailable !== true) {
      try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.available) {
            this._backendAvailable = true;
            console.log('%c✅ WARMUP: Backend is now ready!', 'color: #0f0; font-weight: 500');
            this._warmupInProgress = false;
            return;
          }
        }
      } catch (error) {
        // Keep trying
      }
      
      // Wait 5 seconds before trying again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    this._warmupInProgress = false;
  },

  // Helper to add timeout to fetch requests (for Render cold starts)
  async fetchWithTimeout(url, options, timeoutMs = CONFIG.AI_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      // Attach auth token when available so backend can apply per-user quotas
      // and admin bypass (instead of falling back to IP-based limits).
      let finalOptions = options || {};
      try {
        const token =
          window.AuthService && typeof AuthService.getToken === 'function'
            ? AuthService.getToken()
            : null;
        if (token) {
          const existingHeaders = (finalOptions && finalOptions.headers) || {};
          const mergedHeaders = { ...existingHeaders };
          if (!mergedHeaders.Authorization && !mergedHeaders.authorization) {
            mergedHeaders.Authorization = `Bearer ${token}`;
          }
          finalOptions = { ...finalOptions, headers: mergedHeaders };
        }
      } catch (e) {
        // Non-fatal: continue without auth header
      }

      const response = await fetch(url, {
        ...finalOptions,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // Mark backend as available on successful response
      if (response.ok) {
        this._backendAvailable = true;
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        // Backend is waking up - start background warmup
        this._backendAvailable = false;
        this.warmupBackend(); // Don't await - let it run in background
        throw new Error('Request timed out - backend may be waking up');
      }
      throw error;
    }
  },

  async generateCompletion(prompt, systemPrompt = null) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled in config');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/chat/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          system_prompt: systemPrompt,
          max_tokens: 300,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        // Check for safety system rejection
        if (response.status === 400) {
          try {
            const errorData = await response.json();
            if (errorData.detail && errorData.detail.includes('safety system')) {
              console.warn('⚠️ OpenAI safety system rejection:', errorData.detail);
              // Show user-friendly notification
              if (window.UIService) {
                window.UIService.showNotification(
                  'OpenAI flagged this request. Using fallback response instead.',
                  'warning',
                  5000
                );
              }
            }
          } catch (e) {
            // Error parsing JSON, continue with fallback
          }
        }
        console.log(`Backend API error: ${response.status} - will use fallback`);
        return null;
      }

      const data = await response.json();
      return data.success ? data.content : null;
    } catch (error) {
      // Don't log scary errors - let the calling function handle fallback gracefully
      if (error.message.includes('timed out')) {
        console.log('⏰ AI request timed out - caller will use fallback mode');
      } else {
        console.log('AI service unavailable - caller will use fallback mode');
      }
      return null;
    }
  },

  async generateNarratorComment(context) {
    // Get current narrator and fallbacks
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const fallbacks = narrator.fallbacks;

    // Determine how many backend narrator calls we're allowed per character.
    const maxComments =
      typeof CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER === 'number'
        ? CONFIG.NARRATOR_MAX_AI_COMMENTS_PER_CHARACTER
        : Infinity;

    const narratorAiDisabled =
      CONFIG.ENABLE_AI_NARRATOR_COMMENTS === false || !CONFIG.ENABLE_AI;

    // If narrator AI is disabled or we've hit the cap, immediately use a local line.
    if (narratorAiDisabled || this._narratorCommentCount >= maxComments) {
      console.log(
        '%c🤖 NARRATOR (Fallback - Disabled or limit reached)',
        'color: #ff0; font-weight: 500',
      );
      return Utils.randomChoice(fallbacks);
    }

    try {
      console.log('%c🤖 NARRATOR: Calling backend AI...', 'color: #0ff; font-weight: 500');
      console.log('  Request:', { choice: context.choice, question: context.question, narrator: narratorId });
      console.log(
        `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
      );
      
        const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/narrator/comment`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            choice: context.choice,
            question: context.question,
            character_so_far: context.characterSoFar,
            narrator_id: narratorId,
          }),
        }); // Uses CONFIG.AI_TIMEOUT, then fallback + background warmup

      if (!response.ok) {
        console.log('%c🤖 NARRATOR (Fallback - API Error)', 'color: #f80; font-weight: 500');
        console.log('  Status:', response.status);
        return Utils.randomChoice(fallbacks);
      }

      const data = await response.json();
      let text = data.comment || Utils.randomChoice(fallbacks);
      
      console.log('%c🤖 NARRATOR (AI Generated) ✨', 'color: #0f0; font-weight: 500');
      console.log('  Response:', text);
    
      // Use the text from the response
      let responseText = text;

      // Light post-processing to avoid obvious repetition
    const normalize = (s) => (s || '').trim().toLowerCase();
    const startsWithClassic = (s) =>
      s.startsWith('ah, the classic') || s.startsWith('ah the classic');

    const last = this._lastNarratorComment;
    const lastNorm = normalize(last);
      let newNorm = normalize(responseText);

    if (last) {
      if (newNorm === lastNorm) {
          const alts = fallbacks.filter((f) => normalize(f) !== lastNorm);
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }

      if (startsWithClassic(newNorm) && startsWithClassic(lastNorm)) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }
    }

    if (startsWithClassic(newNorm)) {
      if (this._usedClassicThisRun) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
        }
      } else {
        this._usedClassicThisRun = true;
      }
    }

      this._lastNarratorComment = responseText;
      // Count this as one successful AI narrator comment for this character.
      this._narratorCommentCount += 1;
      return responseText;
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)', 'color: #f80; font-weight: 500');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c🤖 NARRATOR (Fallback - Connection Error)', 'color: #f00; font-weight: 500');
        console.error('  Error:', error);
      }
      return Utils.randomChoice(fallbacks);
    }
  },

  async generateNames(race, classType, count = 3) {
    const desiredCount = Math.max(1, count || 3);
    const candidates = [];

    // Helper: attempt AI generation when enabled
    const tryAiNames = async () => {
      if (!CONFIG.ENABLE_AI) {
        console.log(
          '%c📛 NAMES (Fallback - AI Disabled)',
          'color: #ff0; font-weight: 500',
        );
        return;
      }

      try {
        console.log(
          '%c📛 NAMES: Calling backend AI...',
          'color: #0ff; font-weight: 500',
        );
        console.log('  Request:', { race, classType, count: desiredCount });
        console.log(
          `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
        );

        const response = await this.fetchWithTimeout(
          `${CONFIG.BACKEND_URL}/api/ai/characters/names`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              race: race,
              class_type: classType,
              // Ask for extra so we have room to filter out repeats
              count: desiredCount * 2,
            }),
          },
        ); // Uses CONFIG.AI_TIMEOUT

        if (!response.ok) {
          console.log(
            '%c📛 NAMES (Fallback - API Error)',
            'color: #f80; font-weight: 500',
          );
          return;
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.names) && data.names.length > 0) {
          console.log(
            '%c📛 NAMES (AI Generated) ✨',
            'color: #0f0; font-weight: 500',
          );
          console.log('  Response:', data.names);
          candidates.push(...data.names);
        }
      } catch (error) {
        if (error.message && error.message.includes('timed out')) {
          console.log(
            '%c📛 NAMES (Fallback - Backend Waking Up)',
            'color: #f80; font-weight: 500',
          );
          console.log(
            `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
          );
          console.log(
            '  ✅ Once awake, subsequent requests will use AI!',
          );
        } else {
          console.log(
            '%c📛 NAMES (Fallback - Connection Error)',
            'color: #f00; font-weight: 500',
          );
          console.error('  Error:', error);
        }
      }
    };

    // Helper: always-available fallback candidates
    const addFallbackCandidates = (multiplier = 3) => {
      console.log(
        '%c📛 NAMES (Fallback)',
        'color: #f80; font-weight: 500',
      );
      const extra = this.generateFallbackNames(race, desiredCount * multiplier);
      candidates.push(...extra);
    };

    // 1) Try AI first (if enabled)
    await tryAiNames();

    // 2) If AI unavailable or produced too few unique-looking options, pad with fallback
    if (!candidates.length) {
      addFallbackCandidates(3);
    }

    // 3) Filter for uniqueness and register globally
    let unique = this._filterAndRegisterUniqueNames(candidates, desiredCount);

    // 4) If we still don't have enough, top up with more fallback variations
    if (unique.length < desiredCount) {
      addFallbackCandidates(5);
      const more = this._filterAndRegisterUniqueNames(
        candidates,
        desiredCount - unique.length,
      );
      unique = unique.concat(more);
    }

    // Return whatever we could gather (may be fewer than requested if pools are exhausted)
    return unique.slice(0, desiredCount);
  },

  /**
   * Combined helper: ask the backend once for BOTH
   *   - name suggestions, and
   *   - a backstory template that uses the literal token {{NAME}}
   *
   * This lets us front-load the "heavy" AI work earlier in the flow and
   * avoid a second OpenAI call when the user later reaches the backstory
   * step. The final, player-chosen name is substituted client-side.
   */
  async generateCharacterSummary(character, options = {}) {
    const nameCount =
      typeof options.nameCount === 'number' && options.nameCount > 0
        ? options.nameCount
        : 3;

    const race = character && character.race;
    const classType = character && character.class;

    // Local, always-available fallback for both names and template
    const buildLocalFallback = () => {
      const fallbackNames = this.generateFallbackNames(race || 'human', nameCount);
      const template =
        '{{NAME}} is a ' +
        `${race || 'mysterious'}\u0020${classType || 'adventurer'} with a mysterious past. ` +
        "They don't talk about it much. Probably for the best.";
      return {
        names: fallbackNames,
        backstoryTemplate: template,
      };
    };

    if (!CONFIG.ENABLE_AI) {
      console.log(
        '%c📦 SUMMARY (Fallback - AI Disabled)',
        'color: #ff0; font-weight: 500',
      );
      return buildLocalFallback();
    }

    try {
      console.log(
        '%c📦 SUMMARY: Calling backend AI for names + backstory template...',
        'color: #0ff; font-weight: 500',
      );

      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/characters/summary`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            race: race,
            class_type: classType,
            alignment: character && character.alignment,
            background: character && character.background,
            personality:
              character && (character.personalityTrait || character.personality),
            name_count: nameCount * 2, // ask for extra to allow uniqueness filtering
          }),
        },
      );

      if (!response.ok) {
        const status = response.status;
        let detail = null;
        try {
          const errBody = await response.json();
          if (errBody && errBody.detail) {
            detail = errBody.detail;
          }
        } catch {
          // ignore JSON parse errors; we'll fall back below
        }

        if (status === 429) {
          console.log(
            '%c📦 SUMMARY (Cooldown / Quota Limit)',
            'color: #ff0; font-weight: 500',
          );
          // Dispatch quota update event so UI can disable options
          try {
            window.dispatchEvent(
              new CustomEvent('danddy:creationQuotaUpdate', {
                detail: { remaining: 0 },
              }),
            );
          } catch (_) {}
        } else {
          console.log(
            '%c📦 SUMMARY (Fallback - API Error)',
            'color: #f80; font-weight: 500',
          );
          console.log('  Status:', status);
        }

        return buildLocalFallback();
      }

      const data = await response.json();
      if (!data || data.success !== true) {
        console.log(
          '%c📦 SUMMARY (Fallback - Bad Payload)',
          'color: #f80; font-weight: 500',
        );
        return buildLocalFallback();
      }

      let names = Array.isArray(data.names) ? data.names.slice() : [];
      const template =
        typeof data.backstory_template === 'string' && data.backstory_template.trim()
          ? data.backstory_template
          : null;

      // Run through our global uniqueness filter so we avoid repeating
      // first/last names across this browser session.
      if (names.length) {
        names = this._filterAndRegisterUniqueNames(names, nameCount);
      }

      if (!names.length) {
        console.log(
          '%c📦 SUMMARY (Fallback - No Names From Backend)',
          'color: #f80; font-weight: 500',
        );
        const fallback = buildLocalFallback();
        // Preserve backend-provided template if we got one.
        if (template) {
          fallback.backstoryTemplate = template;
        }
        return fallback;
      }

      console.log(
        '%c📦 SUMMARY (AI Generated) ✨',
        'color: #0f0; font-weight: 500',
      );
      console.log('  Names:', names);

      return {
        names,
        backstoryTemplate:
          template ||
          (character && character.backstory) ||
          buildLocalFallback().backstoryTemplate,
        portraitGrantId:
          (typeof data.portrait_grant_id === 'string' && data.portrait_grant_id) ||
          (typeof data.portraitGrantId === 'string' && data.portraitGrantId) ||
          null,
      };
    } catch (error) {
      if (error.message && error.message.includes('timed out')) {
        console.log(
          '%c📦 SUMMARY (Fallback - Backend Waking Up)',
          'color: #f80; font-weight: 500',
        );
        console.log(
          '  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',
        );
      } else {
        console.log(
          '%c📦 SUMMARY (Fallback - Connection Error)',
          'color: #f00; font-weight: 500',
        );
        console.error('  Error:', error);
      }
      return buildLocalFallback();
    }
  },

  generateFallbackNames(race, count) {
    // Use shared name data from CharacterNameData module
    const pattern = window.CharacterNameData
      ? CharacterNameData.getPattern(race)
      : { first: ['Hero'], last: ['Unknown'] };
    const result = [];
    const usedLocalCombos = new Set();

    // Generate name combinations with local (per-call) uniqueness.
    // Global uniqueness (across the entire session) is handled by
    // _filterAndRegisterUniqueNames so we only worry about producing
    // a rich pool of candidates here.
    let attempts = 0;
    const maxAttempts = count * 20;

    while (result.length < count && attempts < maxAttempts) {
      const firstName = Utils.randomChoice(pattern.first);
      const lastName = Utils.randomChoice(pattern.last);
      const fullName = `${firstName}\u0020${lastName}`;

      if (!usedLocalCombos.has(fullName)) {
        usedLocalCombos.add(fullName);
        result.push(fullName);
      }
      attempts++;
    }

    return result;
  },

  /**
   * Internal helper: normalize and register names so we:
   * - avoid duplicate first names (case-insensitive)
   * - avoid duplicate last names
   * - avoid duplicate full names
   * across the entire browser session.
   *
   * Accepts an array of full-name strings and returns a filtered array.
   */
  _filterAndRegisterUniqueNames(candidates, maxCount) {
    const result = [];
    const target = typeof maxCount === 'number' && maxCount > 0
      ? maxCount
      : Number.POSITIVE_INFINITY;

    for (const raw of candidates) {
      if (result.length >= target) break;
      if (!raw) continue;

      const trimmed = String(raw).trim();
      if (!trimmed) continue;

      // Split on whitespace, first token = first name, rest = last name
      const parts = trimmed.split(/\s+/);
      if (parts.length === 0) continue;

      const first = parts[0];
      const last = parts.slice(1).join(' ') || '';

      // Require at least a first name; allow missing last name but treat it as part of full key
      if (!first) continue;

      const firstKey = first.toLowerCase();
      const lastKey = last.toLowerCase();
      const fullKey = last ? `${firstKey}\u0020${lastKey}` : firstKey;

      // Enforce uniqueness across this browser session
      if (
        this._usedFullNames.has(fullKey) ||
        this._usedFirstNames.has(firstKey) ||
        (last && this._usedLastNames.has(lastKey))
      ) {
        continue;
      }

      this._usedFullNames.add(fullKey);
      this._usedFirstNames.add(firstKey);
      if (last) {
        this._usedLastNames.add(lastKey);
      }

      result.push(trimmed);
    }

    return result;
  },

  async generateBackstory(character) {
    const fallback = `${character.name} is a ${character.race}\u0020${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";

    if (!CONFIG.ENABLE_AI) {
      console.log('%c📖 BACKSTORY (Fallback - AI Disabled)', 'color: #ff0; font-weight: 500');
      return fallback;
    }

    try {
      console.log('%c📖 BACKSTORY: Calling backend AI...', 'color: #0ff; font-weight: 500');
      console.log('  Request:', { name: character.name, race: character.race, class: character.class });
      console.log(
        `  Note: Will fallback after ${CONFIG.AI_TIMEOUT / 1000}s if server is cold, but keep warming up in background...`,
      );
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/backstory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: character.name,
          race: character.race,
          class_type: character.class,
          personality: character.personalityTrait || 'mysterious',
          background: character.background,
        }),
      }); // Uses CONFIG.AI_TIMEOUT

      if (!response.ok) {
        console.log('%c📖 BACKSTORY (Fallback - API Error)', 'color: #f80; font-weight: 500');
        return fallback;
      }

      const data = await response.json();
      if (data.success && data.backstory) {
        console.log('%c📖 BACKSTORY (AI Generated) ✨', 'color: #0f0; font-weight: 500');
        console.log('  Response:', data.backstory.substring(0, 100) + '...');
        return data.backstory;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)', 'color: #f80; font-weight: 500');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📖 BACKSTORY (Fallback - Connection Error)', 'color: #f00; font-weight: 500');
        console.error('  Error:', error);
      }
    }

    console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80; font-weight: 500');
    return fallback;
  },

  async generateOptionVariations(questionText, options) {
    if (!CONFIG.ENABLE_AI || CONFIG.ENABLE_AI_OPTION_VARIATIONS === false) {
      console.log(
        '%c🎲 OPTIONS (Fallback - AI Disabled or variations off)',
        'color: #ff0; font-weight: 500',
      );
      return options.map((opt) => opt.text);
    }

    const optionDescriptions = options
      .map((opt) => `Value: "${opt.value}", Default text: "${opt.text}"`)
      .join('\n');

    const prompt = `For the question: "${questionText}"

Generate fresh, creative variations for these D&D character creation options. Keep each variation to 4-8 words, punchy and clear. Match the tone of each original but make them feel unique:

${optionDescriptions}

Format your response as JSON array of strings, one for each option in order. Example: ["text1", "text2", "text3", "text4"]`;

    const systemPrompt =
      'You are a creative D&D character creation assistant. Generate engaging option text that feels fresh but maintains the same meaning. ' +
      'Be concise and direct. Return ONLY valid JSON.';

    console.log('%c🎲 OPTIONS: Calling backend AI...', 'color: #0ff; font-weight: 500');
    console.log('  Note: Will fallback to original option texts if unavailable...');

    const response = await this.generateCompletion(prompt, systemPrompt);

    if (response) {
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const variations = JSON.parse(jsonMatch[0]);
          if (Array.isArray(variations) && variations.length === options.length) {
            console.log('%c🎲 OPTIONS (AI Generated) ✨', 'color: #0f0; font-weight: 500');
            return variations;
          }
        }
      } catch (error) {
        console.log('Failed to parse AI option variations:', error);
      }
    }

    // Fallback: return original texts
    console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅', 'color: #f80; font-weight: 500');
    console.log('  The original option texts will be used instead of AI variations');
    return options.map((opt) => opt.text);
  },

  // Generate character portrait image using DALL-E
  async generatePortraitImage(character, options = {}) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt, options);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt, options = {}) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c🎨 DALL-E (Unavailable - AI Disabled)', 'color: #ff0; font-weight: 500');
      return null;
    }

    // Allow forcing a specific model (used for fallback)
    const forceModel = options.forceModel || null;
    const isRetry = options._isRetry || false;

    try {
      // Resolve current image model preference (builder + manager share this).
      let model = forceModel || 'dall-e-3';
      if (!forceModel) {
        try {
          if (window.StorageService && typeof StorageService.getImageModel === 'function') {
            model = StorageService.getImageModel();
          } else if (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) {
            model = CONFIG.DEFAULT_IMAGE_MODEL;
          }
        } catch (e) {
          console.warn('AIService.generateImageFromPrompt: failed to read image model, using default', e);
        }
      }

      // Preflight quota so we can message the user before burning expensive calls.
      // Backend still enforces quota; this is just a nicer UX.
      try {
        if (typeof this.getImageQuotaStatus === 'function') {
          const quota = await this.getImageQuotaStatus();
          if (quota && quota.enforced && quota.remaining === 0) {
            const resetAt = quota.reset_at || quota.resetAt || null;
            const msg = resetAt
              ? `Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`
              : 'Daily image limit reached. Please try again tomorrow.';
            if (window.UIService) {
              window.UIService.showNotification(msg, 'warning', 8000);
            }
            const rateLimitError = new Error(msg);
            rateLimitError.isRateLimit = true;
            rateLimitError.limit = quota.limit;
            rateLimitError.remaining = quota.remaining;
            rateLimitError.resetAt = resetAt;
            throw rateLimitError;
          }
        }
      } catch (quotaErr) {
        // If quota endpoint fails, don't block generation; backend will enforce anyway.
      }

      console.log('%c🎨 IMAGE: Calling backend AI...', 'color: #0ff; font-weight: 500');
      // Log only a preview of the prompt so the console isn't flooded,
      // but make it clear that the full prompt (without truncation) is
      // sent to the backend.
      console.log('  Prompt (preview):', prompt.substring(0, 100) + (prompt.length > 100 ? '…' : ''));
      console.log('  Model:', model + (forceModel ? ' (fallback)' : ''));
      console.log('  Note: Image generation takes 20-30s (longer than text AI)...');
      
        // Quality setting differs by model:
        // - DALL-E 3: 'standard' or 'hd'
        // - GPT Image 1: 'medium', 'high'
        // - Flux models: no quality setting (use 'standard' as default)
        const defaultQuality = {
          'dall-e-3': 'standard',
          'gpt-image-1': 'medium',
          'gpt-image-1.5': 'medium',
          'flux-1.1-pro': 'standard',
          'flux-schnell': 'standard',
        };
        
        let quality = defaultQuality[model] || 'standard';
        
        // In demo mode, always use 'medium' quality for gpt-image-1 to manage costs
        const isDemoMode = window.DemoCharacters && typeof DemoCharacters.isDemoMode === 'function' && DemoCharacters.isDemoMode();
        if (isDemoMode && model === 'gpt-image-1') {
          quality = 'medium';
          console.log(`  Quality: MEDIUM (demo mode default)`);
        } else {
          // Check for user quality preference (logged-in users only)
          try {
            if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
              const savedQuality = StorageService.getImageQuality(model);
              if (savedQuality) {
                quality = savedQuality;
                console.log(`  Quality: ${quality.toUpperCase()} (user preference)`);
              }
            }
          } catch (e) {
            console.warn('AIService: failed to read quality setting', e);
          }
        }

        const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt: prompt,
            size: '1024x1024',
            quality: quality,
            model: model,
            // Optional one-time included portrait grant from /characters/summary.
            creation_grant_id:
              (options && options.creationGrantId) ||
              (options && options.creation_grant_id) ||
              null,
          }),
        }, 70000); // 70 seconds for image generation (DALL-E can be very slow, plus R2 upload)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 IMAGE (Error)', 'color: #f00; font-weight: 500');
        console.log('  Error:', errorData.detail);
        
        // Helper to extract error message from Pydantic validation errors or plain strings
        const extractErrorMessage = (detail) => {
          if (!detail) return null;
          // Pydantic returns validation errors as an array of objects
          if (Array.isArray(detail)) {
            return detail.map(err => {
              if (typeof err === 'string') return err;
              // Pydantic format: { loc: [...], msg: '...', type: '...' }
              const field = err.loc ? err.loc.slice(1).join('.') : 'unknown';
              return `${field}: ${err.msg || err.message || JSON.stringify(err)}`;
            }).join('; ');
          }
          if (typeof detail === 'object') {
            return detail.msg || detail.message || JSON.stringify(detail);
          }
          return String(detail);
        };
        
        const errorMessage = extractErrorMessage(errorData.detail);
        
        // Check for rate limiting
        if (response.status === 429) {
          const resetAt = (errorData && (errorData.reset_at || errorData.resetAt)) || null;
          const remaining =
            errorData && typeof errorData.remaining === 'number' ? errorData.remaining : null;
          const limit = errorData && typeof errorData.limit === 'number' ? errorData.limit : null;

          const msg =
            errorMessage ||
            (resetAt
              ? `Daily image limit reached. Resets at ${resetAt
                  .replace('T', ' ')
                  .replace('+00:00', ' UTC')}.`
              : 'Daily image limit reached.');

          if (window.UIService) {
            window.UIService.showNotification(msg, 'warning', 8000);
          }

          const rateLimitError = new Error(msg);
          rateLimitError.isRateLimit = true;
          rateLimitError.limit = limit;
          rateLimitError.remaining = remaining;
          rateLimitError.resetAt = resetAt;
          throw rateLimitError;
        }
        
        // Check for Replicate/Flux service errors (502 from backend)
        const detailStr = typeof errorData.detail === 'string' ? errorData.detail : errorMessage;
        if (response.status === 502 && detailStr && (
          detailStr.toLowerCase().includes('flux') ||
          detailStr.toLowerCase().includes('replicate')
        )) {
          console.warn('⚠️ Replicate/Flux service error:', detailStr);
          
          const fluxError = new Error('Flux image generation service is temporarily unavailable');
          fluxError.isFluxError = true;
          fluxError.originalMessage = detailStr;
          fluxError.suggestModelSwitch = true;
          throw fluxError;
        }
        
        // Check for safety system rejection (handle both string and array detail)
        if (response.status === 400 && detailStr && detailStr.toLowerCase().includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', detailStr);
          console.warn('📝 REJECTED PROMPT:', prompt);
          
          // Analyze the prompt to help identify problematic sections
          const analysis = this.analyzeRejectedPrompt(prompt);
          
          const safetyError = new Error('Portrait generation was flagged by OpenAI\'s content safety system');
          safetyError.isSafetyRejection = true;
          safetyError.originalMessage = detailStr;
          safetyError.rejectedPrompt = prompt; // Capture the prompt for debugging
          safetyError.promptAnalysis = analysis; // Include analysis results
          throw safetyError;
        }
        
        throw new Error(errorMessage || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        console.log('%c🎨 IMAGE (Generated) ✨', 'color: #0f0; font-weight: 500');
        console.log('  URL:', data.url.substring(0, 50) + '...');

        // Read quota headers when present and broadcast for UI updates.
        try {
          const limitStr = response.headers.get('x-danddy-image-limit');
          const remainingStr = response.headers.get('x-danddy-image-remaining');
          const resetStr = response.headers.get('x-danddy-image-reset');
          const quotaInfo = {
            limit: limitStr != null ? parseInt(limitStr, 10) : null,
            remaining: remainingStr != null ? parseInt(remainingStr, 10) : null,
            resetEpoch: resetStr != null ? parseInt(resetStr, 10) : null,
          };

          window.dispatchEvent(
            new CustomEvent('danddy:imageQuotaUpdate', { detail: quotaInfo }),
          );

          // Optional lightweight notification when enforced and low remaining.
          if (
            window.UIService &&
            typeof quotaInfo.remaining === 'number' &&
            quotaInfo.remaining >= 0 &&
            quotaInfo.remaining <= 2
          ) {
            window.UIService.showNotification(
              `Images left today: ${quotaInfo.remaining}`,
              'info',
              5000,
            );
          }
        } catch (e) {
          // Non-fatal
        }

        return data.url;
      }
      return null;
    } catch (error) {
      console.log('%c🎨 IMAGE (Failed)', 'color: #f00; font-weight: 500');
      console.error('  Error:', error);
      
      // Auto-fallback: If Flux failed and we haven't tried fallback yet, retry with GPT Image
      if (error.isFluxError && !isRetry) {
        console.log('%c🔄 AUTO-FALLBACK: Flux unavailable, trying GPT Image instead...', 'color: #fa0; font-weight: 500');
        
        if (window.UIService) {
          window.UIService.showNotification(
            'Flux unavailable, switching to GPT Image...',
            'info',
            4000
          );
        }
        
        // Retry with GPT Image as fallback
        return this.generateImageFromPrompt(prompt, { 
          forceModel: 'gpt-image-1', 
          _isRetry: true 
        });
      }
      
      throw error;
    }
  },

  /**
   * Fetch current daily image quota from backend.
   * Returns: { limit, used, remaining, reset_at, reset_epoch, enforced }
   * - remaining === -1 indicates "unlimited" (admin/dev bypass)
   */
  async getImageQuotaStatus() {
    try {
      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/images/quota`,
        { method: 'GET' },
        10000,
      );
      if (!response.ok) return null;
      const data = await response.json();

      // Normalize keys to camelCase for callers, but keep originals too.
      const normalized = {
        ...data,
        resetAt: data.reset_at || data.resetAt,
        resetEpoch: data.reset_epoch || data.resetEpoch,
      };

      // Broadcast so any open UI can update its quota label.
      try {
        window.dispatchEvent(
          new CustomEvent('danddy:imageQuotaUpdate', {
            detail: {
              limit: normalized.limit,
              remaining: normalized.remaining,
              resetAt: normalized.resetAt,
              resetEpoch: normalized.resetEpoch,
            },
          }),
        );
      } catch (_) {}

      return normalized;
    } catch (e) {
      return null;
    }
  },

  /**
   * Fetch current daily character creation quota from backend.
   * Returns: { limit, used, remaining, reset_at, reset_epoch, enforced }
   * - remaining === -1 indicates "unlimited" (admin/dev bypass)
   */
  async getCreationQuotaStatus() {
    try {
      const response = await this.fetchWithTimeout(
        `${CONFIG.BACKEND_URL}/api/ai/characters/quota`,
        { method: 'GET' },
        10000,
      );
      if (!response.ok) return null;
      const data = await response.json();

      // Normalize keys to camelCase for callers, but keep originals too.
      const normalized = {
        ...data,
        resetAt: data.reset_at || data.resetAt,
        resetEpoch: data.reset_epoch || data.resetEpoch,
      };

      // Broadcast so any open UI can update its quota display.
      try {
        window.dispatchEvent(
          new CustomEvent('danddy:creationQuotaUpdate', {
            detail: {
              limit: normalized.limit,
              remaining: normalized.remaining,
              resetAt: normalized.resetAt,
              resetEpoch: normalized.resetEpoch,
            },
          }),
        );
      } catch (_) {}

      return normalized;
    } catch (e) {
      return null;
    }
  },

  // Build character description (shown to user in modal)
  buildCharacterDescription(character) {
    const parts = [];

    // Add D&D context header to help LLM understand class names like "Monk" are fantasy classes
    parts.push('Dungeons & Dragons fantasy character:');

    // Sex - include if set (important for portrait generation)
    if (character.sex) {
      parts.push(character.sex);
    }

    // Race - prefer admin-configured entries, fall back to shared description data
    if (character.race) {
      let raceDesc = null;
      // Try admin entries first
      try {
        if (window.PortraitPrompt && typeof PortraitPrompt.getVariableSnippet === 'function') {
          raceDesc = PortraitPrompt.getVariableSnippet('race', character.race);
        }
      } catch (e) {
        // Non-fatal
      }
      // Fall back to hardcoded descriptions
      if (!raceDesc) {
        raceDesc = window.PortraitPrompt
          ? PortraitPrompt.getRaceDescription(character.race)
          : character.race;
      }
      parts.push(raceDesc);
    }

    // Class - prefer admin-configured entries, fall back to shared description data
    if (character.class) {
      let classDesc = null;
      // Try admin entries first
      try {
        if (window.PortraitPrompt && typeof PortraitPrompt.getVariableSnippet === 'function') {
          classDesc = PortraitPrompt.getVariableSnippet('class', character.class);
        }
      } catch (e) {
        // Non-fatal
      }
      // Fall back to hardcoded descriptions
      if (!classDesc) {
        classDesc = window.PortraitPrompt
          ? PortraitPrompt.getClassDescription(character.class)
          : character.class;
      }
      parts.push(classDesc);
    }

    // Magic specialization (only for spellcasting classes)
    // Note: This is still from hardcoded data - could be moved to admin in future
    if (character.class && window.PortraitPrompt) {
      const magicText = PortraitPrompt.getMagicSpecialization(character.class);
      if (magicText) {
        parts.push(magicText);
      }
    }

    // Alignment
    if (character.alignment) {
      if (character.alignment.includes('good')) {
        parts.push('with noble bearing');
      } else if (character.alignment.includes('evil')) {
        parts.push('with a menacing aura');
      }
    }

    // Background + feature (when available)
    if (character.background) {
      try {
        let backgroundLabel = character.background;
        let backgroundFeature = character.backgroundFeature || null;

        if (typeof DND_DATA !== 'undefined' && Array.isArray(DND_DATA.backgrounds)) {
          const bgObj = DND_DATA.backgrounds.find(
            (b) => b.id === character.background,
          );
          if (bgObj) {
            backgroundLabel = bgObj.name || backgroundLabel;
            // bgObj.feature is an object { name, description } – extract a readable label
            if (!backgroundFeature && bgObj.feature) {
              if (typeof bgObj.feature === 'string') {
                backgroundFeature = bgObj.feature;
              } else if (typeof bgObj.feature.name === 'string') {
                backgroundFeature = bgObj.feature.name;
              } else if (typeof bgObj.feature.description === 'string') {
                backgroundFeature = bgObj.feature.description;
              }
            }
          }
        }

        let backgroundText = `${String(backgroundLabel).toLowerCase()} background`;
        if (backgroundFeature) {
          const featureText = String(backgroundFeature);
          // Avoid noisy [object Object] style strings
          if (!featureText.includes('[object Object]')) {
            backgroundText += ` with background feature "${featureText}"`;
          }
        }

        parts.push(backgroundText);
      } catch (e) {
        // Fallback to a simple tag if anything goes wrong with lookups
        parts.push(`background: ${character.background}`);
      }
    }

    // Backstory removed from portrait prompts to reduce OpenAI safety rejections
    // User-written text is unpredictable and frequently triggers content filters
    // if (character.backstory) {
    //   const raw = String(character.backstory).replace(/\s+/g, ' ').trim();
    //   if (raw) {
    //     parts.push(`backstory: ${raw}`);
    //   }
    // }
  
    return parts.join(', ');
  },

  // Build full DALL-E prompt with rendering instructions (not shown to user)
  buildPortraitPrompt(character) {
    // Normalize class key for lookups
    const classKey = (character.class || 'default').toLowerCase();

    // Use shared pose and camera data from PortraitPoseData module
    const { pose: posePrompt, camera: cameraPrompt } =
      window.PortraitPoseData && typeof PortraitPoseData.getRandomPoseAndCamera === 'function'
        ? PortraitPoseData.getRandomPoseAndCamera(classKey)
        : {
            pose: 'standing in a relaxed but heroic stance',
            camera: 'Camera angle: three-quarter view that clearly shows the full silhouette.',
          };

    // Resolve current portrait prompt theme (if any)
    let promptThemeId = null;
    try {
      if (
        typeof window !== 'undefined' &&
        window.StorageService &&
        typeof window.StorageService.getPortraitPromptTheme === 'function'
      ) {
        promptThemeId = window.StorageService.getPortraitPromptTheme();
      } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) {
        promptThemeId = CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME;
      }
    } catch (e) {
      // Non-fatal: fall back to default theme behavior below.
    }

    // Build compact STYLE / Background descriptions from theme (when available)
    let styleDescription = '';
    let backgroundDescription = '';
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.buildStyleAndBackgroundDescriptions ===
        'function'
    ) {
      try {
        const sections =
          window.PortraitPrompt.buildStyleAndBackgroundDescriptions({
            posePrompt,
            cameraPrompt,
            themeId: promptThemeId,
          }) || {};
        styleDescription = sections.styleDescription || '';
        backgroundDescription = sections.backgroundDescription || '';
      } catch (e) {
        // Non-fatal – fall through to simple defaults below.
      }
    }

    if (!styleDescription) {
      styleDescription =
        'High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';
    }
    if (!backgroundDescription) {
      backgroundDescription =
        'Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';
    }

    // Build simple header line: {CHARACTER_NAME}: {RACE}, {CLASS}, {BACKGROUND}
    const name = (character && character.name) || 'Unnamed character';

    const raceId = character && character.race ? String(character.race) : null;
    const classId =
      character && character.class ? String(character.class) : null;

    let raceLabel = raceId;
    let classLabel = classId;

    // Prefer admin-configured snippets for race/class when available.
    try {
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getVariableSnippet === 'function'
      ) {
        if (raceId) {
          const customRace =
            window.PortraitPrompt.getVariableSnippet('race', raceId);
          if (customRace) raceLabel = customRace;
        }
        if (classId) {
          const customClass =
            window.PortraitPrompt.getVariableSnippet('class', classId);
          if (customClass) classLabel = customClass;
        }
      }
    } catch (e) {
      // Non-fatal – fall back to simple labels.
    }

    let backgroundLabel = null;
    if (character && character.background) {
      backgroundLabel = String(character.background);
      try {
        if (
          typeof DND_DATA !== 'undefined' &&
          Array.isArray(DND_DATA.backgrounds)
        ) {
          const bgObj = DND_DATA.backgrounds.find(
            (b) => b.id === character.background,
          );
          if (bgObj && bgObj.name) {
            backgroundLabel = String(bgObj.name);
          }
        }
      } catch (e) {
        // Non-fatal – fall back to raw background value.
      }
    }

    const headerParts = [];
    // Sex - include for portrait generation (e.g., "male dwarf" or "female elf")
    if (character && character.sex) {
      headerParts.push(character.sex);
    }
    if (raceLabel) headerParts.push(raceLabel);
    if (classLabel) headerParts.push(classLabel);
    
    // Add magic specialization for spellcasting classes
    if (classId && window.PortraitPrompt && typeof PortraitPrompt.getMagicSpecialization === 'function') {
      const magicText = PortraitPrompt.getMagicSpecialization(classId);
      if (magicText) {
        headerParts.push(magicText);
      }
    }
    
    if (backgroundLabel) headerParts.push(backgroundLabel);

    const headerSuffix = headerParts.join(', ');
    const headerLine = headerSuffix
      ? `${name}: ${headerSuffix}`
      : `${name}`;

    // Final multi-line prompt template:
    // Dungeons & Dragons fantasy character portrait:
    // {CHARACTER_NAME}: {RACE}, {CLASS}, {BACKGROUND}
    //
    // Pose: {POSE_VARIANT}
    //
    // STYLE: {DESCRIPTION}
    //
    // Scene: {DESCRIPTION}
    // Note: Camera temporarily disabled - may interfere with pose
    let prompt = `Dungeons & Dragons fantasy character portrait:\n${headerLine}\n\nPose: ${posePrompt}`;
    if (styleDescription) {
      prompt += `\n\nSTYLE: ${styleDescription}`;
    }
    if (backgroundDescription) {
      prompt += `\n\nScene: ${backgroundDescription}`;
    }

    return prompt;
  },

  // Analyze a rejected prompt to help identify problematic sections
  analyzeRejectedPrompt(prompt) {
    console.log('%c🔍 Analyzing Rejected Prompt', 'color: #ff0; font-weight: 500; font-size: 14px;');
    console.log('─'.repeat(80));
    
    // Common problematic patterns that might trigger safety filters
    const potentialIssues = [];
    const warningPatterns = [
      { pattern: /\b(blood|gore|violence|death|kill|weapon|sword|axe|dagger|knife)\b/gi, category: 'Violence/Weapons' },
      { pattern: /\b(dark|evil|demon|devil|hell|sinister|menacing|malevolent)\b/gi, category: 'Dark Themes' },
      { pattern: /\b(naked|nude|exposed|bare|revealing|sensual|seductive)\b/gi, category: 'Adult Content' },
      { pattern: /\b(child|young|minor|kid|juvenile)\b/gi, category: 'Age-Related' },
      { pattern: /\b(slave|slavery|bound|chained|prisoner)\b/gi, category: 'Sensitive Topics' },
    ];

    // Check for each pattern
    warningPatterns.forEach(({ pattern, category }) => {
      const matches = prompt.match(pattern);
      if (matches && matches.length > 0) {
        potentialIssues.push({
          category,
          matches: [...new Set(matches.map(m => m.toLowerCase()))],
          count: matches.length
        });
      }
    });

    // Try to break down the prompt into sections
    const sections = prompt.split(', ').filter(s => s.trim());
    
    console.log('📋 PROMPT SECTIONS (%d total):', sections.length);
    sections.forEach((section, idx) => {
      const sectionLower = section.toLowerCase();
      let hasWarning = false;
      
      // Check if this section contains problematic terms
      for (const { pattern } of warningPatterns) {
        if (pattern.test(section)) {
          hasWarning = true;
          break;
        }
      }
      
      const marker = hasWarning ? '⚠️ ' : '   ';
      console.log(`${marker}${idx + 1}. ${section}`);
    });
    
    console.log('─'.repeat(80));
    
    if (potentialIssues.length > 0) {
      console.log('%c⚠️  POTENTIAL ISSUES DETECTED:', 'color: #f90; font-weight: 500;');
      potentialIssues.forEach(issue => {
        console.log(`  • ${issue.category}: ${issue.matches.join(', ')} (${issue.count}x)`);
      });
    } else {
      console.log('%c✓ No obvious problematic patterns detected', 'color: #0f0;');
      console.log('  The rejection may be due to:');
      console.log('  • Combination of terms that seem innocent individually');
      console.log('  • Character race/class combinations OpenAI finds problematic');
      console.log('  • Background story content or phrasing');
      console.log('  • OpenAI policy updates or temporary sensitivity changes');
    }
    
    console.log('─'.repeat(80));
    console.log('%c💡 DEBUGGING SUGGESTIONS:', 'color: #0ff; font-weight: 500;');
    console.log('  1. Try regenerating - sometimes the same prompt works on retry');
    console.log('  2. Simplify the backstory or character description');
    console.log('  3. Remove alignment-based descriptions (e.g., "menacing aura")');
    console.log('  4. Adjust weapon/equipment descriptions to be less specific');
    console.log('  5. Use the custom prompt modal to test simplified versions');
    console.log('─'.repeat(80));
    
    return {
      sections,
      potentialIssues,
      hasKnownProblematicTerms: potentialIssues.length > 0
    };
  },
});






// ===== BUNDLE PART: builder-components.js =====

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
            ${opt.text}
          </button>
        `,
      )
      .join('');

    return `
      <div class="question-card" data-question-id="${question.id}">
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
        <input type="text" class="input-field" id="text-input" placeholder="${question.placeholder || 'Type here...'}" data-1p-ignore>
        <button class="button-primary mt-md" onclick="App.handleTextInput('${question.id}')">
          CONTINUE
        </button>
      </div>
    `;
  },

  renderCharacterSheet(
    character,
    portrait = null,
    showPortrait = true,
    extraOptions = {},
  ) {
    const { showGeneratePortraitButton = true, hideOverflowMenu = false } = extraOptions || {};

    // Use the shared CharacterSheet component
    return `
      <div class="character-sheet">
        ${CharacterSheet.render(character, {
          context: 'builder',
          showPortrait: showPortrait,
          // In quick-create mode we may want to suppress the custom AI portrait
          // button until the first custom image has actually been generated.
          onGeneratePortrait: showGeneratePortraitButton,
          onRename: true,
          onTogglePortrait: true,
          onLevelChange: true,
          onPrint: true,
          // Hide overflow menu until character creation is complete (including portrait)
          hideOverflowMenu: hideOverflowMenu,
        })}
      </div>
    `;
  },

  renderSettings() {
    const currentNarratorId = StorageService.getNarratorId();
    const narratorsList = getNarratorList();

    // Check if current user is admin (decode JWT)
    let isUserAdmin = false;
    try {
      if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
        const token = AuthService.getToken ? AuthService.getToken() : null;
        if (token) {
          const payload = token.split('.')[1];
          const decoded = JSON.parse(atob(payload));
          isUserAdmin = decoded.role?.toLowerCase() === 'admin';
        }
      }
    } catch (e) {
      // Silent fail - user is not admin
    }

    // Image quality options per model
    const modelQualityOptions = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      'gpt-image-1.5': [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      // Flux models don't have quality options
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Get default quality for a model
    const getDefaultQuality = (model) => {
      const options = modelQualityOptions[model] || [];
      return options.length > 0 ? options[0].value : null;
    };

    // Get current quality setting for selected model
    const getCurrentImageQuality = (model) => {
      if (!StorageService || typeof StorageService.getImageQuality !== 'function') {
        return getDefaultQuality(model);
      }
      try {
        const quality = StorageService.getImageQuality(model);
        if (quality) return quality;
        // For gpt-image-1, check legacy setting
        if (model === 'gpt-image-1' && StorageService.getHighQualityGPTImage) {
          return StorageService.getHighQualityGPTImage() ? 'high' : 'medium';
        }
        return getDefaultQuality(model);
      } catch (e) {
        return getDefaultQuality(model);
      }
    };

    // Helper to truncate text for options
    const truncate = (text, maxLength) => {
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
    };

    // Helper to format narrator titles: strip emoji/description and use a clean title.
    const formatNarratorTitle = (narrator) => {
      if (!narrator) return '';
      const base = String(narrator.name || narrator.id || '').trim();
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    // Text speed multiplier: defaults to 1x if not set or invalid.
    const getCurrentTextSpeed = () => {
      if (!StorageService || typeof StorageService.getTextSpeedMultiplier !== 'function') {
        return 1;
      }
      try {
        return StorageService.getTextSpeedMultiplier();
      } catch (e) {
        console.warn('Settings: failed to read text speed multiplier', e);
        return 1;
      }
    };

    const currentTextSpeedMultiplier = getCurrentTextSpeed();

    // Image model preference (for custom AI portraits)
    const getCurrentImageModel = () => {
      if (!StorageService || typeof StorageService.getImageModel !== 'function') {
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
      try {
        return StorageService.getImageModel();
      } catch (e) {
        console.warn('Settings: failed to read image model preference', e);
        return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
      }
    };

    const currentNarrator =
      narratorsList.find((n) => n.id === currentNarratorId) || narratorsList[0];
    const currentNarratorLabel = currentNarrator
      ? formatNarratorTitle(currentNarrator)
      : 'Choose narrator';

    const narratorOptionsMenu = narratorsList
      .map((narrator) => {
        const label = formatNarratorTitle(narrator);
        const isSelected = narrator.id === currentNarratorId;
        return `
          <button
            class="selector-option${isSelected ? ' is-selected' : ''}"
            type="button"
            role="option"
            data-value="${narrator.id}"
            aria-selected="${isSelected ? 'true' : 'false'}"
          >
            <span class="selector-option-label">
              ${label}
            </span>
          </button>
        `;
      })
      .join('');

    const textSpeedOptions = [
      { value: 1, label: 'Normal' },
      { value: 1.5, label: 'Fast (1.5×)' },
      { value: 2, label: 'Very Fast (2×)' },
    ];

    const currentTextSpeedOption =
      textSpeedOptions.find((opt) => opt.value === currentTextSpeedMultiplier) ||
      textSpeedOptions[0];
    const currentTextSpeedLabel = currentTextSpeedOption.label;

    const imageModelOptions = [
      { value: 'dall-e-3', label: 'DALL·E 3 (high detail)' },
      { value: 'gpt-image-1', label: 'GPT Image 1 (OpenAI)' },
      { value: 'gpt-image-1.5', label: 'GPT Image 1.5 (faster)' },
      { value: 'flux-1.1-pro', label: 'Flux Pro (high quality)' },
      { value: 'flux-schnell', label: 'Flux Schnell (fast)' },
    ];

    const currentImageModelValue = getCurrentImageModel();
    const currentImageModelOption =
      imageModelOptions.find((opt) => opt.value === currentImageModelValue) ||
      imageModelOptions[0];
    const currentImageModelLabel = currentImageModelOption.label;

    // Quality options for current model
    const currentQualityOptions = modelQualityOptions[currentImageModelValue] || [];
    const currentQualityValue = getCurrentImageQuality(currentImageModelValue);
    const currentQualityOption = currentQualityOptions.find(
      (opt) => opt.value === currentQualityValue,
    ) || currentQualityOptions[0];
    const currentQualityLabel = currentQualityOption?.label || '';
    // Only show quality options to admin users
    const hasQualityOptions = currentQualityOptions.length > 0 && isUserAdmin;

    // Portrait view mode (ASCII vs Original)
    const getPortraitViewMode = () => {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        return StorageService.getPortraitViewMode();
      }
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'original';
    };

    const currentPortraitViewMode = getPortraitViewMode();

    // Portrait prompt theme (for AI-generated portraits)
    const getPortraitPromptTheme = () => {
      try {
        if (window.StorageService && StorageService.getPortraitPromptTheme) {
          return StorageService.getPortraitPromptTheme();
        }
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt theme', e);
      }

      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getDefaultThemeId === 'function'
      ) {
        try {
          return window.PortraitPrompt.getDefaultThemeId();
        } catch (e) {
          // Non-fatal
        }
      }

      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
    };

    const currentPromptThemeId = getPortraitPromptTheme();

    // Note: PortraitPrompt.syncFromAPI() runs automatically on page load for
    // authenticated users (see data-portrait-prompts.js initAutoSync).
    // We don't call it here because renderSettings is synchronous and can't
    // wait for the async sync - we just use whatever themes are already cached.

    let promptThemes = [];
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.getThemes === 'function'
    ) {
      try {
        promptThemes = window.PortraitPrompt.getThemes() || [];
      } catch (e) {
        console.warn('Settings: failed to read portrait prompt themes', e);
      }
    }

    // Fallback to a single default theme when the helper is unavailable.
    if (!Array.isArray(promptThemes) || !promptThemes.length) {
      promptThemes = [
        {
          id: 'cinematic-inks',
          label: 'Cinematic Inks (default)',
          description:
            'More cinematic lighting and framing while staying in black-and-white ink.',
        },
      ];
    }

    // Sort themes alphabetically by id
    promptThemes = promptThemes.slice().sort((a, b) => {
      const nameA = (a.id || '').toLowerCase();
      const nameB = (b.id || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });

    const activePromptTheme =
      promptThemes.find((t) => t.id === currentPromptThemeId) ||
      promptThemes[0];

    // Helper to format a theme id/label into Title Case name.
    const formatThemeName = (theme) => {
      const rawId = (theme && theme.id) || '';
      // Prefer id so custom themes don't inherit any legacy "(default)" suffixes.
      const base = String(rawId || '').trim() || String(theme.label || '');
      if (!base) return '';
      return base
        .split(/[-_\s]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
    };

    const currentPromptThemeLabel = activePromptTheme
      ? formatThemeName(activePromptTheme)
      : 'Cinematic Inks';

    // Color theme options for global settings
    const colorThemeOptions = [
      { value: 'white', label: 'White' },
      { value: 'teal', label: 'Teal' },
      { value: 'green', label: 'Green' },
      { value: 'yellow', label: 'Yellow' },
    ];

    // Get current color theme from theme config
    const getCurrentColorTheme = () => {
      try {
        const stored = localStorage.getItem('danddy_theme_config');
        if (stored) {
          const parsed = JSON.parse(stored);
          return parsed.global || 'yellow';
        }
      } catch (e) {
        console.warn('Settings: failed to read color theme', e);
      }
      return 'yellow';
    };

    const currentColorTheme = getCurrentColorTheme();
    const currentColorThemeOption = colorThemeOptions.find(opt => opt.value === currentColorTheme) || colorThemeOptions[3];
    const currentColorThemeLabel = currentColorThemeOption.label;

    return `
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">Settings</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <div class="settings-group">
                  <div class="settings-group-label">[ Character Sheet ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked">
                      <div class="settings-field">
                        <label class="settings-checkbox-label">
                          <input
                            type="checkbox"
                            class="settings-checkbox"
                            id="show-descriptions-toggle"
                            ${StorageService.getShowDescriptions() ? 'checked' : ''}
                          >
                          <span class="settings-checkbox-text">Show Descriptions</span>
                        </label>
                        <div class="settings-hint settings-hint--small">Show inline descriptions for skills, class resources, traits, etc. When disabled, descriptions appear on hover.</div>
                      </div>
                    </div>
                  </section>
                </div>

                <div class="settings-group">
                  <div class="settings-group-label">[ Image generation ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked mb-lg">
                      <div class="settings-label">Style</div>
                      <div class="settings-field">
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="portrait-theme-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span
                              class="selector-trigger-label"
                              id="portrait-theme-select-label"
                            >
                              ${currentPromptThemeLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Portrait prompt theme"
                            aria-hidden="true"
                          >
                            ${promptThemes
                              .map((theme) => {
                                const isSelected = theme.id === activePromptTheme.id;
                                const label = formatThemeName(theme);
                                return `
                                <button
                                  class="selector-option${
                                    isSelected ? ' is-selected' : ''
                                  }"
                                  type="button"
                                  role="option"
                                  data-value="${theme.id}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="portrait-theme-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${promptThemes
                            .map((theme) => {
                              const label = formatThemeName(theme);
                              return `
                              <option value="${theme.id}" ${
                                theme.id === activePromptTheme.id ? 'selected' : ''
                              }>
                                ${label}
                              </option>
                            `;
                            })
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row-inline mb-lg">
                      <div class="settings-inline-field">
                        <div class="settings-label">AI model</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="image-model-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span class="selector-trigger-label" id="image-model-select-label">
                              ${currentImageModelLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="AI model"
                            aria-hidden="true"
                          >
                            ${imageModelOptions
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentImageModelOption.value;
                                return `
                                <button
                                  class="selector-option${isSelected ? ' is-selected' : ''}"
                                  type="button"
                                  role="option"
                                  data-value="${opt.value}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${opt.label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="image-model-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${imageModelOptions
                            .map(
                              (opt) => `
                              <option value="${opt.value}" ${
                                opt.value === currentImageModelOption.value ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,
                            )
                            .join('')}
                        </select>
                      </div>
                      <div class="settings-inline-field settings-inline-field--quality ${hasQualityOptions ? '' : 'hidden'}" id="quality-selector-container">
                        <div class="settings-label">Quality</div>
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="image-quality-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span class="selector-trigger-label" id="image-quality-select-label">
                              ${currentQualityLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Image quality"
                            aria-hidden="true"
                            id="image-quality-options-menu"
                          >
                            ${currentQualityOptions
                              .map((opt) => {
                                const isSelected =
                                  opt.value === currentQualityOption?.value;
                                return `
                                <button
                                  class="selector-option${isSelected ? ' is-selected' : ''}"
                                  type="button"
                                  role="option"
                                  data-value="${opt.value}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${opt.label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="image-quality-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${currentQualityOptions
                            .map(
                              (opt) => `
                              <option value="${opt.value}" ${
                                opt.value === currentQualityOption?.value ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                    <div class="settings-row settings-row--stacked">
                      <div class="settings-label">Default portrait view</div>
                      <div class="settings-field">
                        <div class="settings-radio-group" role="radiogroup" aria-label="Default portrait view">
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="original"
                              ${currentPortraitViewMode === 'original' ? 'checked' : ''}
                            >
                            <span class="settings-radio-label">Image</span>
                          </label>
                          <label class="settings-radio-option">
                            <input
                              type="radio"
                              name="portrait-view-mode"
                              value="ascii"
                              ${currentPortraitViewMode === 'original' ? '' : 'checked'}
                            >
                            <span class="settings-radio-label">ASCII</span>
                          </label>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>

                <div class="settings-group">
                  <div class="settings-group-label">[ Builder ]</div>
                  <section class="settings-section">
                    <div class="settings-row-inline">
                      <div class="settings-inline-field">
                        <div class="settings-label">Narrator Voice</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                        <button
                          class="terminal-btn selector-trigger"
                          id="narrator-select-trigger"
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded="false"
                          onclick="CharacterSheet.toggleSelectorMenu(this)"
                        >
                          <span class="selector-trigger-label" id="narrator-select-label">
                            ${currentNarratorLabel}
                          </span>
                        </button>
                        <div
                          class="selector-menu"
                          role="listbox"
                          aria-label="Narrator voice"
                          aria-hidden="true"
                        >
                          ${narratorOptionsMenu}
                        </div>
                      </div>
                      <select
                        id="narrator-select"
                        class="terminal-select settings-select hidden"
                      >
                        ${narratorsList
                          .map((narrator) => {
                            const label = formatNarratorTitle(narrator);
                            return `
                            <option value="${narrator.id}" ${
                              narrator.id === currentNarratorId ? 'selected' : ''
                            }>
                              ${label}
                            </option>
                          `;
                          })
                          .join('')}
                      </select>
                    </div>
                    <div class="settings-inline-field">
                      <div class="settings-label">Text Speed</div>
                      <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                        <button
                          class="terminal-btn selector-trigger"
                          id="text-speed-select-trigger"
                          type="button"
                          aria-haspopup="listbox"
                          aria-expanded="false"
                          onclick="CharacterSheet.toggleSelectorMenu(this)"
                        >
                          <span class="selector-trigger-label" id="text-speed-select-label">
                            ${currentTextSpeedLabel}
                          </span>
                        </button>
                        <div
                          class="selector-menu"
                          role="listbox"
                          aria-label="Narrator text speed"
                          aria-hidden="true"
                        >
                          ${textSpeedOptions
                            .map((opt) => {
                              const isSelected =
                                opt.value === currentTextSpeedOption.value;
                              return `
                              <button
                                class="selector-option${isSelected ? ' is-selected' : ''}"
                                type="button"
                                role="option"
                                data-value="${opt.value}"
                                aria-selected="${isSelected ? 'true' : 'false'}"
                              >
                                <span class="selector-option-label">
                                  ${opt.label}
                                </span>
                              </button>
                            `;
                            })
                            .join('')}
                        </div>
                      </div>
                      <select
                        id="text-speed-select"
                        class="terminal-select settings-select hidden"
                      >
                        ${textSpeedOptions
                          .map(
                            (opt) => `
                            <option value="${opt.value}" ${
                              opt.value === currentTextSpeedOption.value
                                ? 'selected'
                                : ''
                            }>
                              ${opt.label}
                            </option>
                          `,
                          )
                          .join('')}
                      </select>
                      </div>
                    </div>
                  </section>
                </div>

                <div class="settings-group">
                  <div class="settings-group-label">[ Display ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked">
                      <div class="settings-label">Color Theme</div>
                      <div class="settings-field">
                        <div class="selector-shell selector-shell--listbox selector-shell--match-width">
                          <button
                            class="terminal-btn selector-trigger"
                            id="color-theme-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                          >
                            <span
                              class="selector-trigger-label"
                              id="color-theme-select-label"
                            >
                              ${currentColorThemeLabel}
                            </span>
                          </button>
                          <div
                            class="selector-menu"
                            role="listbox"
                            aria-label="Color theme"
                            aria-hidden="true"
                          >
                            ${colorThemeOptions
                              .map((opt) => {
                                const isSelected = opt.value === currentColorTheme;
                                return `
                                <button
                                  class="selector-option${isSelected ? ' is-selected' : ''}"
                                  type="button"
                                  role="option"
                                  data-value="${opt.value}"
                                  aria-selected="${isSelected ? 'true' : 'false'}"
                                >
                                  <span class="selector-option-label">
                                    ${opt.label}
                                  </span>
                                </button>
                              `;
                              })
                              .join('')}
                          </div>
                        </div>
                        <select
                          id="color-theme-select"
                          class="terminal-select settings-select hidden"
                        >
                          ${colorThemeOptions
                            .map(
                              (opt) => `
                              <option value="${opt.value}" ${
                                opt.value === currentColorTheme ? 'selected' : ''
                              }>
                                ${opt.label}
                              </option>
                            `,
                            )
                            .join('')}
                        </select>
                      </div>
                    </div>
                  </section>
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="SettingsModal.close()">Cancel</button>
            <button class="terminal-btn terminal-btn-primary" onclick="SettingsModal.save()">Save</button>
          </div>
        </div>
      </div>
    `;
  },
});

// Shared Settings modal used by both the builder and manager screens.
// Handles narrator, text speed, and AI image model preferences.
const SettingsModal = (window.SettingsModal = {
  _escHandler: null,

  open() {
    if (document.getElementById('settingsModal')) return; // Already open

    const settingsHTML = Components.renderSettings();

    // Prefer the main app container when available so the modal is scoped
    // correctly in both builder and manager layouts.
    const host =
      document.querySelector('.app-root') ||
      document.querySelector('.terminal-container') ||
      document.querySelector('.terminal-frame') ||
      document.body;

    host.insertAdjacentHTML('beforeend', settingsHTML);

    const modal = document.getElementById('settingsModal');
    if (modal && typeof window.Utils !== 'undefined' && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    this.initSelectors(modal);

    // ESC key to close
    this._escHandler = (e) => {
      if (e.key === 'Escape') {
        SettingsModal.close();
      }
    };
    document.addEventListener('keydown', this._escHandler);
  },

  /**
   * Initialize settings selectors: wire up option clicks to update the
   * hidden <select> elements and trigger labels.
   * The toggle behavior is handled by onclick="CharacterSheet.toggleSelectorMenu(this)" in the HTML.
   * @param {HTMLElement} modal
   */
  initSelectors(modal) {
    if (!modal) return;

    // Color theme selector
    const colorThemeTrigger = modal.querySelector('#color-theme-select-trigger');
    const colorThemeLabel = modal.querySelector('#color-theme-select-label');
    const colorThemeSelect = modal.querySelector('#color-theme-select');
    const colorThemeOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Color theme"] .selector-option',
    );

    if (colorThemeTrigger && colorThemeLabel && colorThemeSelect && colorThemeOptions.length) {
      colorThemeOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            colorThemeLabel.textContent = label.textContent.trim();
            colorThemeSelect.value = value;
            // Keep menu selection state in sync with the trigger
            colorThemeOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Narrator selector
    const narratorTrigger = modal.querySelector('#narrator-select-trigger');
    const narratorLabel = modal.querySelector('#narrator-select-label');
    const narratorSelect = modal.querySelector('#narrator-select');
    const narratorOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator voice"] .selector-option',
    );

    if (narratorTrigger && narratorLabel && narratorSelect && narratorOptions.length) {
      narratorOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            narratorLabel.textContent = label.textContent.trim();
            narratorSelect.value = value;
            // Keep menu selection state in sync with the trigger
            narratorOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Text speed selector
    const speedTrigger = modal.querySelector('#text-speed-select-trigger');
    const speedLabel = modal.querySelector('#text-speed-select-label');
    const speedSelect = modal.querySelector('#text-speed-select');
    const speedOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Narrator text speed"] .selector-option',
    );

    if (speedTrigger && speedLabel && speedSelect && speedOptions.length) {
      speedOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            speedLabel.textContent = label.textContent.trim();
            speedSelect.value = value;
            // Keep menu selection state in sync with the trigger
            speedOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Quality options per model (duplicated here for initSelectors)
    const modelQualityOptionsMap = {
      'dall-e-3': [
        { value: 'standard', label: 'Standard' },
        { value: 'hd', label: 'HD' },
      ],
      'gpt-image-1': [
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      'gpt-image-1.5': [
        { value: 'low', label: 'Low' },
        { value: 'medium', label: 'Medium' },
        { value: 'high', label: 'High' },
      ],
      'flux-1.1-pro': [],
      'flux-schnell': [],
    };

    // Helper to update quality selector options based on selected model
    const updateQualityOptions = (modelValue) => {
      const qualityContainer = modal.querySelector('#quality-selector-container');
      const qualityLabel = modal.querySelector('#image-quality-select-label');
      const qualitySelect = modal.querySelector('#image-quality-select');
      const qualityMenu = modal.querySelector('#image-quality-options-menu');

      const options = modelQualityOptionsMap[modelValue] || [];

      // Check if current user is admin (decode JWT)
      let isAdmin = false;
      try {
        if (window.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated()) {
          const token = AuthService.getToken ? AuthService.getToken() : null;
          if (token) {
            const payload = token.split('.')[1];
            const decoded = JSON.parse(atob(payload));
            isAdmin = decoded.role?.toLowerCase() === 'admin';
          }
        }
      } catch (e) {
        // Silent fail - user is not admin
      }

      if (!options.length || !isAdmin) {
        // Hide quality selector if model has no quality options or user is not admin
        if (qualityContainer) qualityContainer.classList.add('hidden');
        return;
      }

      // Show quality selector (admin only)
      if (qualityContainer) qualityContainer.classList.remove('hidden');

      // Get saved quality for this model, or default to first option
      let currentQuality = null;
      if (window.StorageService && StorageService.getImageQuality) {
        currentQuality = StorageService.getImageQuality(modelValue);
      }
      if (!currentQuality) {
        currentQuality = options[0].value;
      }

      // Update menu options
      if (qualityMenu) {
        qualityMenu.innerHTML = options
          .map((opt) => {
            const isSelected = opt.value === currentQuality;
            return `
              <button
                class="selector-option${isSelected ? ' is-selected' : ''}"
                type="button"
                role="option"
                data-value="${opt.value}"
                aria-selected="${isSelected ? 'true' : 'false'}"
              >
                <span class="selector-option-label">
                  ${opt.label}
                </span>
              </button>
            `;
          })
          .join('');

        // Re-wire quality option clicks
        const newQualityOptions = qualityMenu.querySelectorAll('.selector-option');
        newQualityOptions.forEach((qOpt) => {
          qOpt.addEventListener('click', (e) => {
            e.stopPropagation();
            const qValue = qOpt.getAttribute('data-value');
            const qLabel = qOpt.querySelector('.selector-option-label');
            if (qValue && qLabel && qualityLabel && qualitySelect) {
              qualityLabel.textContent = qLabel.textContent.trim();
              qualitySelect.value = qValue;
              newQualityOptions.forEach((o) => {
                const isSelected = o === qOpt;
                o.classList.toggle('is-selected', isSelected);
                o.setAttribute('aria-selected', isSelected ? 'true' : 'false');
              });
            }
          });
        });
      }

      // Update hidden select options
      if (qualitySelect) {
        qualitySelect.innerHTML = options
          .map(
            (opt) => `
            <option value="${opt.value}" ${opt.value === currentQuality ? 'selected' : ''}>
              ${opt.label}
            </option>
          `,
          )
          .join('');
      }

      // Update label
      const activeOption = options.find((o) => o.value === currentQuality) || options[0];
      if (qualityLabel && activeOption) {
        qualityLabel.textContent = activeOption.label;
      }
    };

    // Image model selector
    const imageModelTrigger = modal.querySelector('#image-model-select-trigger');
    const imageModelLabel = modal.querySelector('#image-model-select-label');
    const imageModelSelect = modal.querySelector('#image-model-select');
    const imageModelOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="AI model"] .selector-option',
    );

    if (imageModelTrigger && imageModelLabel && imageModelSelect && imageModelOptions.length) {
      imageModelOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            imageModelLabel.textContent = label.textContent.trim();
            imageModelSelect.value = value;
            // Keep menu selection state in sync with the trigger
            imageModelOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
            // Update quality options when model changes
            updateQualityOptions(value);
          }
        });
      });
    }

    // Image quality selector (initial setup)
    const qualityTrigger = modal.querySelector('#image-quality-select-trigger');
    const qualityLabel = modal.querySelector('#image-quality-select-label');
    const qualitySelect = modal.querySelector('#image-quality-select');
    const qualityOptions = modal.querySelectorAll(
      '#image-quality-options-menu .selector-option',
    );

    if (qualityTrigger && qualityLabel && qualitySelect && qualityOptions.length) {
      qualityOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            qualityLabel.textContent = label.textContent.trim();
            qualitySelect.value = value;
            qualityOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }

    // Portrait prompt theme selector
    const themeTrigger = modal.querySelector(
      '#portrait-theme-select-trigger',
    );
    const themeLabel = modal.querySelector('#portrait-theme-select-label');
    const themeSelect = modal.querySelector('#portrait-theme-select');
    const themeOptions = modal.querySelectorAll(
      '.selector-menu[aria-label="Portrait prompt theme"] .selector-option',
    );

    if (themeTrigger && themeLabel && themeSelect && themeOptions.length) {
      themeOptions.forEach((option) => {
        option.addEventListener('click', (e) => {
          e.stopPropagation();
          const value = option.getAttribute('data-value');
          const label = option.querySelector('.selector-option-label');
          if (value && label) {
            themeLabel.textContent = label.textContent.trim();
            themeSelect.value = value;
            // Keep menu selection state in sync with the trigger
            themeOptions.forEach((opt) => {
              const isSelected = opt === option;
              opt.classList.toggle('is-selected', isSelected);
              opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
          }
        });
      });
    }
  },

  close() {
    const modal = document.getElementById('settingsModal');
    if (!modal) {
      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._escHandler) {
        document.removeEventListener('keydown', this._escHandler);
        this._escHandler = null;
      }
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }
  },

  save() {
    // Save color theme selection
    const colorThemeSelect = document.getElementById('color-theme-select');
    if (colorThemeSelect) {
      const newTheme = colorThemeSelect.value;
      try {
        // Get existing theme config or create default
        const THEME_CONFIG_KEY = 'danddy_theme_config';
        let config = {
          global: 'yellow',
          syncAll: true,
          sections: {
            terminal: null,
            narrator: null,
            sheet: null,
            grid: null,
            campaign: null,
            modal: null,
            glow: null,
          },
        };
        const stored = localStorage.getItem(THEME_CONFIG_KEY);
        if (stored) {
          config = { ...config, ...JSON.parse(stored) };
        }
        // Update global theme
        config.global = newTheme;
        // Save to localStorage
        localStorage.setItem(THEME_CONFIG_KEY, JSON.stringify(config));
        // Dispatch event for theme loader to pick up
        window.dispatchEvent(new CustomEvent('danddy:themeConfigChanged', { detail: config }));
      } catch (e) {
        console.warn('Settings: failed to save color theme', e);
      }
    }

    // Save narrator selection
    const narratorSelect = document.getElementById('narrator-select');
    if (narratorSelect && window.StorageService && StorageService.setNarratorId) {
      StorageService.setNarratorId(narratorSelect.value);
    }

    // Save text speed selection
    const textSpeedSelect = document.getElementById('text-speed-select');
    if (textSpeedSelect && window.StorageService && StorageService.setTextSpeedMultiplier) {
      StorageService.setTextSpeedMultiplier(textSpeedSelect.value);
    }

    // Save portrait image model selection
    const imageModelSelect = document.getElementById('image-model-select');
    if (imageModelSelect && window.StorageService && StorageService.setImageModel) {
      StorageService.setImageModel(imageModelSelect.value);
    }

    // Save global portrait view mode (ASCII vs Original)
    // Track if mode changed to trigger UI refresh
    let portraitModeChanged = false;
    const portraitModeInput = document.querySelector(
      'input[name="portrait-view-mode"]:checked',
    );
    if (portraitModeInput && window.StorageService && StorageService.setPortraitViewMode) {
      const oldMode = StorageService.getPortraitViewMode ? StorageService.getPortraitViewMode() : null;
      const newMode = portraitModeInput.value;
      if (oldMode !== newMode) {
        portraitModeChanged = true;
      }
      StorageService.setPortraitViewMode(newMode);
    }

    // Save portrait prompt theme selection
    const portraitThemeSelect = document.getElementById('portrait-theme-select');
    if (
      portraitThemeSelect &&
      window.StorageService &&
      StorageService.setPortraitPromptTheme
    ) {
      StorageService.setPortraitPromptTheme(portraitThemeSelect.value);
    }

    // Save image quality setting for the selected model
    const imageQualitySelect = document.getElementById('image-quality-select');
    const imageModelForQuality = imageModelSelect?.value;
    if (imageQualitySelect && imageModelForQuality && window.StorageService && StorageService.setImageQuality) {
      StorageService.setImageQuality(imageModelForQuality, imageQualitySelect.value);
    }

    // Save "Show Descriptions" toggle
    // Track if this changed to trigger UI refresh
    let descriptionsChanged = false;
    const descriptionsToggle = document.getElementById('show-descriptions-toggle');
    if (descriptionsToggle && window.StorageService && StorageService.setShowDescriptions) {
      const oldValue = StorageService.getShowDescriptions ? StorageService.getShowDescriptions() : true;
      const newValue = descriptionsToggle.checked;
      if (oldValue !== newValue) {
        descriptionsChanged = true;
      }
      StorageService.setShowDescriptions(newValue);
    }

    // Sync preferences to server if logged in (fire and forget)
    if (window.StorageService && StorageService.syncPreferencesToServer) {
      StorageService.syncPreferencesToServer();
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved');
    } else if (typeof showNotification === 'function') {
      showNotification('Settings saved');
    }

    this.close();

    // If portrait view mode or descriptions setting changed, refresh the UI
    if (portraitModeChanged || descriptionsChanged) {
      // Character Manager context: re-render grid and current sheet
      if (typeof UI !== 'undefined' && UI && typeof UI.renderCharacterGrid === 'function') {
        UI.renderCharacterGrid();
        // Re-render the current character sheet if one is selected
        if (typeof AppState !== 'undefined' && AppState && AppState.selectedCharacterId) {
          const selectedChar = AppState.filteredCharacters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          ) || AppState.characters?.find(
            c => c && String(c.id) === String(AppState.selectedCharacterId)
          );
          if (selectedChar) {
            UI.showCharacterSheet(selectedChar);
          }
        }
      }
      // Character Builder context: re-render completion screen if on that step
      if (typeof App !== 'undefined' && App && typeof CharacterState !== 'undefined') {
        const state = CharacterState.get ? CharacterState.get() : null;
        if (state && state.currentQuestionId === 'complete' && state.character) {
          // Re-render the character panel to reflect the new view mode
          const panel = document.getElementById('character-panel');
          if (panel && typeof Components !== 'undefined' && Components.renderCharacterSheet) {
            // Check if portrait is ready (custom portrait exists)
            const hasCustomPortrait = !!state.character.customPortraitAscii;
            // Check if portrait generation is in progress
            const isGenerating = !!(App._quickCreatePortraitGeneration || App._guidedPortraitGenerating || App._quickCreatePortraitPending);
            panel.innerHTML = Components.renderCharacterSheet(state.character, null, true, {
              // Show overflow menu only when creation is complete AND portrait is ready
              hideOverflowMenu: isGenerating || !hasCustomPortrait,
            });
            // Populate the ASCII portrait after rendering
            if (typeof CharacterSheet !== 'undefined' && CharacterSheet.populatePortrait) {
              CharacterSheet.populatePortrait(state.character);
            }
          }
        }
      }
    }
  },
});




// ===== BUNDLE PART: app-api.js =====

// ========================================
// CHARACTER MANAGER - CLOUD API SERVICE
// ========================================
// Handles authentication and cloud storage operations for character-manager

// Shared environment / URL config (single source of truth for the whole app)
const {
  isLocalEnvironment = false,
  API_BASE_URL,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
} = window.DanddyConfig || {};

const DEBUG_CLOUD = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

// ========================================
// AUTH SERVICE
// ========================================
// The unified AuthService is now defined in `danddy-auth.js` and exposed as
// `window.AuthService`. This file only *uses* that shared service (for example,
// via AuthService.getToken() inside API helpers below).

// ========================================
// CHARACTER CLOUD STORAGE SERVICE
// ========================================
const CharacterCloudStorage = (window.CharacterCloudStorage = {
  // Helper to convert spell arrays (objects or strings) to string arrays for backend
  _spellsToStringArray(arr) {
    if (!arr || !Array.isArray(arr)) return [];
    
    return arr.map(item => {
      // If it's an object with a name property, extract the name
      if (typeof item === 'object' && item !== null && item.name) {
        return item.name;
      }
      // If it's already a string, return as-is
      if (typeof item === 'string') {
        return item;
      }
      // Fallback - convert to string
      return String(item);
    });
  },
  
  // Convert localStorage character format to API format (shared mapper)
  _toAPIFormat(character) {
    return window.DanddyCharacterMapper.fromManagerToBackend(character);
  },
  
  // Convert API format to frontend character format (shared mapper)
  _fromAPIFormat(apiChar) {
    return window.DanddyCharacterMapper.fromBackendToManager(apiChar);
  },

  // Map alignment to API enum format
  _mapAlignment(alignment) {
    if (!alignment) return null;
    
    const alignmentMap = {
      'Lawful Good': 'lawful_good',
      'Neutral Good': 'neutral_good',
      'Chaotic Good': 'chaotic_good',
      'Lawful Neutral': 'lawful_neutral',
      'True Neutral': 'true_neutral',
      'Chaotic Neutral': 'chaotic_neutral',
      'Lawful Evil': 'lawful_evil',
      'Neutral Evil': 'neutral_evil',
      'Chaotic Evil': 'chaotic_evil',
    };
    
    return alignmentMap[alignment] || null;
  },

  // Make authenticated API request with automatic retry for transient failures
  async _apiRequest(endpoint, options = {}, retries = 2) {
    const token = AuthService.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
        });

        if (response.status === 401) {
          // Token expired or invalid – handle unexpected logout and notify user
          AuthService.handleUnexpectedLogout?.('character_api_401');
          throw new Error('Your session has expired. Please log in again.');
        }

        // Retry on 5xx server errors (cold start, transient issues)
        if (response.status >= 500 && attempt < retries) {
          console.warn(`[API] Server error ${response.status} on ${endpoint}, retrying (${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
          const detail =
            typeof error.detail === 'string'
              ? error.detail
              : JSON.stringify(error.detail || error);
          console.error('API error response:', error);
          throw new Error(detail || `API error: ${response.status}`);
        }

        // Handle 204 No Content
        if (response.status === 204) {
          return null;
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        // Retry on network errors (Failed to fetch - often CORS/cold start issues)
        const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
        if (isNetworkError && attempt < retries) {
          console.warn(`[API] Network error on ${endpoint}, retrying (${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  },

  // Helper to get portrait mode query param based on user preference
  _getPortraitModeParam() {
    try {
      if (window.StorageService && typeof StorageService.getPortraitViewMode === 'function') {
        const mode = StorageService.getPortraitViewMode();
        if (mode === 'original') {
          return '?portrait_mode=original';
        }
      }
    } catch (e) {
      // Non-fatal - default to including ASCII
    }
    return '';
  },

  // Get all characters for current user
  async getAll() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching all characters from API...');
      }
      const portraitParam = this._getPortraitModeParam();
      const apiChars = await this._apiRequest(`/characters/${portraitParam}`);
      const characters = apiChars.map(c => this._fromAPIFormat(c));
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Retrieved', characters.length, 'characters');
      }
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch characters:', error);
      throw error;
    }
  },

  // Get lightweight character list for current user (no heavy fields)
  async getAllLite() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching LITE character list from API...');
      }
      const apiChars = await this._apiRequest(`/characters/lite`);
      const characters = apiChars.map(c => window.DanddyCharacterMapper.fromBackendLiteToManager(c));
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Retrieved', characters.length, 'lite characters');
      }
      return characters;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch lite characters:', error);
      throw error;
    }
  },

  // Get single character by ID
  async getById(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching character', id);
      }
      const portraitParam = this._getPortraitModeParam();
      const apiChar = await this._apiRequest(`/characters/${id}${portraitParam}`);
      return this._fromAPIFormat(apiChar);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch character:', error);
      throw error;
    }
  },

  // Add new character
  async add(character) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Creating character:', character.name);
      }
      const apiData = this._toAPIFormat(character);
      const apiChar = await this._apiRequest('/characters/', {
        method: 'POST',
        body: JSON.stringify(apiData),
      });
      
      const newChar = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character created with ID:', newChar.id);
      }
      return newChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to create character:', error);
      throw error;
    }
  },

  // Update existing character
  async update(id, updates) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Updating character', id);
      }
      
      // For partial updates, we need to map the frontend fields
      const apiUpdates = {};
      
      // Map common update fields
      if (updates.name !== undefined) apiUpdates.name = updates.name;
      if (updates.level !== undefined) apiUpdates.level = updates.level;
      if (updates.experiencePoints !== undefined) apiUpdates.experience_points = updates.experiencePoints;
      if (updates.alignment !== undefined) {
        // Convert frontend alignment ID (lg, ce, etc.) to backend enum format
        const alignmentMap = {
          'lg': 'lawful_good',
          'ng': 'neutral_good',
          'cg': 'chaotic_good',
          'ln': 'lawful_neutral',
          'n': 'true_neutral',
          'cn': 'chaotic_neutral',
          'le': 'lawful_evil',
          'ne': 'neutral_evil',
          'ce': 'chaotic_evil'
        };
        apiUpdates.alignment = alignmentMap[updates.alignment] || updates.alignment;
      }
      
      // Ability Scores (partial updates from manager)
      if (updates.abilities) {
        const abilities = updates.abilities;
        if (abilities.str !== undefined) apiUpdates.strength = abilities.str;
        if (abilities.dex !== undefined) apiUpdates.dexterity = abilities.dex;
        if (abilities.con !== undefined) apiUpdates.constitution = abilities.con;
        if (abilities.int !== undefined) apiUpdates.intelligence = abilities.int;
        if (abilities.wis !== undefined) apiUpdates.wisdom = abilities.wis;
        if (abilities.cha !== undefined) apiUpdates.charisma = abilities.cha;
      }

      // Combat stats
      if (updates.hitPoints?.max !== undefined) apiUpdates.hit_points_max = updates.hitPoints.max;
      if (updates.hitPoints?.current !== undefined) apiUpdates.hit_points_current = updates.hitPoints.current;
      if (updates.hitPoints?.temp !== undefined) apiUpdates.hit_points_temp = updates.hitPoints.temp;
      if (updates.armorClass !== undefined) apiUpdates.armor_class = updates.armorClass;
      if (updates.initiative !== undefined) apiUpdates.initiative = updates.initiative;
      if (updates.speed !== undefined) apiUpdates.speed = updates.speed;
      
      // Arrays
      if (updates.skillProficiencies !== undefined) apiUpdates.skill_proficiencies = updates.skillProficiencies;
      if (updates.toolProficiencies !== undefined) apiUpdates.tool_proficiencies = updates.toolProficiencies;
      if (updates.languages !== undefined) apiUpdates.languages = updates.languages;
      if (updates.equipment !== undefined) {
        apiUpdates.inventory = updates.equipment.map(item => 
          typeof item === 'string' ? { name: item } : item
        );
      }
      if (updates.conditions !== undefined) apiUpdates.conditions = updates.conditions;
      
      // Spells
      if (updates.cantrips !== undefined) apiUpdates.cantrips = this._spellsToStringArray(updates.cantrips);
      if (updates.spellsKnown !== undefined) apiUpdates.spells_known = this._spellsToStringArray(updates.spellsKnown);
      if (updates.spellsPrepared !== undefined) apiUpdates.spells_prepared = this._spellsToStringArray(updates.spellsPrepared);
      if (updates.spellSlots !== undefined) apiUpdates.spell_slots = updates.spellSlots;
      if (updates.spellSlotsUsed !== undefined) apiUpdates.spell_slots_used = updates.spellSlotsUsed;
      
      // Hit dice and class resources
      if (updates.hitDiceCurrent !== undefined) apiUpdates.hit_dice_current = updates.hitDiceCurrent;
      if (updates.classResources !== undefined) apiUpdates.class_resources = updates.classResources;
      
      // Death saves
      if (updates.death_save_successes !== undefined) apiUpdates.death_save_successes = updates.death_save_successes;
      if (updates.death_save_failures !== undefined) apiUpdates.death_save_failures = updates.death_save_failures;
      
      // Text fields
      if (updates.backstory !== undefined) apiUpdates.backstory = updates.backstory;
      if (updates.sex !== undefined) apiUpdates.sex = updates.sex;
      
      // Portrait data
      if (updates.asciiPortrait !== undefined) apiUpdates.ascii_portrait = updates.asciiPortrait;
      if (updates.originalPortraitUrl !== undefined) apiUpdates.original_portrait_url = updates.originalPortraitUrl;
      if (updates.customPortraitAscii !== undefined) apiUpdates.custom_portrait_ascii = updates.customPortraitAscii;
      if (updates.customPortraitCount !== undefined) apiUpdates.custom_portrait_count = updates.customPortraitCount;
      if (updates.portraitMetadata !== undefined) apiUpdates.portrait_metadata = updates.portraitMetadata;
      
      const apiChar = await this._apiRequest(`/characters/${id}`, {
        method: 'PUT',
        body: JSON.stringify(apiUpdates),
      });
      
      const updatedChar = this._fromAPIFormat(apiChar);
      return updatedChar;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to update character:', error);
      throw error;
    }
  },

  // Delete character
  async delete(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Deleting character', id);
      }
      await this._apiRequest(`/characters/${id}`, { method: 'DELETE' });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character deleted successfully');
      }
      return true;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to delete character:', error);
      throw error;
    }
  },

  // Duplicate character
  async duplicate(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Duplicating character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}/duplicate`, {
        method: 'POST',
      });
      const duplicated = this._fromAPIFormat(apiChar);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character duplicated with ID:', duplicated.id);
      }
      return duplicated;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to duplicate character:', error);
      throw error;
    }
  },

  // Export character as JSON
  async export(id) {
    try {
      const character = await this.getById(id);
      return JSON.stringify(character, null, 2);
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to export character:', error);
      throw error;
    }
  },

  // Import character from JSON
  async import(jsonString) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Importing character from JSON');
      }
      const character = JSON.parse(jsonString);
      
      // Remove ID if it exists (create new character)
      delete character.id;
      delete character.ownerId;
      
      const result = await this.add(character);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character imported with ID:', result.id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to import character:', error);
      return null;
    }
  },

  // Generate unique ID (not used for cloud storage, API generates IDs)
  generateId() {
    return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },

  // ========================================
  // CHARACTER SHARING
  // ========================================

  /**
   * Share a character with another user by username (primary) or email (fallback).
   * @param {number|string} characterId - The character ID to share
   * @param {Object} shareData - { to_username: string } or { to_email: string }
   * @returns {Promise<Object>} The created share record
   */
  async shareCharacterByUsernameOrEmail(characterId, shareData) {
    try {
      const identifier = shareData.to_username 
        ? `@${shareData.to_username}` 
        : shareData.to_email;
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Sharing character', characterId, 'to', identifier);
      }
      const result = await this._apiRequest(`/shares/character/${characterId}`, {
        method: 'POST',
        body: JSON.stringify(shareData),
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Character shared successfully');
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to share character:', error);
      throw error;
    }
  },

  /**
   * Share a character with another user by email (legacy compatibility).
   * @deprecated Use shareCharacterByUsernameOrEmail instead
   */
  async shareCharacter(characterId, email) {
    return this.shareCharacterByUsernameOrEmail(characterId, { to_email: email });
  },

  /**
   * Get pending character shares for the current user.
   * @returns {Promise<Array>} List of pending shares with character previews
   */
  async getPendingShares() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching pending shares...');
      }
      const shares = await this._apiRequest('/shares/pending');
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', shares.length, 'pending shares');
      }
      return shares;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:', error);
      throw error;
    }
  },

  /**
   * Accept a pending character share (creates a copy).
   * @param {number} shareId - The share ID to accept
   * @returns {Promise<Object>} Result with the new character ID
   */
  async acceptShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Accepting share', shareId);
      }
      const result = await this._apiRequest(`/shares/${shareId}/accept`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share accepted, new character ID:', result.character_id);
      }
      return result;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to accept share:', error);
      throw error;
    }
  },

  /**
   * Dismiss a pending character share (ignores forever).
   * @param {number} shareId - The share ID to dismiss
   * @returns {Promise<void>}
   */
  async dismissShare(shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Dismissing share', shareId);
      }
      await this._apiRequest(`/shares/${shareId}/dismiss`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Share dismissed');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to dismiss share:', error);
      throw error;
    }
  },

  /**
   * Leave a shared character (remove yourself as a collaborator).
   * @param {number|string} characterId - The character ID to leave
   * @returns {Promise<void>}
   */
  async leaveSharedCharacter(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Leaving shared character', characterId);
      }
      await this._apiRequest(`/characters/${characterId}/leave`, {
        method: 'POST',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Left shared character');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to leave shared character:', error);
      throw error;
    }
  },

  /**
   * Get all collaborators for a character (owner only).
   * @param {number|string} characterId - The character ID
   * @returns {Promise<Array>} List of collaborators with id, user_email, permission, created_at
   */
  async getCollaborators(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching collaborators for character', characterId);
      }
      const collaborators = await this._apiRequest(`/characters/${characterId}/collaborators`);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', collaborators.length, 'collaborators');
      }
      return collaborators;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch collaborators:', error);
      throw error;
    }
  },

  /**
   * Remove a collaborator from a character (owner only).
   * @param {number|string} characterId - The character ID
   * @param {number} collaboratorId - The collaborator record ID to remove
   * @returns {Promise<void>}
   */
  async removeCollaborator(characterId, collaboratorId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Removing collaborator', collaboratorId, 'from character', characterId);
      }
      await this._apiRequest(`/characters/${characterId}/collaborators/${collaboratorId}`, {
        method: 'DELETE',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Collaborator removed');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to remove collaborator:', error);
      throw error;
    }
  },

  /**
   * Get pending share invitations for a character (owner only).
   * @param {number|string} characterId - The character ID
   * @returns {Promise<Array>} List of pending shares with id, to_email, created_at
   */
  async getPendingSharesForCharacter(characterId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching pending shares for character', characterId);
      }
      const shares = await this._apiRequest(`/shares/character/${characterId}/pending`);
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Found', shares.length, 'pending shares');
      }
      return shares;
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to fetch pending shares:', error);
      throw error;
    }
  },

  /**
   * Cancel a pending share invitation (owner only).
   * @param {number|string} characterId - The character ID
   * @param {number} shareId - The share record ID to cancel
   * @returns {Promise<void>}
   */
  async cancelPendingShare(characterId, shareId) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Canceling pending share', shareId, 'for character', characterId);
      }
      await this._apiRequest(`/shares/character/${characterId}/pending/${shareId}`, {
        method: 'DELETE',
      });
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Pending share canceled');
      }
    } catch (error) {
      console.error('☁️ CLOUD ERROR: Failed to cancel pending share:', error);
      throw error;
    }
  },
});

// ========================================
// MIGRATION UTILITY
// ========================================
const MigrationService = (window.MigrationService = {
  LOCAL_STORAGE_KEY: (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) || 'dnd_characters',
  
  // Check if there are characters in localStorage (excluding demo characters)
  hasLocalCharacters() {
    const characters = this._getLocalCharacters();
    // Only count non-demo characters for migration prompt
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length > 0;
  },

  // Check if there are demo characters in localStorage
  hasDemoCharacters() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return false;
    return characters.some(c => window.DemoCharacters.isDemo(c));
  },

  // Get all local characters (helper)
  _getLocalCharacters() {
    return (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
  },

  // Get count of local characters (excluding demo)
  getLocalCharacterCount() {
    const characters = this._getLocalCharacters();
    const userCharacters = characters.filter(c => 
      !window.DemoCharacters || !window.DemoCharacters.isDemo(c)
    );
    return userCharacters.length;
  },

  // Get count of demo characters
  getDemoCharacterCount() {
    const characters = this._getLocalCharacters();
    if (!window.DemoCharacters) return 0;
    return characters.filter(c => window.DemoCharacters.isDemo(c)).length;
  },

  // Migrate localStorage characters to cloud
  // Options:
  //   includeDemoCharacters: boolean - whether to include demo characters (default: false)
  async migrateToCloud(options = {}) {
    const { includeDemoCharacters = false } = options;
    
    try {
      if (!AuthService.isAuthenticated()) {
        throw new Error('Must be logged in to migrate characters');
      }

      console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');
      
      let localCharacters = this._getLocalCharacters();
      
      // Filter out demo characters if not including them
      if (!includeDemoCharacters && window.DemoCharacters) {
        localCharacters = localCharacters.filter(c => !window.DemoCharacters.isDemo(c));
      }
      
      console.log('📦 MIGRATION: Found', localCharacters.length, 'characters to migrate');
      
      const results = {
        total: localCharacters.length,
        success: 0,
        failed: 0,
        errors: [],
      };

      for (const character of localCharacters) {
        try {
          console.log('📦 MIGRATION: Migrating', character.name);
          // Remove demo flag when migrating to cloud
          const charToMigrate = { ...character };
          delete charToMigrate.isDemo;
          // Generate new ID for cloud (remove demo prefix)
          if (charToMigrate.id && String(charToMigrate.id).startsWith('demo_')) {
            delete charToMigrate.id;
          }
          await CharacterCloudStorage.add(charToMigrate);
          results.success++;
        } catch (error) {
          console.error('📦 MIGRATION ERROR: Failed to migrate', character.name, error);
          results.failed++;
          results.errors.push({ character: character.name, error: error.message });
        }
      }

      console.log('📦 MIGRATION: Complete!', results.success, 'succeeded,', results.failed, 'failed');
      
      return results;
    } catch (error) {
      console.error('📦 MIGRATION ERROR:', error);
      throw error;
    }
  },

  // Backup localStorage data before clearing
  backupLocalStorage() {
    const chars =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
    if (chars && chars.length) {
      const backup = {
        timestamp: new Date().toISOString(),
        characters: chars,
      };
      
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `dnd-characters-backup-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      
      console.log('📦 BACKUP: Created backup of', backup.characters.length, 'characters');
      return true;
    }
    return false;
  },

  // Clear localStorage characters (after successful migration)
  clearLocalStorage() {
    if (window.DanddyStorage) {
      window.DanddyStorage.clearAll();
    } else {
      // Remove primary character storage
      localStorage.removeItem(this.LOCAL_STORAGE_KEY);
      // Also remove any legacy/cache copies of characters to avoid duplicates
      try {
        localStorage.removeItem(this.LOCAL_STORAGE_KEY + '_cache');
      } catch (e) {
        console.warn('📦 CLEAR: Failed to clear local cache key', e);
      }
    }
    if (DEBUG_CLOUD) {
      console.log('📦 CLEAR: Cleared local character storage (including cache, if present)');
    }
  },
});

if (DEBUG_CLOUD) {
  console.log('☁️ Character Manager Cloud API Service loaded');
}

// ========================================
// CAMPAIGN API SERVICE
// ========================================
// Handles campaign and session operations for campaign tracking feature

const DEBUG_CAMPAIGN = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);

const CampaignAPI = (window.CampaignAPI = {
  
  // ========================================
  // HELPER METHODS
  // ========================================
  
  // Make authenticated API request with automatic retry for transient failures
  async _apiRequest(endpoint, options = {}, retries = 2) {
    const { API_BASE_URL } = window.DanddyConfig || {};
    const token = window.AuthService?.getToken();
    
    if (!token) {
      throw new Error('Not authenticated');
    }

    let lastError;
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
            ...options.headers,
          },
        });

        if (response.status === 401) {
          window.AuthService?.handleUnexpectedLogout?.('campaign_api_401');
          throw new Error('Your session has expired. Please log in again.');
        }

        // Retry on 5xx server errors (cold start, transient issues)
        if (response.status >= 500 && attempt < retries) {
          console.warn(`[CampaignAPI] Server error ${response.status} on ${endpoint}, retrying (${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }

        if (!response.ok) {
          const error = await response.json().catch(() => ({ detail: 'Unknown error' }));
          const detail = typeof error.detail === 'string'
            ? error.detail
            : JSON.stringify(error.detail || error);
          console.error('Campaign API error:', error);
          throw new Error(detail || `API error: ${response.status}`);
        }

        if (response.status === 204) {
          return null;
        }

        return await response.json();
      } catch (err) {
        lastError = err;
        // Retry on network errors (Failed to fetch - often CORS/cold start issues)
        const isNetworkError = err.message === 'Failed to fetch' || err.name === 'TypeError';
        if (isNetworkError && attempt < retries) {
          console.warn(`[CampaignAPI] Network error on ${endpoint}, retrying (${attempt + 1}/${retries})...`);
          await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
          continue;
        }
        throw err;
      }
    }
    throw lastError;
  },

  // ========================================
  // CAMPAIGN METHODS
  // ========================================

  /**
   * Get all campaigns the user is a member of
   * @returns {Promise<Array>} List of campaigns
   */
  async getCampaigns() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaigns...');
      const campaigns = await this._apiRequest('/campaigns/');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', campaigns.length, 'campaigns');
      return campaigns;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaigns:', error);
      throw error;
    }
  },

  /**
   * Get past campaigns the user was a member of
   * (campaigns they left or that have been completed/archived)
   * @param {number|null} [characterId] - Optional character ID to filter by specific character
   * @returns {Promise<Array>} List of past campaigns with member info
   */
  async getPastCampaigns(characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching past campaigns...', characterId ? `for character ${characterId}` : '');
      const url = characterId ? `/campaigns/past?character_id=${characterId}` : '/campaigns/past';
      const campaigns = await this._apiRequest(url);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', campaigns.length, 'past campaigns');
      return campaigns;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch past campaigns:', error);
      throw error;
    }
  },

  /**
   * Get historical journal entries for a past campaign
   * @param {number} campaignId
   * @param {number} [limit=100] - Maximum entries to return
   * @returns {Promise<Array>} Journal entries (respecting visibility settings)
   */
  async getPastCampaignJournals(campaignId, limit = 100) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching past campaign journals for', campaignId);
      const journals = await this._apiRequest(`/journal/campaign/${campaignId}/history?limit=${limit}`);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', journals.length, 'journal entries');
      return journals;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch past campaign journals:', error);
      throw error;
    }
  },

  /**
   * Get a single campaign with characters
   * @param {number} campaignId
   * @returns {Promise<Object>} Campaign with characters
   */
  async getCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign:', error);
      throw error;
    }
  },

  /**
   * Create a new campaign
   * @param {Object} data - { name, description? }
   * @returns {Promise<Object>} Created campaign
   */
  async createCampaign(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Creating campaign:', data.name);
      const campaign = await this._apiRequest('/campaigns/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Created with invite code:', campaign.invite_code);
      return campaign;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to create campaign:', error);
      throw error;
    }
  },

  /**
   * Update a campaign
   * @param {number} campaignId
   * @param {Object} data - { name?, description?, status? }
   * @returns {Promise<Object>} Updated campaign
   */
  async updateCampaign(campaignId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Updating campaign', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to update campaign:', error);
      throw error;
    }
  },

  /**
   * Delete a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async deleteCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleting campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Deleted successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to delete campaign:', error);
      throw error;
    }
  },

  /**
   * Regenerate invite code for a campaign
   * @param {number} campaignId
   * @returns {Promise<Object>} Updated campaign with new invite code
   */
  async regenerateInviteCode(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Regenerating invite code for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/regenerate-code`, {
        method: 'POST',
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to regenerate invite code:', error);
      throw error;
    }
  },

  // ========================================
  // JOIN / MEMBERSHIP METHODS
  // ========================================

  /**
   * Join a campaign using an invite code
   * @param {string} inviteCode
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async joinCampaign(inviteCode, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joining with code:', inviteCode);
      const result = await this._apiRequest('/campaigns/join', {
        method: 'POST',
        body: JSON.stringify({
          invite_code: inviteCode,
          character_id: characterId,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Joined campaign:', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to join campaign:', error);
      throw error;
    }
  },

  /**
   * Get all members of a campaign
   * @param {number} campaignId
   * @returns {Promise<Array>} List of members
   */
  async getCampaignMembers(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching members for', campaignId);
      return await this._apiRequest(`/campaigns/${campaignId}/members`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch members:', error);
      throw error;
    }
  },

  /**
   * Assign a character to your campaign membership
   * @param {number} campaignId
   * @param {number} characterId
   * @returns {Promise<Object>} Updated membership
   */
  async assignCharacter(campaignId, characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Assigning character', characterId, 'to campaign', campaignId);
      return await this._apiRequest(
        `/campaigns/${campaignId}/members/assign-character?character_id=${characterId}`,
        { method: 'PUT' }
      );
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to assign character:', error);
      throw error;
    }
  },

  /**
   * Leave a campaign
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async leaveCampaign(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Leaving campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/members/leave`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Left successfully');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to leave campaign:', error);
      throw error;
    }
  },

  // ========================================
  // INVITATION METHODS
  // ========================================

  /**
   * Get pending campaign invitations for the current user
   * @returns {Promise<Array>} List of pending invitations
   */
  async getPendingInvitations() {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations...');
      const invitations = await this._apiRequest('/campaigns/invitations/pending');
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch invitations:', error);
      throw error;
    }
  },

  /**
   * Invite a user to a campaign by username (primary) or email (fallback).
   * @param {number} campaignId
   * @param {string} identifier - Username (starting with @) or email address
   * @returns {Promise<Object>} Invitation result
   */
  async inviteByUsernameOrEmail(campaignId, identifier) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Inviting', identifier, 'to campaign', campaignId);
      
      // Determine if this is a username (@user) or email
      const isUsername = identifier.startsWith('@');
      const body = isUsername 
        ? { username: identifier.substring(1) }  // Remove @ prefix
        : { email: identifier };
      
      return await this._apiRequest(`/campaigns/${campaignId}/invite`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to invite user:', error);
      throw error;
    }
  },

  /**
   * Invite a user to a campaign by email (legacy compatibility)
   * @deprecated Use inviteByUsernameOrEmail instead
   */
  async inviteByEmail(campaignId, email) {
    return this.inviteByUsernameOrEmail(campaignId, email);
  },

  /**
   * Look up a user by username (for invitation/sharing validation)
   * @param {string} username - Username to look up (with or without @ prefix)
   * @returns {Promise<{id: number, username: string}>} User info
   * @throws {Error} If user not found
   */
  async lookupUserByUsername(username) {
    try {
      // Strip @ prefix if present
      const cleanUsername = username.startsWith('@') ? username.substring(1) : username;
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Looking up user by username:', cleanUsername);
      return await this._apiRequest(`/users/lookup?username=${encodeURIComponent(cleanUsername)}`);
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to lookup user:', error);
      throw error;
    }
  },

  /**
   * Get pending invitations sent from a campaign (for DM to see who's been invited)
   * @param {number} campaignId
   * @returns {Promise<Array>} List of pending invitations with email
   */
  async getCampaignPendingInvitations(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Fetching pending invitations for campaign', campaignId);
      const invitations = await this._apiRequest(`/campaigns/${campaignId}/pending-invitations`);
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Found', invitations.length, 'pending invitations');
      return invitations;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to fetch campaign pending invitations:', error);
      throw error;
    }
  },

  /**
   * Accept a campaign invitation
   * @param {number} campaignId
   * @param {number?} characterId - Optional character to assign
   * @returns {Promise<Object>} { campaign, membership }
   */
  async acceptInvitation(campaignId, characterId = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepting invitation for campaign', campaignId);
      const result = await this._apiRequest(`/campaigns/${campaignId}/accept-invitation`, {
        method: 'POST',
        body: JSON.stringify({ character_id: characterId }),
      });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Accepted invitation, now member of', result.campaign.name);
      return result;
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to accept invitation:', error);
      throw error;
    }
  },

  /**
   * Decline a campaign invitation
   * @param {number} campaignId
   * @returns {Promise<void>}
   */
  async declineInvitation(campaignId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declining invitation for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/decline-invitation`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Declined invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to decline invitation:', error);
      throw error;
    }
  },

  /**
   * Revoke a campaign invitation (DM only)
   * @param {number} campaignId
   * @param {number} invitationId - The membership/invitation ID to revoke
   * @returns {Promise<void>}
   */
  async revokeInvitation(campaignId, invitationId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoking invitation', invitationId, 'for campaign', campaignId);
      await this._apiRequest(`/campaigns/${campaignId}/revoke-invitation/${invitationId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('🏰 CAMPAIGN: Revoked invitation');
    } catch (error) {
      console.error('🏰 CAMPAIGN ERROR: Failed to revoke invitation:', error);
      throw error;
    }
  },

  // ========================================
  // SESSION METHODS
  // ========================================

  /**
   * Start a new session for a character
   * @param {number} characterId
   * @param {number?} campaignId - Optional, uses character's campaign if not provided
   * @param {string?} name - Optional session name
   * @returns {Promise<Object>} Created session
   */
  async startSession(characterId, campaignId = null, name = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Starting session for character', characterId);
      const session = await this._apiRequest('/sessions/start', {
        method: 'POST',
        body: JSON.stringify({
          character_id: characterId,
          campaign_id: campaignId,
          name: name,
        }),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Started session #', session.session_number);
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to start session:', error);
      throw error;
    }
  },

  /**
   * End a session with optional post-session log
   * @param {number} sessionId
   * @param {Object?} logData - Optional post-session data
   * @returns {Promise<Object>} Completed session with log
   */
  async endSession(sessionId, logData = null) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Ending session', sessionId);
      const session = await this._apiRequest(`/sessions/${sessionId}/end`, {
        method: 'POST',
        body: JSON.stringify(logData || {}),
      });
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Session ended');
      return session;
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to end session:', error);
      throw error;
    }
  },

  /**
   * Cancel an active session without logging
   * @param {number} sessionId
   * @returns {Promise<Object>} Cancelled session
   */
  async cancelSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Cancelling session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/cancel`, { method: 'POST' });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to cancel session:', error);
      throw error;
    }
  },

  /**
   * Get active session for a character
   * @param {number} characterId
   * @returns {Promise<Object|null>} Active session or null
   */
  async getActiveSession(characterId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Checking active session for character', characterId);
      return await this._apiRequest(`/sessions/active?character_id=${characterId}`);
    } catch (error) {
      // 404 means no active session, which is fine
      if (error.message.includes('404')) {
        return null;
      }
      console.error('🎲 SESSION ERROR: Failed to check active session:', error);
      throw error;
    }
  },

  /**
   * Get session history for a character
   * @param {number} characterId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCharacterSessions(characterId, limit = 20) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for character', characterId);
      return await this._apiRequest(`/sessions/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch character sessions:', error);
      throw error;
    }
  },

  /**
   * Get all sessions for a campaign
   * @param {number} campaignId
   * @param {number} limit - Max sessions to return
   * @returns {Promise<Array>} List of sessions with logs
   */
  async getCampaignSessions(campaignId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching sessions for campaign', campaignId);
      return await this._apiRequest(`/sessions/campaign/${campaignId}?limit=${limit}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch campaign sessions:', error);
      throw error;
    }
  },

  /**
   * Get a specific session
   * @param {number} sessionId
   * @returns {Promise<Object>} Session with log
   */
  async getSession(sessionId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Fetching session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}`);
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to fetch session:', error);
      throw error;
    }
  },

  /**
   * Add or update session log (for backdated entries)
   * @param {number} sessionId
   * @param {Object} logData
   * @returns {Promise<Object>} Session log
   */
  async addSessionLog(sessionId, logData) {
    try {
      if (DEBUG_CAMPAIGN) console.log('🎲 SESSION: Adding log to session', sessionId);
      return await this._apiRequest(`/sessions/${sessionId}/log`, {
        method: 'POST',
        body: JSON.stringify(logData),
      });
    } catch (error) {
      console.error('🎲 SESSION ERROR: Failed to add session log:', error);
      throw error;
    }
  },

  // ========================================
  // JOURNAL ENTRY METHODS
  // ========================================

  /**
   * Get journal entries for a character
   * @param {number} characterId
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} List of journal entries (newest first)
   */
  async getJournalEntries(characterId, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entries for character', characterId);
      return await this._apiRequest(`/journal/character/${characterId}?limit=${limit}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entries:', error);
      throw error;
    }
  },

  /**
   * Get a single journal entry
   * @param {number} entryId
   * @returns {Promise<Object>} Journal entry
   */
  async getJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch entry:', error);
      throw error;
    }
  },

  /**
   * Create a new journal entry
   * @param {Object} data - { character_id, title, content, entry_date, campaign_id? }
   * @returns {Promise<Object>} Created journal entry
   */
  async createJournalEntry(data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating entry:', data.title);
      const entry = await this._apiRequest('/journal/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Created entry', entry.id);
      return entry;
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create entry:', error);
      throw error;
    }
  },

  /**
   * Update a journal entry
   * @param {number} entryId
   * @param {Object} data - { title?, content?, entry_date? }
   * @returns {Promise<Object>} Updated journal entry
   */
  async updateJournalEntry(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Updating entry', entryId);
      return await this._apiRequest(`/journal/${entryId}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to update entry:', error);
      throw error;
    }
  },

  /**
   * Delete a journal entry
   * @param {number} entryId
   * @returns {Promise<void>}
   */
  async deleteJournalEntry(entryId) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleting entry', entryId);
      await this._apiRequest(`/journal/${entryId}`, { method: 'DELETE' });
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Deleted entry', entryId);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to delete entry:', error);
      throw error;
    }
  },

  /**
   * Create a character update linked to a journal entry
   * @param {number} entryId - Journal entry to link
   * @param {Object} data - { xp_gained, gold_change, hp_change, items_acquired, items_lost, conditions }
   * @returns {Promise<Object>} Character update record
   */
  async createCharacterUpdate(entryId, data) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Creating character update for entry', entryId);
      return await this._apiRequest(`/journal/${entryId}/character-update`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to create character update:', error);
      throw error;
    }
  },

  /**
   * Get campaign-wide journal entries with visibility filtering
   * @param {number} campaignId
   * @param {number|null} userId - Optional filter by user ID
   * @param {number} limit - Max entries to return
   * @returns {Promise<Array>} List of journal entries with character_name and user_email
   */
  async getCampaignJournalEntries(campaignId, userId = null, limit = 50) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Fetching campaign entries for', campaignId, 'user filter:', userId);
      let url = `/journal/campaign/${campaignId}?limit=${limit}`;
      if (userId !== null) {
        url += `&user_id=${userId}`;
      }
      return await this._apiRequest(url);
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to fetch campaign entries:', error);
      throw error;
    }
  },

  /**
   * Update journal visibility setting for your campaign membership
   * @param {number} campaignId
   * @param {string} visibility - "private" or "public"
   * @returns {Promise<Object>} Updated membership
   */
  async updateJournalVisibility(campaignId, visibility) {
    try {
      if (DEBUG_CAMPAIGN) console.log('📖 JOURNAL: Updating visibility for campaign', campaignId, 'to', visibility);
      return await this._apiRequest(`/campaigns/${campaignId}/members/journal-visibility`, {
        method: 'PUT',
        body: JSON.stringify({ visibility }),
      });
    } catch (error) {
      console.error('📖 JOURNAL ERROR: Failed to update visibility:', error);
      throw error;
    }
  },
});

if (DEBUG_CAMPAIGN) {
  console.log('🏰 Campaign API Service loaded');
}




// ===== BUNDLE PART: app-character-sheet.js =====

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
      isPinned = false,  // Whether character is pinned
      campaignName = null,  // Name of campaign (for IN CAMPAIGN badge tooltip)
      hasPastAdventures = false,  // Whether character has past campaigns
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
        isPinned,
        campaignName,
        hasPastAdventures,
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
              isPinned,
              campaignName,
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
      isPinned,
      campaignName,
      hasPastAdventures,
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

    // Manager-only: Past Adventures (for users with past campaigns)
    if (context === 'manager' && hasPastAdventures && hasValidManagerId) {
      headerActions.push({
        icon: '↺',
        label: 'Past adventures',
        onclick: `CampaignUI.openPastAdventuresModal('${character.id}')`,
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

    // Manager-only: Navigation buttons in header
    // - "Collapse" to go back to grid view
    // - "Expand" to expand campaign panel (hidden in sheet-campaign view via CSS)
    // Desktop: icon-only, expands to show label on hover
    // Mobile: icon-only always
    const allowExpandControls = window.innerWidth > 1024;

    const charactersButtonHtml =
      context === 'manager' && hasValidManagerId && allowExpandControls
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
      context === 'manager' && hasValidManagerId && allowExpandControls
        ? `
        <button
          class="terminal-btn terminal-btn-small terminal-btn-secondary sheet-edit-btn sheet-nav-btn sheet-nav-btn--to-campaign sheet-nav-btn--expandable"
          type="button"
          onclick="ExpandedView.expand()"
          title="View campaign info"
        ><span class="sheet-nav-btn__icon">↗</span><span class="sheet-nav-btn__label">Expand</span></button>
      `
        : '';

    // Manager-only: Standalone Manage link
    const editButtonHtml =
      context === 'manager' && onEdit && editFn
        ? `<a href="#" class="action-link sheet-edit-link" onclick="${editFn}; return false;" title="Edit character">✎ Manage</a>`
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

    // Left-side nav buttons (expand/collapse) + right-side actions (edit, overflow)
    // Both collapse and expand buttons are included; CSS controls which is visible

    const safeTitle =
      character.name && typeof character.name === 'string'
        ? this.escapeHtml(character.name)
        : '[ CHARACTER SHEET ]';

    const headerClass = context === 'builder' ? 'sheet-title-header sheet-title-header--flush' : 'sheet-title-header';

    // Left-side nav buttons: [collapse/expand] - positioned left of character name
    // Both collapse and expand are included; CSS controls visibility based on view
    const leftNavHtml = (charactersButtonHtml || campaignButtonHtml)
      ? `<div class="sheet-title-nav">${charactersButtonHtml}${campaignButtonHtml}</div>`
      : '';

    // Right-side actions: [edit] [overflow]
    const rightActionsHtml = (editButtonHtml || headerMenu)
      ? `<div class="sheet-title-actions">${editButtonHtml}${headerMenu}</div>`
      : '';

    return `
      <div class="${headerClass}">
        ${leftNavHtml}
        <div class="sheet-title"><span class="sheet-title-name">${safeTitle}</span></div>
        ${rightActionsHtml}
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
      isPinned,
      campaignName,
    } = callbacks;

    // Check if this is a demo character - only show tag in guest mode
    const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
    const isDemoMode = window.DemoCharacters && window.DemoCharacters.isDemoMode();
    
    // Build status badges array - overlays portrait at top-left
    // Order: IN CAMPAIGN, SHARED, PINNED
    const statusBadges = [];
    
    // IN CAMPAIGN status badge
    const characterCampaignId = character.campaignId || character.campaign_id;
    if (characterCampaignId) {
      const campaignTooltip = campaignName 
        ? this.escapeHtml(campaignName)
        : 'In a campaign';
      statusBadges.push(`
        <span class="sheet-status-badge sheet-status-badge--campaign has-tooltip">
          <span class="sheet-status-badge__icon">⚔</span> IN CAMPAIGN
          <span class="custom-tooltip" data-position="right">${campaignTooltip}</span>
        </span>`);
    }
    
    // SHARED status badge
    if (isShared || hasCollaborators) {
      // Format the last updated time
      const updatedAt = character.updatedAt || character.updated_at;
      let lastUpdatedText = '';
      if (updatedAt) {
        lastUpdatedText = window.Utils && Utils.formatCompactDate 
          ? Utils.formatCompactDate(updatedAt)
          : '';
      }
      
      // Format who last updated
      const lastUpdatedBy = lastUpdatedByEmail ? this.escapeHtml(lastUpdatedByEmail) : null;
      
      let tooltipContent = '';
      if (isShared) {
        // Collaborator's view
        const sharedByLine = `Shared by ${this.escapeHtml(ownerEmail || 'unknown')}`;
        let updatedLine = '';
        if (lastUpdatedText) {
          updatedLine = lastUpdatedBy 
            ? `Last updated: ${lastUpdatedText}<br>by ${lastUpdatedBy}`
            : `Last updated: ${lastUpdatedText}`;
        }
        tooltipContent = updatedLine ? `${sharedByLine}<br>${updatedLine}` : sharedByLine;
      } else if (hasCollaborators) {
        // Owner's view
        const sharedWithLine = collaboratorCount === 1 ? 'Shared with 1 user' : `Shared with ${collaboratorCount} users`;
        let updatedLine = '';
        if (lastUpdatedText) {
          updatedLine = lastUpdatedBy 
            ? `Last updated: ${lastUpdatedText}<br>by ${lastUpdatedBy}`
            : `Last updated: ${lastUpdatedText}`;
        }
        tooltipContent = updatedLine ? `${sharedWithLine}<br>${updatedLine}` : sharedWithLine;
      }
      
      statusBadges.push(`
        <span class="sheet-status-badge sheet-status-badge--shared has-tooltip">
          <span class="sheet-status-badge__icon">↔</span> SHARED
          <span class="custom-tooltip" data-position="right">${tooltipContent}</span>
        </span>`);
    }
    
    // PINNED status badge (manager context only)
    if (context === 'manager' && isPinned) {
      statusBadges.push(`
        <span class="sheet-status-badge sheet-status-badge--pinned">
          <span class="sheet-status-badge__icon">◆</span> PINNED
        </span>`);
    }
    
    // Status badges overlay HTML
    const statusOverlayHtml = statusBadges.length > 0
      ? `<div class="sheet-status-overlay">${statusBadges.join('')}</div>`
      : '';

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

    // Demo tag overlays portrait like on cards - only show in guest mode
    const demoTagHtml = (isDemo && isDemoMode) ? '<span class="sheet-demo-tag">SAMPLE</span>' : '';

    return `
      <div class="portrait-container${showOriginalByDefault ? ' portrait-container--original-mode' : ''}">
        ${demoTagHtml}
        ${statusOverlayHtml}
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
          ? `<img id="${originalPortraitId}" class="original-portrait${showOriginalByDefault ? '' : ' is-hidden'}" src="${originalPortraitUrl}" alt="Character portrait" loading="lazy" decoding="async" width="800" height="1000" onload="this.classList.add('is-loaded')">`
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

        // Define these before the try block so they're in scope for agent logging after try/catch
        const inSearchActions = !!triggerEl.closest('.search-actions');
        const inHeaderOverflow = !!triggerEl.closest('.header-overflow');

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
          menu.style.width = '';
          menu.style.minWidth = '';
          menu.style.maxWidth = '';
          menu.style.position = useFixedPositioning ? 'fixed' : 'absolute';
          menu.style.top = '0';
          menu.style.left = '0';
          menu.style.visibility = 'hidden';
          menu.style.display = 'block';
          menu.style.transform = 'none';

          // Force a reflow before measuring to ensure styles are applied.
          // This fixes issues where first-open menus have incorrect dimensions.
          void menu.offsetHeight;

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
              triggerEl.closest('.app-panel--narrator, .left-panel') ||
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

              // Sheet actions menu should open to the left (right-aligned with trigger)
              if (isSheetActionsMenu) {
                // Use right positioning - this anchors the menu's right edge
                // to the trigger's right edge so it opens leftward
                menu.style.right = `${viewportWidth - triggerRect.right}px`;
                menu.style.left = 'auto';
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

        // #region agent log
        if (inHeaderOverflow) {
        }
        
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

  /**
   * Close a selector menu (without toggling).
   * Used when an action inside the menu should close it.
   * @param {HTMLElement} triggerEl - The selector-trigger element
   */
  closeSelectorMenu(triggerEl) {
    if (!triggerEl) return;
    const shell = triggerEl.closest('.selector-shell');
    if (!shell || !shell.classList.contains('is-open')) return;

    const btn = shell.querySelector('.selector-trigger');
    const menu = shell._detachedMenu || shell.querySelector('.selector-menu');
    if (!btn || !menu) return;

    // If focus is inside the menu, move it back to the trigger first
    try {
      const activeEl = document.activeElement;
      if (activeEl && menu.contains(activeEl)) {
        btn.focus();
      }
    } catch (e) {
      // Non-fatal
    }

    // Close animation
    btn.classList.remove('is-open');
    menu.classList.remove('is-open');
    menu.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    shell.classList.remove('is-open');

    // Unlock scroll
    CharacterSheet._updateScrollLock(false);

    // Restore menu to original parent after animation
    if (menu._originalParent) {
      const originalParent = menu._originalParent;
      delete menu._originalParent;
      delete shell._detachedMenu;

      setTimeout(() => {
        menu.classList.remove('portrait-history-menu-detached');
        menu.classList.remove('portrait-history-menu-detached--teal');
        menu.classList.remove('selector-menu-detached');
        menu.style.position = '';
        menu.style.top = '';
        menu.style.left = '';
        menu.style.width = '';
        menu.style.minWidth = '';
        menu.style.maxWidth = '';
        menu.style.maxHeight = '';
        originalParent.appendChild(menu);
      }, 200);
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
   * Check if a value looks like a URL (R2-hosted ASCII portrait).
   * Used to detect migrated ASCII portraits stored in Cloudflare R2.
   */
  isAsciiUrl(value) {
    if (!value || typeof value !== 'string') return false;
    return value.startsWith('http://') || value.startsWith('https://');
  },

  /**
   * Fetch ASCII portrait text from a URL (R2).
   * Results are cached in memory to avoid repeated network requests.
   * @param {string} url - The URL to fetch ASCII from
   * @returns {Promise<string|null>} The ASCII text or null on error
   */
  _asciiCache: {},
  async fetchAsciiFromUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    // Check cache first
    if (this._asciiCache[url]) {
      return this._asciiCache[url];
    }
    
    try {
      const response = await fetch(url);
      if (!response.ok) {
        console.warn('Failed to fetch ASCII from URL:', url, response.status);
        return null;
      }
      const text = await response.text();
      // Cache the result
      this._asciiCache[url] = text;
      return text;
    } catch (error) {
      console.warn('Error fetching ASCII from URL:', url, error);
      return null;
    }
  },

  /**
   * Async version of getAsciiPortrait that resolves URLs to actual ASCII text.
   * Use this when you need the actual ASCII content and the value might be a URL.
   * @param {object} character - The character object
   * @returns {Promise<string|null>} The ASCII portrait text
   */
  async resolveAsciiPortrait(character) {
    const value = this.getAsciiPortrait(character);
    if (!value) return null;
    
    // If it's a URL, fetch the actual ASCII text
    if (this.isAsciiUrl(value)) {
      return await this.fetchAsciiFromUrl(value);
    }
    
    // Otherwise return as-is
    return value;
  },

  /**
   * Determine the best ASCII portrait to use for a character.
   * NOTE: May return a URL if the ASCII is stored in R2. Use resolveAsciiPortrait()
   * if you need the actual ASCII text content.
   * 
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
   * 
   * If asciiArt is a URL (R2-hosted), it will be fetched asynchronously.
   * 
   * @param {HTMLElement} portraitEl
   * @param {string} asciiArt - ASCII text or URL to fetch
   */
  setPortraitContent(portraitEl, asciiArt) {
    if (!portraitEl) return;
    
    // Check if this is a URL that needs to be fetched
    if (this.isAsciiUrl(asciiArt)) {
      // Show loading state while fetching
      portraitEl.classList.add('ascii-portrait--loading');
      
      // Fetch the ASCII from the URL
      this.fetchAsciiFromUrl(asciiArt).then(fetchedAscii => {
        if (fetchedAscii) {
          this._applyAsciiContent(portraitEl, fetchedAscii);
        } else {
          // Fallback if fetch fails
          portraitEl.classList.remove('ascii-portrait--loading');
          portraitEl.innerHTML = '<pre>[ PORTRAIT UNAVAILABLE ]</pre>';
        }
      });
      return;
    }
    
    // Direct ASCII text - apply immediately
    this._applyAsciiContent(portraitEl, asciiArt);
  },
  
  /**
   * Internal helper to apply ASCII content to a portrait element.
   * @private
   */
  _applyAsciiContent(portraitEl, asciiArt) {
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




// ===== BUNDLE PART: app-portraits.js =====

// ========================================
// SHARED PORTRAIT UI MODULE
// - Portrait history modal
// - Keyboard navigation
// - ASCII/original toggle
//
// Used by: Character Manager (and later Character Builder)
// ========================================

(function () {
  const state = {
    context: null, // { type: 'manager', characterId }
    focusIndex: 0,
    escHandler: null,
    keyHandler: null,
  };

  const PortraitUI = (window.PortraitUI = {
    /**
     * Open the portrait history modal for a manager character.
     * @param {string} characterId
     */
    async openManagerHistory(characterId) {
      if (!characterId) return;

      // Avoid duplicate modals
      if (document.getElementById('portraitHistoryModal')) {
        return;
      }

      // Prefer the in-memory manager cache first so we avoid extra localStorage
      // scans or cloud round-trips whenever the character grid has already
      // loaded this character.
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character =
            AppState.characters.find(
              (c) =>
                c &&
                (c.id === characterId ||
                  String(c.id) === String(characterId)),
            ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage facade below.
      }

      // Fallback to hybrid storage facade when the character is not present
      // in the current AppState cache (for example, when opening history
      // from a context that hasn't loaded the grid).
      if (!character) {
        const CharacterStorage = window.CharacterStorage;
        if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
          console.warn(
            'PortraitUI.openManagerHistory: CharacterStorage.getById is not available',
          );
          this.closeHistory();
          return;
        }

        try {
          character = await CharacterStorage.getById(characterId);
        } catch (e) {
          console.error(
            'PortraitUI.openManagerHistory: CharacterStorage.getById failed',
            e,
          );
          this.closeHistory();
          return;
        }
      }

      if (!character) {
        console.warn(
          'PortraitUI.openManagerHistory: character not found for id',
          characterId,
        );
        this.closeHistory();
        return;
      }

      // Normalize metadata + versions using shared helper so builder and
      // manager stay in sync. Fall back to a simple inline version if the
      // helper is unavailable for any reason.
      const normalized =
        window.PortraitHistory &&
        typeof PortraitHistory.normalizeForDisplay === 'function'
          ? PortraitHistory.normalizeForDisplay(character)
          : (() => {
              const fallbackMetadata = character.portraitMetadata || {};
              const fallbackRaw = Array.isArray(fallbackMetadata.versions)
                ? fallbackMetadata.versions
                : [];
              return {
                metadata: fallbackMetadata,
                versions: fallbackRaw,
                hasVersions: fallbackRaw.length > 0,
                hasCustomPortraitWithoutHistory: !fallbackRaw.length,
              };
            })();

      const metadata = normalized.metadata;
      const versions = normalized.versions;
      const hasVersions = normalized.hasVersions;

      // Debug hook to verify manager history is opening with the expected data.
      try {
        console.log('%c🎨 MANAGER PORTRAIT HISTORY OPEN', 'color:#0ff;font-weight:500;');
        console.log('  Character ID:', characterId);
        console.log('  Versions count:', versions.length);
        console.log('  Active version ID:', metadata.activeVersionId || '(none)');
      } catch (e) {
        // Non-fatal logging failure
      }

      // If the character already has a custom portrait but no version history yet,
      // show a helpful empty state rather than the generic "no saved portraits" copy.
      const hasCustomPortraitWithoutHistory =
        normalized.hasCustomPortraitWithoutHistory;

      state.context = {
        type: 'manager',
        characterId,
        metadata,
        // Store the display-ordered versions so focus/index updates match
        // the DOM order.
        versions,
        hasCustomPortraitWithoutHistory,
      };

      const listHtml = this._buildHistoryCardsHtml(
        'manager',
        characterId,
        metadata,
        versions,
        hasCustomPortraitWithoutHistory,
      );

      // Build and insert the full modal once data is ready so there is no
      // intermediate loading skeleton state.
      const modalHtml = `
        <div id="portraitHistoryModal" class="modal show" onclick="PortraitUI.closeHistory()">
          <div class="modal-content portrait-history-modal" onclick="event.stopPropagation();">
            <div class="modal-header">
              <h2 class="modal-title">Portrait History</h2>
              <button class="modal-close" onclick="PortraitUI.closeHistory()">&times;</button>
            </div>
            <div class="modal-body">
              <p class="terminal-text-small terminal-text-dim">
                View previous custom AI portraits for this character.${' '}Choose one to make it active,${' '}or delete versions you no longer need.
              </p>
              <div class="portrait-history-carousel">
                ${
                  versions.length > 1
                    ? `<button
                        type="button"
                        class="portrait-history-nav portrait-history-nav-left"
                        aria-label="Previous portrait"
                        aria-controls="portraitHistoryList"
                        onclick="event.stopPropagation(); PortraitUI.moveFocus(-1);"
                      >
                        <span aria-hidden="true">‹</span>
                      </button>`
                    : ''
                }
                <div
                  id="portraitHistoryList"
                  class="portrait-history-card-row${
                    versions.length === 1 ? ' is-single' : ''
                  }"
                >
                  ${listHtml}
                </div>
                ${
                  versions.length > 1
                    ? `<button
                        type="button"
                        class="portrait-history-nav portrait-history-nav-right"
                        aria-label="Next portrait"
                        aria-controls="portraitHistoryList"
                        onclick="event.stopPropagation(); PortraitUI.moveFocus(1);"
                      >
                        <span aria-hidden="true">›</span>
                      </button>`
                    : ''
                }
              </div>
            </div>
            <div class="modal-footer modal-footer-end">
              <button class="terminal-btn" onclick="PortraitUI.closeHistory()">Cancel</button>
              <button class="terminal-btn terminal-btn-primary" onclick="PortraitUI.confirmSelection()">Use selected</button>
            </div>
          </div>
        </div>
      `;

      // Attach the portrait history modal to the terminal frame/container so
      // its overlay and content stay within the app window instead of the
      // full browser viewport.
      const host =
        document.querySelector('.app-root') ||
        document.querySelector('.terminal-frame') ||
        document.querySelector('.terminal-container') ||
        document.body;
      host.insertAdjacentHTML('beforeend', modalHtml);

      this._populateAsciiPreviews(versions);
      this._initKeyboardFocus();
      this._attachKeyboardHandlers();
    },

    /**
     * Shared ASCII thumbnail cropping.
     * Prefer any host-provided implementation (UI.cropAsciiForThumbnail) and
     * fall back to the standard race/class portrait cropping heuristic.
     */
    cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
      try {
        if (window.UI && typeof window.UI.cropAsciiForThumbnail === 'function') {
          return window.UI.cropAsciiForThumbnail(asciiArt, heightLines, widthChars);
        }
      } catch (e) {
        // Non-fatal: fall through to local implementation
      }

      if (!asciiArt || typeof asciiArt !== 'string') return '';

      const lines = asciiArt.split('\n');
      const totalLines = lines.length;
      const startLine = 0; // Keep top pinned (faces/heads)
      const endLine = Math.min(totalLines, heightLines);

      // HORIZONTAL: Crop equally from both sides to stay centered
      const topLines = lines.slice(startLine, endLine).map((line) => {
        if (line.length <= widthChars) return line;
        const excess = line.length - widthChars;
        const cropLeft = Math.floor(excess / 2);
        return line.slice(cropLeft, cropLeft + widthChars);
      });

      return topLines.join('\n');
    },

    /**
     * Shared helper: return a human-readable subtext for the portrait loader
     * based on the currently selected image model (DALL·E 3 vs GPT Image 1).
     *
     * This is used by both the builder and manager so the cube loader's
     * timing hint stays consistent across apps.
     *
     * @returns {string}
     */
    getImageModelSubtext() {
      let subtext = '(This usually takes 20–30 seconds)';
      try {
        let imageModel = 'dall-e-3';
        if (
          window.StorageService &&
          typeof StorageService.getImageModel === 'function'
        ) {
          imageModel = StorageService.getImageModel();
        } else if (
          typeof CONFIG !== 'undefined' &&
          CONFIG.DEFAULT_IMAGE_MODEL
        ) {
          imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }

        if (imageModel === 'gpt-image-1') {
          subtext = '(This can take up to a minute)';
        } else if (imageModel === 'gpt-image-1.5') {
          subtext = '(GPT Image 1.5 – usually 15–30 seconds)';
        } else if (imageModel === 'flux-1.1-pro') {
          subtext = '(Flux Pro – usually 10–20 seconds)';
        } else if (imageModel === 'flux-schnell') {
          subtext = '(Flux Schnell – usually 5–10 seconds)';
        }
      } catch (e) {
        // Fall back to default subtext on any error.
      }
      return subtext;
    },

    /**
     * Shared portrait "cube" loader for the character sheet portrait area.
     *
     * Normalizes the portrait container and ensures that the fast-spinning
     * cube + status text markup is present. Subsequent calls will *update*
     * the message / subtext / dot state without re-rendering the whole
     * container, so it's safe to call from a timer.
     *
     * @param {HTMLElement} portraitEl
     * @param {{ baseMessage?: string, subtext?: string, dotCount?: number, isLoading?: boolean }} options
     * @returns {HTMLElement|null} the `.portrait-placeholder-text` element
     */
    renderGeneratingLoader(portraitEl, options) {
      if (!portraitEl) return null;

      const opts = options || {};
      const baseMessage = opts.baseMessage || 'Generating character art';
      const subtext =
        opts.subtext || this.getImageModelSubtext() || '(This usually takes 20–30 seconds)';
      const dotCount = Number.isFinite(opts.dotCount) ? opts.dotCount : 1;
      const isLoading = opts.isLoading !== false;

      // Normalize container classes so cube styles work consistently.
      portraitEl.classList.add('ascii-portrait--placeholder');
      if (isLoading) {
        portraitEl.classList.add('ascii-portrait--loading');
      }

      // Ensure the cube + text shell exists once; thereafter only update text.
      // Check for the --generating class on the cube to know if loader is rendered,
      // not just .portrait-placeholder-text which exists in the waiting placeholder too.
      const hasLoader = portraitEl.querySelector('.portrait-placeholder-cube--generating');
      let textEl = portraitEl.querySelector('.portrait-placeholder-text');
      if (!hasLoader) {
        portraitEl.innerHTML = `
          <div class="portrait-placeholder-content">
            <div class="portrait-placeholder-cube-container">
              <div class="portrait-placeholder-cube portrait-placeholder-cube--generating">
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
                <i></i>
              </div>
            </div>
            <div class="portrait-placeholder-text" data-dots="${dotCount}">
              <span class="portrait-placeholder-message">${baseMessage}</span>
              <span class="portrait-placeholder-dots">
                <span class="dot dot-1">.</span>
                <span class="dot dot-2">.</span>
                <span class="dot dot-3">.</span>
              </span>
              <div class="portrait-placeholder-subtext">
                ${subtext}
              </div>
            </div>
          </div>
        `;
        textEl = portraitEl.querySelector('.portrait-placeholder-text');
      } else {
        // Update text + dot state without reconstructing DOM.
        textEl.setAttribute('data-dots', String(dotCount));
        const messageEl =
          textEl.querySelector('.portrait-placeholder-message');
        if (messageEl) {
          messageEl.textContent = baseMessage;
        }
        const subtextEl =
          textEl.querySelector('.portrait-placeholder-subtext');
        if (subtextEl) {
          subtextEl.textContent = subtext;
        }
      }

      return textEl || null;
    },

    // ========================================
    // PUBLIC UI ACTIONS (used by onclick="")
    // ========================================

    closeHistory() {
      // Close any open overflow menus in the modal first
      const openShells = document.querySelectorAll('.portrait-history-modal .selector-shell.is-open');
      openShells.forEach((shell) => {
        const menu = shell._detachedMenu || shell.querySelector('.selector-menu');
        const trigger = shell.querySelector('.selector-trigger');
        
        if (menu && menu._originalParent) {
          // Restore detached menus before removing modal
          menu.classList.remove('portrait-history-menu-detached');
          menu.classList.remove('portrait-history-menu-detached--teal');
          menu._originalParent.appendChild(menu);
          delete menu._originalParent;
          delete shell._detachedMenu;
        }
        
        if (trigger) {
          trigger.classList.remove('is-open');
        }
        if (menu) {
          menu.classList.remove('is-open');
          menu.setAttribute('aria-hidden', 'true');
        }
        shell.classList.remove('is-open');
      });
      
      const modal = document.getElementById('portraitHistoryModal');
      if (modal) modal.remove();

      this._detachKeyboardHandlers();
      state.focusIndex = 0;
      state.context = null;
    },

    selectCard(versionId) {
      const cards = this._getCards();
      if (!cards.length) return;

      let targetIndex = 0;
      cards.forEach((card, i) => {
        const matches = card.getAttribute('data-version-id') === versionId;
        if (matches) {
          targetIndex = i;
        }
      });

      state.focusIndex = targetIndex;
      this._updateFocus();
    },

    moveFocus(delta) {
      const cards = this._getCards();
      if (!cards.length) return;

      const current =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;
      const next = Math.max(0, Math.min(cards.length - 1, current + delta));
      state.focusIndex = next;
      this._updateFocus();
    },

    toggleView(versionId) {
      const asciiEl = document.querySelector(
        `.portrait-history-preview.ascii-portrait[data-version-id="${versionId}"]`,
      );
      const imgEl = document.querySelector(
        `.portrait-history-image[data-version-id="${versionId}"]`,
      );
      // The overflow menu may be detached from the card, so look for the
      // button globally instead of limiting to .portrait-history-actions.
      const btn = document.querySelector(
        `button[data-toggle-version-id="${versionId}"]`,
      );
      // Get the card thumbnail container for original mode styling
      const thumbContainer = asciiEl ? asciiEl.closest('.card-thumbnail') : null;

      if (!imgEl || !asciiEl) return;

      const showingAscii = imgEl.classList.contains('is-hidden');

      if (showingAscii) {
        // Switch to original image
        asciiEl.classList.add('is-hidden');
        imgEl.classList.remove('is-hidden');
        if (thumbContainer) {
          thumbContainer.classList.add('card-thumbnail--original-mode');
        }
        if (btn) {
          const label = btn.querySelector('.selector-option-label');
          if (label) {
            label.textContent = 'View ASCII';
          } else {
            btn.textContent = 'View ASCII';
          }
        }
      } else {
        // Switch back to ASCII art
        imgEl.classList.add('is-hidden');
        asciiEl.classList.remove('is-hidden');
        if (thumbContainer) {
          thumbContainer.classList.remove('card-thumbnail--original-mode');
        }
        if (btn) {
          const label = btn.querySelector('.selector-option-label');
          if (label) {
            label.textContent = 'View original';
          } else {
            btn.textContent = 'View original';
          }
        }
      }
    },

    async confirmSelection() {
      const ctx = state.context;
      if (!ctx || ctx.type !== 'manager') {
        this.closeHistory();
        return;
      }

      const cards = this._getCards();
      if (!cards.length) {
        this.closeHistory();
        return;
      }

      const index =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;
      const card = cards[index];
      if (!card) {
        this.closeHistory();
        return;
      }

      const versionId = card.getAttribute('data-version-id');
      if (!versionId) {
        this.closeHistory();
        return;
      }

      // Debug: log which version is being applied.
      try {
        console.log('%c🎨 MANAGER PORTRAIT USE SELECTED', 'color:#0ff;font-weight:500;');
        console.log('  Character ID:', ctx.characterId);
        console.log('  Selected version ID:', versionId);
      } catch (e) {
        // Non-fatal
      }

      // Show a lightweight inline loading state while we apply the new portrait.
      const modal = document.getElementById('portraitHistoryModal');
      const useBtn =
        modal && modal.querySelector('.modal-footer .terminal-btn-primary');
      const originalLabel = useBtn ? useBtn.textContent : null;
      if (useBtn) {
        useBtn.disabled = true;
        useBtn.textContent = 'Applying...';
      }

      try {
        await this._usePortraitVersionManager(ctx.characterId, versionId);
      } catch (error) {
        console.error(
          'PortraitUI.confirmSelection: failed to apply portrait version',
          error,
        );
        if (typeof window.showNotification === 'function') {
          window.showNotification(
            'Failed to switch portrait. Please try again.',
          );
        }
        // If something went wrong, restore button state so the user can retry.
        if (useBtn) {
          useBtn.disabled = false;
          useBtn.textContent = originalLabel || 'USE SELECTED';
        }
      }
    },

    async viewImageInfo(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      // Prefer AppState cache to ensure we show the most up-to-date data
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
      if (!character) return;

      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const version = versions.find((v) => v.id === versionId);

      if (!version) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('No info available for this portrait.');
        }
        return;
      }

      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      const modalBody = modal.querySelector('.modal-body');
      const modalTitle = modal.querySelector('.modal-title');
      const modalFooter = modal.querySelector('.modal-footer');
      if (!modalBody) return;

      // Store original content to restore on back
      const modalHeader = modal.querySelector('.modal-header');
      const originalBodyHtml = modalBody.innerHTML;
      const originalHeaderHtml = modalHeader ? modalHeader.innerHTML : '';
      const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';
      const originalVersions = state.context?.versions || [];

      // Helper to format labels to title case
      const formatLabel = (str) => {
        if (!str) return null;
        // Replace dashes/underscores with spaces
        let cleaned = str.replace(/[-_]/g, ' ');
        // Title case: capitalize first letter of each word
        if (cleaned.length > 0) {
          cleaned = cleaned.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
          ).join(' ');
        }
        return cleaned;
      };

      // Format model name for display
      const formatModelName = (model) => {
        if (!model) return null;
        const modelNames = {
          'dall-e-3': 'DALL·E 3',
          'gpt-image-1': 'GPT Image 1',
          'gpt-image-1.5': 'GPT Image 1.5',
          'flux-1.1-pro': 'Flux 1.1 Pro',
          'flux-schnell': 'Flux Schnell',
        };
        return modelNames[model] || formatLabel(model);
      };

      // Format quality for display
      const formatQuality = (quality) => {
        if (!quality) return null;
        const qualityNames = {
          'standard': 'Standard',
          'medium': 'Medium',
          'high': 'High',
          'hd': 'HD',
        };
        return qualityNames[quality] || formatLabel(quality);
      };

      // Format date/time for display
      const formatDateTime = (isoString) => {
        if (!isoString) return null;
        try {
          const date = new Date(isoString);
          return date.toLocaleString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          });
        } catch (e) {
          return isoString;
        }
      };

      const styleLabel = formatLabel(version.style) || 'Default';
      const modelLabel = formatModelName(version.model);
      const qualityLabel = formatQuality(version.quality);
      const dateTimeLabel = formatDateTime(version.createdAt);

      // Escape prompt text for safe display
      const escapedPrompt = (version.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const infoHeaderHtml = `
        <h2 class="modal-title">Image Info</h2>
        <button class="modal-close" onclick="PortraitUI.closeHistory()">&times;</button>
      `;

      // Build the info sections
      let infoSections = '';

      // Date/Time
      if (dateTimeLabel) {
        infoSections += `
          <div class="image-info-row">
            <span class="image-info-label">Created</span>
            <span class="image-info-value">${dateTimeLabel}</span>
          </div>
        `;
      }

      // Style
      infoSections += `
        <div class="image-info-row">
          <span class="image-info-label">Style</span>
          <span class="image-info-value">${styleLabel}</span>
        </div>
      `;

      // Model and Quality
      if (modelLabel) {
        let modelDisplay = modelLabel;
        if (qualityLabel) {
          modelDisplay = modelDisplay + ' (' + qualityLabel + ')';
        }
        infoSections += `
          <div class="image-info-row">
            <span class="image-info-label">Model</span>
            <span class="image-info-value">${modelDisplay}</span>
          </div>
        `;
      }

      // Prompt section
      let promptSection = '';
      if (escapedPrompt) {
        promptSection = `
          <div class="image-info-prompt-section">
            <div class="image-info-prompt-label">Prompt</div>
            <pre class="terminal-text portrait-prompt-display">${escapedPrompt}</pre>
          </div>
        `;
      } else {
        promptSection = `
          <div class="image-info-prompt-section">
            <div class="image-info-prompt-label">Prompt</div>
            <p class="terminal-text-dim">No prompt saved for this portrait.</p>
          </div>
        `;
      }

      const infoBodyHtml = `
        <div class="image-info-container">
          <div class="image-info-metadata">
            ${infoSections}
          </div>
          ${promptSection}
        </div>
      `;

      const infoFooterHtml = `
        <button class="terminal-btn" id="portrait-info-back">Back</button>
        ${escapedPrompt ? '<button class="terminal-btn" id="portrait-info-copy">Copy prompt</button>' : ''}
      `;

      // Transform modal to info view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalHeader) modalHeader.innerHTML = infoHeaderHtml;
        modalBody.innerHTML = infoBodyHtml;
        if (modalFooter) modalFooter.innerHTML = infoFooterHtml;
      });

      const backBtn = document.getElementById('portrait-info-back');
      const copyBtn = document.getElementById('portrait-info-copy');

      const goBack = () => {
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalHeader) modalHeader.innerHTML = originalHeaderHtml;
          modalBody.innerHTML = originalBodyHtml;
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-populate ASCII previews after restoring
        if (Array.isArray(originalVersions) && originalVersions.length > 0) {
          this._populateAsciiPreviews(originalVersions);
        }

        this._initKeyboardFocus();
      };

      if (backBtn) {
        backBtn.onclick = goBack;
      }

      if (copyBtn) {
        copyBtn.onclick = async () => {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              await navigator.clipboard.writeText(version.prompt);
            } else {
              const textarea = document.createElement('textarea');
              textarea.value = version.prompt;
              textarea.setAttribute('readonly', '');
              textarea.style.position = 'absolute';
              textarea.style.left = '-9999px';
              document.body.appendChild(textarea);
              textarea.select();
              try {
                document.execCommand('copy');
              } finally {
                document.body.removeChild(textarea);
              }
            }
            if (typeof window.showNotification === 'function') {
              window.showNotification('Prompt copied to clipboard.');
            }
          } catch (error) {
            console.error('PortraitUI.viewImageInfo: failed to copy prompt', error);
            if (typeof window.showNotification === 'function') {
              window.showNotification('Could not copy prompt.');
            }
          }
        };
      }
    },

    // Legacy alias for backwards compatibility
    async viewPrompt(characterId, versionId) {
      return this.viewImageInfo(characterId, versionId);
    },

    deleteVersion(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      const modalBody = modal.querySelector('.modal-body');
      const modalTitle = modal.querySelector('.modal-title');
      const modalFooter = modal.querySelector('.modal-footer');
      if (!modalBody) return;

      // Store original content to restore on cancel
      const originalBodyHtml = modalBody.innerHTML;
      const originalTitle = modalTitle ? modalTitle.textContent : '';
      const originalFooterHtml = modalFooter ? modalFooter.innerHTML : '';
      const originalVersions = state.context?.versions || [];

      // If this is the only portrait, show "create new" prompt instead of delete confirmation
      if (originalVersions.length === 1) {
        const createNewBodyHtml = `
          <p class="terminal-text">
            To delete this portrait, create a new one first.
          </p>
        `;

        const createNewFooterHtml = `
          <button class="terminal-btn" id="portrait-delete-cancel">Cancel</button>
          <button class="terminal-btn terminal-btn-primary" id="portrait-create-new">Create new</button>
        `;

        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = 'Create a New Portrait?';
          modalBody.innerHTML = createNewBodyHtml;
          if (modalFooter) modalFooter.innerHTML = createNewFooterHtml;
        });

        const cancelBtn = document.getElementById('portrait-delete-cancel');
        const createNewBtn = document.getElementById('portrait-create-new');

        if (cancelBtn) {
          cancelBtn.onclick = () => {
            this._animateModalContentResize('portraitHistoryModal', () => {
              if (modalTitle) modalTitle.textContent = originalTitle;
              modalBody.innerHTML = originalBodyHtml;
              if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
            });

            // Re-populate ASCII previews after restoring
            if (Array.isArray(originalVersions) && originalVersions.length > 0) {
              this._populateAsciiPreviews(originalVersions);
            }

            this._initKeyboardFocus();
          };
        }

        if (createNewBtn) {
          createNewBtn.onclick = () => {
            this.closeHistory();
            // Trigger portrait generation for this character in the manager context
            if (typeof window.generatePortraitForCharacter === 'function') {
              window.generatePortraitForCharacter(characterId);
            }
          };
        }

        return;
      }

      // Build the confirmation view using standard modal structure
      const confirmationBodyHtml = `
        <p class="terminal-text">
          Delete this saved portrait version?${' '}This cannot be undone.
        </p>
      `;

      const confirmationFooterHtml = `
        <button class="terminal-btn" id="portrait-delete-cancel">No</button>
        <button class="terminal-btn terminal-btn-primary" id="portrait-delete-confirm">Yes</button>
      `;

      // Transform modal to confirmation view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = 'Confirm Delete';
        modalBody.innerHTML = confirmationBodyHtml;
        if (modalFooter) modalFooter.innerHTML = confirmationFooterHtml;
      });

      // Handle cancel - restore original content
      const cancelBtn = document.getElementById('portrait-delete-cancel');
      const confirmBtn = document.getElementById('portrait-delete-confirm');

      const restoreOriginal = () => {
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = originalTitle;
          modalBody.innerHTML = originalBodyHtml;
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
        });

        // Re-populate ASCII previews after restoring
        if (Array.isArray(originalVersions) && originalVersions.length > 0) {
          this._populateAsciiPreviews(originalVersions);
        }

        this._initKeyboardFocus();
      };

      if (cancelBtn) {
        cancelBtn.onclick = restoreOriginal;
      }

      if (confirmBtn) {
        confirmBtn.onclick = async () => {
          // Prefer AppState cache to ensure we have the most up-to-date data
          let character = null;
          try {
            if (window.AppState && Array.isArray(AppState.characters)) {
              character = AppState.characters.find(
                (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
              ) || null;
            }
          } catch (e) {
            // Non-fatal – fall back to storage lookup below.
          }
          if (!character) {
            character = await CharacterStorage.getById(characterId);
          }
          if (!character) return;

          const metadata = character.portraitMetadata || {};
          const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
          if (!versions.length) {
            this.closeHistory();
            return;
          }

          const remaining = versions.filter((v) => v.id !== versionId);
          const deletedWasActive = metadata.activeVersionId === versionId;

          const updatedMetadata = {
            ...metadata,
            versions: remaining,
            activeVersionId: deletedWasActive
              ? remaining[0]?.id || null
              : metadata.activeVersionId,
          };

          const updates = {
            portraitMetadata: updatedMetadata,
          };

          if (deletedWasActive) {
            if (remaining[0]) {
              updates.originalPortraitUrl =
                remaining[0].url || character.originalPortraitUrl || null;
              updates.customPortraitAscii =
                remaining[0].ascii || character.customPortraitAscii || '';
              updates.portrait = {
                ...(character.portrait || {}),
                url:
                  remaining[0].url ||
                  (character.portrait && character.portrait.url) ||
                  null,
                ascii:
                  remaining[0].ascii ||
                  (character.portrait && character.portrait.ascii) ||
                  '',
              };
            } else {
              // No remaining custom versions – clear custom portrait so we fall back to pre-generated ASCII.
              updates.originalPortraitUrl = null;
              updates.customPortraitAscii = '';
              updates.portrait = {
                ...(character.portrait || {}),
                url: null,
                ascii: character.asciiPortrait || '',
              };
            }
          }

          await CharacterStorage.update(characterId, updates);
          if (window.AppState && typeof AppState.loadCharacters === 'function') {
            await AppState.loadCharacters();
          }
          if (window.UI && typeof UI.render === 'function') {
            UI.render();
          }
          if (typeof window.viewCharacter === 'function') {
            window.viewCharacter(characterId);
          }

          // If no remaining versions, close the modal entirely
          if (!remaining.length) {
            this.closeHistory();
            return;
          }

          // Rebuild and show the updated history view
          const updatedCharacter = await CharacterStorage.getById(characterId);
          if (!updatedCharacter) {
            this.closeHistory();
            return;
          }

          const normalized =
            window.PortraitHistory &&
            typeof PortraitHistory.normalizeForDisplay === 'function'
              ? PortraitHistory.normalizeForDisplay(updatedCharacter)
              : (() => {
                  const fallbackMetadata = updatedCharacter.portraitMetadata || {};
                  const fallbackRaw = Array.isArray(fallbackMetadata.versions)
                    ? fallbackMetadata.versions
                    : [];
                  return {
                    metadata: fallbackMetadata,
                    versions: fallbackRaw,
                    hasVersions: fallbackRaw.length > 0,
                    hasCustomPortraitWithoutHistory: !fallbackRaw.length,
                  };
                })();

          // Update state context with new versions
          state.context = {
            ...state.context,
            metadata: normalized.metadata,
            versions: normalized.versions,
            hasCustomPortraitWithoutHistory: normalized.hasCustomPortraitWithoutHistory,
          };

          const listHtml = this._buildHistoryCardsHtml(
            'manager',
            characterId,
            normalized.metadata,
            normalized.versions,
            normalized.hasCustomPortraitWithoutHistory,
          );

          // Build updated body content
          const updatedBodyHtml = `
            <p class="terminal-text-small terminal-text-dim">
              View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
            </p>
            <div class="portrait-history-carousel">
              ${
                normalized.versions.length > 1
                  ? `<button
                      type="button"
                      class="portrait-history-nav portrait-history-nav-left"
                      aria-label="Previous portrait"
                      aria-controls="portraitHistoryList"
                      onclick="event.stopPropagation(); PortraitUI.moveFocus(-1);"
                    >
                      <span aria-hidden="true">‹</span>
                    </button>`
                  : ''
              }
              <div
                id="portraitHistoryList"
                class="portrait-history-card-row${
                  normalized.versions.length === 1 ? ' is-single' : ''
                }"
              >
                ${listHtml}
              </div>
              ${
                normalized.versions.length > 1
                  ? `<button
                      type="button"
                      class="portrait-history-nav portrait-history-nav-right"
                      aria-label="Next portrait"
                      aria-controls="portraitHistoryList"
                      onclick="event.stopPropagation(); PortraitUI.moveFocus(1);"
                    >
                      <span aria-hidden="true">›</span>
                    </button>`
                  : ''
              }
            </div>
          `;

          // Transform back to history view with updated content
          this._animateModalContentResize('portraitHistoryModal', () => {
            if (modalTitle) modalTitle.textContent = originalTitle;
            modalBody.innerHTML = updatedBodyHtml;
            if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
          });

          // Re-populate ASCII previews and reset focus
          this._populateAsciiPreviews(normalized.versions);
          this._initKeyboardFocus();
        };
      }
    },

    // ========================================
    // INTERNAL HELPERS
    // ========================================

    _buildHistoryCardsHtml(
      context,
      characterId,
      metadata,
      versions,
      hasCustomPortraitWithoutHistory,
    ) {
      const hasVersions = versions.length > 0;

      if (!hasVersions) {
        if (hasCustomPortraitWithoutHistory) {
          return `<div class="terminal-text-small terminal-text-dim portrait-history-callout">
              <p><strong>No portrait history yet.</strong></p>
              <p>This character's portrait was created before the history feature was added.</p>
              <p>Generate a new custom AI portrait to:</p>
              <ul class="portrait-history-callout-list">
                <li>Save your current portrait as Version 1</li>
                <li>Add the new portrait as Version 2</li>
                <li>Enable portrait version switching</li>
              </ul>
            </div>`;
        }

        return `<p class="terminal-text-small terminal-text-dim portrait-history-callout">
              No saved portraits yet.<br><br>
              Generate a custom AI portrait to start building a history.
            </p>`;
      }

      // Check global portrait view mode (ASCII vs Original) to determine default display
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
      const showOriginalByDefault = portraitViewMode === 'original';

      return versions
        .map((v) => {
          const isActive = metadata.activeVersionId === v.id;
          const createdDate = v.createdAt ? new Date(v.createdAt) : null;
          const dateLabel = createdDate
            ? createdDate.toLocaleDateString()
            : '';
          const timeLabel = createdDate
            ? createdDate.toLocaleTimeString()
            : '';
          const title = dateLabel || 'Unknown date';
          const infoText = timeLabel || '';

          const hasImage = !!v.url;
          const hasPrompt = !!v.prompt;

          // Apply visibility based on global portrait view mode:
          // If 'original' mode and we have an image, show image by default (hide ASCII)
          // Otherwise show ASCII by default (hide image)
          const shouldShowOriginal = showOriginalByDefault && hasImage;
          const asciiHiddenClass = shouldShowOriginal ? ' is-hidden' : '';
          const imageHiddenClass = shouldShowOriginal ? '' : ' is-hidden';

          const thumbHtml = `
            <div class="card-thumbnail${shouldShowOriginal ? ' card-thumbnail--original-mode' : ''}">
              <div class="ascii-portrait portrait-history-preview${asciiHiddenClass}" data-version-id="${v.id}"></div>
              ${
                hasImage
                  ? `<img src="${v.url}" alt="${title}" class="portrait-history-image${imageHiddenClass}" data-version-id="${v.id}" onload="this.classList.add('is-loaded')">`
                  : ''
              }
            </div>`;

          // Overflow menu for per-version actions (Info, Delete)
          const actionItems = [];

          // Always show Image Info - displays date, style, model, and prompt (if available)
          actionItems.push(`
            <button
              class="selector-option"
              type="button"
              role="menuitem"
              onclick="event.stopPropagation(); PortraitUI.viewImageInfo('${characterId}', '${v.id}')"
              title="View image generation details"
            >
              <span class="selector-option-icon">ℹ︎</span>
              <span class="selector-option-label">Image info</span>
            </button>
          `);

          actionItems.push(`
            <button
              class="selector-option portrait-history-delete-option"
              type="button"
              role="menuitem"
              onclick="event.stopPropagation(); PortraitUI.deleteVersion('${characterId}', '${v.id}')"
              title="Delete this portrait version"
              aria-label="Delete portrait version"
            >
              <span class="selector-option-icon">×</span>
              <span class="selector-option-label">Delete version</span>
            </button>
          `);

          const actionsMenu =
            actionItems.length > 0
              ? `
              <div class="portrait-history-actions selector-shell selector-shell--actions">
                <button
                  class="terminal-btn-small selector-trigger overflow-trigger portrait-history-overflow-btn"
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded="false"
                  aria-label="More portrait actions"
                  onclick="CharacterSheet.toggleSelectorMenu(this); event.stopPropagation();"
                >
                  <span class="sheet-actions-icon" aria-hidden="true">
                    <span class="sheet-actions-dot dot-1"></span>
                    <span class="sheet-actions-dot dot-2"></span>
                    <span class="sheet-actions-dot dot-3"></span>
                  </span>
                </button>
                <div class="selector-menu portrait-history-menu" role="menu" aria-hidden="true">
                  ${actionItems.join('')}
                </div>
              </div>
            `
              : '';

          return `
            <div class="character-card portrait-history-card${
              isActive ? ' is-selected' : ''
            }" data-version-id="${v.id}" onclick="PortraitUI.selectCard('${v.id}')">
              ${thumbHtml}
              <div class="card-details portrait-history-details">
                <div class="portrait-history-meta">
                  <div class="card-name">${title}</div>
                  <div class="card-info">${infoText || '&nbsp;'}</div>
                </div>
                ${actionsMenu}
              </div>
            </div>
          `;
        })
        .join('');
    },

    // Smoothly animate a modal's content height when its body is "reloaded"
    // (e.g., after deleting a portrait history entry or showing confirmation).
    // Uses a simple FLIP pattern: measure -> update -> animate height from old to new.
    _animateModalContentResize(modalId, updateFn) {
      const modal = document.getElementById(modalId);
      if (!modal || typeof updateFn !== 'function') {
        if (typeof updateFn === 'function') {
          updateFn();
        }
        return;
      }

      const content = modal.querySelector('.modal-content');
      if (!content) {
        updateFn();
        return;
      }

      const startHeight = content.offsetHeight;

      // Apply DOM updates synchronously so we can measure the new height.
      updateFn();

      const endHeight = content.offsetHeight;

      if (!startHeight || !endHeight || startHeight === endHeight) {
        return;
      }

      // Lock the current height, then animate to the new height.
      content.style.height = `${startHeight}px`;
      // Force reflow so the browser registers the starting height.
      // eslint-disable-next-line no-unused-expressions
      content.offsetHeight;

      content.style.transition =
        'height 220ms cubic-bezier(0.2, 0.8, 0.2, 1.05)';
      content.style.height = `${endHeight}px`;

      const cleanup = () => {
        content.style.height = '';
        content.style.transition = '';
        content.removeEventListener('transitionend', cleanup);
      };

      content.addEventListener('transitionend', cleanup);
    },

    _populateAsciiPreviews(versions) {
      if (!Array.isArray(versions) || versions.length === 0) return;

      if (
        window.PortraitHistory &&
        typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
      ) {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
        return;
      }

      // Fallback: simple synchronous population if shared helper is unavailable.
      versions.forEach((v) => {
        if (!v) return;
        const el = document.querySelector(
          `.portrait-history-preview.ascii-portrait[data-version-id="${v.id}"]`,
        );
        if (el && v.ascii) {
          // Use <pre> wrapper for proper CSS flex centering
          el.innerHTML = '';
          const pre = document.createElement('pre');
          pre.textContent = this.cropAsciiForThumbnail(v.ascii);
          el.appendChild(pre);
        }

        const promptEl = document.querySelector(
          `.portrait-history-prompt[data-version-id="${v.id}"]`,
        );
        if (promptEl && v.prompt) {
          promptEl.textContent = v.prompt;
        }
      });
    },

    _getCards() {
      return Array.from(
        document.querySelectorAll('#portraitHistoryModal .character-card'),
      );
    },

    _updateNavButtons(currentIndex) {
      const cards = this._getCards();
      const total = cards.length;
      const prevBtn = document.querySelector(
        '#portraitHistoryModal .portrait-history-nav-left',
      );
      const nextBtn = document.querySelector(
        '#portraitHistoryModal .portrait-history-nav-right',
      );

      const hasMultiple = total > 1;

      if (prevBtn) {
        const disabled = !hasMultiple || currentIndex <= 0;
        prevBtn.disabled = disabled;
        prevBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }

      if (nextBtn) {
        const disabled = !hasMultiple || currentIndex >= total - 1;
        nextBtn.disabled = disabled;
        nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
      }
    },

    _updateFocus() {
      const cards = this._getCards();
      if (!cards.length) return;

      const index =
        typeof state.focusIndex === 'number' ? state.focusIndex : 0;

      cards.forEach((card, i) => {
        const isFocused = i === index;
        card.classList.toggle('is-keyboard-focused', isFocused);
        card.classList.toggle('is-selected', isFocused);
      });

      // Ensure the focused card is scrolled into view within the horizontal
      // list so keyboard and button navigation always reveal the selection.
      const activeCard = cards[index];
      if (activeCard && typeof activeCard.scrollIntoView === 'function') {
        try {
          activeCard.scrollIntoView({
            block: 'nearest',
            inline: 'nearest', // keep the focused card fully visible but do not center it
            behavior: 'smooth',
          });
        } catch (e) {
          // Non-fatal; older browsers may not support options object
          activeCard.scrollIntoView();
        }
      }

      this._updateNavButtons(index);
    },

    _initKeyboardFocus() {
      const cards = this._getCards();
      if (!cards.length) return;

      // Prefer focusing the card that represents the current active portrait,
      // falling back to the first card if no active version is set.
      let initialIndex = 0;
      try {
        const ctx = state.context;
        const activeId = ctx && ctx.metadata && ctx.metadata.activeVersionId;
        if (activeId) {
          const matchIndex = cards.findIndex(
            (card) => card.getAttribute('data-version-id') === activeId,
          );
          if (matchIndex >= 0) {
            initialIndex = matchIndex;
          }
        }
      } catch (e) {
        // Non-fatal: just fall back to index 0
      }

      state.focusIndex = initialIndex;
      this._updateFocus();
    },

    _attachKeyboardHandlers() {
      state.escHandler = (e) => {
        if (e.key === 'Escape') this.closeHistory();
      };

      state.keyHandler = (e) => {
        const modal = document.getElementById('portraitHistoryModal');
        if (!modal) return;

        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          this.moveFocus(-1);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          this.moveFocus(1);
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.moveFocus(-1);
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.moveFocus(1);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          this.confirmSelection();
        }
      };

      document.addEventListener('keydown', state.escHandler);
      document.addEventListener('keydown', state.keyHandler);
    },

    _detachKeyboardHandlers() {
      if (state.escHandler) {
        document.removeEventListener('keydown', state.escHandler);
        state.escHandler = null;
      }
      if (state.keyHandler) {
        document.removeEventListener('keydown', state.keyHandler);
        state.keyHandler = null;
      }
    },

    async _usePortraitVersionManager(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      // Prefer the in-memory AppState cache to avoid stale data from storage.
      // The AppState may contain recent edits that haven't been persisted yet,
      // and using storage directly could cause those edits to be lost.
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }

      // Fallback to storage if not found in AppState cache
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
      if (!character) return;

      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const version = versions.find((v) => v.id === versionId);

      if (!version) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('Portrait version not found.');
        }
        return;
      }

       // Debug: log current vs target portrait details.
      try {
        console.log('%c🎨 MANAGER PORTRAIT APPLY VERSION', 'color:#0ff;font-weight:500;');
        console.log('  Character ID:', characterId);
        console.log('  Applying version ID:', versionId);
        console.log('  Version has ascii:', !!version.ascii, 'len:', (version.ascii || '').length);
        console.log('  Version has url:', !!version.url, 'url:', version.url || '(none)');
        console.log(
          '  Current customPortraitAscii len:',
          (character.customPortraitAscii || '').length,
        );
        console.log(
          '  Current portrait.ascii len:',
          (character.portrait && character.portrait.ascii
            ? character.portrait.ascii.length
            : 0),
        );
      } catch (e) {
        // Non-fatal
      }

      // Immediately patch the visible manager UI so the user sees the new art
      // without needing to wait for storage reload timing or a full refresh.
      try {
        const portraitId = `character-portrait-${characterId}`;
        const originalPortraitId = `original-portrait-${characterId}`;
        const asciiEl = document.getElementById(portraitId);
        const imgEl = document.getElementById(originalPortraitId);
        const container = asciiEl
          ? asciiEl.closest('.portrait-container')
          : null;

        // Update ASCII art if we have a visible container and ASCII content.
        if (asciiEl && version.ascii) {
          if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
            CharacterSheet.setPortraitContent(asciiEl, version.ascii);
          } else {
            // Fallback: use <pre> wrapper for proper CSS flex centering
            asciiEl.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = version.ascii;
            asciiEl.appendChild(pre);
          }
        }

        // Update original image src so "View original art" immediately shows
        // the selected version's image (respecting global portrait view mode).
        if (imgEl && version.url) {
          imgEl.src = version.url;

          if (
            container &&
            window.StorageService &&
            StorageService.getPortraitViewMode
          ) {
            const mode = StorageService.getPortraitViewMode();
            if (mode === 'original') {
              imgEl.addEventListener(
                'load',
                () => {
                  if (asciiEl) {
                    asciiEl.classList.add('is-hidden');
                  }
                  imgEl.classList.remove('is-hidden');
                  container.classList.add('portrait-container--original-mode');
                },
                { once: true },
              );
            }
          }
        }

        // Also update the grid card thumbnail (if it exists) so the list view
        // immediately reflects the selected portrait version.
        // Respect the user's portrait view mode preference (original vs ASCII).
        const thumbEl = document.getElementById(`card-thumb-${characterId}`);
        if (thumbEl) {
          try {
            // Check the user's portrait view mode preference
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

            const showOriginalImage = portraitViewMode === 'original' && !!version.url;

            if (showOriginalImage) {
              // Update to show the original image
              // Check if thumbnail already has an img element
              let imgEl = thumbEl.querySelector('img');
              if (imgEl) {
                // Just update the src
                imgEl.src = version.url;
              } else {
                // Need to switch from ASCII to image mode
                thumbEl.innerHTML = '';
                thumbEl.classList.add('card-thumbnail--image');
                imgEl = document.createElement('img');
                imgEl.src = version.url;
                imgEl.alt = 'Character portrait';
                imgEl.loading = 'lazy';
                imgEl.onload = function() { this.classList.add('is-loaded'); };
                thumbEl.appendChild(imgEl);
              }
            } else if (version.ascii) {
              // Update to show ASCII art
              let croppedArt;
              if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                croppedArt = UI.cropAsciiForThumbnail(version.ascii);
              } else {
                // Fallback: simple top-crop similar to CharacterSheet behavior
                const lines = version.ascii.split('\n');
                const topLines = lines.slice(0, 80).map((line) => line.slice(0, 160));
                croppedArt = topLines.join('\n');
              }
              // Remove image mode class if present
              thumbEl.classList.remove('card-thumbnail--image');
              // Use <pre> wrapper for proper CSS flex centering
              thumbEl.innerHTML = '';
              const pre = document.createElement('pre');
              pre.textContent = croppedArt;
              thumbEl.appendChild(pre);
            }
          } catch (thumbError) {
            console.error(
              'PortraitUI._usePortraitVersionManager: thumbnail update failed',
              thumbError,
            );
          }
        }
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: direct DOM patch failed',
          e,
        );
      }

      const updatedMetadata = {
        ...metadata,
        activeVersionId: version.id,
      };

      const updates = {
        originalPortraitUrl:
          version.url || character.originalPortraitUrl || null,
        customPortraitAscii:
          version.ascii || character.customPortraitAscii || '',
        portraitMetadata: updatedMetadata,
        portrait: {
          ...(character.portrait || {}),
          url:
            version.url ||
            (character.portrait && character.portrait.url) ||
            null,
          ascii:
            version.ascii ||
            (character.portrait && character.portrait.ascii) ||
            '',
        },
      };

      // Persist the change to storage using the shared CharacterStorage
      // facade. This will update either cloud or local data depending on
      // the current auth state. We deliberately do NOT immediately re-render
      // from storage results here to avoid snapping the UI back to any stale
      // data that a just-in-time refetch might return.
      try {
        await CharacterStorage.update(characterId, updates);
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: storage update failed',
          e,
        );
      }

      // Keep AppState in sync for future renders/navigation so that whenever
      // the grid or sheet *does* re-render from state, it uses this new
      // portrait version. We rely on our direct DOM patch above to keep the
      // currently visible sheet/card in sync right away.
      // Use String() comparison to handle type mismatches (cloud IDs may be
      // numeric, but characterId from onclick is always a string).
      try {
        const nextCharacter = { ...character, ...updates };
        const idStr = String(characterId);

        if (window.AppState) {
          if (Array.isArray(AppState.characters)) {
            const idx = AppState.characters.findIndex(
              (c) => c && String(c.id) === idStr,
            );
            if (idx !== -1) {
              AppState.characters[idx] = nextCharacter;
            }
          }
          if (Array.isArray(AppState.filteredCharacters)) {
            const fIdx = AppState.filteredCharacters.findIndex(
              (c) => c && String(c.id) === idStr,
            );
            if (fIdx !== -1) {
              AppState.filteredCharacters[fIdx] = nextCharacter;
            }
          }
        }
      } catch (e) {
        console.error(
          'PortraitUI._usePortraitVersionManager: AppState sync failed',
          e,
        );
      }
      this.closeHistory();
    },
  });

  // Backwards-compatible global hook used by shared-character-sheet.js
  // and any debug tooling that calls openPortraitHistory(characterId).
  if (typeof window.openPortraitHistory !== 'function') {
    window.openPortraitHistory = function (characterId) {
      return PortraitUI.openManagerHistory(characterId);
    };
  }
})();





// ===== BUNDLE PART: demo-characters.js =====

// ========================================
// DEMO CHARACTERS
// ========================================
// Pre-made sample characters available in demo mode (not authenticated).
// These showcase the variety of characters users can create.
// 
// Demo characters can be fetched from the API (characters marked with is_demo=true)
// or fall back to hardcoded characters if the API is unavailable.

(function (global) {
  // Demo character IDs use a special prefix for identification
  const DEMO_PREFIX = 'demo_';
  
  // Key to track if user has been asked about demo migration
  const DEMO_MIGRATION_ASKED_KEY = 'danddy_demo_migration_asked';

  // Demo mode limits
  // Character limit is enforced locally (total characters stored)
  // Portrait limit is enforced by backend (daily quota)
  const DEMO_MAX_USER_CHARACTERS = 3;

  // Cache for loaded ASCII art and demo characters
  let _asciiCache = {};
  let _demoCharactersCache = null;
  let _asciiLoadPromise = null;
  let _apiDemoCharacters = null; // Characters fetched from API
  let _apiDemoFetchPromise = null;

  const DemoCharacters = (global.DemoCharacters = {
    DEMO_PREFIX,
    DEMO_MIGRATION_ASKED_KEY,
    DEMO_MAX_USER_CHARACTERS,

    /**
     * Load ASCII art for a race/class combination from pre-generated files.
     * @param {string} race - Character race
     * @param {string} classType - Character class
     * @returns {Promise<string|null>} ASCII art or null if not found
     */
    async _loadAscii(race, classType) {
      const raceLower = String(race).toLowerCase().replace(/\s+/g, '-');
      const classLower = String(classType).toLowerCase().replace(/\s+/g, '-');
      const key = `${raceLower}-${classLower}`;
      
      if (_asciiCache[key]) return _asciiCache[key];
      
      // Try to load from generated_portraits/ascii/
      const paths = [
        `generated_portraits/ascii/${key}.txt`,
        `./generated_portraits/ascii/${key}.txt`,
        `../generated_portraits/ascii/${key}.txt`,
      ];
      
      for (const path of paths) {
        try {
          const response = await fetch(path);
          if (response.ok) {
            const ascii = await response.text();
            _asciiCache[key] = ascii;
            return ascii;
          }
        } catch (e) {
          // Try next path
        }
      }
      
      return null;
    },

    /**
     * Pre-load ASCII art for all demo characters.
     * Call this on page load to ensure demo characters have ASCII art ready.
     * Characters from API may already have ASCII art, so we skip those.
     * @returns {Promise<void>}
     */
    async loadAsciiForAllDemoCharacters() {
      if (_asciiLoadPromise) return _asciiLoadPromise;
      
      _asciiLoadPromise = (async () => {
        // Skip ASCII loading if user prefers original portraits - ASCII isn't needed for display
        try {
          if (global.StorageService && typeof StorageService.getPortraitViewMode === 'function') {
            const mode = StorageService.getPortraitViewMode();
            if (mode === 'original') {
              console.log('DemoCharacters: Skipping ASCII loading (user prefers original portraits)');
              return;
            }
          }
        } catch (e) {
          // Non-fatal - continue with ASCII loading
        }
        
        const characters = this.getAll();
        console.log('DemoCharacters: Loading ASCII art for', characters.length, 'demo characters...');
        
        let loadedCount = 0;
        let skippedCount = 0;
        const loadPromises = characters.map(async (char) => {
          // Skip if character already has ASCII art (from API)
          if (char.asciiPortrait) {
            skippedCount++;
            console.log(`  ⏭️ Skipped ${char.name} (already has ASCII art)`);
            return;
          }
          
          if (!char.race || !char.class) return;
          const ascii = await this._loadAscii(char.race, char.class);
          if (ascii) {
            // Patch the character object with ASCII art
            char.asciiPortrait = ascii;
            char.asciiPortraitKey = `${char.race}|${char.class}`;
            loadedCount++;
            console.log(`  ✅ Loaded ASCII for ${char.name} (${char.race}-${char.class})`);
          } else {
            console.warn(`  ❌ Failed to load ASCII for ${char.name} (${char.race}-${char.class})`);
          }
        });
        await Promise.all(loadPromises);
        console.log(`DemoCharacters: ASCII art loaded for ${loadedCount} / skipped ${skippedCount} / total ${characters.length} demo characters`);
      })();
      
      return _asciiLoadPromise;
    },
    
    /**
     * Clear the demo characters cache. Useful for testing.
     */
    _clearCache() {
      _demoCharactersCache = null;
      _asciiCache = {};
      _asciiLoadPromise = null;
      _apiDemoCharacters = null;
      _apiDemoFetchPromise = null;
    },

    /**
     * Helper to get portrait mode query param based on user preference.
     * @returns {string} Query string like '?portrait_mode=original' or ''
     */
    _getPortraitModeParam() {
      try {
        if (global.StorageService && typeof StorageService.getPortraitViewMode === 'function') {
          const mode = StorageService.getPortraitViewMode();
          if (mode === 'original') {
            return '?portrait_mode=original';
          }
        }
      } catch (e) {
        // Non-fatal - default to including ASCII
      }
      return '';
    },

    /**
     * Fetch demo characters from the API.
     * @returns {Promise<Array|null>} Array of demo characters or null if fetch failed
     */
    async fetchFromApi() {
      if (_apiDemoFetchPromise) return _apiDemoFetchPromise;

      _apiDemoFetchPromise = (async () => {
        try {
          const apiBase = global.DanddyConfig?.BACKEND_ORIGIN || 'https://danddy-api.onrender.com';
          console.log('DemoCharacters: Fetching demo characters from API...');
          
          const portraitParam = this._getPortraitModeParam();
          const response = await fetch(`${apiBase}/api/characters/demo/list${portraitParam}`);
          if (!response.ok) {
            console.warn('DemoCharacters: API returned', response.status);
            return null;
          }

          const apiChars = await response.json();
          console.log(`DemoCharacters: Fetched ${apiChars.length} demo characters from API`);

          // Transform API response to match expected format
          _apiDemoCharacters = apiChars.map(char => this._transformApiCharacter(char));
          return _apiDemoCharacters;
        } catch (err) {
          console.warn('DemoCharacters: Failed to fetch from API:', err.message);
          return null;
        }
      })();

      return _apiDemoFetchPromise;
    },

    /**
     * Transform an API character response to the format expected by the frontend.
     * @param {Object} apiChar - Character from API
     * @returns {Object} Transformed character
     */
    _transformApiCharacter(apiChar) {
      const nowIso = new Date().toISOString();
      
      return {
        // Use demo prefix for ID to mark as demo character
        id: `${DEMO_PREFIX}${apiChar.id}`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}${apiChar.id}`,
        
        // Basic info
        name: apiChar.name,
        race: apiChar.race,
        class: apiChar.character_class,
        background: apiChar.background,
        alignment: apiChar.alignment,
        sex: apiChar.sex,
        level: apiChar.level || 1,
        
        // Abilities
        abilities: {
          str: apiChar.strength,
          dex: apiChar.dexterity,
          con: apiChar.constitution,
          int: apiChar.intelligence,
          wis: apiChar.wisdom,
          cha: apiChar.charisma,
        },
        
        // Computed stats
        hitPoints: apiChar.hit_points_max,
        armorClass: apiChar.armor_class,
        initiative: apiChar.initiative,
        speed: apiChar.speed,
        
        // Skills and proficiencies
        skillProficiencies: apiChar.skill_proficiencies || [],
        savingThrows: apiChar.saving_throw_proficiencies || [],
        languages: apiChar.languages || [],
        toolProficiencies: apiChar.tool_proficiencies || [],
        
        // Spellcasting
        spellcastingAbility: apiChar.spellcasting_ability,
        cantrips: apiChar.cantrips || [],
        spellsKnown: apiChar.spells_known || [],
        spellSlots: apiChar.spell_slots || {},
        
        // Background and personality
        backstory: apiChar.backstory,
        personalityTrait: apiChar.personality_traits,
        
        // Portrait - use API values
        originalPortraitUrl: apiChar.original_portrait_url,
        asciiPortrait: apiChar.custom_portrait_ascii || apiChar.ascii_portrait,
        
        // Metadata
        createdAt: apiChar.created_at || nowIso,
        updatedAt: apiChar.updated_at || nowIso,
      };
    },

    // Check if a character is a demo character
    isDemo(character) {
      return character && (
        character.isDemo === true ||
        (character.id && String(character.id).startsWith(DEMO_PREFIX))
      );
    },

    // Check if user is in demo mode (not authenticated)
    isDemoMode() {
      return !(global.AuthService && typeof AuthService.isAuthenticated === 'function' && AuthService.isAuthenticated());
    },

    // Check if migration prompt has been shown
    hasMigrationBeenAsked() {
      return localStorage.getItem(DEMO_MIGRATION_ASKED_KEY) === 'true';
    },

    // Mark migration prompt as shown
    markMigrationAsked() {
      localStorage.setItem(DEMO_MIGRATION_ASKED_KEY, 'true');
    },

    // Clear migration asked flag (for testing)
    clearMigrationAsked() {
      localStorage.removeItem(DEMO_MIGRATION_ASKED_KEY);
    },

    // Get all demo characters (cached so ASCII can be patched)
    // Returns API characters if available, otherwise falls back to hardcoded
    getAll() {
      // If we have API characters, use those
      if (_apiDemoCharacters && _apiDemoCharacters.length > 0) {
        return _apiDemoCharacters;
      }
      
      // Fall back to hardcoded characters
      if (!_demoCharactersCache) {
        _demoCharactersCache = [
          this._createLyra(),
          this._createThorgrim(),
          this._createZephyr(),
          this._createSienna(),
          this._createKrazul(),
        ];
      }
      return _demoCharactersCache;
    },

    /**
     * Get all demo characters, fetching from API first.
     * Use this async version when you want to ensure API characters are loaded.
     * @returns {Promise<Array>} Array of demo characters
     */
    async getAllAsync() {
      // Try to fetch from API first
      const apiChars = await this.fetchFromApi();
      if (apiChars && apiChars.length > 0) {
        return apiChars;
      }
      // Fall back to hardcoded characters
      return this.getAll();
    },

    // Get count of demo characters that would be migrated
    getDemoCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => this.isDemo(c)).length;
    },

    // Get count of user-created (non-demo) local characters
    getUserCharacterCount() {
      const localChars = (global.DanddyStorage && global.DanddyStorage.readAll()) || [];
      return localChars.filter(c => !this.isDemo(c)).length;
    },

    // Check if user has reached the character limit in demo mode
    hasReachedCharacterLimit() {
      if (!this.isDemoMode()) return false;
      return this.getUserCharacterCount() >= DEMO_MAX_USER_CHARACTERS;
    },

    // Check if custom art generation is allowed for a character
    // Note: Daily portrait limits are now enforced by the backend.
    // This function only checks if the character type allows custom art.
    canGenerateCustomArt(character) {
      // Sample characters cannot have custom art generated
      if (this.isDemo(character)) {
        return false;
      }
      // All other characters can have custom art (backend enforces daily quota)
      return true;
    },

    // ========================================
    // DEMO CHARACTER 1: Lyra Starwhisper
    // ========================================
    // Female Elf Wizard - scholarly and mystical
    _createLyra() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}lyra`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}lyra_starwhisper`,
        name: 'Lyra Starwhisper',
        race: 'elf',
        class: 'wizard',
        background: 'sage',
        alignment: 'ng',
        sex: 'female',
        level: 5,
        
        // Abilities (point buy optimized for wizard)
        abilities: {
          str: 8,
          dex: 14,
          con: 13,
          int: 17,  // Primary stat + racial bonus
          wis: 12,
          cha: 10,
        },
        baseAbilities: {
          str: 8,
          dex: 12,  // Before racial +2
          con: 13,
          int: 17,
          wis: 12,
          cha: 10,
        },
        
        // Computed stats
        hitPoints: 27,  // 6 + 4*4 + 5*1 (CON mod) = 27
        armorClass: 12, // 10 + DEX mod
        initiative: 2,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 3,
          wis: 1,
          cha: 0,
        },
        
        // Skills
        skillProficiencies: ['arcana', 'history', 'investigation', 'insight'],
        skillModifiers: {
          arcana: 6,      // INT + prof
          history: 6,     // INT + prof (sage)
          investigation: 6,
          insight: 4,     // WIS + prof (sage)
          perception: 3,  // WIS + racial keen senses
        },
        
        // Saving throws
        savingThrows: ['int', 'wis'],
        savingThrowModifiers: {
          str: -1,
          dex: 2,
          con: 1,
          int: 6,  // Proficient
          wis: 4,  // Proficient
          cha: 0,
        },
        
        // Languages
        languages: ['Common', 'Elvish', 'Draconic', 'Celestial'],
        
        // Equipment
        equipment: [
          'Spellbook',
          'Arcane focus (crystal orb)',
          'Scholar\'s pack',
          'Dagger',
          'Component pouch',
          'Bottle of black ink',
          'Quill',
          'Robes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'int',
        cantrips: ['Fire Bolt', 'Mage Hand', 'Prestidigitation', 'Light'],
        spellsKnown: [
          'Magic Missile',
          'Shield',
          'Detect Magic',
          'Mage Armor',
          'Misty Step',
          'Hold Person',
          'Fireball',
          'Counterspell',
        ],
        spellSlots: {
          1: 4,
          2: 3,
          3: 2,
        },
        
        // Race data
        raceData: {
          name: 'Elf',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Keen Senses', 'Fey Ancestry', 'Trance'],
          languages: ['Common', 'Elvish'],
        },
        
        // Class data
        classData: {
          name: 'Wizard',
          hitDie: 6,
          primaryAbility: ['int'],
          savingThrows: ['int', 'wis'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Sage',
          feature: {
            name: 'Researcher',
            description: 'When you attempt to learn or recall a piece of lore, if you don\'t know it, you often know where and from whom you can obtain it.',
          },
        },
        
        // Personality
        backstory: 'Lyra spent decades studying in the Silverspire Academy, where she discovered an ancient tome that hinted at forgotten magic from before the Sundering. Now she travels the realm, seeking fragments of lost arcane knowledge.',
        personalityTrait: 'I\'m convinced there\'s a logical explanation for everything, and I won\'t rest until I find it.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 2: Thorgrim Ironforge
    // ========================================
    // Male Dwarf Fighter - classic warrior tank
    _createThorgrim() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}thorgrim`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}thorgrim_ironforge`,
        name: 'Thorgrim Ironforge',
        race: 'dwarf',
        class: 'fighter',
        background: 'soldier',
        alignment: 'lg',
        sex: 'male',
        level: 3,
        
        // Abilities (strong and tough)
        abilities: {
          str: 16,
          dex: 12,
          con: 16,  // +2 racial
          int: 10,
          wis: 13,
          cha: 8,
        },
        baseAbilities: {
          str: 16,
          dex: 12,
          con: 14,
          int: 10,
          wis: 13,
          cha: 8,
        },
        
        // Computed stats
        hitPoints: 31,  // 10 + 2*6 + 3*3 = 31 (with CON mod)
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 1,
        speed: 25,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 1,
          con: 3,
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'perception', 'survival'],
        skillModifiers: {
          athletics: 5,     // STR + prof
          intimidation: 1,  // CHA + prof
          perception: 3,    // WIS + prof
          survival: 3,      // WIS + prof
        },
        
        // Saving throws
        savingThrows: ['str', 'con'],
        savingThrowModifiers: {
          str: 5,  // Proficient
          dex: 1,
          con: 5,  // Proficient
          int: 0,
          wis: 1,
          cha: -1,
        },
        
        // Languages
        languages: ['Common', 'Dwarvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Battleaxe',
          'Handaxes (2)',
          'Explorer\'s pack',
          'Insignia of rank',
          'Trophy from fallen enemy',
          'Bone dice',
        ],
        
        // Race data
        raceData: {
          name: 'Dwarf',
          size: 'Medium',
          speed: 25,
          traits: ['Darkvision', 'Dwarven Resilience', 'Stonecunning'],
          languages: ['Common', 'Dwarvish'],
        },
        
        // Class data
        classData: {
          name: 'Fighter',
          hitDie: 10,
          primaryAbility: ['str', 'dex'],
          savingThrows: ['str', 'con'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Soldier',
          feature: {
            name: 'Military Rank',
            description: 'You have a military rank from your career as a soldier. Soldiers loyal to your former organization still recognize your authority and influence.',
          },
        },
        
        // Personality
        backstory: 'Thorgrim served twenty years in the Ironforge Legion, defending the mountain holds from orc raids and goblin incursions. After the Battle of Redstone Pass, where he was the sole survivor of his unit, he set out to forge his own legend.',
        personalityTrait: 'I face problems head-on. A simple, direct solution is the best path to success.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 3: Zephyr Nightshade
    // ========================================
    // Non-binary Tiefling Rogue - stealthy and charismatic
    _createZephyr() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}zephyr`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}zephyr_nightshade`,
        name: 'Zephyr Nightshade',
        race: 'tiefling',
        class: 'rogue',
        background: 'criminal',
        alignment: 'cn',
        sex: 'non-binary',
        level: 4,
        
        // Abilities (quick and charming)
        abilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 14,  // +1 racial
          wis: 10,
          cha: 15,  // +2 racial
        },
        baseAbilities: {
          str: 10,
          dex: 17,
          con: 12,
          int: 13,
          wis: 10,
          cha: 13,
        },
        
        // Computed stats
        hitPoints: 27,  // 8 + 3*5 + 4*1 = 27
        armorClass: 14, // Leather (11) + DEX mod (3)
        initiative: 3,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 0,
          dex: 3,
          con: 1,
          int: 2,
          wis: 0,
          cha: 2,
        },
        
        // Skills (rogues get 4 + 2 from background)
        skillProficiencies: ['acrobatics', 'deception', 'sleight-of-hand', 'stealth', 'perception', 'persuasion'],
        skillModifiers: {
          acrobatics: 5,      // DEX + prof
          deception: 4,       // CHA + prof
          'sleight-of-hand': 7, // DEX + prof + expertise
          stealth: 7,         // DEX + prof + expertise
          perception: 2,      // WIS + prof
          persuasion: 4,      // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['dex', 'int'],
        savingThrowModifiers: {
          str: 0,
          dex: 5,  // Proficient
          con: 1,
          int: 4,  // Proficient
          wis: 0,
          cha: 2,
        },
        
        // Languages
        languages: ['Common', 'Infernal', 'Thieves\' Cant'],
        
        // Tool proficiencies
        toolProficiencies: ['Thieves\' tools', 'Playing cards'],
        
        // Equipment
        equipment: [
          'Leather armor',
          'Rapier',
          'Shortbow',
          'Arrows (20)',
          'Thieves\' tools',
          'Burglar\'s pack',
          'Crowbar',
          'Dark hooded cloak',
        ],
        
        // Race data
        raceData: {
          name: 'Tiefling',
          size: 'Medium',
          speed: 30,
          traits: ['Darkvision', 'Hellish Resistance', 'Infernal Legacy'],
          languages: ['Common', 'Infernal'],
        },
        
        // Class data
        classData: {
          name: 'Rogue',
          hitDie: 8,
          primaryAbility: ['dex'],
          savingThrows: ['dex', 'int'],
          spellcaster: false,
        },
        
        // Background data
        backgroundData: {
          name: 'Criminal',
          feature: {
            name: 'Criminal Contact',
            description: 'You have a reliable contact who acts as your liaison to a network of criminals. You can get messages to and from your contact even over great distances.',
          },
        },
        
        // Personality
        backstory: 'Zephyr grew up on the streets of Waterdeep, their infernal appearance making them an outcast from birth. They learned to survive through cunning and quick fingers, eventually joining the Shadow Thieves. Now they work independently, taking jobs that interest them and staying one step ahead of the law.',
        personalityTrait: 'I have a joke for every occasion, especially occasions where humor is inappropriate.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 4: Sienna Dawnbringer
    // ========================================
    // Female Human Cleric - compassionate healer
    _createSienna() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}sienna`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}sienna_dawnbringer`,
        name: 'Sienna Dawnbringer',
        race: 'human',
        class: 'cleric',
        background: 'acolyte',
        alignment: 'lg',
        sex: 'female',
        level: 4,
        
        // Abilities (wisdom-focused healer)
        abilities: {
          str: 12,
          dex: 10,
          con: 14,
          int: 11,
          wis: 17,
          cha: 14,
        },
        baseAbilities: {
          str: 11,  // +1 human
          dex: 9,   // +1 human
          con: 13,  // +1 human
          int: 10,  // +1 human
          wis: 16,  // +1 human
          cha: 13,  // +1 human
        },
        
        // Computed stats
        hitPoints: 31,  // 8 + 3*5 + 4*2 = 31
        armorClass: 18, // Chain mail (16) + shield (+2)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 2,
        
        // Ability modifiers
        abilityModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 3,
          cha: 2,
        },
        
        // Skills
        skillProficiencies: ['insight', 'medicine', 'religion', 'persuasion'],
        skillModifiers: {
          insight: 5,     // WIS + prof
          medicine: 5,    // WIS + prof
          religion: 2,    // INT + prof
          persuasion: 4,  // CHA + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 1,
          dex: 0,
          con: 2,
          int: 0,
          wis: 5,  // Proficient
          cha: 4,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Celestial', 'Elvish'],
        
        // Equipment
        equipment: [
          'Chain mail',
          'Shield',
          'Mace',
          'Holy symbol of Lathander',
          'Prayer book',
          'Incense sticks (5)',
          'Vestments',
          'Healer\'s kit',
        ],
        
        // Spellcasting
        spellcastingAbility: 'wis',
        cantrips: ['Sacred Flame', 'Spare the Dying', 'Guidance'],
        spellsKnown: [
          'Cure Wounds',
          'Bless',
          'Shield of Faith',
          'Healing Word',
          'Lesser Restoration',
          'Spiritual Weapon',
          'Prayer of Healing',
        ],
        spellSlots: {
          1: 4,
          2: 3,
        },
        
        // Race data
        raceData: {
          name: 'Human',
          size: 'Medium',
          speed: 30,
          traits: ['Extra Language', 'Versatile (+1 to all abilities)'],
          languages: ['Common', 'one extra'],
        },
        
        // Class data
        classData: {
          name: 'Cleric',
          hitDie: 8,
          primaryAbility: ['wis'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Acolyte',
          feature: {
            name: 'Shelter of the Faithful',
            description: 'You can receive free healing and care at temples of your faith, and you can call upon priests for assistance.',
          },
        },
        
        // Personality
        backstory: 'Sienna was orphaned during a plague that swept through her village. Taken in by the Temple of Lathander, she devoted her life to ensuring no one else would suffer as she had. Now she travels the land, bringing hope and healing wherever darkness threatens.',
        personalityTrait: 'I see omens in every event and action. The gods are always speaking to us, we just need to listen.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },

    // ========================================
    // DEMO CHARACTER 5: Krazul Stormscale
    // ========================================
    // Male Dragonborn Paladin - noble dragon knight
    _createKrazul() {
      const nowIso = new Date().toISOString();
      return {
        id: `${DEMO_PREFIX}krazul`,
        isDemo: true,
        characterUid: `${DEMO_PREFIX}krazul_stormscale`,
        name: 'Krazul Stormscale',
        race: 'dragonborn',
        class: 'paladin',
        background: 'noble',
        alignment: 'lg',
        sex: 'male',
        level: 5,
        
        // Abilities (strong and charismatic)
        abilities: {
          str: 17,  // +2 racial
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 16,  // +1 racial
        },
        baseAbilities: {
          str: 15,
          dex: 10,
          con: 14,
          int: 10,
          wis: 12,
          cha: 15,
        },
        
        // Computed stats
        hitPoints: 44,  // 10 + 4*6 + 5*2 = 44
        armorClass: 18, // Chain mail (16) + shield (+2) or plate (18)
        initiative: 0,
        speed: 30,
        proficiencyBonus: 3,
        
        // Ability modifiers
        abilityModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 1,
          cha: 3,
        },
        
        // Skills
        skillProficiencies: ['athletics', 'intimidation', 'persuasion', 'history'],
        skillModifiers: {
          athletics: 6,    // STR + prof
          intimidation: 6, // CHA + prof
          persuasion: 6,   // CHA + prof
          history: 3,      // INT + prof
        },
        
        // Saving throws
        savingThrows: ['wis', 'cha'],
        savingThrowModifiers: {
          str: 3,
          dex: 0,
          con: 2,
          int: 0,
          wis: 4,  // Proficient
          cha: 6,  // Proficient
        },
        
        // Languages
        languages: ['Common', 'Draconic'],
        
        // Equipment
        equipment: [
          'Plate armor',
          'Shield',
          'Longsword',
          'Javelins (5)',
          'Holy symbol embedded in shield',
          'Signet ring of House Stormscale',
          'Fine clothes',
        ],
        
        // Spellcasting
        spellcastingAbility: 'cha',
        cantrips: [],
        spellsKnown: [
          'Divine Smite',
          'Thunderous Smite',
          'Shield of Faith',
          'Cure Wounds',
          'Command',
          'Find Steed',
        ],
        spellSlots: {
          1: 4,
          2: 2,
        },
        
        // Race data
        raceData: {
          name: 'Dragonborn',
          size: 'Medium',
          speed: 30,
          traits: ['Draconic Ancestry (Blue)', 'Breath Weapon (Lightning)', 'Damage Resistance (Lightning)'],
          languages: ['Common', 'Draconic'],
        },
        
        // Class data
        classData: {
          name: 'Paladin',
          hitDie: 10,
          primaryAbility: ['str', 'cha'],
          savingThrows: ['wis', 'cha'],
          spellcaster: true,
        },
        
        // Background data
        backgroundData: {
          name: 'Noble',
          feature: {
            name: 'Position of Privilege',
            description: 'Thanks to your noble birth, people are inclined to think the best of you. Common folk make every effort to accommodate you.',
          },
        },
        
        // Personality
        backstory: 'Krazul hails from an ancient dragonborn clan that once served as dragon knights in a forgotten empire. When his clan\'s honor was questioned by corrupt nobles, he swore an oath to restore their name through righteous deeds. His lightning breath crackles with ancestral power.',
        personalityTrait: 'My favor, once lost, is lost forever. But my loyalty, once earned, is unshakeable.',
        
        
        // Metadata
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    },
  });
})(window);

