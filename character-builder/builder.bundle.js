

// ===== BUNDLE PART: danddy-config.js =====

// Global configuration and shared utilities for the DandDy app (builder + manager).
// Exposes `window.DanddyConfig` (env + URLs) for all frontends to consume.

(function (global) {
  const location = global.location || {};

  const isLocalEnvironment =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.protocol === 'file:';

  // Single source of truth for backend origin & API base URL.
  //
  // IMPORTANT: Even when running the UI locally (localhost / file://), we now
  // ALWAYS talk to the production Render backend so that auth + cloud data are
  // consistent with the live site. If you ever need to point at a local
  // backend again, temporarily change BACKEND_ORIGIN below.
  const BACKEND_ORIGIN = 'https://danddy-api.onrender.com';

  // Many callers use either "<origin>/api" or "<origin>/api/..." directly.
  const API_BASE_URL = `${BACKEND_ORIGIN}/api`;

  // Shared storage keys and flags
  const TOKEN_STORAGE_KEY = 'dnd_auth_token';
  const USER_STORAGE_KEY = 'dnd_user_info';
  const CHARACTER_STORAGE_KEY = 'dnd_characters';
  // Only treat local/file:// environments as "debug" to avoid noisy logs in production.
  const DEBUG = isLocalEnvironment;

  global.DanddyConfig = {
    isLocalEnvironment,
    BACKEND_ORIGIN,
    API_BASE_URL,
    TOKEN_STORAGE_KEY,
    USER_STORAGE_KEY,
    CHARACTER_STORAGE_KEY,
    DEBUG,
  };

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





// ===== BUNDLE PART: danddy-auth.js =====

// Unified AuthService for the DandDy app (manager + builder).
// Relies on `window.DanddyConfig` for API URLs & storage keys and exposes
// a single `window.AuthService` used across all views.

(function (global) {
  const cfg = global.DanddyConfig || {};
  const API_BASE_URL = cfg.API_BASE_URL || 'https://danddy-api.onrender.com/api';
  const TOKEN_KEY = cfg.TOKEN_STORAGE_KEY || 'dnd_auth_token';
  const USER_KEY = cfg.USER_STORAGE_KEY || 'dnd_user_info';
  const DEBUG = !!cfg.DEBUG;

  const AuthService = (global.AuthService = global.AuthService || {});

  Object.assign(AuthService, {
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
      this.clearToken();
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
     * Register a new user using email + password.
     * Returns { success, user, error }.
     *
     * For backward-compatibility with older backend deployments that still
     * expect a `username` field, we derive a simple username from the email
     * (typically the part before "@"). Newer backends that ignore usernames
     * will simply drop this extra field.
     */
    async register(email, password, role = 'player') {
      try {
        const derivedUsername =
          typeof email === 'string' && email.includes('@')
            ? email.split('@')[0]
            : email;

        const data = await this._request('/auth/register', {
          method: 'POST',
          // Backend identifies accounts by email only; username is legacy.
          // Sending both keeps us compatible with older API versions.
          body: { username: derivedUsername, email, password, role },
        });

        if (!data || !data.access_token) {
          throw new Error('Registration succeeded but no token was returned.');
        }

        this.setToken(data.access_token);

        // Try to fetch full user profile; fall back to a minimal email-only object.
        const profile = await this.fetchProfile();
        const user =
          profile && Object.keys(profile).length
            ? profile
            : { email, role };

        this.setCurrentUser(user);

        return { success: true, user };
      } catch (error) {
        return { success: false, error: error.message || 'Registration failed' };
      }
    },

    /**
     * Login with email + password.
     *
     * Note: the OAuth2 password flow still uses the `username` form field name,
     * but this value is always interpreted as an email address by the backend.
     * Returns { success, user, error }.
     */
    async login(email, password) {
      const url = `${API_BASE_URL}/auth/token`;
      if (DEBUG) {
        console.log('[AuthService] Login attempt', {
          url,
          email,
        });
      }

      try {
        const formData = new FormData();
        // Field name must remain "username" for OAuth2PasswordRequestForm,
        // but the value is the user's email address.
        formData.append('username', email);
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
              '[AuthService] Token rejected by /auth/me; clearing local session.',
              {
                status: response.status,
                detail: backendDetail,
              }
            );
            this.clearToken();
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
  });
})(window);






// ===== BUNDLE PART: danddy-character-mapper.js =====

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

        asciiPortrait: backendChar.ascii_portrait,
        originalPortraitUrl: backendChar.original_portrait_url,
        customPortraitAscii: backendChar.custom_portrait_ascii,
        customPortraitCount: backendChar.custom_portrait_count,
        portraitMetadata: backendChar.portrait_metadata,

        equipment: backendChar.inventory,

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
        hit_points_max: character.hitPoints?.max || character.hitPoints || 10,
        hit_points_current:
          character.hitPoints?.current || character.hitPoints?.max || character.hitPoints || 10,
        hit_points_temp: character.hitPoints?.temp || 0,
        armor_class: character.armorClass || 10,
        initiative: character.initiative || 0,
        speed: character.speed || 30,

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

        currency: {
          cp: apiChar.copper_pieces,
          sp: apiChar.silver_pieces,
          ep: apiChar.electrum_pieces,
          gp: apiChar.gold_pieces,
          pp: apiChar.platinum_pieces,
        },

        campaignId: apiChar.campaign_id,
        ownerId: apiChar.owner_id,
        createdAt: apiChar.created_at,
        updatedAt: apiChar.updated_at,

        asciiPortrait: apiChar.ascii_portrait,
        originalPortraitUrl: apiChar.original_portrait_url,
        customPortraitAscii: apiChar.custom_portrait_ascii,
        customPortraitCount: apiChar.custom_portrait_count || 0,
        portraitMetadata: apiChar.portrait_metadata || {},
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







// ===== BUNDLE PART: danddy-storage.js =====

// Shared helpers for character storage in localStorage.
// Exposes `window.DanddyStorage` and centralizes the `dnd_characters` key and
// its companion cache key.

(function (global) {
  const cfg = global.DanddyConfig || {};

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
    upsert(character) {
      if (!character) return;
      const chars = this.readAll();
      const idx = chars.findIndex((c) => c.id === character.id);
      if (idx >= 0) {
        chars[idx] = character;
      } else {
        chars.push(character);
      }
      this.writeAll(chars);
    },

    // Delete a character by id.
    deleteById(id) {
      const chars = this.readAll().filter((c) => c.id !== id);
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

  global.DanddyStorage = Storage;
})(window);










// ===== BUNDLE PART: character-manager-api.js =====

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

  // Make authenticated API request
  async _apiRequest(endpoint, options = {}) {
    const token = AuthService.getToken();
    if (!token) {
      throw new Error('Not authenticated');
    }

    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      // Token expired or invalid – clear auth state and sync UI so the user
      // doesn't appear "logged in" while we silently fall back to local data.
      AuthService.clearToken();
      if (typeof window.updateAuthUI === 'function') {
        window.updateAuthUI();
      }
      throw new Error('Session expired. Please log in again.');
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
  },

  // Get all characters for current user
  async getAll() {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching all characters from API...');
      }
      const apiChars = await this._apiRequest('/characters/');
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

  // Get single character by ID
  async getById(id) {
    try {
      if (DEBUG_CLOUD) {
        console.log('☁️ CLOUD: Fetching character', id);
      }
      const apiChar = await this._apiRequest(`/characters/${id}`);
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
      
      // Text fields
      if (updates.backstory !== undefined) apiUpdates.backstory = updates.backstory;
      
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
});

// ========================================
// MIGRATION UTILITY
// ========================================
const MigrationService = (window.MigrationService = {
  LOCAL_STORAGE_KEY: (window.DanddyStorage && window.DanddyStorage.STORAGE_KEY) || 'dnd_characters',
  
  // Check if there are characters in localStorage
  hasLocalCharacters() {
    const characters =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
    return characters.length > 0;
  },

  // Get count of local characters
  getLocalCharacterCount() {
    const characters =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
    return characters.length;
  },

  // Migrate all localStorage characters to cloud
  async migrateToCloud() {
    try {
      if (!AuthService.isAuthenticated()) {
        throw new Error('Must be logged in to migrate characters');
      }

      console.log('📦 MIGRATION: Starting migration of localStorage characters to cloud...');
      
    const localCharacters =
      (window.DanddyStorage && window.DanddyStorage.readAll()) ||
      (function (key) {
        const data = localStorage.getItem(key);
        return data ? JSON.parse(data) : [];
      })(this.LOCAL_STORAGE_KEY);
      
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
          await CharacterCloudStorage.add(character);
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




// ===== BUNDLE PART: character-storage.js =====

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

    // Get single character by ID
    async getById(id) {
      if (this.useCloud() && window.CharacterCloudStorage) {
        try {
          if (DEBUG_STORAGE) {
            console.log('☁️ STORAGE: Fetching character from cloud:', id);
          }
          return await window.CharacterCloudStorage.getById(id);
        } catch (error) {
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
      const characters =
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
          localStorage.setItem(
            this.STORAGE_KEY,
            JSON.stringify(characters),
          );
        } catch (e) {
          console.warn('LOCAL.GETALL: Failed to persist normalized timestamps', e);
        }
      }

      return characters;
    },

    _getLocalById(id) {
      const characters = this._getLocalAll();
      return characters.find((char) => char.id === id);
    },

    _localSaveAll(characters) {
      if (DEBUG_STORAGE) {
        console.log(
          '💾 LOCAL.SAVEALL: Saving',
          characters.length,
          'characters to local storage',
        );
      }

      if (window.DanddyStorage) {
        window.DanddyStorage.writeAll(characters);
      } else {
        try {
          localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
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
      const index = characters.findIndex((char) => char.id === id);
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
      const filtered = characters.filter((char) => char.id !== id);
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





// ===== BUNDLE PART: character-builder/character-builder-config.js =====

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
  PREGENERATED_PORTRAIT_BASE_URL: 'https://pub-afa9482f09a14edbab3514fa1466ab95.r2.dev/portraits/pregen',

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
  DEFAULT_PORTRAIT_VIEW_MODE: 'ascii',
};



// ===== BUNDLE PART: character-builder/character-builder-dnd-data.js =====

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
    },
    {
      id: 'paladin',
      name: 'Paladin',
      description: 'Holy warrior sworn to an oath, wielding divine magic.',
      hitDie: 10,
      primaryAbility: ['str', 'cha'],
      savingThrows: ['wis', 'cha'],
      equipment: ['Heavy armor', 'Martial weapons', 'Holy symbol'],
    },
    {
      id: 'barbarian',
      name: 'Barbarian',
      description: 'Fierce warrior who channels rage in battle.',
      hitDie: 12,
      primaryAbility: ['str'],
      savingThrows: ['str', 'con'],
      equipment: ['Greataxe', 'Medium armor', 'Javelins'],
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





// ===== BUNDLE PART: character-builder/character-builder-spells.js =====

// Spell data for D&D 5e character builder.
// Exposes SPELL_DATA as a global on window.

window.SPELL_DATA = {
  // Spellcasting class configurations
  spellcastingClasses: {
    wizard: {
      ability: 'int',
      cantripsKnown: 3,
      spellsKnown: 6, // Written in spellbook
      preparedSpells: 'INT + level', // Can prepare this many
      spellSlots: { 1: 2 },
    },
    sorcerer: {
      ability: 'cha',
      cantripsKnown: 4,
      spellsKnown: 2,
      spellSlots: { 1: 2 },
    },
    warlock: {
      ability: 'cha',
      cantripsKnown: 2,
      spellsKnown: 2,
      spellSlots: { 1: 1 }, // Pact magic
    },
    bard: {
      ability: 'cha',
      cantripsKnown: 2,
      spellsKnown: 4,
      spellSlots: { 1: 2 },
    },
    cleric: {
      ability: 'wis',
      cantripsKnown: 3,
      preparedSpells: 'WIS + level', // Can prepare from full list
      spellSlots: { 1: 2 },
    },
    druid: {
      ability: 'wis',
      cantripsKnown: 2,
      preparedSpells: 'WIS + level', // Can prepare from full list
      spellSlots: { 1: 2 },
    },
  },

  // Cantrips organized by class
  cantrips: {
    wizard: [
      {
        id: 'fire-bolt',
        name: 'Fire Bolt',
        school: 'Evocation',
        description: 'Hurl a mote of fire at a creature or object. 1d10 fire damage.',
        tags: ['damage', 'fire', 'offense'],
      },
      {
        id: 'mage-hand',
        name: 'Mage Hand',
        school: 'Conjuration',
        description: 'Create a spectral hand that can manipulate objects at range.',
        tags: ['utility', 'manipulation'],
      },
      {
        id: 'light',
        name: 'Light',
        school: 'Evocation',
        description: 'Touch an object to make it shed bright light for 1 hour.',
        tags: ['utility', 'light'],
      },
      {
        id: 'ray-of-frost',
        name: 'Ray of Frost',
        school: 'Evocation',
        description: 'Frigid beam dealing 1d8 cold damage and reducing speed.',
        tags: ['damage', 'cold', 'offense', 'control'],
      },
      {
        id: 'shocking-grasp',
        name: 'Shocking Grasp',
        school: 'Evocation',
        description: 'Lightning damage on touch (1d8) and target cannot take reactions.',
        tags: ['damage', 'lightning', 'offense'],
      },
      {
        id: 'prestidigitation',
        name: 'Prestidigitation',
        school: 'Transmutation',
        description: 'Minor magical trick: light a candle, clean clothes, flavor food.',
        tags: ['utility', 'social'],
      },
      {
        id: 'minor-illusion',
        name: 'Minor Illusion',
        school: 'Illusion',
        description: 'Create a sound or image of an object within range.',
        tags: ['utility', 'illusion', 'deception'],
      },
    ],
    sorcerer: [
      { id: 'fire-bolt', name: 'Fire Bolt', school: 'Evocation', description: 'Hurl a mote of fire at a creature or object. 1d10 fire damage.', tags: ['damage', 'fire', 'offense'] },
      { id: 'ray-of-frost', name: 'Ray of Frost', school: 'Evocation', description: 'Frigid beam dealing 1d8 cold damage and reducing speed.', tags: ['damage', 'cold', 'offense', 'control'] },
      { id: 'shocking-grasp', name: 'Shocking Grasp', school: 'Evocation', description: 'Lightning damage on touch (1d8) and target cannot take reactions.', tags: ['damage', 'lightning', 'offense'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
    ],
    warlock: [
      { id: 'eldritch-blast', name: 'Eldritch Blast', school: 'Evocation', description: 'Beam of crackling energy dealing 1d10 force damage.', tags: ['damage', 'force', 'offense'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'chill-touch', name: 'Chill Touch', school: 'Necromancy', description: 'Ghostly hand dealing 1d8 necrotic damage and preventing healing.', tags: ['damage', 'necrotic', 'offense'] },
    ],
    bard: [
      { id: 'vicious-mockery', name: 'Vicious Mockery', school: 'Enchantment', description: 'Insult dealing 1d4 psychic damage and imposing disadvantage.', tags: ['damage', 'psychic', 'debuff', 'social'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'mage-hand', name: 'Mage Hand', school: 'Conjuration', description: 'Create a spectral hand that can manipulate objects at range.', tags: ['utility', 'manipulation'] },
      { id: 'prestidigitation', name: 'Prestidigitation', school: 'Transmutation', description: 'Minor magical trick: light a candle, clean clothes, flavor food.', tags: ['utility', 'social'] },
      { id: 'minor-illusion', name: 'Minor Illusion', school: 'Illusion', description: 'Create a sound or image of an object within range.', tags: ['utility', 'illusion', 'deception'] },
    ],
    cleric: [
      { id: 'sacred-flame', name: 'Sacred Flame', school: 'Evocation', description: 'Flame-like radiance dealing 1d8 radiant damage (Dex save).', tags: ['damage', 'radiant', 'offense'] },
      { id: 'light', name: 'Light', school: 'Evocation', description: 'Touch an object to make it shed bright light for 1 hour.', tags: ['utility', 'light'] },
      { id: 'guidance', name: 'Guidance', school: 'Divination', description: 'Touch a creature to grant +1d4 to one ability check.', tags: ['buff', 'support'] },
      { id: 'spare-the-dying', name: 'Spare the Dying', school: 'Necromancy', description: 'Touch a dying creature to stabilize it.', tags: ['healing', 'support'] },
      { id: 'thaumaturgy', name: 'Thaumaturgy', school: 'Transmutation', description: 'Minor wonder: amplify voice, flicker flames, open doors.', tags: ['utility', 'social'] },
    ],
    druid: [
      { id: 'produce-flame', name: 'Produce Flame', school: 'Conjuration', description: 'Flickering flame for light or to throw (1d8 fire damage).', tags: ['damage', 'fire', 'utility', 'light'] },
      { id: 'guidance', name: 'Guidance', school: 'Divination', description: 'Touch a creature to grant +1d4 to one ability check.', tags: ['buff', 'support'] },
      { id: 'shillelagh', name: 'Shillelagh', school: 'Transmutation', description: 'Imbue a club or staff to use Wisdom for attacks (1d8 damage).', tags: ['buff', 'combat'] },
      { id: 'druidcraft', name: 'Druidcraft', school: 'Transmutation', description: 'Minor druidic effects: predict weather, bloom flowers, light fires.', tags: ['utility', 'nature'] },
    ],
  },

  // 1st level spells organized by class
  firstLevel: {
    wizard: [
      {
        id: 'magic-missile',
        name: 'Magic Missile',
        school: 'Evocation',
        description: 'Three darts of force, each dealing 1d4+1 damage (auto-hit).',
        tags: ['damage', 'force', 'offense', 'reliable'],
      },
      {
        id: 'shield',
        name: 'Shield',
        school: 'Abjuration',
        description: 'Reaction: +5 AC until start of your next turn.',
        tags: ['defense', 'protection', 'reaction'],
      },
      {
        id: 'mage-armor',
        name: 'Mage Armor',
        school: 'Abjuration',
        description: 'Set AC to 13 + Dex modifier for 8 hours.',
        tags: ['defense', 'protection', 'buff'],
      },
      {
        id: 'detect-magic',
        name: 'Detect Magic',
        school: 'Divination',
        description: 'Sense magic within 30 feet for 10 minutes (concentration).',
        tags: ['utility', 'detection', 'exploration'],
      },
      {
        id: 'identify',
        name: 'Identify',
        school: 'Divination',
        description: 'Learn properties of a magical object or spell affecting a creature.',
        tags: ['utility', 'knowledge', 'exploration'],
      },
      {
        id: 'sleep',
        name: 'Sleep',
        school: 'Enchantment',
        description: 'Put 5d8 HP worth of creatures to sleep.',
        tags: ['control', 'debuff', 'crowd-control'],
      },
      {
        id: 'burning-hands',
        name: 'Burning Hands',
        school: 'Evocation',
        description: 'Cone of fire dealing 3d6 fire damage (Dex save for half).',
        tags: ['damage', 'fire', 'aoe', 'offense'],
      },
      {
        id: 'disguise-self',
        name: 'Disguise Self',
        school: 'Illusion',
        description: 'Make yourself look different for 1 hour.',
        tags: ['utility', 'illusion', 'social', 'deception'],
      },
      {
        id: 'feather-fall',
        name: 'Feather Fall',
        school: 'Transmutation',
        description: 'Reaction: Up to 5 creatures fall slowly, taking no damage.',
        tags: ['utility', 'protection', 'reaction'],
      },
      {
        id: 'grease',
        name: 'Grease',
        school: 'Conjuration',
        description: 'Slick grease covers a 10-foot square (Dex save or fall prone).',
        tags: ['control', 'terrain', 'debuff'],
      },
    ],
    sorcerer: [
      { id: 'magic-missile', name: 'Magic Missile', school: 'Evocation', description: 'Three darts of force, each dealing 1d4+1 damage (auto-hit).', tags: ['damage', 'force', 'offense', 'reliable'] },
      { id: 'shield', name: 'Shield', school: 'Abjuration', description: 'Reaction: +5 AC until start of your next turn.', tags: ['defense', 'protection', 'reaction'] },
      { id: 'mage-armor', name: 'Mage Armor', school: 'Abjuration', description: 'Set AC to 13 + Dex modifier for 8 hours.', tags: ['defense', 'protection', 'buff'] },
      { id: 'burning-hands', name: 'Burning Hands', school: 'Evocation', description: 'Cone of fire dealing 3d6 fire damage (Dex save for half).', tags: ['damage', 'fire', 'aoe', 'offense'] },
      { id: 'chromatic-orb', name: 'Chromatic Orb', school: 'Evocation', description: 'Hurl a 4-inch sphere dealing 3d8 damage (choose: acid, cold, fire, lightning, poison, thunder).', tags: ['damage', 'versatile', 'offense'] },
      { id: 'disguise-self', name: 'Disguise Self', school: 'Illusion', description: 'Make yourself look different for 1 hour.', tags: ['utility', 'illusion', 'social', 'deception'] },
      { id: 'sleep', name: 'Sleep', school: 'Enchantment', description: 'Put 5d8 HP worth of creatures to sleep.', tags: ['control', 'debuff', 'crowd-control'] },
    ],
    warlock: [
      { id: 'hex', name: 'Hex', school: 'Enchantment', description: 'Curse a creature to take +1d6 necrotic damage and disadvantage on checks (1 hour, concentration).', tags: ['damage', 'debuff', 'curse'] },
      { id: 'armor-of-agathys', name: 'Armor of Agathys', school: 'Abjuration', description: 'Gain 5 temp HP; attackers take 5 cold damage when they hit you (1 hour).', tags: ['defense', 'protection', 'retaliation'] },
      { id: 'arms-of-hadar', name: 'Arms of Hadar', school: 'Conjuration', description: 'Tendrils deal 2d6 necrotic damage in 10-foot radius (Str save for half).', tags: ['damage', 'necrotic', 'aoe', 'offense'] },
      { id: 'charm-person', name: 'Charm Person', school: 'Enchantment', description: 'Charm a humanoid (Wis save) for 1 hour.', tags: ['control', 'social', 'charm'] },
      { id: 'hellish-rebuke', name: 'Hellish Rebuke', school: 'Evocation', description: 'Reaction: Attacker takes 2d10 fire damage (Dex save for half).', tags: ['damage', 'fire', 'reaction', 'retaliation'] },
    ],
    bard: [
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'charm-person', name: 'Charm Person', school: 'Enchantment', description: 'Charm a humanoid (Wis save) for 1 hour.', tags: ['control', 'social', 'charm'] },
      { id: 'disguise-self', name: 'Disguise Self', school: 'Illusion', description: 'Make yourself look different for 1 hour.', tags: ['utility', 'illusion', 'social', 'deception'] },
      { id: 'faerie-fire', name: 'Faerie Fire', school: 'Evocation', description: 'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).', tags: ['buff', 'support', 'debuff'] },
      { id: 'sleep', name: 'Sleep', school: 'Enchantment', description: 'Put 5d8 HP worth of creatures to sleep.', tags: ['control', 'debuff', 'crowd-control'] },
      { id: 'thunderwave', name: 'Thunderwave', school: 'Evocation', description: '15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).', tags: ['damage', 'thunder', 'aoe', 'control'] },
    ],
    cleric: [
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'bless', name: 'Bless', school: 'Enchantment', description: 'Up to 3 creatures add 1d4 to attacks and saves (1 minute, concentration).', tags: ['buff', 'support', 'team'] },
      { id: 'shield-of-faith', name: 'Shield of Faith', school: 'Abjuration', description: 'Grant +2 AC to a creature (10 minutes, concentration).', tags: ['buff', 'defense', 'support'] },
      { id: 'guiding-bolt', name: 'Guiding Bolt', school: 'Evocation', description: 'Ranged attack dealing 4d6 radiant damage; next attack against target has advantage.', tags: ['damage', 'radiant', 'offense', 'buff'] },
      { id: 'inflict-wounds', name: 'Inflict Wounds', school: 'Necromancy', description: 'Melee attack dealing 3d10 necrotic damage.', tags: ['damage', 'necrotic', 'offense'] },
      { id: 'sanctuary', name: 'Sanctuary', school: 'Abjuration', description: 'Attackers must make Wis save or choose another target (1 minute).', tags: ['defense', 'protection', 'support'] },
    ],
    druid: [
      { id: 'cure-wounds', name: 'Cure Wounds', school: 'Evocation', description: 'Touch to heal 1d8 + spellcasting modifier HP.', tags: ['healing', 'support'] },
      { id: 'healing-word', name: 'Healing Word', school: 'Evocation', description: 'Bonus action: Heal a creature for 1d4 + spellcasting modifier.', tags: ['healing', 'support', 'bonus-action'] },
      { id: 'entangle', name: 'Entangle', school: 'Conjuration', description: 'Grasping vines restrain creatures in 20-foot square (Str save, 1 minute, concentration).', tags: ['control', 'terrain', 'debuff'] },
      { id: 'faerie-fire', name: 'Faerie Fire', school: 'Evocation', description: 'Outline creatures in light, granting advantage on attacks against them (1 minute, concentration).', tags: ['buff', 'support', 'debuff'] },
      { id: 'goodberry', name: 'Goodberry', school: 'Transmutation', description: 'Create 10 berries that each restore 1 HP and provide nourishment (24 hours).', tags: ['healing', 'utility', 'support'] },
      { id: 'thunderwave', name: 'Thunderwave', school: 'Evocation', description: '15-foot cube of thunderous force dealing 2d8 thunder damage and pushing creatures (Con save for half).', tags: ['damage', 'thunder', 'aoe', 'control'] },
      { id: 'speak-with-animals', name: 'Speak with Animals', school: 'Divination', description: 'Communicate with beasts for 10 minutes.', tags: ['utility', 'social', 'nature'] },
    ],
  },

  // Helper to get spells for a class
  getCantripsForClass(classId) {
    return this.cantrips[classId] || [];
  },

  getFirstLevelSpellsForClass(classId) {
    return this.firstLevel[classId] || [];
  },

  getSpellcastingConfig(classId) {
    return this.spellcastingClasses[classId] || null;
  },

  isSpellcaster(classId) {
    return !!this.spellcastingClasses[classId];
  },

  // Quick mode auto-selection (balanced starter spells)
  getQuickModeSpells(classId) {
    const config = this.getSpellcastingConfig(classId);
    if (!config) return null;

    const cantrips = this.getCantripsForClass(classId);
    const firstLevel = this.getFirstLevelSpellsForClass(classId);

    const result = {
      cantrips: [],
      firstLevel: [],
    };

    // Auto-select balanced cantrips
    switch (classId) {
      case 'wizard':
        result.cantrips = [cantrips[0], cantrips[1], cantrips[2]]; // Fire Bolt, Mage Hand, Light
        result.firstLevel = [
          firstLevel[0], // Magic Missile
          firstLevel[1], // Shield
          firstLevel[2], // Mage Armor
          firstLevel[3], // Detect Magic
          firstLevel[4], // Identify
          firstLevel[5], // Sleep
        ];
        break;
      case 'sorcerer':
        result.cantrips = [cantrips[0], cantrips[1], cantrips[4], cantrips[5]]; // Fire Bolt, Ray of Frost, Mage Hand, Prestidigitation
        result.firstLevel = [firstLevel[0], firstLevel[1]]; // Magic Missile, Shield
        break;
      case 'warlock':
        result.cantrips = [cantrips[0], cantrips[1]]; // Eldritch Blast, Mage Hand
        result.firstLevel = [firstLevel[0], firstLevel[1]]; // Hex, Armor of Agathys
        break;
      case 'bard':
        result.cantrips = [cantrips[0], cantrips[4]]; // Vicious Mockery, Minor Illusion
        result.firstLevel = [firstLevel[0], firstLevel[1], firstLevel[2], firstLevel[3]]; // Healing Word, Cure Wounds, Charm Person, Disguise Self
        break;
      case 'cleric':
        result.cantrips = [cantrips[0], cantrips[2], cantrips[3]]; // Sacred Flame, Guidance, Spare the Dying
        // Clerics prepare spells, so we give them a starter prepared list
        result.firstLevel = [firstLevel[0], firstLevel[1], firstLevel[2]]; // Cure Wounds, Healing Word, Bless
        break;
      case 'druid':
        result.cantrips = [cantrips[0], cantrips[1]]; // Produce Flame, Guidance
        // Druids prepare spells, so we give them a starter prepared list
        result.firstLevel = [firstLevel[0], firstLevel[2], firstLevel[3]]; // Cure Wounds, Entangle, Faerie Fire
        break;
    }

    return result;
  },

  // Guided mode spell selection based on playstyle
  getGuidedSpells(classId, preferences) {
    const config = this.getSpellcastingConfig(classId);
    if (!config) return null;

    const cantrips = this.getCantripsForClass(classId);
    const firstLevel = this.getFirstLevelSpellsForClass(classId);

    // Filter spells by tags based on preferences
    const filterByTags = (spells, preferredTags, count) => {
      const tagged = spells.map(spell => {
        const matchCount = spell.tags.filter(tag => preferredTags.includes(tag)).length;
        return { spell, matchCount };
      });
      tagged.sort((a, b) => b.matchCount - a.matchCount);
      return tagged.slice(0, count).map(item => item.spell);
    };

    // Determine preferred tags from preferences
    const preferredTags = [];
    if (preferences.style === 'offense') preferredTags.push('damage', 'offense');
    if (preferences.style === 'defense') preferredTags.push('defense', 'protection', 'healing', 'support');
    if (preferences.style === 'control') preferredTags.push('control', 'debuff', 'crowd-control');
    if (preferences.style === 'utility') preferredTags.push('utility', 'social', 'exploration');

    if (preferences.element) preferredTags.push(preferences.element);

    const result = {
      cantrips: filterByTags(cantrips, preferredTags, config.cantripsKnown),
      firstLevel: [],
    };

    // Get first level spells
    if (config.spellsKnown) {
      result.firstLevel = filterByTags(firstLevel, preferredTags, config.spellsKnown);
    } else if (config.preparedSpells) {
      // For clerics/druids, suggest a starter prepared list
      result.firstLevel = filterByTags(firstLevel, preferredTags, 3);
    }

    return result;
  },
};




// ===== BUNDLE PART: character-builder/character-builder-narrators.js =====

// Narrator personalities for DandDy character builder
// Exposes NARRATORS as a global on window

const NARRATORS = (window.NARRATORS = {
  deadpan: {
    id: 'deadpan',
    name: 'The Deadpan Observer',
    emoji: '( ._. )',
    description: 'Dry, witty, and occasionally breaks the fourth wall',
    systemPrompt: 'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. Be brief, sarcastic, and occasionally break the fourth wall. Vary your phrasing across comments.',
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> Ah. Another soul seeking adventure. Or at least, trying to.
> 
> Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.
> 
> Let's start with something easy...`,
    completeText: "Well. That's done. Your character is ready. Try not to die immediately.",
    quickCreateIntro: `> QUICK-CREATE MODE ENGAGED...\n> Generating a character while you sit back and enjoy the show.`,
    quickCreateSummary: (race, cls, background, alignment) => 
      `> All right, here's what I've cobbled together:\n> ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Try not to waste my hard work.`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> OH YES! Another adventurer! Welcome, friend!
> 
> This is going to be AMAZING! We're going to create something absolutely LEGENDARY together! Every choice you make is going to be perfect because YOU'RE making it!
> 
> Let's dive right in! ✨`,
    completeText: "INCREDIBLE! Your character is COMPLETE and they are MAGNIFICENT! The world won't know what hit it! Adventure awaits, hero! ✨",
    quickCreateIntro: `> QUICK-CREATE MODE: ACTIVATED! ✨\n> This is going to be SO EXCITING! I'm creating something AMAZING for you!`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> HERE THEY ARE! Your MAGNIFICENT hero!\n> ${race} ${cls}, ${background} background, ${alignment} alignment!\n> I LOVE THEM ALREADY! ✨`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> The mists part... another soul arrives at the crossroads.
> 
> The threads of destiny have brought you here. Your choices will echo through realms unseen. The future whispers, but its words are unclear...
> 
> Let us begin to unravel your fate... 🔮`,
    completeText: "The tapestry is woven. Your fate is sealed... or perhaps, just beginning. The path ahead is shrouded, yet inevitable. Go forth, seeker. 🔮",
    quickCreateIntro: `> THE FATES HAVE SPOKEN...\n> The threads weave themselves... Your destiny takes form without your hand...`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> The cards reveal their truth:\n> ${race} ${cls}, walking the path of ${background}, aligned with ${alignment}.\n> So it is written... 🔮`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> *sigh* Another one. Great.
> 
> Listen kid, I've done this a thousand times. Most of you don't make it past level 3. But sure, let's go through the motions. Try not to make it too painful for me.
> 
> Let's get this over with...`,
    completeText: "There. Your character's done. Marginally competent, I suppose. Don't expect me to save you when things go south. And they will. They always do.",
    quickCreateIntro: `> *sigh* Quick create. Of course.\n> Fine. I'll just do all the work while you sit there.`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> Here's what you're getting:\n> ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Could be worse, I suppose.`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> *cackling* OH! A new plaything! DELIGHTFUL!
> 
> Welcome, welcome! Let's make something BEAUTIFULLY CHAOTIC together! Forget boring! Forget safe! Let's create something that makes the dice gods GIGGLE! 😈
> 
> Ohoho, let the mayhem begin!`,
    completeText: "*CACKLING INTENSIFIES* YESSSS! Your character is COMPLETE and they are GLORIOUSLY UNPREDICTABLE! Now go forth and cause MAGNIFICENT CHAOS! 😈",
    quickCreateIntro: `> *CACKLING* OHOHO! Quick create?! Let's RANDOMIZE EVERYTHING!\n> This is going to be DELIGHTFULLY CHAOTIC! 😈`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> *giggling maniacally* BEHOLD YOUR CHAOS AGENT!\n> ${race} ${cls}, ${background} background, ${alignment} alignment!\n> The MAYHEM they'll cause! *chef's kiss* 😈`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> Greetings, student. Welcome to the Character Creation Compendium.
> 
> I shall guide you through this process with precision and historical context. Each decision you make has statistical implications and narrative weight. Fascinating, really.
> 
> Let us proceed methodically... 📚`,
    completeText: "Character creation: Complete. All parameters within acceptable ranges. Statistical viability: High. You are now adequately prepared for adventure. Proceed with confidence, student. 📚",
    quickCreateIntro: `> QUICK-CREATE PROTOCOL: Initiated.\n> Randomizing parameters according to standard probability distributions...`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> Character profile generated:\n> Race: ${race}. Class: ${cls}. Background: ${background}. Alignment: ${alignment}.\n> Statistical analysis: Within acceptable parameters. 📚`,
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
    introText: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> Hey there, man. Welcome.
> 
> So like, we're gonna make a character together, yeah? No pressure, dude. Just take it easy, go with the flow. Whatever feels right to you, that's cool with me.
> 
> Let's just like... start, man. 🥃`,
    completeText: "Alright, man. Your character's all set. Pretty cool, dude. Now go out there and just... be yourself, you know? The Dude abides. 🥃",
    quickCreateIntro: `> Quick create, huh? Cool, cool.\n> Just gonna roll some dice here, take it easy, see what happens, man.`,
    quickCreateSummary: (race, cls, background, alignment) =>
      `> Alright, so here's what we got:\n> ${race} ${cls}, ${background} background, ${alignment} alignment.\n> Pretty chill combo, man. I dig it. 🥃`,
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




// ===== BUNDLE PART: character-builder/character-builder-utils.js =====

// Core reusable helper functions for the DandDy terminal character builder.
// Exposes Utils as a global (window.Utils) so existing inline code can use it.

const Utils = window.Utils = {
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

    // Allow skipping by pressing any key
    const skipHandler = (e) => {
      // Only skip if not typing in an input field
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        skipTyping = true;
      }
    };

    window.addEventListener('keydown', skipHandler, { once: true });

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







// ===== BUNDLE PART: character-builder/character-builder-auth.js =====

// Authentication UI screens for the DandDy terminal character builder.
// Exposes AuthUI as global on window.

const AuthUI = (window.AuthUI = {
  // Show login screen
  showLogin(onSuccess, onSwitchToRegister, onGuestMode) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    // Hide other content
    document.getElementById('splash-content')?.classList.add('is-hidden');
    document.getElementById('main-content')?.classList.add('is-hidden');

    // Create auth screen
    const authScreen = document.createElement('div');
    authScreen.id = 'auth-screen';
    authScreen.className = 'auth-screen';
    authScreen.innerHTML = `
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║     D&D CHARACTER BUILDER LOGIN       ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="login-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="login-password" class="terminal-input" placeholder="••••••••" autocomplete="current-password" />
              <button type="button" class="password-toggle-btn" data-target="login-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div id="login-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="login-submit" class="button-primary">
              <span class="button-icon">▶</span> LOGIN
            </button>
            <button id="login-guest" class="button-secondary">
              <span class="button-icon">👤</span> CONTINUE AS GUEST
            </button>
          </div>
          
          <div class="auth-footer">
            <span class="auth-link" id="switch-to-register">
              Don't have an account? <span class="link-highlight">REGISTER HERE</span>
            </span>
          </div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const passwordToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="login-password"]',
    );
    const submitButton = document.getElementById('login-submit');
    const guestButton = document.getElementById('login-guest');
    const switchButton = document.getElementById('switch-to-register');
    const errorDiv = document.getElementById('login-error');

    // Handle submit
    const handleSubmit = async () => {
      // Give password managers / autofill a brief moment to finish
      // populating fields before we read them. This avoids bogus
      // "Please enter both email and password" errors when the UI
      // *appears* filled in.
      await new Promise((resolve) => setTimeout(resolve, 50));

      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!email || !password) {
        this.showError(errorDiv, 'Please enter both email and password');
        return;
      }

      // Lightweight UI-side debug logging (never logs the raw password)
      try {
        const cfg = window.DanddyConfig || {};
        const debug = !!cfg.DEBUG;
        if (debug) {
          console.log('[AuthUI] Login submit clicked', {
            email,
            apiBaseUrl: cfg.API_BASE_URL,
          });
        }
      } catch (_) {
        // Ignore logging failures – never block login
      }

      this.showLoading(submitButton, true, 'AUTHENTICATING...');
      errorDiv.classList.add('is-hidden');

      try {
        const result = await AuthService.login(email, password);
        this.showLoading(submitButton, false);
        if (result && result.success) {
          this.removeAuthScreen();
          if (onSuccess) onSuccess(result.user);
        } else {
          this.showError(
            errorDiv,
            (result && result.error) || 'Login failed. Please try again.',
          );
        }
      } catch (error) {
        this.showLoading(submitButton, false);
        this.showError(errorDiv, error.message || 'Login failed. Please try again.');
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    if (passwordToggle && passwordInput) {
      passwordToggle.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        passwordToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        passwordToggle.setAttribute('aria-pressed', String(isPassword));
        passwordToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }
    
    passwordInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    guestButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onGuestMode) onGuestMode();
    });

    switchButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onSwitchToRegister) onSwitchToRegister();
    });

    // Focus email input
    emailInput.focus();
  },

  // Show register screen
  showRegister(onSuccess, onSwitchToLogin) {
    const container = document.querySelector('.terminal-container');
    if (!container) return;

    // Hide other content
    document.getElementById('splash-content')?.classList.add('is-hidden');
    document.getElementById('main-content')?.classList.add('is-hidden');

    // Create auth screen
    const authScreen = document.createElement('div');
    authScreen.id = 'auth-screen';
    authScreen.className = 'auth-screen';
    authScreen.innerHTML = `
      <div class="auth-container">
        <div class="auth-header">
          <div class="auth-title">╔═══════════════════════════════════════╗</div>
          <div class="auth-title">║   D&D CHARACTER BUILDER REGISTER      ║</div>
          <div class="auth-title">╚═══════════════════════════════════════╝</div>
        </div>
        
        <div class="auth-form">
          <div class="form-group">
            <label class="form-label">[ EMAIL ]</label>
            <input type="email" id="register-email" class="terminal-input" placeholder="adventurer@tavern.com" autocomplete="email" />
          </div>
          
          <div class="form-group">
            <label class="form-label">[ PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ CONFIRM PASSWORD ]</label>
            <div class="password-input-wrapper">
              <input type="password" id="register-password-confirm" class="terminal-input" placeholder="••••••••" autocomplete="new-password" />
              <button type="button" class="password-toggle-btn" data-target="register-password-confirm" aria-label="Show password">SHOW</button>
            </div>
          </div>
          
          <div class="form-group">
            <label class="form-label">[ ROLE ]</label>
            <select id="register-role" class="terminal-select">
              <option value="player">Player</option>
              <option value="dm">Dungeon Master</option>
            </select>
          </div>
          
          <div id="register-error" class="error-message is-hidden"></div>
          
          <div class="button-group">
            <button id="register-submit" class="button-primary">
              <span class="button-icon">▶</span> CREATE ACCOUNT
            </button>
            <button id="register-cancel" class="button-secondary">
              <span class="button-icon">◀</span> BACK TO LOGIN
            </button>
          </div>
        </div>
      </div>
    `;

    container.appendChild(authScreen);

    // Add event listeners
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-password-confirm');
    const passwordToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="register-password"]',
    );
    const confirmToggle = authScreen.querySelector(
      '.password-toggle-btn[data-target="register-password-confirm"]',
    );
    const roleSelect = document.getElementById('register-role');
    const submitButton = document.getElementById('register-submit');
    const cancelButton = document.getElementById('register-cancel');
    const errorDiv = document.getElementById('register-error');

    // Handle submit
    const handleSubmit = async () => {
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;
      const role = roleSelect.value;

      if (!email || !password || !confirmPassword) {
        this.showError(errorDiv, 'Please fill in all fields');
        return;
      }

      if (password.length < 6) {
        this.showError(errorDiv, 'Password must be at least 6 characters');
        return;
      }

      if (password !== confirmPassword) {
        this.showError(errorDiv, 'Passwords do not match');
        return;
      }

      this.showLoading(submitButton, true, 'CREATING ACCOUNT...');
      errorDiv.classList.add('is-hidden');

      try {
        const result = await AuthService.register(email, password, role);
        this.showLoading(submitButton, false);
        if (result && result.success) {
          this.removeAuthScreen();
          if (onSuccess) onSuccess(result.user);
        } else {
          this.showError(
            errorDiv,
            (result && result.error) ||
              'Registration failed. Please try again.',
          );
        }
      } catch (error) {
        this.showLoading(submitButton, false);
        this.showError(
          errorDiv,
          error.message || 'Registration failed. Please try again.',
        );
      }
    };

    submitButton.addEventListener('click', handleSubmit);
    if (passwordToggle && passwordInput) {
      passwordToggle.addEventListener('click', () => {
        const isPassword = passwordInput.type === 'password';
        passwordInput.type = isPassword ? 'text' : 'password';
        passwordToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        passwordToggle.setAttribute('aria-pressed', String(isPassword));
        passwordToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }

    if (confirmToggle && confirmInput) {
      confirmToggle.addEventListener('click', () => {
        const isPassword = confirmInput.type === 'password';
        confirmInput.type = isPassword ? 'text' : 'password';
        confirmToggle.textContent = isPassword ? 'HIDE' : 'SHOW';
        confirmToggle.setAttribute('aria-pressed', String(isPassword));
        confirmToggle.setAttribute(
          'aria-label',
          isPassword ? 'Hide password' : 'Show password',
        );
      });
    }
    
    confirmInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') handleSubmit();
    });

    cancelButton.addEventListener('click', () => {
      this.removeAuthScreen();
      if (onSwitchToLogin) onSwitchToLogin();
    });

    // Focus email input
    emailInput.focus();
  },

  // Helper: Show error message
  showError(errorDiv, message) {
    errorDiv.textContent = `⚠ ERROR: ${message}`;
    errorDiv.classList.remove('is-hidden');
  },

  // Helper: Show/hide loading on a primary button
  showLoading(button, show, label) {
    if (!button) return;

    if (show) {
      if (!button.dataset.originalLabel) {
        button.dataset.originalLabel = button.innerHTML;
      }
      button.disabled = true;
      const loadingLabel = label || 'WORKING...';
      const cubeMarkup = 
        '<span class="spinner-cube-scene">' +
        '<span class="spinner-cube-tilt">' +
        '<span class="spinner-cube">' +
        '<span class="spinner-cube-face spinner-cube-face-front"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-back"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-right"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-left"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-top"></span>' +
        '<span class="spinner-cube-face spinner-cube-face-bottom"></span>' +
        '</span></span></span>';
      button.innerHTML = `${cubeMarkup} ${loadingLabel}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalLabel) {
        button.innerHTML = button.dataset.originalLabel;
        delete button.dataset.originalLabel;
      }
    }
  },

  // Helper: Remove auth screen
  removeAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    if (authScreen) {
      authScreen.remove();
    }
  },

  // Show user info in header
  updateHeaderWithUser(user) {
    const statusText = document.getElementById('status-text');
    if (statusText && user) {
      const roleIcon = user.role === 'dm' ? '🎲' : '⚔️';
      const label = (user.email || '').toUpperCase();
      statusText.innerHTML = `${roleIcon} ${label} | <button class="link-button" id="header-characters">MY CHARACTERS</button> | <button class="link-button" id="header-logout">LOGOUT</button>`;
      
      // Add characters button handler
      document.getElementById('header-characters')?.addEventListener('click', () => {
        CharacterManager.show();
      });
      
      // Add logout handler
      document.getElementById('header-logout')?.addEventListener('click', () => {
        if (confirm('Are you sure you want to logout?')) {
          AuthService.logout();
          
          // Show login screen after logout (with register and guest mode options)
          if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
            window.AuthUI.showLogin(
              () => window.location.reload(),  // onSuccess
              () => {},                         // onSwitchToRegister (handled within AuthUI)
              () => {}                          // onGuestMode
            );
          } else {
            window.location.reload();
          }
        }
      });
    }
  },

  // Show guest mode banner
  showGuestBanner() {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.innerHTML = `👤 GUEST MODE | <button class="link-button" id="header-login">LOGIN TO SAVE</button>`;
      
      // Add login handler
      document.getElementById('header-login')?.addEventListener('click', () => {
        App.showAuthScreen();
      });
    }
  },
});




// ===== BUNDLE PART: character-builder/character-builder-api.js =====

// API service layer for backend character operations.
// Exposes CharacterAPI as global on window.

const CharacterAPI = (window.CharacterAPI = {
  // Helper to convert arrays to dict format for backend
  arrayToDict(arr) {
    if (!arr || !Array.isArray(arr)) return [];
    
    return arr.map(item => {
      // If already an object, return as-is
      if (typeof item === 'object' && item !== null) {
        return item;
      }
      // If string, convert to dict format
      if (typeof item === 'string') {
        return { name: item };
      }
      // Fallback
      return { value: item };
    });
  },
  
  // Helper to convert spell arrays (objects or strings) to string arrays for backend
  spellsToStringArray(arr) {
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
  
  // Helper to make authenticated API requests
  async request(method, endpoint, body = null) {
    const token = AuthService.getToken();
    const headers = {
      'Content-Type': 'application/json',
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const options = {
      method,
      headers,
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    try {
      const response = await fetch(`${CONFIG.BACKEND_URL}${endpoint}`, options);
      
      if (response.status === 401) {
        // Token expired or invalid
        AuthService.clearToken();
        throw new Error('Session expired. Please log in again.');
      }
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || `API error: ${response.status}`);
      }
      
      // Handle 204 No Content
      if (response.status === 204) {
        return null;
      }
      
      return await response.json();
    } catch (error) {
      console.error(`API request failed [${method} ${endpoint}]:`, error);
      throw error;
    }
  },
  
  // Transform frontend character format to backend format (shared mapper)
  toBackendFormat(character) {
    return window.DanddyCharacterMapper.fromBuilderToBackend(character);
  },
  
  // Transform backend character format to frontend format (shared mapper)
  toFrontendFormat(backendChar) {
    return window.DanddyCharacterMapper.fromBackendToBuilder(backendChar);
  },
  
  // Helper: Map alignment format
  mapAlignment(alignment) {
    if (!alignment) return null;
    
    // Convert from frontend format (e.g., "Lawful Good") to backend format (e.g., "lawful_good")
    const map = {
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
  
  // Helper: Calculate AC (simplified)
  calculateAC(character) {
    const dexMod = character.abilities?.dex ? Math.floor((character.abilities.dex - 10) / 2) : 0;
    return 10 + dexMod; // Base AC calculation
  },
  
  // Helper: Calculate initiative
  calculateInitiative(character) {
    return character.abilities?.dex ? Math.floor((character.abilities.dex - 10) / 2) : 0;
  },
  
  // Helper: Get speed based on race
  getSpeed(character) {
    const speedMap = {
      'dwarf': 25,
      'halfling': 25,
      'gnome': 25,
      'elf': 30,
      'human': 30,
      'half-elf': 30,
      'half-orc': 30,
      'tiefling': 30,
      'dragonborn': 30,
    };
    
    return speedMap[character.race?.toLowerCase()] || 30;
  },
  
  // ==== CHARACTER CRUD OPERATIONS ====
  
  // Create a new character
  async createCharacter(character) {
    const backendData = this.toBackendFormat(character);
    const response = await this.request('POST', '/api/characters', backendData);
    return this.toFrontendFormat(response);
  },
  
  // Get all characters for current user
  async getCharacters() {
    const response = await this.request('GET', '/api/characters');
    return response.map(char => this.toFrontendFormat(char));
  },
  
  // Get a single character by ID
  async getCharacter(id) {
    const response = await this.request('GET', `/api/characters/${id}`);
    return this.toFrontendFormat(response);
  },
  
  // Update a character
  async updateCharacter(id, updates) {
    // If updates is a full character object, convert it
    const backendUpdates = updates.id ? this.toBackendFormat(updates) : updates;
    const response = await this.request('PUT', `/api/characters/${id}`, backendUpdates);
    return this.toFrontendFormat(response);
  },
  
  // Delete a character
  async deleteCharacter(id) {
    await this.request('DELETE', `/api/characters/${id}`);
    return true;
  },
  
  // ==== CAMPAIGN OPERATIONS ====
  
  // Get all campaigns
  async getCampaigns() {
    return await this.request('GET', '/api/campaigns');
  },
  
  // Create a campaign (DM only)
  async createCampaign(name, description) {
    return await this.request('POST', '/api/campaigns', { name, description });
  },
  
  // Assign character to campaign
  async assignToCampaign(characterId, campaignId) {
    return await this.request('PUT', `/api/characters/${characterId}`, {
      campaign_id: campaignId,
    });
  },
  
  // ==== ADDITIONAL CHARACTER OPERATIONS ====
  
  // Duplicate a character
  async duplicateCharacter(id, newName) {
    const response = await this.request('POST', `/api/characters/${id}/duplicate?new_name=${encodeURIComponent(newName || '')}`);
    return this.toFrontendFormat(response);
  },
  
  // Export character
  async exportCharacter(id) {
    return await this.request('GET', `/api/characters/${id}/export`);
  },
  
  // Import character
  async importCharacter(characterData) {
    const backendData = this.toBackendFormat(characterData);
    const response = await this.request('POST', '/api/characters/import', backendData);
    return this.toFrontendFormat(response);
  },
});




// ===== BUNDLE PART: character-builder/character-builder-services.js =====

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

  // Load image from URL (handles CORS via proxy)
  async loadImage(url) {
    try {
      // Use CORS proxy for Azure blob storage URLs (DALL-E images)
      // Azure doesn't allow CORS from most origins, so we need a proxy
      const corsProxy = 'https://corsproxy.io/?';
      const proxiedUrl = corsProxy + encodeURIComponent(url);

      // Fetch the image as a blob to bypass CORS restrictions
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Create object URL from blob
      const objectUrl = URL.createObjectURL(blob);

      // Load image from object URL
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Clean up object URL
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = (error) => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image from blob'));
        };
        img.src = objectUrl;
      });
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
  getImageModel() {
    try {
      const raw = localStorage.getItem('dnd_image_model');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) ||
        'dall-e-3';
      if (!raw) return fallback;
      const value = String(raw).trim();
      const allowed = ['dall-e-3', 'gpt-image-1'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn('StorageService.getImageModel failed, using fallback', e);
      return (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) || 'dall-e-3';
    }
  },

  setImageModel(model) {
    try {
      const value = String(model || '').trim();
      const allowed = ['dall-e-3', 'gpt-image-1'];
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
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'ascii';
      if (!raw) return fallback;
      const value = String(raw).trim().toLowerCase();
      const allowed = ['ascii', 'original'];
      return allowed.includes(value) ? value : fallback;
    } catch (e) {
      console.warn(
        'StorageService.getPortraitViewMode failed, using fallback',
        e,
      );
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'ascii';
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

  // ==== CHARACTER STORAGE (via shared CharacterStorage facade) ====

  /**
   * Get all characters using the shared CharacterStorage facade.
   * This keeps builder + manager on the same storage rail.
   */
  async getCharacters() {
    if (!window.CharacterStorage || typeof window.CharacterStorage.getAll !== 'function') {
      console.warn(
        'StorageService.getCharacters: CharacterStorage facade not available. Falling back to local-only storage.',
      );
      return this._getCharactersFromLocalStorage();
    }

    try {
      const characters = await window.CharacterStorage.getAll();
      // Cache in localStorage for offline access (builder may still rely on this)
      this._cacheCharactersLocally(characters);
      return characters;
    } catch (error) {
      console.error(
        'StorageService.getCharacters: CharacterStorage.getAll failed, using local fallback:',
        error,
      );
      return this._getCharactersFromLocalStorage();
    }
  },
  
  /**
   * Save character through CharacterStorage facade.
   * Preserves existing builder expectations (returns saved character).
   */
  async saveCharacter(character) {
    if (!window.CharacterStorage) {
      console.warn(
        'StorageService.saveCharacter: CharacterStorage facade not available. Using legacy local-only save.',
      );
      return this._saveCharacterToLocalStorage(character);
    }

    try {
      let savedCharacter;

      if (character.id) {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Updating character via CharacterStorage:', character.id);
        }
        savedCharacter = await window.CharacterStorage.update(character.id, character);
      } else {
        if (DEBUG_BUILDER) {
          console.log('💾 BUILDER: Creating character via CharacterStorage');
        }
        savedCharacter = await window.CharacterStorage.add(character);
      }

      // Keep local cache in sync for any builder flows that still read from it
      this._cacheCharacterLocally(savedCharacter);
      return savedCharacter;
    } catch (error) {
      console.error(
        'StorageService.saveCharacter: CharacterStorage operation failed, using legacy local-only save:',
        error,
      );
      return this._saveCharacterToLocalStorage(character);
    }
  },
  
  /**
   * Delete character via CharacterStorage facade.
   */
  async deleteCharacter(id) {
    if (!window.CharacterStorage) {
      console.warn(
        'StorageService.deleteCharacter: CharacterStorage facade not available. Using legacy local-only delete.',
      );
      this._deleteCharacterFromLocalStorage(id);
      return true;
    }

    try {
      await window.CharacterStorage.delete(id);
      this._deleteCharacterFromLocalStorage(id);
      return true;
    } catch (error) {
      console.error(
        'StorageService.deleteCharacter: CharacterStorage.delete failed, falling back to local-only delete:',
        error,
      );
      this._deleteCharacterFromLocalStorage(id);
      return true;
    }
  },
  
  // ==== LOCALSTORAGE HELPERS (private) ====
  
  _getCharactersFromLocalStorage() {
    return (window.DanddyStorage && window.DanddyStorage.readAll())
      || [];
  },

  _saveCharacterToLocalStorage(character) {
    const characters = this._getCharactersFromLocalStorage();
    
    // Assign a temporary ID if none exists (for guest mode)
    if (!character.id) {
      character.id = 'local_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    // Ensure characters have stable timestamps so "Date modified" sorting in
    // the manager can rely on the character data itself instead of separate
    // client-side caches.
    const nowIso = new Date().toISOString();
    if (!character.createdAt) {
      character.createdAt = nowIso;
    }
    character.updatedAt = nowIso;
    
    const index = characters.findIndex((c) => c.id === character.id);

    if (index >= 0) {
      characters[index] = character;
    } else {
      characters.push(character);
    }

    if (window.DanddyStorage) {
      window.DanddyStorage.writeAll(characters);
    } else {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
    }
    return character;
  },

  _deleteCharacterFromLocalStorage(id) {
    if (window.DanddyStorage) {
      window.DanddyStorage.deleteById(id);
    } else {
      const characters = this._getCharactersFromLocalStorage().filter((c) => c.id !== id);
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
    }
  },
  
  _cacheCharactersLocally(characters) {
    if (window.DanddyStorage) {
      window.DanddyStorage.writeCache(characters);
    } else {
      localStorage.setItem(CONFIG.STORAGE_KEY + '_cache', JSON.stringify(characters));
    }
  },
  
  _cacheCharacterLocally(character) {
    const cached = this._getCharactersFromLocalStorage();
    const index = cached.findIndex((c) => c.id === character.id);
    
    if (index >= 0) {
      cached[index] = character;
    } else {
      cached.push(character);
    }
    
    this._cacheCharactersLocally(cached);
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
    const raceLower = race?.toLowerCase().replace(/\s+/g, '-') || '';
    const classLower = classType?.toLowerCase().replace(/\s+/g, '-') || '';
    
    if (!raceLower) return null;

    const fileName = classLower
      ? `${raceLower}-${classLower}.png`
      : `${raceLower}.png`;

    // If a public R2 (or other CDN) base URL is configured, use that.
    if (CONFIG && CONFIG.PREGENERATED_PORTRAIT_BASE_URL) {
      const base = CONFIG.PREGENERATED_PORTRAIT_BASE_URL.replace(/\/+$/, '');
      return `${base}/${fileName}`;
    }

    // Fallback: relative path for environments where PNGs are served locally.
    // This keeps older static setups working if images are present on disk.
    return `../web/generated_portraits/images/${fileName}`;
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

        // Store ASCII art (and original image URL, when configured) in character for export
        if (window.CharacterState) {
          const updates = {
            asciiPortrait: preGenerated,
            asciiPortraitKey: key,
          };

          // If we have a known location for the original pre-generated PNG,
          // expose it as originalPortraitUrl so apps can show "View Original Art".
          const pregenImageUrl = this.getPreGeneratedImageUrl(
            character.race,
            character.class,
          );
          if (pregenImageUrl) {
            updates.originalPortraitUrl = pregenImageUrl;
          }

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
  async generateCustomAIPortrait(character) {
    try {
      console.log('🎨 Generating custom AI portrait with DALL-E...');

      // Step 1: Generate image with DALL-E
      const imageUrl = await AIService.generatePortraitImage(character);

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
    console.log('%c🔄 WARMUP: Waking up backend server...', 'color: #fa0; font-weight: bold');
    
    while (this._backendAvailable !== true) {
      try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.available) {
            this._backendAvailable = true;
            console.log('%c✅ WARMUP: Backend is now ready!', 'color: #0f0; font-weight: bold');
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
      const response = await fetch(url, {
        ...options,
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
        'color: #ff0; font-weight: bold',
      );
      return Utils.randomChoice(fallbacks);
    }

    try {
      console.log('%c🤖 NARRATOR: Calling backend AI...', 'color: #0ff; font-weight: bold');
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
        console.log('%c🤖 NARRATOR (Fallback - API Error)', 'color: #f80; font-weight: bold');
        console.log('  Status:', response.status);
        return Utils.randomChoice(fallbacks);
      }

      const data = await response.json();
      let text = data.comment || Utils.randomChoice(fallbacks);
      
      console.log('%c🤖 NARRATOR (AI Generated) ✨', 'color: #0f0; font-weight: bold');
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
        console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c🤖 NARRATOR (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
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
          'color: #ff0; font-weight: bold',
        );
        return;
      }

      try {
        console.log(
          '%c📛 NAMES: Calling backend AI...',
          'color: #0ff; font-weight: bold',
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
            'color: #f80; font-weight: bold',
          );
          return;
        }

        const data = await response.json();
        if (data.success && Array.isArray(data.names) && data.names.length > 0) {
          console.log(
            '%c📛 NAMES (AI Generated) ✨',
            'color: #0f0; font-weight: bold',
          );
          console.log('  Response:', data.names);
          candidates.push(...data.names);
        }
      } catch (error) {
        if (error.message && error.message.includes('timed out')) {
          console.log(
            '%c📛 NAMES (Fallback - Backend Waking Up)',
            'color: #f80; font-weight: bold',
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
            'color: #f00; font-weight: bold',
          );
          console.error('  Error:', error);
        }
      }
    };

    // Helper: always-available fallback candidates
    const addFallbackCandidates = (multiplier = 3) => {
      console.log(
        '%c📛 NAMES (Fallback)',
        'color: #f80; font-weight: bold',
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
        `${race || 'mysterious'} ${classType || 'adventurer'} with a mysterious past. ` +
        "They don't talk about it much. Probably for the best.";
      return {
        names: fallbackNames,
        backstoryTemplate: template,
      };
    };

    if (!CONFIG.ENABLE_AI) {
      console.log(
        '%c📦 SUMMARY (Fallback - AI Disabled)',
        'color: #ff0; font-weight: bold',
      );
      return buildLocalFallback();
    }

    try {
      console.log(
        '%c📦 SUMMARY: Calling backend AI for names + backstory template...',
        'color: #0ff; font-weight: bold',
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
            '%c📦 SUMMARY (Cooldown / Rate Limit)',
            'color: #ff0; font-weight: bold',
          );
          if (window.UIService) {
            window.UIService.showNotification(
              detail ||
                'AI character generation is cooling down. Using offline suggestions for this one.',
              'warning',
              6000,
            );
          }
        } else {
          console.log(
            '%c📦 SUMMARY (Fallback - API Error)',
            'color: #f80; font-weight: bold',
          );
          console.log('  Status:', status);
        }

        return buildLocalFallback();
      }

      const data = await response.json();
      if (!data || data.success !== true) {
        console.log(
          '%c📦 SUMMARY (Fallback - Bad Payload)',
          'color: #f80; font-weight: bold',
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
          'color: #f80; font-weight: bold',
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
        'color: #0f0; font-weight: bold',
      );
      console.log('  Names:', names);

      return {
        names,
        backstoryTemplate:
          template ||
          (character && character.backstory) ||
          buildLocalFallback().backstoryTemplate,
      };
    } catch (error) {
      if (error.message && error.message.includes('timed out')) {
        console.log(
          '%c📦 SUMMARY (Fallback - Backend Waking Up)',
          'color: #f80; font-weight: bold',
        );
        console.log(
          '  ⏰ Timeout reached. Using local fallback for now; backend warmup continues...',
        );
      } else {
        console.log(
          '%c📦 SUMMARY (Fallback - Connection Error)',
          'color: #f00; font-weight: bold',
        );
        console.error('  Error:', error);
      }
      return buildLocalFallback();
    }
  },

  generateFallbackNames(race, count) {
    const namePatterns = {
      dwarf: {
        first: [
          'Thorin',
          'Gimli',
          'Balin',
          'Dwalin',
          'Thrain',
          'Dain',
          'Bombur',
          'Bofur',
          'Kili',
          'Fili',
          'Oin',
          'Gloin',
          'Bruenor',
          'Morgran',
          'Rurik',
          'Einkil',
          'Barendd',
          'Baern',
          'Harbek',
          'Rumnar',
        ],
        last: [
          'Ironforge',
          'Stonehelm',
          'Deepdelver',
          'Mountainheart',
          'Goldseeker',
          'Ironfoot',
          'Hammerhand',
          'Oakenshield',
          'Battlehammer',
          'Fireforge',
          'Stormdelver',
          'Stonebreaker',
          'Coppervein',
          'Bronzebrow',
          'Rockseeker',
        ],
      },
      elf: {
        first: [
          'Legolas',
          'Galadriel',
          'Elrond',
          'Arwen',
          'Thranduil',
          'Celeborn',
          'Elessar',
          'Elendil',
          'Finrod',
          'Luthien',
          'Faelar',
          'Aelar',
          'Mialee',
          'Syllin',
          'Thia',
          'Varis',
          'Althaea',
          'Enna',
          'Nelar',
        ],
        last: [
          'Greenleaf',
          'Starweaver',
          'Moonwhisper',
          'Silverbow',
          'Nightbreeze',
          'Sunshadow',
          'Stormwind',
          'Brightwood',
          'Dawnpetal',
          'Evenwood',
          'Silverfrond',
          'Nightstar',
          'Willowshade',
          'Starfall',
          'Moonbrook',
        ],
      },
      human: {
        first: [
          'Aragorn',
          'Boromir',
          'Eowyn',
          'Faramir',
          'Theodred',
          'Eomer',
          'Eddard',
          'Catelyn',
          'Jon',
          'Sansa',
          'Alaric',
          'Rowan',
          'Serena',
          'Garrick',
          'Lysa',
          'Marcus',
          'Elena',
          'Corin',
          'Brynn',
        ],
        last: [
          'Stormborn',
          'Blackwood',
          'Riverrun',
          'Ironwall',
          'Longstrider',
          'Stormblade',
          'Brightshield',
          'Greywind',
          'Highvale',
          'Steelguard',
          'Duskwalker',
          'Redcrest',
          'Stoneward',
          'Ashborne',
          'Hawkspear',
        ],
      },
      halfling: {
        first: [
          'Bilbo',
          'Frodo',
          'Sam',
          'Merry',
          'Pippin',
          'Rosie',
          'Hamfast',
          'Belladonna',
          'Lobelia',
          'Fredegar',
          'Milo',
          'Daisy',
          'Rosa',
          'Cora',
          'Perrin',
          'Tansy',
          'Dodo',
          'Seraphina',
          'Odo',
        ],
        last: [
          'Baggins',
          'Took',
          'Brandybuck',
          'Gamgee',
          'Goodbody',
          'Proudfoot',
          'Burrows',
          'Underhill',
          'Greenhill',
          'Fairbairn',
          'Hilltopple',
          'Brushgather',
          'Tealeaf',
          'Thorngage',
          'Goodbarrel',
          'Hearthcoat',
        ],
      },
      dragonborn: {
        first: [
          'Drax',
          'Razax',
          'Thordak',
          'Torinn',
          'Balasar',
          'Kriv',
          'Nadarr',
          'Heskan',
          'Shedinn',
          'Ghesh',
          'Arjhan',
          'Medrash',
          'Rhogar',
          'Tarhun',
          'Akra',
          'Miirym',
          'Sora',
          'Vezera',
          'Zorvath',
        ],
        last: [
          'Flameheart',
          'Ironclaw',
          'Stormsinger',
          'Ashborn',
          'Dragonfall',
          'Firebreath',
          'Scaleborn',
          'Wyrmblood',
          'Skyscale',
          'Embermaw',
          'Stormscale',
          'Brightflame',
          'Stoneclaw',
          'Cloudsunder',
          'Blazewing',
        ],
      },
      gnome: {
        first: [
          'Glim',
          'Boddynock',
          'Dimble',
          'Fonkin',
          'Seebo',
          'Zook',
          'Eldon',
          'Brocc',
          'Burgell',
          'Jebeddo',
          'Alston',
          'Bimpnottin',
          'Fizzik',
          'Carlin',
          'Nissa',
          'Wrenn',
          'Tavi',
          'Ellyjobell',
          'Zanna',
        ],
        last: [
          'Tinkertop',
          'Sparklegem',
          'Nimblefingers',
          'Brightgear',
          'Gadgetwhiz',
          'Fizzlebang',
          'Cogsworth',
          'Glimmergold',
          'Whistlewhirr',
          'Gadgetgrind',
          'Janglecoin',
          'Copperbolt',
          'Mithrilspanner',
          'Quickwidget',
          'Proudgear',
        ],
      },
      'half-elf': {
        first: [
          'Tanis',
          'Raistlin',
          'Laurana',
          'Gilthanas',
          'Tanthalas',
          'Silvara',
          'Eliana',
          'Korrin',
          'Faelyn',
          'Soveliss',
          'Ilanis',
          'Kael',
          'Myla',
          'Tharos',
          'Elira',
          'Daeris',
          'Rian',
          'Caelynn',
          'Torren',
        ],
        last: [
          'Half-Elven',
          'Moonbrook',
          'Starfall',
          'Whisperwind',
          'Shadowvale',
          'Dawnbringer',
          'Twilightbane',
          'Silvermoon',
          'Nightbloom',
          'Duskwillow',
          'Starcrest',
          'Eveningfall',
          'Shadeglade',
          'Brightglen',
          'Silvershade',
        ],
      },
      'half-orc': {
        first: [
          'Grognak',
          'Throk',
          'Ugak',
          'Krod',
          'Sharn',
          'Dench',
          'Grul',
          'Drog',
          'Feng',
          'Shump',
          'Ghorbash',
          'Mazog',
          'Uglar',
          'Ruk',
          'Karash',
          'Vorag',
          'Yagra',
          'Shautha',
          'Ovak',
        ],
        last: [
          'Ironhide',
          'Bonecrusher',
          'Skullsplitter',
          'Bloodaxe',
          'Stonefist',
          'Grimjaw',
          'Warbringer',
          'Doomhammer',
          'Boulderfist',
          'Skullbrand',
          'Gorefang',
          'Bloodfury',
          'Ironmaw',
          'Steelgrip',
          'Rageborn',
        ],
      },
      tiefling: {
        first: [
          'Zevlor',
          'Raven',
          'Damakos',
          'Akta',
          'Therai',
          'Nemeia',
          'Kallista',
          'Leucis',
          'Orianna',
          'Morthos',
          'Azazel',
          'Seraphine',
          'Xathos',
          'Riven',
          'Lyra',
          'Caelum',
          'Naeris',
          'Vexria',
          'Zheren',
        ],
        last: [
          'Hellborn',
          'Darkflame',
          'Shadowhorn',
          'Nightwhisper',
          'Embersoul',
          'Dreadfire',
          'Ashenborn',
          'Voidwalker',
          'Grimshroud',
          'Duskwreath',
          'Soulbrand',
          'Cindertongue',
          'Nightreign',
          'Gloomsigil',
          'Shadebinder',
        ],
      },
    };

    const pattern = namePatterns[race] || namePatterns.human;
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
      const fullName = `${firstName} ${lastName}`;

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
      const fullKey = last ? `${firstKey} ${lastKey}` : firstKey;

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
    const fallback = `${character.name} is a ${character.race} ${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";

    if (!CONFIG.ENABLE_AI) {
      console.log('%c📖 BACKSTORY (Fallback - AI Disabled)', 'color: #ff0; font-weight: bold');
      return fallback;
    }

    try {
      console.log('%c📖 BACKSTORY: Calling backend AI...', 'color: #0ff; font-weight: bold');
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
        console.log('%c📖 BACKSTORY (Fallback - API Error)', 'color: #f80; font-weight: bold');
        return fallback;
      }

      const data = await response.json();
      if (data.success && data.backstory) {
        console.log('%c📖 BACKSTORY (AI Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  Response:', data.backstory.substring(0, 100) + '...');
        return data.backstory;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log(
          `  ⏰ ${CONFIG.AI_TIMEOUT / 1000}s timeout reached. Using fallback now, but backend warmup continues...`,
        );
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📖 BACKSTORY (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
        console.error('  Error:', error);
      }
    }

    console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80; font-weight: bold');
    return fallback;
  },

  async generateOptionVariations(questionText, options) {
    if (!CONFIG.ENABLE_AI || CONFIG.ENABLE_AI_OPTION_VARIATIONS === false) {
      console.log(
        '%c🎲 OPTIONS (Fallback - AI Disabled or variations off)',
        'color: #ff0; font-weight: bold',
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

    console.log('%c🎲 OPTIONS: Calling backend AI...', 'color: #0ff; font-weight: bold');
    console.log('  Note: Will fallback to original option texts if unavailable...');

    const response = await this.generateCompletion(prompt, systemPrompt);

    if (response) {
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const variations = JSON.parse(jsonMatch[0]);
          if (Array.isArray(variations) && variations.length === options.length) {
            console.log('%c🎲 OPTIONS (AI Generated) ✨', 'color: #0f0; font-weight: bold');
            return variations;
          }
        }
      } catch (error) {
        console.log('Failed to parse AI option variations:', error);
      }
    }

    // Fallback: return original texts
    console.log('%c🎲 OPTIONS (Fallback - Using Original Texts) ✅', 'color: #f80; font-weight: bold');
    console.log('  The original option texts will be used instead of AI variations');
    return options.map((opt) => opt.text);
  },

  // Generate character portrait image using DALL-E
  async generatePortraitImage(character) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c🎨 DALL-E (Unavailable - AI Disabled)', 'color: #ff0; font-weight: bold');
      return null;
    }

    try {
      // Resolve current image model preference (builder + manager share this).
      let model = 'dall-e-3';
      try {
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          model = StorageService.getImageModel();
        } else if (CONFIG && CONFIG.DEFAULT_IMAGE_MODEL) {
          model = CONFIG.DEFAULT_IMAGE_MODEL;
        }
      } catch (e) {
        console.warn('AIService.generateImageFromPrompt: failed to read image model, using default', e);
      }

      console.log('%c🎨 IMAGE: Calling backend AI...', 'color: #0ff; font-weight: bold');
      // Log only a preview of the prompt so the console isn't flooded,
      // but make it clear that the full prompt (without truncation) is
      // sent to the backend.
      console.log('  Prompt (preview):', prompt.substring(0, 100) + (prompt.length > 100 ? '…' : ''));
      console.log('  Model:', model);
      console.log('  Note: Image generation takes 20-30s (longer than text AI)...');
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          size: '1024x1024',
          // Use "high" for best quality portraits (kept for compatibility with existing backend validation).
          quality: 'high',
          model: model,
        }),
      }, 70000); // 70 seconds for image generation (DALL-E can be very slow, plus R2 upload)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 IMAGE (Error)', 'color: #f00; font-weight: bold');
        console.log('  Error:', errorData.detail);
        
        // Check for rate limiting
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.detail || 'Rate limit exceeded');
          rateLimitError.isRateLimit = true;
          throw rateLimitError;
        }
        
        // Check for safety system rejection
        if (response.status === 400 && errorData.detail && errorData.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', errorData.detail);
          console.warn('📝 REJECTED PROMPT:', prompt);
          
          // Analyze the prompt to help identify problematic sections
          const analysis = this.analyzeRejectedPrompt(prompt);
          
          const safetyError = new Error('Portrait generation was flagged by OpenAI\'s content safety system');
          safetyError.isSafetyRejection = true;
          safetyError.originalMessage = errorData.detail;
          safetyError.rejectedPrompt = prompt; // Capture the prompt for debugging
          safetyError.promptAnalysis = analysis; // Include analysis results
          throw safetyError;
        }
        
        throw new Error(errorData.detail || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        console.log('%c🎨 IMAGE (Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  URL:', data.url.substring(0, 50) + '...');
        return data.url;
      }
      return null;
    } catch (error) {
      console.log('%c🎨 IMAGE (Failed)', 'color: #f00; font-weight: bold');
      console.error('  Error:', error);
      throw error;
    }
  },

  // Build character description (shown to user in modal)
  buildCharacterDescription(character) {
    const parts = [];

    // Race
    if (character.race) {
      const raceDescriptions = {
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
      parts.push(raceDescriptions[character.race] || character.race);
    }

    // Class
    if (character.class) {
      const classDescriptions = {
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
      parts.push(classDescriptions[character.class] || character.class);
    }

    // Magic specialization (only for spellcasting classes)
    if (character.class) {
      const magicSpecializations = {
        wizard: 'specializing in elemental magic like fire and ice',
        sorcerer: 'channeling raw elemental arcane power',
        warlock: 'wielding shadowy eldritch magic',
        cleric: 'focused on radiant and healing magic',
        druid: 'calling on primal nature and elemental magic',
        bard: 'weaving subtle enchantments and support magic through music',
        paladin: 'enhancing strikes with holy, radiant magic',
      };

      const magicText = magicSpecializations[character.class];
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
    const characterDescription = this.buildCharacterDescription(character);

    // Normalize class key for lookups
    const classKey = (character.class || 'default').toLowerCase();

    // Class-specific pose variants (5 each where applicable)
    const poseVariantsByClass = {
      // Martial / weapon-focused
      fighter: [
        'posed mid-swing with a heavy weapon, body twisted to show the arc of the strike',
        'standing in a ready battle stance, shield raised and weapon held low but tense',
        'caught in the moment of blocking an attack, weight shifted back with shield braced',
        'bust-length portrait (shoulders-up chest shot), armor and pauldrons filling most of the frame, weapon only implied near the edge of the composition',
        'half-body view from the top of the head to the waist, shield and weapon crossing in front of the torso in a strong diagonal',
      ],
      barbarian: [
        'leaning forward in a feral roar, muscles tensed, weapon mid-swing',
        'standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands',
        'caught mid-leap as if diving into battle, hair and trophies flying outward',
        'bust-length portrait (shoulders-up) with wild hair and trophies framing the face, weapon only partially visible',
        'half-body view from head to waist, torso twisted slightly as they grip a massive weapon across their body',
      ],
      paladin: [
        'kneeling with shield planted in front, weapon held upright in a solemn vow pose',
        'standing tall with shield forward and weapon raised in a protective gesture',
        'framed in a side stance, shield angled and weapon ready for a precise strike',
        'bust-length portrait (chest and shoulders) with polished armor and holy symbol prominent, gaze lifted slightly upward',
        'half-body view from head to waist, shield raised to one side and weapon held upright along the torso',
      ],
      rogue: [
        'crouched low in the shadows, one dagger drawn and the other held behind for balance',
        'leaning casually against an unseen wall, one hand resting on a hidden blade',
        'mid-step on a narrow ledge, body turned sideways with cloak pulled close',
        'bust-length portrait (shoulders-up) emerging from shadow, cloak and hood framing the face, one dagger just at the edge of frame',
        'half-body view from head to waist, body angled three-quarter with one hand resting lightly on a hidden blade at the belt',
      ],
      monk: [
        'balanced on one leg in a classic kick pose, arms forming a flowing guard shape',
        'mid-strike with an open palm, body rotated and lines clean and focused',
        'seated in calm meditation, legs crossed and hands resting in a composed mudra',
        'bust-length portrait (shoulders-up), calm expression and neatly arranged robes, one hand raised near the chest in a subtle gesture',
        'half-body view from head to waist in a centered stance, arms forming a clean symmetrical guard in front of the torso',
      ],
      ranger: [
        'drawing a bow with the string fully pulled, body turned in a three-quarter stance',
        'kneeling on one knee with bow lowered, scanning the distance like a watchful scout',
        'mid-stride through an implied forest floor, bow held loosely but ready',
        'bust-length portrait (shoulders-up) with cloak and quiver framing the head and shoulders, bow only hinted at near the edge of frame',
        'half-body view from head to waist, bow held across the chest in a relaxed but ready posture',
      ],
 
      // Casters and support
      wizard: [
        'standing with one hand raised and fingers splayed, arcane energy swirling upward',
        'leaning over an invisible spellbook, staff angled forward as if channeling power',
        'mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion',
        'bust-length portrait (shoulders-up) with arcane light reflecting off the face and shoulders, staff or spell effect just entering frame',
        'half-body view from head to waist, one arm across the torso cradling a spellbook while the other hand traces glowing sigils',
      ],
      sorcerer: [
        'surrounded by swirling magical energy, one hand outstretched and the other pulled close',
        'standing with arms wide, raw power coiling around their torso and shoulders',
        'mid-step as a surge of magic bursts from the ground around their feet',
        'bust-length portrait (shoulders-up) wreathed in subtle magical glow around the shoulders and chest, expression intense',
        'half-body view from head to waist, arms drawn in close as swirling power wraps the upper torso',
      ],
      warlock: [
        'holding a pact focus or talisman forward, dark energy streaming from it',
        'standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes',
        'reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind',
        'bust-length portrait (shoulders-up) with pact focus or talisman held near the chest, faint eldritch patterns behind the head and shoulders',
        'half-body view from head to waist, cloak falling around the torso while one hand rests lightly on a focus at the belt',
      ],
      cleric: [
        'raising a holy symbol high, light radiating outward in a protective arc',
        'standing with shield angled and mace lowered, posture firm and resolute',
        'kneeling in prayerful focus, holy symbol clasped between both hands',
        'bust-length portrait (shoulders-up) with holy symbol and upper armor prominent in frame, expression serene but resolute',
        'half-body view from head to waist, shield or mace held close to the torso in a protective stance',
      ],
      druid: [
        'standing with staff planted in the earth, vines and leaves swirling around',
        'mid-transformation pose, body partly turned and framed by natural shapes',
        'kneeling to touch the ground, one hand extended as if coaxing growth',
        'bust-length portrait (shoulders-up) framed by leaves, branches, or antler-like shapes around the head and shoulders',
        'half-body view from head to waist, staff or natural focus held across the chest with cloak or furs draped over the shoulders',
      ],
      bard: [
        'mid-performance with an instrument, one foot forward and body open to an unseen crowd',
        'leaning back in a dramatic flourish, cloak and hair trailing with the motion',
        'perched casually on an unseen stool or crate, instrument resting comfortably in hand',
        'bust-length portrait (shoulders-up) with instrument or microphone-like focus near the chest, hair and clothing adding dynamic shapes',
        'half-body view from head to waist, instrument cradled against the torso in a relaxed, performative pose',
      ],
 
      // Default / non-class-specific fallback
      default: [
        'standing in a relaxed but heroic stance, weight shifted slightly to one side',
        'mid-stride as if walking toward the viewer with confident energy',
        'standing in profile with head turned toward the viewer, posture composed and steady',
        'bust-length portrait (shoulders-up) with the character centered in frame, clothing and armor details emphasized around the chest and shoulders',
        'half-body view from head to waist, stance relaxed but confident with hands or a weapon resting near the torso',
      ],
    };

    // Camera angle variants (5 each where applicable)
    const cameraVariantsByClass = {
      fighter: [
        'Camera angle: slightly low and three-quarter to emphasize strength and presence.',
        'Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.',
        'Camera angle: three-quarter from the shield side, highlighting defense and stance.',
        'Camera angle: slightly above, looking down to show battlefield context around the figure.',
        'Camera angle: close to ground level, making the character loom large in the frame.',
      ],
      barbarian: [
        'Camera angle: low and close, exaggerating size and ferocity.',
        'Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.',
        'Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.',
        'Camera angle: pulled back to show the full silhouette and large weapon in motion.',
        'Camera angle: slightly below the shoulders, looking up into a battle roar.',
      ],
      paladin: [
        'Camera angle: eye-level, straight on, emphasizing honor and symmetry.',
        'Camera angle: slightly low, looking up past the shield to give a guardian feeling.',
        'Camera angle: three-quarter from the weapon side, showing both devotion and readiness.',
        'Camera angle: slightly above, as if from the viewpoint of someone being protected.',
        'Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.',
      ],
      rogue: [
        'Camera angle: slightly above and to the side, emphasizing stealth and environment.',
        'Camera angle: three-quarter from behind, with the face turned back toward the viewer.',
        'Camera angle: low and angled sharply, creating long, dramatic shadows.',
        'Camera angle: tight framing around the upper body, leaving the background mostly in shadow.',
        'Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.',
      ],
      monk: [
        'Camera angle: mid-distance and centered, capturing clean lines of the martial pose.',
        'Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.',
        'Camera angle: from above, looking down on a circular stance pattern.',
        'Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.',
        'Camera angle: side-on profile to highlight precision and alignment of the form.',
      ],
      ranger: [
        'Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.',
        'Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.',
        'Camera angle: slightly elevated, framing the ranger and implied terrain below.',
        'Camera angle: low and angled upward through implied undergrowth or rough ground.',
        'Camera angle: mid-distance, with the character slightly off-center to suggest open space.',
      ],
      wizard: [
        'Camera angle: three-quarter, framing both staff and spell effect in the same view.',
        'Camera angle: slightly low, making the spellcasting gesture feel towering and grand.',
        'Camera angle: slightly above, looking down on a circle of arcane energy.',
        'Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.',
        'Camera angle: oblique and off-center, with arcane elements framing the composition.',
      ],
      sorcerer: [
        'Camera angle: close and low, centered on the chest where power is gathering.',
        'Camera angle: three-quarter from the side, showing energy spiraling around the figure.',
        'Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.',
        'Camera angle: tight framing on the face and hands, emphasizing raw intensity.',
        'Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.',
      ],
      warlock: [
        'Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.',
        'Camera angle: three-quarter from behind, looking toward an unseen source of power.',
        'Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.',
        'Camera angle: close to the focus or talisman, with the character looming just behind it.',
        'Camera angle: slightly above, letting eldritch patterns form around the character\'s feet.',
      ],
      cleric: [
        'Camera angle: slightly low, looking up toward the raised holy symbol.',
        'Camera angle: eye-level, centered to evoke balance and stability.',
        'Camera angle: three-quarter, allowing both shield and symbol to read clearly.',
        'Camera angle: slightly above, as if from the viewpoint of a blessed ally.',
        'Camera angle: mid-distance with the character framed symmetrically in the composition.',
      ],
      druid: [
        'Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.',
        'Camera angle: three-quarter, with implied branches or leaves partially framing the view.',
        'Camera angle: slightly above, looking down as if from a bird\'s-eye vantage.',
        'Camera angle: eye-level but softened, placing the character gently into the environment.',
        'Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.',
      ],
      bard: [
        'Camera angle: eye-level, as if the viewer is part of an unseen audience.',
        'Camera angle: three-quarter, capturing both gesture and instrument clearly.',
        'Camera angle: slightly low, turning a performance flourish into a heroic moment.',
        'Camera angle: above and angled, as if looking down from a balcony over a small stage.',
        'Camera angle: tight around the upper body and instrument, focusing on expression.',
      ],
      default: [
        'Camera angle: three-quarter view that clearly shows the full silhouette.',
        'Camera angle: eye-level, centered, with the figure dominating the frame.',
        'Camera angle: slightly low, making the character feel larger and more heroic.',
        'Camera angle: slightly above, looking down just enough to show shoulders and gear.',
        'Camera angle: mid-distance with the character placed slightly off-center for balance.',
      ],
    };

    // Select randomized pose and camera angle for this generation
    const poseList =
      poseVariantsByClass[classKey] || poseVariantsByClass.default;
    const cameraList =
      cameraVariantsByClass[classKey] || cameraVariantsByClass.default;

    const posePrompt =
      poseList[Math.floor(Math.random() * poseList.length)];
    const cameraPrompt =
      cameraList[Math.floor(Math.random() * cameraList.length)];

    const renderingInstructions = [
      `Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,
      'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
      'Include some controlled, directional hatching to define form (light mid-tone texture only).',
      `Pose: ${posePrompt}`,
      cameraPrompt,
      'Background should be simple, entirely black, and free of symbols or text.',
      'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
      'Aspect ratio 3:4.',
    ];
    return renderingInstructions.join(' ');
  },

  // Analyze a rejected prompt to help identify problematic sections
  analyzeRejectedPrompt(prompt) {
    console.log('%c🔍 Analyzing Rejected Prompt', 'color: #ff0; font-weight: bold; font-size: 14px;');
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
      console.log('%c⚠️  POTENTIAL ISSUES DETECTED:', 'color: #f90; font-weight: bold;');
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
    console.log('%c💡 DEBUGGING SUGGESTIONS:', 'color: #0ff; font-weight: bold;');
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






// ===== BUNDLE PART: character-builder/character-builder-state.js =====

// State management for the DandDy terminal character builder.
// Exposes CharacterState and OptionVariationsCache as globals on window.

// Cache of AI-generated option text variations (per session)
const OptionVariationsCache = (window.OptionVariationsCache = {
  cache: {},

  async get(questionId, question) {
    // Don't vary race, class, background, or alignment choices - keep classic D&D terms
    const noVariationQuestions = [
      'race-choice',
      'class-choice',
      'background-choice',
      'alignment-choice',
    ];
    if (noVariationQuestions.includes(questionId)) {
      return question.options;
    }

    // Return cached if exists
    if (this.cache[questionId]) {
      return this.cache[questionId];
    }

    // Generate new variations
    const variations = await AIService.generateOptionVariations(
      question.text,
      question.options,
    );

    // Create new options array with varied text but same underlying data
    const variedOptions = question.options.map((opt, index) => ({
      ...opt,
      text: variations[index],
    }));

    // Cache it
    this.cache[questionId] = variedOptions;

    return variedOptions;
  },

  reset() {
    this.cache = {};
  },
});

// Character creation state (current character, answers, listeners)
const CharacterState = (window.CharacterState = {
  current: {
    id: null,
    step: 0,
    abilityMethod: null,
    answers: {},
    character: {
      // Stable identity for this character across renames/exports/imports
      // Used by Character Manager to detect "this is the same character"
      characterUid: null,
      name: '',
      race: '',
      class: '',
      background: '',
      alignment: '',
      baseAbilities: null,
      abilities: {
        str: 10,
        dex: 10,
        con: 10,
        int: 10,
        wis: 10,
        cha: 10,
      },
      level: 1,
      hitPoints: 0,
      personalityTrait: '',
      backstory: '',
      // Background benefits
      skillProficiencies: [],
      toolProficiencies: [],
      languages: [],
      equipment: [],
      backgroundFeature: null,
      // Spellcasting
      spellcastingAbility: null,
      cantrips: [],
      spellsKnown: [],
      spellsPrepared: [],
      spellSlots: {},
    },
  },

  listeners: [],

  get() {
    return this.current;
  },

  set(updates) {
    this.current = { ...this.current, ...updates };
    this.notify();
  },

  updateCharacter(updates) {
    this.current.character = { ...this.current.character, ...updates };
    this.notify();
  },

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach((listener) => listener(this.current));
  },

  reset() {
    this.current = {
      id: Date.now().toString(),
      step: 0,
      abilityMethod: null,
      answers: {},
      character: {
        // Generate a fresh stable UID for this new character
        characterUid: `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name: '',
        race: '',
        class: '',
        background: '',
        alignment: '',
        baseAbilities: null,
        abilities: {
          str: 10,
          dex: 10,
          con: 10,
          int: 10,
          wis: 10,
          cha: 10,
        },
        level: 1,
        hitPoints: 0,
        personalityTrait: '',
        backstory: '',
        // Background benefits
        skillProficiencies: [],
        toolProficiencies: [],
        languages: [],
        equipment: [],
        backgroundFeature: null,
        // Spellcasting
        spellcastingAbility: null,
        cantrips: [],
        spellsKnown: [],
        spellsPrepared: [],
        spellSlots: {},
      },
    };
    this.notify();
  },
});







// ===== BUNDLE PART: shared-character-sheet.js =====

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




// ===== BUNDLE PART: character-builder/character-builder-components.js =====

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
        <input type="text" class="input-field" id="text-input" placeholder="${question.placeholder || 'Type here...'}">
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
    const { showGeneratePortraitButton = true } = extraOptions || {};

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
        })}
      </div>
    `;
  },

  renderSettings() {
    const currentNarratorId = StorageService.getNarratorId();
    const narratorsList = getNarratorList();

    // Helper to truncate text for options
    const truncate = (text, maxLength) => {
      return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
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
      ? truncate(
          `${currentNarrator.emoji} ${currentNarrator.name} - ${currentNarrator.description}`,
          60,
        )
      : 'Choose narrator';

    const narratorOptionsMenu = narratorsList
      .map((narrator) => {
        const optionText = `${narrator.emoji} ${narrator.name} - ${narrator.description}`;
        const truncatedText = truncate(optionText, 60);
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
              ${truncatedText}
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
      { value: 'gpt-image-1', label: 'GPT Image 1 (new)' },
    ];

    const currentImageModelValue = getCurrentImageModel();
    const currentImageModelOption =
      imageModelOptions.find((opt) => opt.value === currentImageModelValue) ||
      imageModelOptions[0];
    const currentImageModelLabel = currentImageModelOption.label;

    // Portrait view mode (ASCII vs Original)
    const getPortraitViewMode = () => {
      if (window.StorageService && StorageService.getPortraitViewMode) {
        return StorageService.getPortraitViewMode();
      }
      return (CONFIG && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) || 'ascii';
    };

    const currentPortraitViewMode = getPortraitViewMode();

    return `
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">⚙ Settings</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">Narrator Voice</div>
                    <div class="selector-shell selector-shell--match-width">
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
                          const optionText = `${narrator.emoji} ${narrator.name} - ${narrator.description}`;
                          const truncatedText = truncate(optionText, 60);
                          return `
                            <option value="${narrator.id}" ${
                              narrator.id === currentNarratorId ? 'selected' : ''
                            }>
                              ${truncatedText}
                            </option>
                          `;
                        })
                        .join('')}
                    </select>
                  </div>
                </section>

                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">Narrator Text Speed</div>
                    <div class="selector-shell selector-shell--match-width">
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
                            opt.value === currentTextSpeedOption.value ? 'selected' : ''
                          }>
                            ${opt.label}
                          </option>
                        `,
                        )
                        .join('')}
                    </select>
                  </div>
                </section>

                <section class="settings-section">
                  <div class="settings-row">
                    <div class="settings-label">AI model</div>
                    <div class="selector-shell selector-shell--match-width">
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
                </section>

                <section class="settings-section">
                  <div class="settings-row settings-row--stacked">
                    <div class="settings-label">Default portrait view</div>
                    <div class="settings-field">
                      <div class="settings-radio-group" role="radiogroup" aria-label="Default portrait view">
                        <label class="settings-radio-option">
                          <input
                            type="radio"
                            name="portrait-view-mode"
                            value="ascii"
                            ${currentPortraitViewMode === 'original' ? '' : 'checked'}
                          >
                          <span class="settings-radio-label">ASCII</span>
                        </label>
                        <label class="settings-radio-option">
                          <input
                            type="radio"
                            name="portrait-view-mode"
                            value="original"
                            ${currentPortraitViewMode === 'original' ? 'checked' : ''}
                          >
                          <span class="settings-radio-label">Original</span>
                        </label>
                      </div>
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="SettingsModal.close()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="SettingsModal.save()">SAVE</button>
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
    const portraitModeInput = document.querySelector(
      'input[name="portrait-view-mode"]:checked',
    );
    if (portraitModeInput && window.StorageService && StorageService.setPortraitViewMode) {
      StorageService.setPortraitViewMode(portraitModeInput.value);
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved!');
    } else if (typeof showNotification === 'function') {
      showNotification('Settings saved');
    }

    this.close();
  },
});




// ===== BUNDLE PART: character-builder/character-builder-questions.js =====

// Question flow definition for the DandDy terminal character builder.
// Exposes QUESTIONS as a global on window.

const QUESTIONS = (window.QUESTIONS = [
  {
    id: 'intro',
    type: 'message',
    text: `> SYSTEM INITIALIZED...
> LOADING CHARACTER CREATION PROTOCOL...
> 
> Ah. Another soul seeking adventure. Or at least, trying to.
> 
> Look, I've done this a thousand times. You'll make choices. I'll pretend they matter. We'll both get through this.
> 
> Let's start with something easy...`,
    next: 'entry-mode',
  },

  {
    id: 'entry-mode',
    type: 'choice',
    text: 'How would you like to create your character?',
    options: [
      {
        text: 'Co-create with the narrator (guided mode)',
        value: 'guided',
      },
      {
        text: 'Quick create (let the system roll everything)',
        value: 'quick',
      },
    ],
    next: 'motivation',
  },

  {
    id: 'motivation',
    type: 'choice',
    text: 'What draws you to the adventuring life?',
    options: [
      { text: 'Glory and heroism', value: 'glory', trait: 'heroic' },
      { text: 'Gold and treasure', value: 'gold', trait: 'greedy' },
      { text: 'Escaping my past', value: 'escape', trait: 'mysterious' },
      { text: 'Just bored, honestly', value: 'bored', trait: 'casual' },
    ],
    aiPromptContext: 'player motivation for adventuring',
    next: 'playstyle',
  },

  {
    id: 'playstyle',
    type: 'choice',
    text: 'What kind of playstyle sounds most fun to you?',
    options: [
      {
        text: 'Sneaky and tactical',
        value: 'sneaky',
      },
      {
        text: 'Tanky and hard to kill',
        value: 'tanky',
      },
      {
        text: 'Social and talkative',
        value: 'social',
      },
      {
        text: 'Blasting things from the back line',
        value: 'blaster',
      },
    ],
    aiPromptContext: 'player preferred combat and roleplay playstyle',
    next: 'physicality',
  },

  {
    id: 'physicality',
    type: 'choice',
    text: 'And physically, how would you describe yourself?',
    options: [
      {
        text: 'Strong and imposing',
        value: 'strong',
        suggests: ['fighter', 'barbarian', 'paladin'],
      },
      {
        text: 'Quick and nimble',
        value: 'nimble',
        suggests: ['rogue', 'ranger', 'monk'],
      },
      {
        text: 'Mystically gifted',
        value: 'mystical',
        suggests: ['wizard', 'sorcerer', 'warlock'],
      },
      {
        text: 'Unremarkable, honestly',
        value: 'average',
        suggests: ['bard', 'cleric', 'druid'],
      },
    ],
    aiPromptContext: 'player physical description',
    next: 'social',
  },

  {
    id: 'social',
    type: 'choice',
    text: 'In social situations, you tend to be...',
    options: [
      {
        text: 'Charismatic and charming',
        value: 'charismatic',
        suggests: ['bard', 'paladin', 'sorcerer', 'warlock'],
      },
      {
        text: 'Observant and quiet',
        value: 'observant',
        suggests: ['rogue', 'ranger', 'druid'],
      },
      {
        text: 'Intimidating',
        value: 'intimidating',
        suggests: ['barbarian', 'fighter'],
      },
      {
        text: 'Awkward but well-meaning',
        value: 'awkward',
        suggests: ['wizard', 'cleric', 'monk'],
      },
    ],
    aiPromptContext: 'player social tendencies',
    next: 'race-suggest',
  },

  {
    id: 'race-suggest',
    type: 'suggestion',
    text: 'Analyzing your responses... ( ._. )',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Map answers to race suggestions
      if (answers.physicality === 'strong') {
        suggestions.push('dwarf', 'half-orc', 'dragonborn');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('elf', 'halfling', 'half-elf');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('tiefling', 'elf', 'gnome');
      }
      if (answers.physicality === 'average') {
        suggestions.push('human', 'half-elf', 'halfling');
      }

      if (answers.social === 'charismatic') {
        suggestions.push('human', 'half-elf', 'tiefling');
      }
      if (answers.social === 'observant') {
        suggestions.push('elf', 'gnome');
      }
      if (answers.social === 'intimidating') {
        suggestions.push('half-orc', 'dragonborn', 'dwarf');
      }
      if (answers.social === 'awkward') {
        suggestions.push('gnome', 'halfling', 'tiefling');
      }

      // Get top 3 most suggested
      const counts = {};
      suggestions.forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
      const top3 = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([race]) => race);

      return {
        message:
          'Based on your answers, you seem like the type who would be... let me think...',
        suggestions: top3.length === 3 ? top3 : ['human', 'elf', 'dwarf'],
      };
    },
    next: 'race-choice',
  },

  {
    id: 'race-choice',
    type: 'list-choice',
    text: 'Choose your race:',
    options: DND_DATA.races.map((r) => ({
      text: `${r.name} - ${r.description}`,
      value: r.id,
    })),
    saveTo: 'race',
    next: 'class-suggest',
  },

  {
    id: 'class-suggest',
    type: 'suggestion',
    text: 'Interesting choice. Now for your class...',
    getSuggestion: (state) => {
      const answers = state.answers;
      const suggestions = [];

      // Physicality preferences
      if (answers.physicality === 'strong') {
        suggestions.push('fighter', 'barbarian', 'paladin');
      }
      if (answers.physicality === 'nimble') {
        suggestions.push('rogue', 'ranger', 'monk');
      }
      if (answers.physicality === 'mystical') {
        suggestions.push('wizard', 'sorcerer', 'warlock');
      }

      // Social tendencies
      if (answers.social === 'charismatic') {
        suggestions.push('bard', 'paladin', 'warlock');
      }

      // Playstyle preferences (sneaky / tanky / social / blaster)
      if (answers.playstyle === 'sneaky') {
        suggestions.push('rogue', 'ranger', 'monk');
      }
      if (answers.playstyle === 'tanky') {
        suggestions.push('barbarian', 'fighter', 'paladin');
      }
      if (answers.playstyle === 'social') {
        suggestions.push('bard', 'paladin', 'warlock');
      }
      if (answers.playstyle === 'blaster') {
        suggestions.push('wizard', 'sorcerer', 'warlock');
      }

      // If we collected multiple ideas, bias toward the ones that appear more often
      const counts = {};
      suggestions.forEach((cls) => {
        counts[cls] = (counts[cls] || 0) + 1;
      });
      const ranked = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .map(([cls]) => cls);

      const finalSuggestions =
        ranked.length > 0 ? ranked.slice(0, 3) : ['fighter', 'wizard', 'rogue'];

      return {
        message: 'Given your choices, might I suggest...',
        suggestions: finalSuggestions,
      };
    },
    next: 'class-choice',
  },

  {
    id: 'class-choice',
    type: 'list-choice',
    text: 'Choose your class:',
    options: DND_DATA.classes.map((c) => ({
      text: `${c.name} - ${c.description}`,
      value: c.id,
    })),
    saveTo: 'class',
    next: 'abilities',
  },

  {
    id: 'abilities',
    type: 'abilities',
    text: 'Time to roll your ability scores. Choose your method:',
    options: [
      {
        text: 'Standard Array (15, 14, 13, 12, 10, 8)',
        value: 'standard',
      },
      { text: 'Roll 4d6 (drop lowest)', value: 'roll' },
    ],
    // Next question is chosen dynamically in handleAbilityMethod
    // based on class (spellcaster or not) and entry mode (guided vs quick).
    next: 'background-choice',
  },

  // === SPELL SELECTION (Guided Mode) ===
  {
    id: 'spell-style-intro',
    type: 'message',
    text: `> Ah, right. You're a spellcaster.
> 
> *sighs*
> 
> I suppose we should talk about your magical abilities. Because what's an adventure without someone hurling fireballs or dramatically shouting healing incantations?
> 
> Let's figure out your spell preferences...`,
    next: 'spell-style',
  },

  {
    id: 'spell-style',
    type: 'choice',
    text: 'What draws you to magic?',
    options: [
      {
        text: 'Blasting things into oblivion',
        value: 'offense',
        trait: 'aggressive',
      },
      {
        text: 'Protecting myself and allies',
        value: 'defense',
        trait: 'protective',
      },
      {
        text: 'Controlling the battlefield',
        value: 'control',
        trait: 'tactical',
      },
      {
        text: 'Practical utility and tricks',
        value: 'utility',
        trait: 'clever',
      },
    ],
    saveTo: 'spellStyle',
    next: 'spell-element',
  },

  {
    id: 'spell-element',
    type: 'choice',
    text: 'And if you had to pick a magical specialty...',
    options: [
      { text: 'Fire and flames', value: 'fire' },
      { text: 'Ice and cold', value: 'cold' },
      { text: 'Lightning and storms', value: 'lightning' },
      { text: 'Shadows and darkness', value: 'necrotic' },
      { text: 'Light and radiance', value: 'radiant' },
      { text: "Whatever's most effective", value: 'versatile' },
    ],
    saveTo: 'spellElement',
    next: 'spell-selection-guided',
  },

  {
    id: 'spell-selection-guided',
    type: 'spell-selection',
    mode: 'guided',
    text: 'Based on your preferences, here are your recommended spells...',
    next: 'background-choice',
  },

  // === SPELL SELECTION (Quick Mode) ===
  {
    id: 'spell-quick-mode',
    type: 'spell-selection',
    mode: 'quick',
    text: 'Auto-selecting balanced starter spells...',
    next: 'background-choice',
  },

  {
    id: 'background-choice',
    type: 'list-choice',
    text: 'What was your life before adventuring?',
    options: DND_DATA.backgrounds.map((b) => ({
      text: `${b.name} - ${b.description}`,
      value: b.id,
    })),
    saveTo: 'background',
    next: 'alignment-choice',
  },

  {
    id: 'alignment-choice',
    type: 'list-choice',
    text: 'And your moral compass points toward...',
    options: DND_DATA.alignments.map((a) => ({
      text: `${a.name} - ${a.description}`,
      value: a.id,
    })),
    saveTo: 'alignment',
    next: 'name-choice',
  },

  {
    id: 'name-choice',
    type: 'name',
    text: 'Finally, what shall we call you?',
    next: 'backstory',
  },

  {
    id: 'backstory',
    type: 'backstory',
    text: 'Generating your backstory...',
    next: 'complete',
  },

  {
    id: 'complete',
    type: 'complete',
    text: "Well. That's done. Your character is ready. Try not to die immediately.",
  },
]);







// ===== BUNDLE PART: character-builder/character-builder-app.js =====

// Core app logic and keyboard navigation for the DandDy terminal character builder.
// Exposes App and KeyboardNav as globals on window.

// ===== KEYBOARD NAVIGATION =====

const KeyboardNav = (window.KeyboardNav = {
  currentFocusIndex: 0,
  isActive: false,
  retryCount: 0,

  activate() {
    this.isActive = true;
    // Focus on the first button of the last question by default
    const buttons = this.getActiveButtons();
    if (buttons.length > 0) {
      // Find the first button in the last question card
      const allCards = document.querySelectorAll('.question-card');
      const lastCard = allCards[allCards.length - 1];
      const lastCardButtons = buttons.filter((btn) => lastCard.contains(btn));

      if (lastCardButtons.length > 0) {
        this.currentFocusIndex = buttons.indexOf(lastCardButtons[0]);
      } else {
        this.currentFocusIndex = 0;
      }
    } else {
      this.currentFocusIndex = 0;
    }
    this.retryCount = 0;
    // Wait for DOM to update before focusing
    this.tryActivate();
  },

  /**
   * Calculate a reasonable default Armor Class based on class, abilities,
   * and a simplified 5e armor model.
   *
   * Precedence:
   * - If class is Barbarian/Monk *and* no armorCategory is set → Unarmored Defense.
   * - Otherwise, if armorCategory is set → use armor + optional shield.
   * - Otherwise → 10 + DEX mod (no armor).
   */
  calculateArmorClassForClass(classId, abilities, armorCategory = null, hasShield = false) {
    const dexMod = Utils.abilityModifier(abilities.dex);
    const conMod = Utils.abilityModifier(abilities.con);
    const wisMod = Utils.abilityModifier(abilities.wis);

    // Unarmored Defense for Barbarian/Monk when not wearing armor
    if (classId === 'barbarian' && !armorCategory) {
      return 10 + dexMod + conMod;
    }
    if (classId === 'monk' && !armorCategory) {
      return 10 + dexMod + wisMod;
    }

    // Armor-based AC when an armor category is present
    let baseAC;
    switch (armorCategory) {
      case 'light':
        // Typical light armor baseline (leather): 11 + DEX
        baseAC = 11 + dexMod;
        break;
      case 'medium':
        // Typical medium armor (scale mail): 14 + min(DEX, +2)
        baseAC = 14 + Math.min(dexMod, 2);
        break;
      case 'heavy':
        // Typical heavy armor (chain mail): fixed 16, no DEX
        baseAC = 16;
        break;
      default:
        // No armor: 10 + DEX
        baseAC = 10 + dexMod;
        break;
    }

    if (hasShield) {
      baseAC += 2;
    }

    return baseAC;
  },

  /**
   * Infer a coarse armor loadout (armor category + shield) from the class's
   * starting equipment text. This doesn't try to be exhaustive – it gives us
   * stable fields we can later surface in UI.
   */
  inferArmorLoadoutForClass(classId) {
    const cls = DND_DATA.classes.find((c) => c.id === classId);
    if (!cls || !Array.isArray(cls.equipment)) {
      return { armorCategory: null, hasShield: false };
    }

    const equipmentText = cls.equipment.join(' ').toLowerCase();

    let armorCategory = null;
    if (equipmentText.includes('leather armor') || equipmentText.includes('light armor')) {
      armorCategory = 'light';
    } else if (equipmentText.includes('medium armor')) {
      armorCategory = 'medium';
    } else if (equipmentText.includes('heavy armor')) {
      armorCategory = 'heavy';
    }

    const hasShield =
      equipmentText.includes('shield') ||
      equipmentText.includes('wooden shield');

    return { armorCategory, hasShield };
  },

  /**
   * Map an armorCategory + class into concrete armor item strings that should
   * appear in the equipment list (e.g., "Leather Armor", "Chain Mail", "Shield").
   */
  getStartingArmorItems(classId, armorCategory, hasShield) {
    const items = [];

    if (armorCategory === 'light') {
      items.push('Leather Armor');
    } else if (armorCategory === 'medium') {
      // Barbarians often start in hide; others in scale mail.
      if (classId === 'barbarian') {
        items.push('Hide Armor');
      } else {
        items.push('Scale Mail');
      }
    } else if (armorCategory === 'heavy') {
      items.push('Chain Mail');
    }

    if (hasShield) {
      // Druids/clerics often have wooden shields; others a generic shield.
      if (classId === 'druid' || classId === 'cleric') {
        items.push('Wooden Shield');
      } else {
        items.push('Shield');
      }
    }

    return items;
  },

  tryActivate() {
    setTimeout(() => {
      const buttons = this.getActiveButtons();

      if (buttons.length > 0) {
        this.updateFocus();
      } else if (this.retryCount < 10) {
        // Retry up to 10 times (1 second total)
        this.retryCount++;
        this.tryActivate();
      }
    }, 100);
  },

  deactivate() {
    this.isActive = false;
    this.clearFocus();
  },

  getActiveButtons() {
    // Get ALL question cards
    const allCards = document.querySelectorAll('.question-card');

    if (allCards.length === 0) {
      return [];
    }

    // Get ALL clickable buttons from ALL cards
    const allButtons = [];
    allCards.forEach((card) => {
      const cardButtons = Array.from(card.querySelectorAll('.button-primary'));
      // Include all buttons (selected, locked, etc) - they're all clickable now
      cardButtons.forEach((btn) => {
        // Skip only truly disabled buttons (like name input buttons after selection)
        if (!btn.hasAttribute('disabled')) {
          allButtons.push(btn);
        }
      });
    });

    return allButtons;
  },

  updateFocus() {
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) {
      return;
    }

    // Remove focus from all buttons
    buttons.forEach((btn) => btn.classList.remove('is-focused'));

    // Add focus to current index
    if (buttons[this.currentFocusIndex]) {
      const focusedButton = buttons[this.currentFocusIndex];
      focusedButton.classList.add('is-focused');

      // Scroll the focused button into view
      focusedButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  },

  clearFocus() {
    const buttons = this.getActiveButtons();
    buttons.forEach((btn) => btn.classList.remove('is-focused'));
  },

  moveUp() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the top
    this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 1);
    this.updateFocus();
  },

  moveDown() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    // Don't wrap - stop at the bottom
    this.currentFocusIndex = Math.min(buttons.length - 1, this.currentFocusIndex + 1);
    this.updateFocus();
  },

  // Horizontal navigation mirrors vertical movement for now:
  // buttons are laid out linearly, but when they appear side by side,
  // Left/Right should feel like moving between siblings.
  moveLeft() {
    this.moveUp();
  },

  moveRight() {
    this.moveDown();
  },

  select() {
    if (!this.isActive) return;
    const buttons = this.getActiveButtons();
    if (buttons.length === 0) return;

    const button = buttons[this.currentFocusIndex];
    if (button) {
      button.click();
      this.deactivate();
    }
  },
});

// ===== APP LOGIC =====

const App = (window.App = {
  currentQuestion: null,
  _lastRenderedCharacter: null,
  _PORTRAIT_HISTORY_MAX_VERSIONS: 5,
  // When true, the next character-panel update will render portraits without
  // re-running the ASCII "type-in" animation (used for non-visual updates like save).
  _suppressNextPortraitAnimation: false,

  async init() {
    console.log('Initializing Character Builder...');

    // Subscribe to state changes
    CharacterState.subscribe((state) => {
      this.updateCharacterPanel(state.character);
    });

    // Start the flow
    CharacterState.reset();
    OptionVariationsCache.reset(); // Reset option variations for new character
    this._lastPortraitArt = null; // Reset portrait tracking for new character
    await this.showQuestion('intro');
  },

  // Show progressive "thinking" messages while waiting for AI
  showProgressiveThinking(element) {
    if (!element) return;
    
    // Clear any existing interval
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
    }
    
    let elapsed = 0;
    // Cube markup used inside a narrator-spinner-shell so that whitespace
    // behavior is controlled and the cube + text stay on a single line.
    const cubeMarkup =
      '<span class="spinner-cube-scene">' +
      '<span class="spinner-cube-tilt">' +
      '<span class="spinner-cube">' +
      '<span class="spinner-cube-face spinner-cube-face-front"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-back"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-right"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-left"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-top"></span>' +
      '<span class="spinner-cube-face spinner-cube-face-bottom"></span>' +
      '</span></span></span>';

    const renderLine = (text) =>
      `<span class="narrator-spinner-shell">${cubeMarkup} ${text}</span>`;

    element.innerHTML = renderLine('rolling the dice...');
    
    this._thinkingInterval = setInterval(() => {
      elapsed++;
      
      if (elapsed < 3) {
        element.innerHTML = renderLine('rolling the dice...');
      } else if (elapsed < 6) {
        element.innerHTML = renderLine('still rolling...');
      } else {
        element.innerHTML = renderLine('server waking up... hang tight!');
      }
    }, 1000); // Update every second
  },
  
  stopProgressiveThinking() {
    if (this._thinkingInterval) {
      clearInterval(this._thinkingInterval);
      this._thinkingInterval = null;
    }
  },

  async showQuestion(questionId) {
    const question = QUESTIONS.find((q) => q.id === questionId);
    if (!question) {
      console.error('Question not found:', questionId);
      return;
    }

    this.currentQuestion = question;
    const narratorPanel = document.getElementById('narrator-panel');

    // Handle different question types
    switch (question.type) {
      case 'message':
        await this.showMessage(question);
        break;
      case 'choice':
        await this.showChoice(question);
        break;
      case 'list-choice':
        await this.showListChoice(question);
        break;
      case 'suggestion':
        await this.showSuggestion(question);
        break;
      case 'abilities':
        await this.showAbilities(question);
        break;
      case 'name':
        await this.showNameChoice(question);
        break;
      case 'backstory':
        await this.showBackstory(question);
        break;
      case 'complete':
        await this.showComplete(question);
        break;
      case 'spell-selection':
        await this.showSpellSelection(question);
        break;
    }
  },

  async showMessage(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // For intro message, use narrator-specific intro text
    let messageText = question.text;
    if (question.id === 'intro') {
      const narratorId = StorageService.getNarratorId();
      const narrator = getNarrator(narratorId);
      messageText = narrator.introText;
    }

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, messageText);
    Utils.scrollToBottom(true);

    if (question.next) {
      messageEl.classList.add('is-waiting');
      await Utils.sleep(1500);
      messageEl.classList.remove('is-waiting');
      await this.showQuestion(question.next);
    }
  },

  async showChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);
    const variedQuestion = { ...question, options: variedOptions };

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderQuestion(variedQuestion),
    );

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle
    await Utils.sleep(150);

    // In guided (co-create) mode, default keyboard focus to the ROLL button so
    // players can immediately press Enter to roll abilities, while still being
    // able to arrow between the selector and the roll button.
    try {
      const rollButton = document.querySelector(
        `.question-card[data-question-id="${question.id}"] .ability-method-roll`,
      );
      if (
        rollButton &&
        typeof KeyboardNav !== 'undefined' &&
        typeof KeyboardNav.getActiveButtons === 'function'
      ) {
        const activeButtons = KeyboardNav.getActiveButtons();
        const rollIndex = activeButtons.indexOf(rollButton);
        if (rollIndex !== -1) {
          KeyboardNav.currentFocusIndex = rollIndex;
          KeyboardNav.updateFocus();
        }
      }
    } catch (e) {
      // Non-fatal: fall back to the default keyboard focus behavior
      console.error('Ability method keyboard focus override failed', e);
    }

    Utils.scrollToBottom(true);
  },

  async showListChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Get varied options (AI-generated or cached)
    const variedOptions = await OptionVariationsCache.get(question.id, question);

    // Check for recommendations
    const state = CharacterState.get();
    const recommendations = state.recommendations?.[question.id] || [];

    // Separate options into recommended and non-recommended
    const recommendedOptions = [];
    const otherOptions = [];

    variedOptions.forEach((opt, index) => {
      // Check if this option's value is in the recommendations list
      const isRecommended = recommendations.includes(opt.value);
      if (isRecommended) {
        recommendedOptions.push({ opt, originalIndex: index });
      } else {
        otherOptions.push({ opt, originalIndex: index });
      }
    });

    // Ensure recommended options appear in the SAME order as the narrator's
    // recommendation list, so the "RECOMMENDED" buttons match the bullet list
    // that was just narrated to the player.
    if (recommendations.length > 0 && recommendedOptions.length > 1) {
      const indexInRecommendations = (value) => {
        const idx = recommendations.indexOf(value);
        return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
      };

      recommendedOptions.sort(
        (a, b) =>
          indexInRecommendations(a.opt.value) -
          indexInRecommendations(b.opt.value),
      );
    }

    // Reorder options: recommended first (in narrated order), then others
    const reorderedOptions = [...recommendedOptions, ...otherOptions];

    // Store the reordered mapping for handleAnswer to use
    if (!this._optionIndexMapping) this._optionIndexMapping = {};
    this._optionIndexMapping[question.id] = reorderedOptions.map(
      (item) => item.originalIndex,
    );

    // Build the HTML with recommendations first
    let optionsHTML = '';
    let displayIndex = 0;

    if (recommendedOptions.length > 0) {
      optionsHTML += '<div class="recommendations-header">RECOMMENDED</div>';
      optionsHTML += recommendedOptions
        .map(({ opt, originalIndex }) => {
          const currentIndex = displayIndex++;
          return `
              <button class="button-primary" onclick="App.handleListAnswer('${question.id}', ${currentIndex})">
                * ${opt.text}
              </button>
            `;
        })
        .join('');

      if (otherOptions.length > 0) {
        optionsHTML += '<hr class="recommendations-divider">';
      }
    }

    optionsHTML += otherOptions
      .map(({ opt, originalIndex }) => {
        const currentIndex = displayIndex++;
        return `
            <button class="button-primary" onclick="App.handleListAnswer('${question.id}', ${currentIndex})">
              ${opt.text}
            </button>
          `;
      })
      .join('');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${optionsHTML}
        </div>
      </div>`,
    );

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showSuggestion(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Get AI suggestion if available
    const suggestion = question.getSuggestion(state);

    // Store recommendations in state for the next question
    if (!state.recommendations) {
      state.recommendations = {};
    }
    state.recommendations[question.next] = suggestion.suggestions;

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const suggestionEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(suggestionEl, suggestion.message);
    Utils.scrollToBottom(true);

    // Show suggested options
    const suggestedHTML = suggestion.suggestions
      .map((s) => {
        const data =
          DND_DATA.races.find((r) => r.id === s) ||
          DND_DATA.classes.find((c) => c.id === s);
        if (data) return `• ${data.name}`;
        return `• ${s}`;
      })
      .join('\n');

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(suggestedHTML),
    );
    await Utils.sleep(100);
    Utils.scrollToBottom(true);

    const suggestedListEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    suggestedListEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    suggestedListEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showAbilities(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Helper to truncate option text
    const truncate = (text, maxLength) => {
      return text.length > maxLength
        ? text.substring(0, maxLength - 3) + '...'
        : text;
    };

    const options = question.options || [];
    const selectOptionsHTML = options
      .map(
        (opt, index) => `
          <option value="${opt.value}" ${
            index === 0 ? 'selected' : ''
          }>${truncate(opt.text, 45)}</option>
        `,
      )
      .join('');

    const listboxOptionsHTML = options
      .map(
        (opt, index) => `
          <button
            class="ability-method-option selector-option${
              index === 0 ? ' is-selected' : ''
            }"
            data-method="${opt.value}"
            role="option"
            aria-selected="${index === 0 ? 'true' : 'false'}"
          >
            <span class="selector-option-label">
              ${truncate(opt.text, 45)}
            </span>
          </button>
        `,
      )
      .join('');

    const initialMethod = options[0]?.value || 'standard';
    const initialLabel = truncate(
      options[0]?.text || 'Standard Array',
      45,
    );

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container ability-method-container">
          <label class="settings-label ability-method-label">Ability generation method:</label>
          <div class="ability-method-controls">
            <div class="ability-method-trigger-wrap selector-shell">
              <button
                class="button-primary ability-method-trigger selector-trigger"
                id="ability-method-trigger"
                type="button"
                aria-haspopup="listbox"
                aria-expanded="false"
                aria-controls="ability-method-listbox"
                data-selected-method="${initialMethod}"
              >
                <span class="ability-method-trigger-label">
                  ${initialLabel}
                </span>
              </button>
              <div
                id="ability-method-listbox"
                class="ability-method-listbox selector-menu"
                role="listbox"
                aria-label="Ability generation method"
              >
                ${listboxOptionsHTML}
              </div>
            </div>
            <button class="button-primary ability-method-roll" onclick="App.handleAbilityFromSelect()">
              ROLL
            </button>
          </div>
        </div>
      </div>`,
    );

    // Wire up animated listbox behavior for ability method selector
    const trigger = document.getElementById('ability-method-trigger');
    const listbox = document.getElementById('ability-method-listbox');
    if (trigger && listbox) {
      const optionsEls = Array.from(
        listbox.querySelectorAll('.ability-method-option'),
      );

      const setMethod = (method, label) => {
        trigger.setAttribute('data-selected-method', method);
        const labelEl = trigger.querySelector(
          '.ability-method-trigger-label',
        );
        if (labelEl) {
          labelEl.textContent = label;
        }

        optionsEls.forEach((opt) => {
          const isSelected = opt.getAttribute('data-method') === method;
          opt.classList.toggle('is-selected', isSelected);
          opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        });
      };

      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = listbox.classList.contains('is-open');
        if (!isOpen) {
          // Open and focus first option for immediate keyboard nav
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');

          // Position the listbox relative to the trigger so it behaves like
          // other selector menus: always above or below (preferring below),
          // at least as wide as the trigger, and constrained to the viewport.
          const shell = trigger.closest('.selector-shell') || trigger.parentElement;
          if (shell) {
            const shellRect = shell.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();

            // Measure menu size without affecting final animation. Temporarily
            // neutralize transforms so we get the full height instead of the
            // scaled (collapsed) height from CSS.
            const prevDisplay = listbox.style.display;
            const prevVisibility = listbox.style.visibility;
            const prevTransform = listbox.style.transform;

            listbox.style.visibility = 'hidden';
            listbox.style.display = 'block';
            listbox.style.transform = 'none';

            const menuRect = listbox.getBoundingClientRect();
            let menuHeight = menuRect.height || 0;
            let menuWidth = menuRect.width || 0;

            // Ensure the listbox is at least as wide as the trigger. For small
            // triggers (like icons), we still respect the global min-width.
            const triggerWidth = triggerRect.width || 0;
            if (triggerWidth > 0 && menuWidth < triggerWidth) {
              listbox.style.minWidth = `${triggerWidth}px`;
              const remeasureRect = listbox.getBoundingClientRect();
              menuWidth = remeasureRect.width || menuWidth;
              menuHeight = remeasureRect.height || menuHeight;
            }

            listbox.style.display = prevDisplay;
            listbox.style.visibility = prevVisibility;
            listbox.style.transform = prevTransform;

            const viewportHeight = window.innerHeight;
            const viewportWidth = window.innerWidth;
            const padding = 8; // breathing room from viewport edges
            const gapY = 4; // small gap between trigger and menu when opening below

            // Decide if the menu can fit fully below the trigger within the
            // viewport padding. If not, we flip it above.
            const fitsBelow =
              triggerRect.bottom + gapY + menuHeight <=
              viewportHeight - padding;

            let topInViewport;
            // Prefer below the trigger when there's enough room; otherwise open above.
            if (fitsBelow) {
              // Below: align the top of the listbox just under the trigger.
              topInViewport = triggerRect.bottom + gapY;
            } else {
              // Above: align the *bottom* of the listbox with the top of the trigger.
              topInViewport = triggerRect.top - menuHeight;
              if (topInViewport < padding) {
                topInViewport = padding;
              }
            }

            // Horizontal alignment: start left-aligned, then if that would
            // overflow to the right, right-align to the trigger instead.
            const minLeft = padding;
            const maxLeft = Math.max(
              minLeft,
              viewportWidth - padding - menuWidth,
            );

            let targetLeft = triggerRect.left;
            const naturalRight = targetLeft + menuWidth;
            const viewportRightLimit = viewportWidth - padding;
            if (naturalRight > viewportRightLimit) {
              targetLeft = triggerRect.right - menuWidth;
            }

            if (targetLeft < minLeft) targetLeft = minLeft;
            if (targetLeft > maxLeft) targetLeft = maxLeft;

            // Use fixed positioning in viewport space so the listbox is
            // independent of scroll containers and always anchors to the
            // trigger's visual position.
            listbox.style.position = 'fixed';
            listbox.style.top = `${topInViewport}px`;
            listbox.style.left = `${targetLeft}px`;
            listbox.style.right = 'auto';
          }

          if (optionsEls.length) {
            optionsEls[0].focus();
          }
        } else {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        }
      });

      optionsEls.forEach((opt) => {
        opt.addEventListener('click', (e) => {
          e.stopPropagation();
          const method = opt.getAttribute('data-method') || 'standard';
          const label = (opt.textContent || '').trim();
          setMethod(method, label);
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
        });
      });

      document.addEventListener('click', (e) => {
        if (!listbox.classList.contains('is-open')) return;
        if (trigger.contains(e.target) || listbox.contains(e.target)) return;
        listbox.classList.remove('is-open');
        trigger.classList.remove('is-open');
        trigger.setAttribute('aria-expanded', 'false');
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && listbox.classList.contains('is-open')) {
          listbox.classList.remove('is-open');
          trigger.classList.remove('is-open');
          trigger.setAttribute('aria-expanded', 'false');
          trigger.focus();
        }
      });

      // Keyboard navigation for ability method listbox
      const handleAbilityListboxKeydown = (e) => {
        const isOpen = listbox.classList.contains('is-open');

        const openAndFocus = (index) => {
          listbox.classList.add('is-open');
          trigger.classList.add('is-open');
          trigger.setAttribute('aria-expanded', 'true');
          if (optionsEls.length) {
            const clamped = Math.max(
              0,
              Math.min(optionsEls.length - 1, index),
            );
            optionsEls[clamped].focus();
          }
        };

        if (e.target === trigger) {
          if ((e.key === 'Enter' || e.key === ' ') && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowDown' && !isOpen) {
            e.preventDefault();
            openAndFocus(0);
            return;
          }
          if (e.key === 'ArrowUp' && !isOpen) {
            e.preventDefault();
            openAndFocus(optionsEls.length - 1);
            return;
          }
        }

        if (!isOpen) return;

        if (e.key === 'Escape') {
          // Global ESC handler above will close and refocus trigger
          return;
        }

        if (!optionsEls.length) return;

        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault();
          const currentIndex = optionsEls.indexOf(document.activeElement);
          let nextIndex = currentIndex;
          if (currentIndex === -1) {
            nextIndex = e.key === 'ArrowDown' ? 0 : optionsEls.length - 1;
          } else {
            nextIndex =
              e.key === 'ArrowDown'
                ? (currentIndex + 1) % optionsEls.length
                : (currentIndex - 1 + optionsEls.length) % optionsEls.length;
          }
          optionsEls[nextIndex].focus();
          return;
        }

        if (e.key === 'Enter' || e.key === ' ') {
          const activeOption = optionsEls.find(
            (opt) => opt === document.activeElement,
          );
          if (activeOption) {
            e.preventDefault();
            activeOption.click();
          }
        }
      };

      trigger.addEventListener('keydown', handleAbilityListboxKeydown);
      listbox.addEventListener('keydown', handleAbilityListboxKeydown);

      // Initialize selected state from initial method
      setMethod(initialMethod, initialLabel);
    }

    // Activate keyboard navigation first
    KeyboardNav.activate();

    // Wait for DOM and keyboard nav to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
    
    // Focus the roll button instead of the selector
    const rollButton = document.querySelector('.ability-method-roll');
    if (rollButton) {
      rollButton.focus();
    }
  },

  async showNameChoice(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    // Show the question text with typewriter effect
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);

    // Show progressive thinking message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(nameThinkingEl);

    // Generate BOTH name suggestions and a backstory template using a single
    // backend AI call. This front-loads the heavy work so the later backstory
    // step can feel instant.
    let names = [];
    try {
      const summary = await AIService.generateCharacterSummary(state.character, {
        nameCount: 3,
      });
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        names = summary.names;
      }
      // Stash the backstory template (if provided) on the character so the
      // backstory step can simply substitute {{NAME}} later without another
      // API call.
      if (summary && summary.backstoryTemplate) {
        CharacterState.updateCharacter({
          backstoryTemplate: summary.backstoryTemplate,
        });
      }
    } catch (e) {
      console.error('Name/backstory summary error; falling back to names-only flow:', e);
    }

    // Absolute fallback in case summary failed for any reason
    if (!names.length) {
      names = await AIService.generateNames(
        state.character.race,
        state.character.class,
        3,
      );
    }

    // Remove the thinking message
    this.stopProgressiveThinking();
    narratorPanel.lastElementChild.remove();

    // Build the name selection UI with proper styling matching other sections
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card" data-question-id="${question.id}">
        <div class="options-container">
          ${names
            .map(
              (name, index) =>
                `<button class="button-primary" onclick="App.handleNameSelect(${index})">${name}</button>`,
            )
            .join('\n              ')}
        </div>
        <div class="name-input-container">
          <input 
            type="text" 
            class="input-field" 
            id="custom-name-input" 
            placeholder="Or enter your own name..."
          >
          <button class="button-primary" onclick="App.handleCustomName()">
            SUBMIT
          </button>
        </div>
      </div>`,
    );

    // Store generated names for later reference
    this._generatedNames = names;

    // Wire up custom name behavior:
    // - When the input is focused, clear button keyboard focus so the
    //   user's attention is on their custom entry.
    // - Pressing Enter in the input submits the custom name.
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.addEventListener('focus', () => {
        if (typeof KeyboardNav !== 'undefined' && KeyboardNav.clearFocus) {
          KeyboardNav.clearFocus();
        }
      });

      customInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          this.handleCustomName();
        }
      });
    }

    // Activate keyboard navigation
    KeyboardNav.activate();

    // Wait for DOM to settle, then scroll
    await Utils.sleep(150);
    Utils.scrollToBottom(true);
  },

  async showBackstory(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, question.text);
    Utils.scrollToBottom(true);

    // Show progressive thinking message for backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(backstoryThinkingEl);

    // Prefer using a cached backstory template (generated earlier during the
    // name step) so this feels instant and does not require another AI call.
    let backstory = state.character.backstory;
    const template = state.character.backstoryTemplate;
    const nameForTemplate = state.character.name || 'This character';

    if (!backstory && template && typeof template === 'string') {
      backstory = template.replace(/{{\s*NAME\s*}}/g, nameForTemplate);
      CharacterState.updateCharacter({ backstory });
    }

    // Fallback: if we have no template or something went wrong, fall back to
    // the original behavior and call the dedicated backstory endpoint.
    if (!backstory) {
      backstory = await AIService.generateBackstory(state.character);
      CharacterState.updateCharacter({ backstory });
    }

    // Stop thinking and clear the element, then type out the backstory
    this.stopProgressiveThinking();
    backstoryThinkingEl.textContent = '';
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(2000);
    backstoryThinkingEl.classList.remove('is-waiting');
    await this.showQuestion(question.next);
  },

  async showSpellSelection(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const classId = state.character.class;

    // Show narrator message
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');

    let spells = null;

    if (question.mode === 'quick') {
      // Quick mode: auto-select spells
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      // Get auto-selected spells
      spells = SPELL_DATA.getQuickModeSpells(classId);

      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(classId);
        
        // Show what was selected
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        const spellSummary = `> Selected ${spells.cantrips.length} cantrip${spells.cantrips.length !== 1 ? 's' : ''} and ${spells.firstLevel.length} 1st level spell${spells.firstLevel.length !== 1 ? 's' : ''}.
> 
> Cantrips: ${spells.cantrips.map(s => s.name).join(', ')}
> 1st Level: ${spells.firstLevel.map(s => s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    } else {
      // Guided mode: suggest based on preferences
      await Utils.typewriter(messageEl, question.text);
      Utils.scrollToBottom(true);

      await Utils.sleep(500);

      const preferences = {
        style: state.answers.spellStyle || 'offense',
        element: state.answers.spellElement || 'versatile',
      };

      spells = SPELL_DATA.getGuidedSpells(classId, preferences);

      if (spells) {
        // Show personalized recommendations
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        
        const confirmEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        
        let flavorText = '';
        if (preferences.style === 'offense') {
          flavorText = "> Ah, a blaster. How... predictable. Here's your destruction kit:";
        } else if (preferences.style === 'defense') {
          flavorText = "> The cautious type, I see. Here are your survival tools:";
        } else if (preferences.style === 'control') {
          flavorText = "> A tactician. Interesting. Here's your battlefield control suite:";
        } else {
          flavorText = "> Utility over flash. Practical. Here's your toolkit:";
        }
        
        const spellSummary = `${flavorText}
> 
> Cantrips: ${spells.cantrips.map(s => s.name).join(', ')}
> 1st Level: ${spells.firstLevel.map(s => s.name).join(', ')}`;
        
        await Utils.typewriter(confirmEl, spellSummary);
        Utils.scrollToBottom(true);
      }
    }

    // Save spells to character
    if (spells) {
      const config = SPELL_DATA.getSpellcastingConfig(classId);
      CharacterState.updateCharacter({
        spellcastingAbility: config.ability,
        cantrips: spells.cantrips,
        spellsKnown: spells.firstLevel,
        spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
        spellSlots: config.spellSlots,
      });
    }

    await Utils.sleep(1500);
    await this.showQuestion(question.next);
  },

  async showComplete(question) {
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);

    // Use narrator-specific completion text
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const completionText = narrator.completeText || question.text;

    const messageEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, completionText);
    Utils.scrollToBottom(true);

    // NOTE: AI portrait generation now starts after name selection (earlier in flow)
    // since we removed backstory from the prompt. This gives it more time to complete.
    
    // NOTE: We don't save here anymore - we wait for portrait to load first
    // This prevents creating duplicate characters in cloud storage

    // Show completion options
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      `
      <div class="question-card mt-lg" data-question-id="${question.id}">
        <button class="button-primary completion-save-btn" onclick="App.saveCharacter()">
          > SAVE CHARACTER
        </button>
        <button class="button-primary" onclick="App.startNew()">
          > CREATE ANOTHER CHARACTER
        </button>
      </div>`,
    );
    Utils.scrollToBottom(true);

    // Activate keyboard navigation
    KeyboardNav.activate();
  },

  /**
   * Render the standard AI portrait loading state in the portrait panel.
   * Uses the glowing, fast-spinning cube plus unified status text:
   * "Generating AI portrait… This can take 20–30 seconds."
   */
  _renderPortraitGeneratingLoader(portraitEl) {
    if (!portraitEl) return;

    // Normalize the portrait container into a loading state so the cube + text
    // layout matches the shared portrait styles in `portraits.css`.
    // - Ensure the placeholder variant (16:9 flex box) is present so the cube
    //   stays centered and the 3D context is correct even after custom art
    //   has been rendered previously.
    // - Also add the loading variant, which loosens white-space/overflow and
    //   guarantees a minimum height for the spinner + status text.
    portraitEl.classList.add('ascii-portrait--placeholder');
    portraitEl.classList.add('ascii-portrait--loading');
    // Clear any custom inline sizing overrides from previous renders.
    portraitEl.style.fontSize = '';
    portraitEl.style.whiteSpace = '';
    portraitEl.style.textAlign = '';
    portraitEl.style.overflowX = '';
    portraitEl.style.overflowY = '';

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
        <div class="portrait-placeholder-text">
          Generating AI portrait…<br>
          This can take 20–30 seconds.
        </div>
      </div>
    `;
  },

  // In guided (co-create) mode, automatically generate a custom AI portrait
  // once we have the essential character context (race, class, name).
  // Triggered after name selection since backstory is no longer used in prompts.
  // This runs in the background and doesn't block the conversational flow.
  async autoGenerateGuidedAIPortraitIfReady() {
    try {
      if (
        !window.CharacterState ||
        typeof CharacterState.get !== 'function' ||
        !window.AsciiArtService ||
        !CONFIG.ENABLE_AI
      ) {
        return;
      }

      const state = CharacterState.get() || {};
      const character = state.character || {};
      const answers = state.answers || {};
      const entryMode = answers['entry-mode'];

      // Only run this logic for guided (co-create) mode.
      if (entryMode !== 'guided') {
        return;
      }

      // Require the core fields that we include in portrait prompts.
      // Name is now the trigger point (backstory removed from prompts).
      // We also have race, class, background, and alignment at this point.
      const hasCoreFields =
        character.race &&
        character.class &&
        character.name;

      if (!hasCoreFields) {
        return;
      }

      // If we already have a custom AI portrait, don't regenerate.
      if (character.customPortraitAscii || (character.customPortraitCount || 0) > 0) {
        return;
      }
      
      // Mark that portrait generation is in progress (used by updateCharacterPanel)
      this._guidedPortraitGenerating = true;

      const portraitEl = document.getElementById('character-portrait');

      // Show a loading state in the portrait panel while the AI image is
      // being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(character);

      if (result && result.asciiArt) {
        const currentCount = character.customPortraitCount || 0;
        const updatedMetadata =
          window.PortraitHistory && typeof PortraitHistory.addVersion === 'function'
            ? PortraitHistory.addVersion(
                character,
                result.asciiArt,
                result.imageUrl || null,
                {
                  source: 'guided-auto',
                  prompt:
                    (AIService.buildCharacterDescription &&
                      AIService.buildCharacterDescription(character)) ||
                    null,
                },
              )
            : character.portraitMetadata || {};

        // After a fresh custom portrait is generated in the builder, prefer
        // showing the ASCII art first so the new artwork is immediately
        // visible, regardless of the global default portrait view mode.
        if (window.StorageService && StorageService.setPortraitViewMode) {
          try {
            StorageService.setPortraitViewMode('ascii');
          } catch (e) {
            // Non-fatal: keep generating even if preference write fails
            console.warn('Failed to set portrait view mode to ASCII after guided AI portrait', e);
          }
        }

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Guided-mode AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Guided Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          'AI portrait generation hit a rate limit, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a pre-generated portrait to fall back to
      await this._ensurePreGeneratedPortraitFallback(character);
    } finally {
      // Clear the generating flag so future re-renders work normally
      this._guidedPortraitGenerating = false;
      
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  // Persist changes to shared storage only after a character has been saved once.
  // This keeps manager in sync for post-completion edits (rename, level, portrait, etc.)
  async persistIfAlreadySaved() {
    const state = CharacterState.get();
    const character = state.character;
    
    // If there's no ID yet, this character hasn't been saved to shared storage.
    if (!character || !character.id) {
      return;
    }
    
    try {
      await StorageService.saveCharacter(character);
    } catch (error) {
      console.error('Error persisting character changes:', error);
    }
  },

  async handleListAnswer(questionId, displayIndex) {
    // Check if this is a previous question being changed.
    // We consider any question card that is NOT the last one in the narrator
    // panel to be "previous", regardless of current state.answers contents.
    const narratorPanel = document.getElementById('narrator-panel');
    const state = CharacterState.get();
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, displayIndex, true);
      return;
    }

    // Translate display index to original index using the mapping
    const originalIndex =
      this._optionIndexMapping?.[questionId]?.[displayIndex] ??
      displayIndex;

    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[originalIndex];

    // Mark the selected button using the DISPLAY index
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn) => {
      btn.classList.remove('is-selected', 'is-locked');
    });
    buttons.forEach((btn, idx) => {
      if (idx === displayIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
      
      // Apply background benefits if a background was selected
      if (question.saveTo === 'background') {
        const backgroundData = DND_DATA.backgrounds.find(b => b.id === option.value);
        if (backgroundData) {
          CharacterState.updateCharacter({
            skillProficiencies: backgroundData.skillProficiencies || [],
            toolProficiencies: backgroundData.toolProficiencies || [],
            equipment: backgroundData.equipment || [],
            backgroundFeature: backgroundData.feature || null,
            // Note: languages is a number (choices to make), not automatically assigned
            languageChoices: backgroundData.languages || 0,
          });
        }
      }
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.insertAdjacentHTML(
        'beforeend',
        Components.renderNarratorMessage(''),
      );
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAnswer(questionId, optionIndex) {
    // Check if this is a previous question being changed (see comment in
    // handleListAnswer for rationale).
    const narratorPanel = document.getElementById('narrator-panel');
    const cards = narratorPanel?.querySelectorAll(
      '.question-card[data-question-id]',
    );
    const lastCard = cards && cards[cards.length - 1];
    const lastQuestionId = lastCard?.getAttribute('data-question-id');
    const isChangingPrevious = lastQuestionId && lastQuestionId !== questionId;

    if (isChangingPrevious) {
      // Show confirmation overlay
      await this.showChangeConfirmation(questionId, optionIndex, false);
      return;
    }

    const state = CharacterState.get();
    const question = QUESTIONS.find((q) => q.id === questionId);
    const option = question.options[optionIndex];

    // Special handling for entry mode selection
    if (questionId === 'entry-mode') {
      if (option.value === 'quick') {
        // Record the selected entry mode in state so downstream logic
        // (like updateCharacterPanel) can detect that we're in quick mode
        // before any character renders happen.
        state.answers[questionId] = option.value;
        await this.quickCreateCharacter();
        return;
      }
      // Guided mode just continues into the normal flow below.
    }

    // Mark the selected button
    const card =
      document.querySelector(
        `.question-card[data-question-id="${questionId}"]`,
      ) || document.querySelector('.question-card:last-child');
    const buttons = card
      ? card.querySelectorAll('.button-primary')
      : document.querySelectorAll('.question-card:last-child .button-primary');

    // Clear previous selection/lock state in this card
    buttons.forEach((btn, idx) => {
      btn.classList.remove('is-selected', 'is-locked');
      if (idx === optionIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Save answer
    state.answers[questionId] = option.value;

    if (question.saveTo) {
      CharacterState.updateCharacter({ [question.saveTo]: option.value });
    }

    // Get AI commentary if configured
    if (question.aiPromptContext) {
      const narratorPanel = document.getElementById('narrator-panel');
      narratorPanel.innerHTML += Components.renderNarratorMessage('');
      Utils.scrollToBottom(true);

      const commentEl =
        narratorPanel.lastElementChild.querySelector('.narrator-text');
      
      // Show progressive thinking messages
      this.showProgressiveThinking(commentEl);
      Utils.scrollToBottom(true);

      const comment = await AIService.generateNarratorComment({
        question: question.aiPromptContext,
        choice: option.text,
        characterSoFar: state.character,
      });

      // Stop thinking animation and clear
      this.stopProgressiveThinking();
      commentEl.textContent = '';
      await Utils.typewriter(commentEl, comment);
      Utils.scrollToBottom(true);
      commentEl.classList.add('is-waiting');
      await Utils.sleep(750);
      commentEl.classList.remove('is-waiting');
    }

    // Move to next question
    if (question.next) {
      await this.showQuestion(question.next);
    }
  },

  async handleAbilityMethod(method) {
    // Mark the selected button
    const buttons = document.querySelectorAll(
      '.question-card:last-child .button-primary',
    );
    buttons.forEach((btn) => {
      if (
        btn.textContent.includes(
          method === 'standard' ? 'Standard Array' : 'Roll 4d6',
        )
      ) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    const state = CharacterState.get();
    let classData = DND_DATA.classes.find(
      (c) => c.id === state.character.class,
    );

    // Guard against missing or invalid class data so the flow never stalls
    // on the ability generation step. If something went wrong earlier and we
    // don't have a valid class, fall back to a generic Fighter-like profile.
    if (!classData) {
      console.error(
        'handleAbilityMethod: missing class data for',
        state.character?.class,
      );
      classData = {
        id: 'fighter',
        name: 'Fighter (fallback)',
        hitDie: 10,
        primaryAbility: ['str'],
        savingThrows: ['str', 'con'],
        equipment: [],
      };
    }

    let abilities = {};

    if (method === 'standard') {
      // Standard array: let user assign them (for now, auto-assign based on class)
      const scores = [15, 14, 13, 12, 10, 8];
      const primary = classData.primaryAbility[0];

      // Simple auto-assignment based on class
      abilities = {
        str: primary === 'str' ? 15 : 10,
        dex: primary === 'dex' ? 15 : 12,
        con: 14,
        int: primary === 'int' ? 15 : 8,
        wis: primary === 'wis' ? 15 : 13,
        cha: primary === 'cha' ? 15 : 10,
      };
    } else {
      // Roll 4d6 drop lowest
      abilities = {
        str: this.rollAbility(),
        dex: this.rollAbility(),
        con: this.rollAbility(),
        int: this.rollAbility(),
        wis: this.rollAbility(),
        cha: this.rollAbility(),
      };
    }

    // Apply racial bonuses (with a safe fallback if race data is missing)
    const race =
      DND_DATA.races.find((r) => r.id === state.character.race) || {
        abilityBonuses: {},
      };
    Object.keys(race.abilityBonuses || {}).forEach((ability) => {
      const bonus = race.abilityBonuses[ability] || 0;
      abilities[ability] = (abilities[ability] || 0) + bonus;
    });

    // Infer a coarse armor loadout from class equipment
    // Infer a coarse armor loadout from class equipment. The helper lives
    // on KeyboardNav (where the armor helpers are defined), so delegate to it.
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      state.character.class,
    );

    // Calculate HP (level 1)
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = classData.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor,
    // delegating to the shared armor helper on KeyboardNav.
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      state.character.class,
      abilities,
      armorCategory,
      hasShield,
    );

    // Store both base (level 1) abilities and current abilities
    CharacterState.updateCharacter({
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
    });
    CharacterState.set({ abilityMethod: method });

    // Tailor narrator tone based on how sturdy this character looks at level 1
    let hpComment;
    if (hitPoints <= Math.max(4, Math.floor(classData.hitDie * 0.5))) {
      hpComment = 'Ouch. I hope you like making death saves.';
    } else if (hitPoints >= classData.hitDie + 2) {
      hpComment = 'All meat, no subtlety. The healer will be proud.';
    } else {
      hpComment = 'Respectable. You might even survive the tutorial.';
    }

    // Also make a quick remark about other standout abilities
    const abilityNames = {
      str: 'Strength',
      dex: 'Dexterity',
      con: 'Constitution',
      int: 'Intelligence',
      wis: 'Wisdom',
      cha: 'Charisma',
    };

    const abilityEntries = Object.entries(abilities);
    const highest = abilityEntries.reduce(
      (best, current) => (current[1] > best[1] ? current : best),
      abilityEntries[0],
    );
    const lowest = abilityEntries.reduce(
      (worst, current) => (current[1] < worst[1] ? current : worst),
      abilityEntries[0],
    );

    let abilityComment = '';
    if (highest && highest[1] >= 16) {
      abilityComment += ` Your ${abilityNames[highest[0]]} is doing a lot of heavy lifting.`;
    }
    if (lowest && lowest[1] <= 8) {
      abilityComment += ` Maybe don't advertise that ${abilityNames[lowest[0]]} score.`;
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `Your abilities have been determined. HP: ${hitPoints}. ${hpComment}${abilityComment}`,
    );
    Utils.scrollToBottom(true);

    await Utils.sleep(2000);
    // Decide next question dynamically:
    // - If class is a spellcaster, branch into spell selection
    //   (guided vs quick based on entry mode).
    // - Otherwise, continue to background selection.
    const latestState = CharacterState.get();
    const classId = latestState.character.class;
    let nextQuestionId = this.currentQuestion.next || 'background-choice';

    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(classId)) {
      const entryMode = latestState.answers['entry-mode'];
      if (entryMode === 'guided') {
        nextQuestionId = 'spell-style-intro';
      } else {
        nextQuestionId = 'spell-quick-mode';
      }
    } else {
      nextQuestionId = 'background-choice';
    }

    await this.showQuestion(nextQuestionId);
  },

  async handleAbilityFromSelect() {
    const trigger = document.getElementById('ability-method-trigger');
    const method =
      trigger?.getAttribute('data-selected-method') || 'standard';
    await this.handleAbilityMethod(method);
  },

  rollAbility() {
    const rolls = [
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
      Utils.rollDice(6),
    ].sort((a, b) => b - a);

    // Drop lowest, sum the rest
    return rolls[0] + rolls[1] + rolls[2];
  },

  async handleNameSelect(nameIndex) {
    // Get the selected name from the generated names array
    const name = this._generatedNames[nameIndex];

    if (!name) {
      console.error('Name not found at index:', nameIndex);
      return;
    }

    // Find all buttons in the last question card
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');

    // Mark the selected button and lock others
    buttons.forEach((btn, index) => {
      // Skip the submit button (last button in the card)
      if (btn.textContent.includes('SUBMIT')) return;

      if (index === nameIndex) {
        btn.classList.add('is-selected');
      } else {
        btn.classList.add('is-locked');
      }
    });

    // Disable and lock the custom name input
    const customInput = document.getElementById('custom-name-input');
    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-locked');
    }

    // Disable the custom name submit button
    const submitButton = questionCard.querySelector(
      '.name-input-container .button-primary',
    );
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.classList.add('is-locked');
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}. Sure. Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async handleCustomName() {
    const customInput = document.getElementById('custom-name-input');
    const name = customInput.value.trim();

    if (!name) {
      // Optionally provide feedback to the user
      console.log('Custom name cannot be empty.');
      return;
    }

    // Disable all name buttons and the input field
    const questionCard = document.querySelector('.question-card:last-child');
    const buttons = questionCard.querySelectorAll('.button-primary');
    buttons.forEach((btn) => {
      btn.classList.add('is-locked');
      btn.disabled = true;
    });

    if (customInput) {
      customInput.disabled = true;
      customInput.classList.add('is-selected'); // Mark custom input as selected
    }

    CharacterState.updateCharacter({ name });

    // Start generating AI portrait in background now that we have name, race, class
    if (typeof this.autoGenerateGuidedAIPortraitIfReady === 'function') {
      this.autoGenerateGuidedAIPortraitIfReady();
    }

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.innerHTML += Components.renderNarratorMessage(
      `${name}. Sure. Why not.`,
    );
    Utils.scrollToBottom(true);

    // Continue to next question
    await Utils.sleep(1500);
    await this.showQuestion(this.currentQuestion.next);
  },

  async checkBackendStatus() {
    // Backend status indicator has been removed from the settings modal UI.
    // This method is kept as a no-op for backwards compatibility.
    return;
  },

  // Legacy settings helpers are now routed through the shared SettingsModal
  // so both builder + manager use a single implementation.
  async openSettings() {
    if (window.SettingsModal && typeof SettingsModal.open === 'function') {
      SettingsModal.open();
    }
  },

  closeSettings() {
    if (window.SettingsModal && typeof SettingsModal.close === 'function') {
      SettingsModal.close();
    }
  },

  saveSettings() {
    if (window.SettingsModal && typeof SettingsModal.save === 'function') {
      SettingsModal.save();
    }
  },

  // Build the inner HTML for the portrait history modal body. This is shared
  // between the initial open and any in-place "reload" after a delete.
  _buildPortraitHistoryBody(normalized) {
    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];
    const hasVersions = !!normalized.hasVersions;
    const hasCustomPortraitWithoutHistory =
      !!normalized.hasCustomPortraitWithoutHistory;

    const listHtml = hasVersions
      ? versions
          .map((v) => {
            const isActive = metadata.activeVersionId === v.id;
            const createdLabel = v.createdAt
              ? new Date(v.createdAt).toLocaleString()
              : '';
            // Use only the generation date/time as the label for each version
            const title = createdLabel || 'Unknown time';
            const infoText = '';

            const hasImage = !!v.url;
            const hasPrompt = !!v.prompt;
            const thumbHtml = `
            <div class="card-thumbnail">
              <div class="ascii-portrait portrait-history-preview" data-version-id="${v.id}"></div>
              ${
                hasImage
                  ? `<img src="${v.url}" alt="${title}" class="portrait-history-image is-hidden" data-version-id="${v.id}">`
                  : ''
              }
            </div>`;

            return `
            <div class="character-card portrait-history-card${
              isActive ? ' is-selected' : ''
            }" data-version-id="${v.id}" onclick="App.selectPortraitHistoryCard('${
              v.id
            }')">
              ${thumbHtml}
              <div class="card-details">
                <div class="card-name">${title}</div>
                <div class="card-info">${infoText || '&nbsp;'}</div>
              </div>
              <div class="portrait-history-actions">
                ${
                  hasImage
                    ? `<button class="terminal-btn terminal-btn-small" data-toggle-version-id="${v.id}" onclick="App.togglePortraitHistoryView('${v.id}')">
                  View Original
                </button>`
                    : ''
                }
                ${
                  hasPrompt
                    ? `<button class="terminal-btn terminal-btn-small" onclick="App.copyPortraitHistoryPrompt('${v.id}')" title="Copy this portrait's prompt to your clipboard">
                  Prompt
                </button>`
                    : ''
                }
                <button class="terminal-btn terminal-btn-small portrait-history-delete-btn" onclick="App.deletePortraitVersion('${v.id}')" title="Delete this portrait version" aria-label="Delete portrait version">
                  Del
                </button>
              </div>
            </div>
          `;
          })
          .join('')
      : hasCustomPortraitWithoutHistory
        ? `<div class="terminal-text-small terminal-text-dim portrait-history-callout">
              <p><strong>No portrait history yet.</strong></p>
              <p>This character's portrait was created before the history feature was added.</p>
              <p>Generate a new custom AI portrait to:</p>
              <ul class="portrait-history-callout-list">
                <li>• Save your current portrait as Version 1</li>
                <li>• Add the new portrait as Version 2</li>
                <li>• Enable portrait version switching</li>
              </ul>
            </div>`
        : `<p class="terminal-text-small terminal-text-dim portrait-history-callout">
              No saved portraits yet.<br><br>
              Generate a custom AI portrait to start building a history.
            </p>`;

    return `
      <p class="terminal-text-small terminal-text-dim">
        View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
      </p>
      <div class="portrait-history-card-row${
        versions.length === 1 ? ' is-single' : ''
      }">
        ${listHtml}
      </div>
    `;
  },

  // Smoothly animate a modal's content height when its body is "reloaded"
  // (e.g., after deleting a portrait history entry). This uses a simple FLIP
  // pattern: measure -> update -> animate height from old to new.
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

  openPortraitHistory() {
    const state = CharacterState.get();
    const character = state.character || {};
    // Normalize portrait metadata + versions using the shared helper so the
    // builder and manager stay in sync.
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

    const metadata = normalized.metadata || {};
    const versions = Array.isArray(normalized.versions)
      ? normalized.versions
      : [];

    if (document.getElementById('portraitHistoryModal')) {
      return;
    }

    const bodyInnerHtml = this._buildPortraitHistoryBody(normalized);

    const modalHTML = `
      <div id="portraitHistoryModal" class="modal show" onclick="App.closePortraitHistory()">
        <div class="modal-content portrait-history-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Portrait History</h2>
            <button class="modal-close" onclick="App.closePortraitHistory()">&times;</button>
          </div>
          <div class="modal-body">
            ${bodyInnerHtml}
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closePortraitHistory()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmPortraitHistorySelection()">USE SELECTED</button>
          </div>
        </div>
      </div>
    `;

    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    // Populate ASCII previews (for versions without an image URL) as plain
    // text, cropped to the same thumbnail framing as the main character cards.
    // Shared helper batches this work across animation frames.
    if (
      Array.isArray(versions) &&
      versions.length > 0 &&
      window.PortraitHistory &&
      typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
    ) {
      PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
        this.cropAsciiForThumbnail(ascii),
      );
    }

    // Initialize keyboard-style focus on the currently active portrait card,
    // falling back to the first card if no active version is set.
    const cards = this.getPortraitHistoryCards();
    if (cards.length > 0) {
      let initialIndex = 0;
      if (metadata.activeVersionId) {
        const matchIndex = cards.findIndex(
          (card) =>
            card.getAttribute('data-version-id') === metadata.activeVersionId,
        );
        if (matchIndex >= 0) {
          initialIndex = matchIndex;
        }
      }

      this._portraitHistoryFocusIndex = initialIndex;
      this.updatePortraitHistoryFocus();
    }

    // ESC / arrow keys / Enter inside the history modal
    this._portraitHistoryEscHandler = (e) => {
      if (e.key === 'Escape') this.closePortraitHistory();
    };
    this._portraitHistoryKeyHandler = (e) => {
      const modal = document.getElementById('portraitHistoryModal');
      if (!modal) return;

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        this.movePortraitHistoryFocus(-1);
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        this.movePortraitHistoryFocus(1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        this.confirmPortraitHistorySelection();
      }
    };

    document.addEventListener('keydown', this._portraitHistoryEscHandler);
    document.addEventListener('keydown', this._portraitHistoryKeyHandler);
  },

  closePortraitHistory() {
    const modal = document.getElementById('portraitHistoryModal');
    if (!modal) {
      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', this._portraitHistoryEscHandler);
        this._portraitHistoryEscHandler = null;
      }
      if (this._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
        this._portraitHistoryKeyHandler = null;
      }
      this._portraitHistoryFocusIndex = 0;
    };

    if (!modal.classList.contains('closing')) {
      modal.classList.add('closing');
    }

    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      handleClose();
    }

    if (this._portraitHistoryEscHandler) {
      document.removeEventListener('keydown', this._portraitHistoryEscHandler);
      this._portraitHistoryEscHandler = null;
    }
    if (this._portraitHistoryKeyHandler) {
      document.removeEventListener('keydown', this._portraitHistoryKeyHandler);
      this._portraitHistoryKeyHandler = null;
    }
    this._portraitHistoryFocusIndex = 0;
  },

  getPortraitHistoryCards() {
    return Array.from(
      document.querySelectorAll('#portraitHistoryModal .character-card'),
    );
  },

  updatePortraitHistoryFocus() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;

    cards.forEach((card, i) => {
      const isFocused = i === index;
      card.classList.toggle('is-keyboard-focused', isFocused);
      card.classList.toggle('is-selected', isFocused);
    });
  },

  movePortraitHistoryFocus(delta) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    const current =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const next = Math.max(0, Math.min(cards.length - 1, current + delta));
    this._portraitHistoryFocusIndex = next;
    this.updatePortraitHistoryFocus();
  },

  selectPortraitHistoryCard(versionId) {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) return;

    let targetIndex = 0;
    cards.forEach((card, i) => {
      const matches = card.getAttribute('data-version-id') === versionId;
      if (matches) {
        targetIndex = i;
      }
    });

    this._portraitHistoryFocusIndex = targetIndex;
    this.updatePortraitHistoryFocus();
  },

  togglePortraitHistoryView(versionId) {
    const asciiEl = document.querySelector(
      `.portrait-history-preview.ascii-portrait[data-version-id="${versionId}"]`,
    );
    const imgEl = document.querySelector(
      `.portrait-history-image[data-version-id="${versionId}"]`,
    );
    const btn = document.querySelector(
      `.portrait-history-actions button[data-toggle-version-id="${versionId}"]`,
    );

    if (!imgEl || !asciiEl || !btn) return;

    const showingAscii = imgEl.classList.contains('is-hidden');

    if (showingAscii) {
      // Switch to original image
      asciiEl.classList.add('is-hidden');
      imgEl.classList.remove('is-hidden');
      btn.textContent = 'View ASCII';
    } else {
      // Switch back to ASCII art
      imgEl.classList.add('is-hidden');
      asciiEl.classList.remove('is-hidden');
      btn.textContent = 'View Original';
    }
  },

  cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
    // Split into lines
    const lines = asciiArt.split('\n');

    // CROP FROM BOTTOM: Keep the top portion, discard bottom
    // This ensures faces/heads are visible in the thumbnail
    const totalLines = lines.length;
    const startLine = 0; // Always start from the top (keep heads/faces)
    const endLine = Math.min(totalLines, heightLines); // Crop bottom if needed

    // Get lines from top
    const topLines = lines
      .slice(startLine, endLine)
      .map((line) => line.slice(0, widthChars));

    return topLines.join('\n');
  },

  async confirmPortraitHistorySelection() {
    const cards = this.getPortraitHistoryCards();
    if (cards.length === 0) {
      this.closePortraitHistory();
      return;
    }

    const index =
      typeof this._portraitHistoryFocusIndex === 'number'
        ? this._portraitHistoryFocusIndex
        : 0;
    const card = cards[index];
    if (!card) {
      this.closePortraitHistory();
      return;
    }

    const versionId = card.getAttribute('data-version-id');
    if (!versionId) {
      this.closePortraitHistory();
      return;
    }

    // Show a lightweight loading state on the primary button while we apply
    // the selected portrait. The modal will close once the operation finishes.
    const modal = document.getElementById('portraitHistoryModal');
    const useBtn =
      modal && modal.querySelector('.modal-footer .terminal-btn-primary');
    const originalLabel = useBtn ? useBtn.textContent : null;
    if (useBtn) {
      useBtn.disabled = true;
      useBtn.textContent = 'Applying...';
    }

    try {
      await this.usePortraitVersion(versionId);
    } catch (error) {
      console.error(
        'App.confirmPortraitHistorySelection: failed to apply portrait version',
        error,
      );
      if (useBtn) {
        useBtn.disabled = false;
        useBtn.textContent = originalLabel || 'USE SELECTED';
      }
      this.showSystemMessage(
        'Failed to switch portrait. Please try again in a moment.',
      );
    }
  },

  async usePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
      this.showSystemMessage('Portrait version not found.');
      return;
    }

    const updatedMetadata = {
      ...metadata,
      activeVersionId: version.id,
    };

    CharacterState.updateCharacter({
      originalPortraitUrl:
        version.url || character.originalPortraitUrl || null,
      customPortraitAscii: version.ascii || character.customPortraitAscii || '',
      portraitMetadata: updatedMetadata,
    });

    // Persist in the background if the character is already saved to shared storage.
    await this.persistIfAlreadySaved();

    // Force an immediate refresh of the in-builder character sheet so the new
    // portrait is visible even if any listeners were missed.
    try {
      const latestState = CharacterState.get();
      if (
        latestState &&
        latestState.character &&
        typeof this.updateCharacterPanel === 'function'
      ) {
        await this.updateCharacterPanel(latestState.character);
      }
    } catch (e) {
      console.error(
        'App.usePortraitVersion: failed to refresh character panel after version switch',
        e,
      );
    }

    this.closePortraitHistory();
  },

  async deletePortraitVersion(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    if (!versions.length) {
      this.closePortraitHistory();
      return;
    }

    const onConfirm = async () => {
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
        } else {
          // No remaining custom versions – clear custom portrait so we fall back to template/pre-generated art
          updates.originalPortraitUrl = null;
          updates.customPortraitAscii = '';
        }
      }

      CharacterState.updateCharacter(updates);
      await this.persistIfAlreadySaved();

      const modal = document.getElementById('portraitHistoryModal');

      // If the modal was closed manually or there are no remaining versions,
      // fall back to the original behavior and close completely.
      if (!remaining.length || !modal) {
        this.closePortraitHistory();
        return;
      }

      // Rebuild normalized metadata from the latest state so the builder
      // stays in sync with any shared helpers.
      const latestState = CharacterState.get();
      const latestCharacter = latestState.character || {};
      const latestNormalized =
        window.PortraitHistory &&
        typeof PortraitHistory.normalizeForDisplay === 'function'
          ? PortraitHistory.normalizeForDisplay(latestCharacter)
          : (() => {
              const fallbackMetadata = latestCharacter.portraitMetadata || {};
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

      this._animateModalContentResize('portraitHistoryModal', () => {
        const modalBody = modal.querySelector('.modal-body');
        if (!modalBody) return;
        modalBody.innerHTML = this._buildPortraitHistoryBody(latestNormalized);
      });

      // Re-run ASCII thumbnail population & focus wiring for the updated list
      const nextVersions = Array.isArray(latestNormalized.versions)
        ? latestNormalized.versions
        : [];
      if (
        Array.isArray(nextVersions) &&
        nextVersions.length > 0 &&
        window.PortraitHistory &&
        typeof PortraitHistory.batchPopulateAsciiPreviews === 'function'
      ) {
        PortraitHistory.batchPopulateAsciiPreviews(nextVersions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
    };

    this.showConfirmationOverlay(
      'Delete this saved portrait version? This cannot be undone.',
      onConfirm,
    );
  },

  async copyPortraitHistoryPrompt(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version || !version.prompt) {
      this.showToast('No saved prompt for this portrait.');
      return;
    }

    const promptText = version.prompt;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(promptText);
      } else {
        // Fallback for older browsers: use a temporary textarea
        const textarea = document.createElement('textarea');
        textarea.value = promptText;
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
      this.showToast('Prompt copied.');
    } catch (error) {
      console.error('Failed to copy portrait prompt:', error);
      this.showToast('Could not copy prompt. Copy it manually from the card.');
    }
  },

  async generateCustomAIPortrait() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select both a race and a class before generating a custom portrait.',
      );
      return;
    }

    // Check if backend is available (API key check now handled server-side)
    try {
      const statusCheck = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`);
      if (!statusCheck.ok) {
      this.showSystemMessage(
          'Backend server is not available. Make sure the backend is running on port 8000.',
        );
        return;
      }
      const statusData = await statusCheck.json();
      if (!statusData.available) {
        this.showSystemMessage(
          'AI features are not available. The backend server is not configured.',
        );
        return;
      }
    } catch (error) {
      this.showSystemMessage(
        'Cannot connect to backend server. Make sure it is running on http://localhost:8000',
      );
      return;
    }

    // Show prompt modal
    this.openPromptModal(character);
  },

  /**
   * Ensure we have at least a pre-generated portrait (ASCII + optional image)
   * for the given character. Used when custom AI portrait generation fails
   * (rate limits, backend errors, etc.) so we can gracefully fall back to
   * our static portrait set instead of leaving the frame empty.
   *
   * When `options.force` is true, we will attempt to load a pre-generated
   * portrait even if the character already appears to have one; this is
   * useful in quick-create flows that start from a blank portrait.
   */
  async _ensurePreGeneratedPortraitFallback(character, options = {}) {
    const force = !!(options && options.force);

    try {
      if (!window.AsciiArtService || !character || !character.race || !character.class) {
        return;
      }

      const currentState = CharacterState.get();
      const existing = currentState && currentState.character ? currentState.character : {};

      if (
        !force &&
        (existing.customPortraitAscii ||
          (existing.portrait && (existing.portrait.ascii || existing.portrait.url)) ||
          existing.asciiPortrait)
      ) {
        // We already have some kind of portrait attached; don't overwrite it.
        return;
      }

      // This will prefer race/class-specific ASCII from generated_portraits/,
      // fall back to race-only, and only as a last resort use a simple
      // text template. It also updates CharacterState with asciiPortrait and
      // originalPortraitUrl when successful.
      await AsciiArtService.generateAIPortrait(character);

      // Clear last-portrait cache so the pre-generated art will animate in.
      this._lastPortraitArt = null;

      const latest = CharacterState.get().character;
      await this.updateCharacterPanel(latest);
    } catch (fallbackError) {
      console.error('Failed to apply pre-generated portrait fallback:', fallbackError);
    }
  },

  openPromptModal(character) {
    // Show only the character description to the user (not the rendering instructions)
    const defaultPrompt = AIService.buildCharacterDescription
      ? AIService.buildCharacterDescription(character)
      : ''; // backwards compat if renamed
    const modalHTML = `
      <div id="promptModal" class="modal show" onclick="App.closePromptModal(false)">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">★ Customize AI Portrait</h2>
            <button class="modal-close" onclick="App.closePromptModal(false)">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Describe your character's appearance. AI will generate a portrait optimized for ASCII art.
            </p>
            <p class="terminal-text-small terminal-text-dim portrait-modal-subhead">
              Be descriptive! (e.g., "a stoic dwarf fighter with a braided beard, holding a glowing axe")
            </p>
            <textarea
              class="terminal-textarea terminal-input"
              id="custom-prompt"
              rows="6"
            >${defaultPrompt}</textarea>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closePromptModal(false)">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmPromptModal()">GENERATE PORTRAIT</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('promptModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._promptModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closePromptModal(false);
    };
    document.addEventListener('keydown', this._promptModalEscHandler);
  },

  closePromptModal(regenerate = false) {
    const modal = document.getElementById('promptModal');
    if (!modal) return;

    // If the modal is already in the process of closing, don't re-run animation.
    if (modal.classList.contains('closing')) return;

    modal.classList.add('closing');

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      // Remove the modal from the DOM after the close animation completes.
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      // Remove ESC key listener
      if (this._promptModalEscHandler) {
        document.removeEventListener('keydown', this._promptModalEscHandler);
        this._promptModalEscHandler = null;
      }

      if (regenerate) {
        // Trigger portrait regeneration if confirmed
        const state = CharacterState.get();
        this.updateCharacterPanel(state.character);
      }
    };

    // If we have a modal-content element, wait for the close animation to finish.
    if (content && content.addEventListener) {
      content.addEventListener('animationend', handleClose, { once: true });
    } else {
      // Fallback: no animation support, just close immediately.
      handleClose();
    }
  },

  async confirmPromptModal() {
    const customPromptInput = document.getElementById('custom-prompt');
    const customPrompt = customPromptInput.value.trim();

    if (!customPrompt) {
      this.showSystemMessage('Portrait prompt cannot be empty.');
      return;
    }

    this.closePromptModal(false); // Close modal without regenerating yet

    const portraitEl = document.getElementById('character-portrait');
    const originalPortraitEl = document.getElementById('original-portrait');

    // If the user prefers original images, temporarily switch the visible
    // frame from original → ASCII so they see the cube loader + status while
    // the new portrait is being generated. The shared sheet will re-read the
    // global preference on re-render and switch back to original afterward.
    if (portraitEl && originalPortraitEl) {
      const container = portraitEl.closest('.portrait-container');
      const toggleBtn = document.getElementById('toggle-portrait-btn');

      let portraitViewMode = 'ascii';
      try {
        if (window.StorageService && StorageService.getPortraitViewMode) {
          portraitViewMode = StorageService.getPortraitViewMode();
        } else if (
          typeof CONFIG !== 'undefined' &&
          CONFIG.DEFAULT_PORTRAIT_VIEW_MODE
        ) {
          portraitViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
        }
      } catch (e) {
        // Non-fatal: keep default
      }

      const isAsciiHidden = portraitEl.classList.contains('is-hidden');
      const isOriginalVisible = !originalPortraitEl.classList.contains(
        'is-hidden',
      );
      const isContainerOriginal =
        !!container &&
        container.classList.contains('portrait-container--original-mode');

      if (
        portraitViewMode === 'original' &&
        isAsciiHidden &&
        isOriginalVisible &&
        isContainerOriginal
      ) {
        // Temporarily switch the DOM to ASCII view so the loader is visible.
        portraitEl.classList.remove('is-hidden');
        originalPortraitEl.classList.add('is-hidden');
        if (container) {
          container.classList.remove('portrait-container--original-mode');
        }

        // Update the toggle label to reflect that ASCII is currently shown.
        if (toggleBtn) {
          const iconSpan = toggleBtn.querySelector('.selector-option-icon');
          const labelSpan = toggleBtn.querySelector('.selector-option-label');
          if (iconSpan && labelSpan) {
            iconSpan.textContent = '◉';
            labelSpan.textContent = 'View Original Art';
          } else {
            toggleBtn.textContent = '◉ View Original Art';
          }
        }
      }
    }

    if (portraitEl) {
      // While generating, scroll the character sheet back to the top so the
      // user immediately sees the portrait frame and loading status message.
      const characterPanel = document.getElementById('character-panel');
      if (characterPanel) {
        characterPanel.scrollTo({
          top: 0,
          behavior: 'smooth',
        });
      }

      // Show the standard loading state with glowing, spinning cube and unified text.
      this._renderPortraitGeneratingLoader(portraitEl);
    }

    try {
      // Add rendering instructions to the user's character description
      // (hidden system-level guidance for the image model)
      // Mirror the randomized pose + camera logic from AIService.buildPortraitPrompt
      const classKey = (character.class || 'default').toLowerCase();

      const poseVariantsByClass = {
        fighter: [
          'posed mid-swing with a heavy weapon, body twisted to show the arc of the strike',
          'standing in a ready battle stance, shield raised and weapon held low but tense',
          'caught in the moment of blocking an attack, weight shifted back with shield braced',
          'charging forward with weapon raised overhead, cloak and gear trailing behind',
          'standing atop fallen rubble in a victorious stance, weapon planted like a banner',
        ],
        barbarian: [
          'leaning forward in a feral roar, muscles tensed, weapon mid-swing',
          'standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands',
          'caught mid-leap as if diving into battle, hair and trophies flying outward',
          'holding a weapon across the shoulders, posture relaxed but intimidating',
          'bracing against an unseen impact, teeth bared and stance low and aggressive',
        ],
        paladin: [
          'kneeling with shield planted in front, weapon held upright in a solemn vow pose',
          'standing tall with shield forward and weapon raised in a protective gesture',
          'framed in a side stance, shield angled and weapon ready for a precise strike',
          'holding a holy symbol aloft with one hand while resting the weapon point-down',
          'striding forward with shield half-raised, cloak sweeping back in a confident march',
        ],
        rogue: [
          'crouched low in the shadows, one dagger drawn and the other held behind for balance',
          'leaning casually against an unseen wall, one hand resting on a hidden blade',
          'mid-step on a narrow ledge, body turned sideways with cloak pulled close',
          'poised behind an unseen target, daggers reversed in a silent takedown stance',
          'perched on a raised surface, knees bent, ready to spring into motion',
        ],
        monk: [
          'balanced on one leg in a classic kick pose, arms forming a flowing guard shape',
          'mid-strike with an open palm, body rotated and lines clean and focused',
          'seated in calm meditation, legs crossed and hands resting in a composed mudra',
          'low sweeping stance with one arm extended and the other drawn back defensively',
          'caught at the peak of a spinning kick, robes and sashes tracing the motion',
        ],
        ranger: [
          'drawing a bow with the string fully pulled, body turned in a three-quarter stance',
          'kneeling on one knee with bow lowered, scanning the distance like a watchful scout',
          'mid-stride through an implied forest floor, bow held loosely but ready',
          'standing on a slight rise, bow raised and arrow aimed slightly downward',
          'leaning against an unseen tree, one hand resting on the bow, posture relaxed but alert',
        ],
        wizard: [
          'standing with one hand raised and fingers splayed, arcane energy swirling upward',
          'leaning over an invisible spellbook, staff angled forward as if channeling power',
          'mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion',
          'holding a staff planted before them, gaze lifted as if calling down distant power',
          'caught turning dramatically, cloak sweeping, one hand tracing a glowing sigil',
        ],
        sorcerer: [
          'surrounded by swirling magical energy, one hand outstretched and the other pulled close',
          'standing with arms wide, raw power coiling around their torso and shoulders',
          'mid-step as a surge of magic bursts from the ground around their feet',
          'leaning back slightly as if resisting an overwhelming tide of inner power',
          'cradling a concentrated sphere of magic between both hands at chest height',
        ],
        warlock: [
          'holding a pact focus or talisman forward, dark energy streaming from it',
          'standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes',
          'reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind',
          'half-turned away, casting a spell over their shoulder with a sly or knowing posture',
          'arms crossed loosely while faint sigils burn in the air around them',
        ],
        cleric: [
          'raising a holy symbol high, light radiating outward in a protective arc',
          'standing with shield angled and mace lowered, posture firm and resolute',
          'kneeling in prayerful focus, holy symbol clasped between both hands',
          'reaching one hand toward an unseen ally as if channeling healing energy',
          'planting a weapon or staff into the ground as radiant power rises around them',
        ],
        druid: [
          'standing with staff planted in the earth, vines and leaves swirling around',
          'mid-transformation pose, body partly turned and framed by natural shapes',
          'kneeling to touch the ground, one hand extended as if coaxing growth',
          'arms lifted as if calling wind or storm, cloak and hair driven by imaginary weather',
          'leaning gently against an unseen tree, posture relaxed and rooted',
        ],
        bard: [
          'mid-performance with an instrument, one foot forward and body open to an unseen crowd',
          'leaning back in a dramatic flourish, cloak and hair trailing with the motion',
          'perched casually on an unseen stool or crate, instrument resting comfortably in hand',
          'bowing deeply at the end of a performance, one arm sweeping wide',
          'caught mid-step in a dance-like pose, instrument held close to the torso',
        ],
        default: [
          'standing in a relaxed but heroic stance, weight shifted slightly to one side',
          'mid-stride as if walking toward the viewer with confident energy',
          'standing in profile with head turned toward the viewer, posture composed and steady',
          'seated on an implied stone or crate, leaning slightly forward in a thoughtful pose',
          'standing with arms loosely folded or resting on a weapon, calm and watchful',
        ],
      };

      const cameraVariantsByClass = {
        fighter: [
          'Camera angle: slightly low and three-quarter to emphasize strength and presence.',
          'Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.',
          'Camera angle: three-quarter from the shield side, highlighting defense and stance.',
          'Camera angle: slightly above, looking down to show battlefield context around the figure.',
          'Camera angle: close to ground level, making the character loom large in the frame.',
        ],
        barbarian: [
          'Camera angle: low and close, exaggerating size and ferocity.',
          'Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.',
          'Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.',
          'Camera angle: pulled back to show the full silhouette and large weapon in motion.',
          'Camera angle: slightly below the shoulders, looking up into a battle roar.',
        ],
        paladin: [
          'Camera angle: eye-level, straight on, emphasizing honor and symmetry.',
          'Camera angle: slightly low, looking up past the shield to give a guardian feeling.',
          'Camera angle: three-quarter from the weapon side, showing both devotion and readiness.',
          'Camera angle: slightly above, as if from the viewpoint of someone being protected.',
          'Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.',
        ],
        rogue: [
          'Camera angle: slightly above and to the side, emphasizing stealth and environment.',
          'Camera angle: three-quarter from behind, with the face turned back toward the viewer.',
          'Camera angle: low and angled sharply, creating long, dramatic shadows.',
          'Camera angle: tight framing around the upper body, leaving the background mostly in shadow.',
          'Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.',
        ],
        monk: [
          'Camera angle: mid-distance and centered, capturing clean lines of the martial pose.',
          'Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.',
          'Camera angle: from above, looking down on a circular stance pattern.',
          'Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.',
          'Camera angle: side-on profile to highlight precision and alignment of the form.',
        ],
        ranger: [
          'Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.',
          'Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.',
          'Camera angle: slightly elevated, framing the ranger and implied terrain below.',
          'Camera angle: low and angled upward through implied undergrowth or rough ground.',
          'Camera angle: mid-distance, with the character slightly off-center to suggest open space.',
        ],
        wizard: [
          'Camera angle: three-quarter, framing both staff and spell effect in the same view.',
          'Camera angle: slightly low, making the spellcasting gesture feel towering and grand.',
          'Camera angle: slightly above, looking down on a circle of arcane energy.',
          'Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.',
          'Camera angle: oblique and off-center, with arcane elements framing the composition.',
        ],
        sorcerer: [
          'Camera angle: close and low, centered on the chest where power is gathering.',
          'Camera angle: three-quarter from the side, showing energy spiraling around the figure.',
          'Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.',
          'Camera angle: tight framing on the face and hands, emphasizing raw intensity.',
          'Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.',
        ],
        warlock: [
          'Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.',
          'Camera angle: three-quarter from behind, looking toward an unseen source of power.',
          'Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.',
          'Camera angle: close to the focus or talisman, with the character looming just behind it.',
          'Camera angle: slightly above, letting eldritch patterns form around the character\'s feet.',
        ],
        cleric: [
          'Camera angle: slightly low, looking up toward the raised holy symbol.',
          'Camera angle: eye-level, centered to evoke balance and stability.',
          'Camera angle: three-quarter, allowing both shield and symbol to read clearly.',
          'Camera angle: slightly above, as if from the viewpoint of a blessed ally.',
          'Camera angle: mid-distance with the character framed symmetrically in the composition.',
        ],
        druid: [
          'Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.',
          'Camera angle: three-quarter, with implied branches or leaves partially framing the view.',
          'Camera angle: slightly above, looking down as if from a bird\'s-eye vantage.',
          'Camera angle: eye-level but softened, placing the character gently into the environment.',
          'Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.',
        ],
        bard: [
          'Camera angle: eye-level, as if the viewer is part of an unseen audience.',
          'Camera angle: three-quarter, capturing both gesture and instrument clearly.',
          'Camera angle: slightly low, turning a performance flourish into a heroic moment.',
          'Camera angle: above and angled, as if looking down from a balcony over a small stage.',
          'Camera angle: tight around the upper body and instrument, focusing on expression.',
        ],
        default: [
          'Camera angle: three-quarter view that clearly shows the full silhouette.',
          'Camera angle: eye-level, centered, with the figure dominating the frame.',
          'Camera angle: slightly low, making the character feel larger and more heroic.',
          'Camera angle: slightly above, looking down just enough to show shoulders and gear.',
          'Camera angle: mid-distance with the character placed slightly off-center for balance.',
        ],
      };

      const poseList =
        poseVariantsByClass[classKey] || poseVariantsByClass.default;
      const cameraList =
        cameraVariantsByClass[classKey] || cameraVariantsByClass.default;

      const posePrompt =
        poseList[Math.floor(Math.random() * poseList.length)];
      const cameraPrompt =
        cameraList[Math.floor(Math.random() * cameraList.length)];

      const renderingInstructions = [
        'Create a high-contrast black-and-white fantasy illustration.',
        'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
        'Include some controlled, directional hatching to define form (light mid-tone texture only).',
        `Pose: ${posePrompt}`,
        cameraPrompt,
        'Background should be simple, entirely black, and free of symbols or text.',
        'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
        'Aspect ratio 3:4.',
      ];
      
      const fullPrompt = [...renderingInstructions, customPrompt].join(' ');
      
      // Generate custom portrait with full prompt (including hidden rendering instructions)
      const result =
        await AsciiArtService.generateCustomAIPortraitWithPrompt(
          fullPrompt,
        );

      // Store both the original image URL and custom ASCII art in character state
      // Also increment the custom portrait counter and append to portrait history
      const current = CharacterState.get().character;
      const currentCount = current.customPortraitCount || 0;
      const updatedMetadata = window.PortraitHistory
        ? window.PortraitHistory.addVersion(
            current,
            result.asciiArt,
            result.imageUrl,
            {
              source: 'custom-ai',
              prompt: customPrompt,
            },
          )
        : current.portraitMetadata || {};

      // Respect the player's portrait view preference:
      // - If they prefer original images, keep that mode.
      // - If they prefer ASCII, continue to show ASCII first.
      // We do not forcibly flip the global portrait view mode here.

      CharacterState.updateCharacter({
        originalPortraitUrl: result.imageUrl,
        customPortraitAscii: result.asciiArt,
        customPortraitCount: currentCount + 1,
        portraitMetadata: updatedMetadata,
      });

      if (portraitEl) {
        // Restore portrait font size back to ASCII default; the sheet will
        // re-render the portrait element for the newly generated art.
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }

      // Update the last portrait art to trigger animation
      this._lastPortraitArt = null;

      // Re-render to show the toggle button and trigger animation
      const state = CharacterState.get();
      await this.updateCharacterPanel(state.character);
    } catch (error) {
      console.error('Error generating custom AI portrait with prompt:', error);

      // Check error type and show appropriate message
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Custom Prompt Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          'AI portrait generation hit a rate limit, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Restore portrait font sizing and swap back to a safe, pre-generated portrait.
      const state = CharacterState.get();
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove(
          'ascii-portrait--loading',
          'ascii-portrait--placeholder',
        );
      }

      // If we already have some portrait art (custom or pre-generated), just
      // re-render the sheet; otherwise, load a pre-generated portrait now.
      await this._ensurePreGeneratedPortraitFallback(state.character, {
        force: !(
          state.character &&
          (state.character.customPortraitAscii ||
            state.character.asciiPortrait ||
            (state.character.portrait &&
              (state.character.portrait.ascii || state.character.portrait.url)))
        ),
      });
    }
  },

  togglePortraitView() {
    const asciiPortrait = document.getElementById('character-portrait');
    const originalPortrait = document.getElementById('original-portrait');
    const toggleBtn = document.getElementById('toggle-portrait-btn');
    const container = asciiPortrait
      ? asciiPortrait.closest('.portrait-container')
      : null;

    if (!asciiPortrait || !originalPortrait || !toggleBtn) return;

    // Use the shared "is-hidden" class to determine visibility so we stay
    // consistent with the manager + shared character sheet markup. Relying on
    // inline style.display can get out of sync with the initial render, which
    // applies visibility purely via classes.
    const isShowingAscii = !asciiPortrait.classList.contains('is-hidden');

    const iconSpan = toggleBtn.querySelector('.selector-option-icon');
    const labelSpan = toggleBtn.querySelector('.selector-option-label');

    if (isShowingAscii) {
      // Switch to original
      asciiPortrait.classList.add('is-hidden');
      originalPortrait.classList.remove('is-hidden');
      if (container) {
        container.classList.add('portrait-container--original-mode');
      }

      if (iconSpan && labelSpan) {
        iconSpan.textContent = '≡';
        labelSpan.textContent = 'View ASCII Art';
      } else {
        toggleBtn.textContent = '≡ View ASCII Art';
      }

      toggleBtn.title = 'Toggle between ASCII and original art';
    } else {
      // Switch to ASCII
      asciiPortrait.classList.remove('is-hidden');
      originalPortrait.classList.add('is-hidden');
      if (container) {
        container.classList.remove('portrait-container--original-mode');
      }

      if (iconSpan && labelSpan) {
        iconSpan.textContent = '◉';
        labelSpan.textContent = 'View Original Art';
      } else {
        toggleBtn.textContent = '◉ View Original Art';
      }

      toggleBtn.title = 'Toggle between ASCII and original art';
    }
  },

  /**
   * (Deprecated) Kept for backwards compatibility. The shared character sheet
   * now applies the default portrait view (ASCII vs Original) during initial
   * render based on StorageService.getPortraitViewMode(), so this helper is
   * no longer needed. It is intentionally a no-op.
   */
  _applyPreferredPortraitViewBuilder(character) {
    // No-op: behavior handled by CharacterSheet._renderPortrait.
    void character;
  },

  // Track if we've shown the guest save notice this session
  _guestSaveNoticeShown: false,

  // Explicit save entry point for the completion screen.
  async saveCharacter(showMessage = true) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character || !window.StorageService) {
      this.showSystemMessage(
        'Unable to save character right now. Please try again shortly.',
      );
      return;
    }

    // Validate character has minimum required fields before saving
    if (!character.name || !character.race || !character.class) {
      if (showMessage) {
        this.showSystemMessage(
          'Character must have at least a name, race, and class before saving.',
        );
      }
      return;
    }

    try {
      console.log('💾 Saving character to shared storage (explicit save)...');
      // Saving should be a non-disruptive action – we don't want to re-animate
      // the ASCII portrait when the only change is an assigned ID/timestamps.
      this._suppressNextPortraitAnimation = true;

      // Build a complete character snapshot with derived stats (AC, speed, etc.)
      const completeCharacter = this.buildCompleteCharacter(character);
      const saved = await window.StorageService.saveCharacter(completeCharacter);
      CharacterState.updateCharacter(saved);

      if (showMessage) {
        // Use a short, non-intrusive toast instead of an inline narrator system line.
        this.showToast('Character saved');
      }

      // Show reminder to log in if in guest mode (only once per session)
      if (!this._guestSaveNoticeShown && window.AuthService && !window.AuthService.isAuthenticated()) {
        this._guestSaveNoticeShown = true;
        // Set flag to show guest notice banner when returning to character manager
        sessionStorage.setItem('showGuestNoticeOnReturn', 'true');
        setTimeout(() => {
          this.showNotification('💡 Log in or create an account to save your character to the cloud', 'info');
        }, 1000);
      }
    } catch (error) {
      console.error('Error saving character:', error);
      this.showSystemMessage('Save failed: ' + error.message);
    }
  },

  buildCompleteCharacter(character) {
    // Get data from DND_DATA
    const race = DND_DATA.races.find((r) => r.id === character.race);
    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const background = DND_DATA.backgrounds.find((b) => b.id === character.background);

    // Calculate ability modifiers
    const abilityMods = {
      str: Utils.abilityModifier(character.abilities.str),
      dex: Utils.abilityModifier(character.abilities.dex),
      con: Utils.abilityModifier(character.abilities.con),
      int: Utils.abilityModifier(character.abilities.int),
      wis: Utils.abilityModifier(character.abilities.wis),
      cha: Utils.abilityModifier(character.abilities.cha)
    };

    // Calculate derived stats
    const proficiencyBonus = Math.ceil(character.level / 4) + 1;
    const initiative = abilityMods.dex;
    // Prefer any armorClass already stored on the character (e.g., from builder),
    // otherwise derive a reasonable default based on class + abilities + armor.
    const armorClass =
      character.armorClass != null
        ? character.armorClass
        : KeyboardNav.calculateArmorClassForClass(
            character.class,
            character.abilities,
            character.armorCategory,
            character.hasShield,
          );
    const speed = race?.speed || 30;

    // Calculate HP (if not already set)
    const hitPoints = character.hitPoints || (classData ? classData.hitDie + abilityMods.con : 0);

    // Build skill modifiers
    const skills = {};
    if (character.skillProficiencies) {
      character.skillProficiencies.forEach(skill => {
        const abilityForSkill = this.getSkillAbility(skill);
        const abilityMod = abilityMods[abilityForSkill];
        skills[skill] = abilityMod + proficiencyBonus;
      });
    }

    // Build starting armor items based on armorCategory/hasShield
    // Note: armor helpers live on `KeyboardNav` for now, so call through that namespace.
    const armorItems = KeyboardNav.getStartingArmorItems(
      character.class,
      character.armorCategory,
      character.hasShield,
    );

    // Merge armor items into explicit equipment (without duplicating)
    const explicitEquipment = [...(character.equipment || [])];
    armorItems.forEach((item) => {
      if (!explicitEquipment.includes(item)) {
        explicitEquipment.push(item);
      }
    });

    // Get portrait data
    const portraitContainer = document.getElementById('character-portrait');
    const portraitElement = portraitContainer
      ? portraitContainer.querySelector('pre')
      : null;
    const asciiArt = portraitElement
      ? portraitElement.textContent
      : portraitContainer
      ? portraitContainer.textContent.trim()
      : null;
    
    const originalPortrait = character.portrait?.url || character.portraitUrl || character.originalPortraitUrl || null;
    
    // Get ASCII art from various possible sources
    const portraitAscii = character.customPortraitAscii || character.asciiPortrait || asciiArt || null;

    // Ensure character has a stable UID for cross-app identity
    let stableUid = character.characterUid;
    if (!stableUid) {
      stableUid = `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      if (window.CharacterState) {
        window.CharacterState.updateCharacter({ characterUid: stableUid });
      } else {
        character.characterUid = stableUid;
      }
    }

    // Build complete character object
    return {
      // Export metadata (used by Character Manager to detect true duplicates)
      metadata: {
        exportVersion: '1.1',
        exportDate: new Date().toISOString(),
        exportedBy: 'DandDy Character Builder v1.4',
        characterUid: stableUid,
        source: 'builder',
      },

      // Basic info (original)
      ...character,

      // Normalized portrait object for compatibility with character manager
      portrait: portraitAscii || originalPortrait ? {
        ascii: portraitAscii,
        url: originalPortrait
      } : null,

      // Calculated stats
      abilityModifiers: abilityMods,
      proficiencyBonus,
      initiative,
      armorClass,
      speed,
      hitPoints,
      armorCategory: character.armorCategory || null,
      hasShield: !!character.hasShield,

      // Skills with modifiers
      skillModifiers: skills,

      // Saving throws
      savingThrows: classData?.savingThrows || [],
      savingThrowModifiers: this.calculateSavingThrows(abilityMods, classData?.savingThrows || [], proficiencyBonus),

      // Derived data from DND_DATA
      raceData: race ? {
        name: race.name,
        size: race.size,
        speed: race.speed,
        traits: race.traits,
        languages: race.languages
      } : null,

      classData: classData ? {
        name: classData.name,
        hitDie: classData.hitDie,
        primaryAbility: classData.primaryAbility,
        savingThrows: classData.savingThrows,
        skills: classData.skills,
        equipment: classData.equipment,
        spellcaster: classData.spellcaster || false
      } : null,

      backgroundData: background ? {
        name: background.name,
        description: background.description,
        feature: background.feature,
        skillProficiencies: background.skillProficiencies,
        toolProficiencies: background.toolProficiencies,
        languages: background.languages,
        equipment: background.equipment
      } : null,

      // Equipment (including any inferred armor/shield items)
      equipment: explicitEquipment,

      // Portrait data
      portrait: {
        ascii: asciiArt,
        original: originalPortrait
      }
    };
  },

  getSkillAbility(skill) {
    const skillAbilities = {
      'acrobatics': 'dex',
      'animal-handling': 'wis',
      'arcana': 'int',
      'athletics': 'str',
      'deception': 'cha',
      'history': 'int',
      'insight': 'wis',
      'intimidation': 'cha',
      'investigation': 'int',
      'medicine': 'wis',
      'nature': 'int',
      'perception': 'wis',
      'performance': 'cha',
      'persuasion': 'cha',
      'religion': 'int',
      'sleight-of-hand': 'dex',
      'stealth': 'dex',
      'survival': 'wis'
    };
    return skillAbilities[skill] || 'str';
  },

  calculateSavingThrows(abilityMods, savingThrows, proficiencyBonus) {
    const saves = {};
    ['str', 'dex', 'con', 'int', 'wis', 'cha'].forEach(ability => {
      const isProficient = savingThrows.includes(ability);
      saves[ability] = abilityMods[ability] + (isProficient ? proficiencyBonus : 0);
    });
    return saves;
  },

  printCharacterSheet() {
    const panel = document.getElementById('character-panel');
    if (!panel || !panel.querySelector('.character-sheet')) {
      this.showSystemMessage('No character sheet to print yet.');
      return;
    }

    // Defer to the browser's print dialog, with print-specific CSS handling
    // what is visible on the page.
    window.print();
  },

  // Render a system-style message in the narrator panel instead of using
  // window.alert. Keeps all feedback in-universe.
  showSystemMessage(text) {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(`<span class="text-warning">[ SYSTEM ] ${text}</span>`),
    );
    Utils.scrollToBottom(true);
  },

  // Toast used for quick, non-blocking feedback (e.g. "Prompt copied"), anchored to the terminal container.
  showToast(rawMessage) {
    const message = (rawMessage == null) ? '' : String(rawMessage);
    // Remove any leading glyphs (checkmarks, warning icons, etc.) so builder
    // toasts stay clean and rely only on text + the "×" close button. Also
    // trim stray leading/trailing whitespace so messages render cleanly.
    const cleanedMessage = message
      .replace(
        /^[\s\u200b]*(?:[✓✔✕✖✗★⚠💡❌⏰🔌]+[\s\u00a0\u200b]*)+/u,
        ''
      )
      .trim();

    // Normalize overly-emphatic punctuation so toast messages stay calm and
    // readable. We keep question marks intact but strip trailing exclamation
    // marks (including "!!" etc.) which tend to feel shouty in short toasts.
    const displayMessage = cleanedMessage
      // Collapse any run of exclamation marks to a single one
      .replace(/!{2,}/g, '!')
      // Remove a trailing exclamation mark (or run of them) while preserving
      // any final period or closing paren that may follow.
      .replace(/!+(\s*[\.\)])?$/u, '$1')
      .trim();

    let toast = document.getElementById('toastNotification');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'toastNotification';
      toast.className = 'toast-notification';
      toast.setAttribute('role', 'status');
      toast.setAttribute('aria-live', 'polite');

      // Inner structure: message + dismiss "X" pinned to the right in its own wrapper
      // The inner span gets the shared spin treatment used elsewhere in the app.
      toast.innerHTML = `
        <span class="toast-message"></span>
        <div class="toast-dismiss-wrapper">
          <button type="button" class="toast-dismiss" aria-label="Dismiss notification">
            <span class="toast-dismiss-icon">&times;</span>
          </button>
        </div>
      `;

      const container = document.querySelector('.terminal-container') || document.body;
      container.appendChild(toast);

      const dismissBtn = toast.querySelector('.toast-dismiss');
      if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
          toast.classList.remove('show');
          // Clear any pending show/hide timers
          if (App._toastShowTimeout) {
            clearTimeout(App._toastShowTimeout);
            App._toastShowTimeout = null;
          }
          if (App._toastTimeout) {
            clearTimeout(App._toastTimeout);
            App._toastTimeout = null;
          }
        });
      }
    }

    const messageEl = toast.querySelector('.toast-message');
    if (messageEl) {
      messageEl.textContent = displayMessage;
    } else {
      // Fallback in case markup is missing for any reason
      toast.textContent = displayMessage;
    }

    // Reset any in-flight timers so we can replay the entrance animation
    if (App._toastShowTimeout) {
      clearTimeout(App._toastShowTimeout);
      App._toastShowTimeout = null;
    }
    if (App._toastTimeout) {
      clearTimeout(App._toastTimeout);
      App._toastTimeout = null;
    }

    // Ensure we start from the hidden state so the transition always plays,
    // even immediately after a page reload.
    toast.classList.remove('show');
    // Force a reflow so the browser acknowledges the hidden state
    // before we add the "show" class.
    void toast.offsetWidth; // eslint-disable-line no-unused-expressions

    App._toastShowTimeout = setTimeout(() => {
      toast.classList.add('show');
      App._toastShowTimeout = null;

      // Keep toast visible for 10 seconds before auto-dismissing
      App._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        App._toastTimeout = null;
      }, 10000);
    }, 80);
  },

  // ===== LEVEL CHANGE =====
  openLevelModal() {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const currentLevel = character.level || 1;

    const modalHTML = `
      <div id="levelModal" class="modal show" onclick="App.closeLevelModal()">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Change Character Level</h2>
            <button class="modal-close" onclick="App.closeLevelModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Changing level will <span class="terminal-text-strong">adjust your ability scores and hit points</span>
              as if your character had gained Ability Score Increases at higher levels.
            </p>
            <p class="terminal-text-small terminal-text-dim">
              This cannot be undone. Choose a new level between 1 and 99.
            </p>
            <div class="level-modal-row modal-section">
              <label for="level-input" class="terminal-text-small modal-section-label">New Level:</label>
              <input
                type="number"
                id="level-input"
                class="terminal-input"
                min="1"
                max="99"
                value="${currentLevel}"
              >
            </div>
            <div id="level-modal-error" class="terminal-text-error level-modal-error is-hidden"></div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closeLevelModal()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmLevelModal()">APPLY LEVEL</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('levelModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._levelModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeLevelModal();
    };
    document.addEventListener('keydown', this._levelModalEscHandler);
  },

  closeLevelModal() {
    const modal = document.getElementById('levelModal');
    if (!modal) {
      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._levelModalEscHandler) {
        document.removeEventListener('keydown', this._levelModalEscHandler);
        this._levelModalEscHandler = null;
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

  async confirmLevelModal() {
    const input = document.getElementById('level-input');
    if (!input) {
      this.closeLevelModal();
      return;
    }

    const errorEl = document.getElementById('level-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    let newLevel = parseInt(input.value, 10);
    if (isNaN(newLevel) || newLevel < 1 || newLevel > 99) {
      showError('Level must be a number between 1 and 99.');
      return;
    }

    clearError();

    this.closeLevelModal();
    await this.applyLevelChange(newLevel);
  },

  async applyLevelChange(newLevel) {
    const state = CharacterState.get();
    const character = state.character;

    if (!character.race || !character.class) {
      this.showSystemMessage(
        'Select a race and class before changing level.',
      );
      return;
    }

    const classData = DND_DATA.classes.find((c) => c.id === character.class);
    const race = DND_DATA.races.find((r) => r.id === character.race);

    if (!classData || !race) {
      this.showSystemMessage(
        'Unable to change level because race or class data is missing.',
      );
      return;
    }

    // Start from base (level 1) abilities, falling back to current if missing
    const base = character.baseAbilities || character.abilities;
    let abilities = { ...base };

    // Simulate Ability Score Increases at levels 4, 8, 12, 16, 19
    const asiLevels = [4, 8, 12, 16, 19];
    const asiCount = asiLevels.filter((lvl) => lvl <= newLevel).length;
    let remainingPoints = asiCount * 2;

    const primary = classData.primaryAbility?.[0] || 'str';
    const secondary = classData.primaryAbility?.[1] || null;

    // Distribute ASI points across primary/secondary, capped at 20
    while (remainingPoints > 0) {
      const candidates = [];
      if (abilities[primary] < 20) candidates.push(primary);
      if (secondary && abilities[secondary] < 20) candidates.push(secondary);

      if (candidates.length === 0) {
        break;
      }

      const target = candidates[0];
      abilities[target] += 1;
      remainingPoints -= 1;
    }

    // Approximate HP across levels:
    // Level 1: full hit die + CON mod
    // Each additional level: average die (rounded up) + CON mod
    const conMod = Utils.abilityModifier(abilities.con);
    const baseHP = classData.hitDie + conMod;
    const averageDie = Math.floor(classData.hitDie / 2) + 1;
    const perLevel = Math.max(1, averageDie + conMod);
    const hitPoints =
      newLevel <= 1 ? baseHP : baseHP + (newLevel - 1) * perLevel;

    // Recalculate Armor Class based on updated abilities + existing armor loadout
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      character.class,
      abilities,
      character.armorCategory,
      character.hasShield,
    );

    CharacterState.updateCharacter({
      level: newLevel,
      abilities,
      hitPoints,
      armorClass,
    });

    this.showSystemMessage(
      `Level set to ${newLevel}. Ability scores and hit points have been re-rolled.`,
    );

    // Persist level/stat changes so manager stays in sync
    await this.persistIfAlreadySaved();
  },

  // ===== NAME CHANGE =====
  openNameModal() {
    const state = CharacterState.get();
    const character = state.character;

    const currentName = character.name || '';

    const modalHTML = `
      <div id="nameModal" class="modal show" onclick="App.closeNameModal()">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Change Character Name</h2>
            <button class="modal-close" onclick="App.closeNameModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              Enter a new name for your character.
            </p>
            <div class="name-modal-row modal-section">
              <label for="name-input" class="terminal-text-small modal-section-label">New Name:</label>
              <input
                type="text"
                id="name-input"
                class="terminal-input name-modal-input"
                value="${currentName}"
                placeholder="Enter character name"
              >
            </div>
            <div id="name-modal-error" class="terminal-text-error name-modal-error is-hidden"></div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.closeNameModal()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="App.confirmNameModal()">APPLY NAME</button>
          </div>
        </div>
      </div>
    `;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', modalHTML);

    const modal = document.getElementById('nameModal');
    if (modal && Utils.focusFirstFieldInModal) {
      Utils.focusFirstFieldInModal(modal);
    }

    // ESC key to close
    this._nameModalEscHandler = (e) => {
      if (e.key === 'Escape') this.closeNameModal();
    };
    document.addEventListener('keydown', this._nameModalEscHandler);
  },

  closeNameModal() {
    const modal = document.getElementById('nameModal');
    if (!modal) {
      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
      }
      return;
    }

    const content = modal.querySelector('.modal-content') || modal;

    const handleClose = () => {
      if (modal && modal.parentNode) {
        modal.parentNode.removeChild(modal);
      }

      if (this._nameModalEscHandler) {
        document.removeEventListener('keydown', this._nameModalEscHandler);
        this._nameModalEscHandler = null;
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

  async confirmNameModal() {
    const input = document.getElementById('name-input');
    if (!input) {
      this.closeNameModal();
      return;
    }

    const errorEl = document.getElementById('name-modal-error');
    const showError = (msg) => {
      if (!errorEl) return;
      errorEl.textContent = msg;
      errorEl.style.display = 'block';
    };
    const clearError = () => {
      if (!errorEl) return;
      errorEl.textContent = '';
      errorEl.style.display = 'none';
    };

    const newName = input.value.trim();
    if (!newName) {
      showError('Name cannot be empty.');
      return;
    }

    clearError();

    this.closeNameModal();
    await this.applyNameChange(newName);
  },

  async applyNameChange(newName) {
    // Update the character name in state (this will trigger observers)
    CharacterState.updateCharacter({ name: newName });

    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(
        `Character renamed to "${newName}". Identity crisis averted.`,
      ),
    );
    Utils.scrollToBottom(true);

    // Persist rename so manager sees updated name
    await this.persistIfAlreadySaved();
  },

  // ===== QUICK CREATE MODE =====
  
  // Generate AI portrait for quick-create mode (runs in background)
  async _generateQuickCreatePortrait() {
    try {
      const stateAfter = CharacterState.get();
      const currentChar = stateAfter.character || {};

      if (!CONFIG.ENABLE_AI || !currentChar.race || !currentChar.class || !window.AsciiArtService) {
        return;
      }

      const portraitEl = document.getElementById('character-portrait');

      // Show a loading state in the portrait panel while the AI image
      // is being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(currentChar);

      if (result && result.asciiArt) {
        const currentCount = currentChar.customPortraitCount || 0;
        const updatedMetadata = window.PortraitHistory
          ? window.PortraitHistory.addVersion(
              currentChar,
              result.asciiArt,
              result.imageUrl || null,
              {
                source: 'quick-ai',
                prompt:
                  (AIService.buildCharacterDescription &&
                    AIService.buildCharacterDescription(currentChar)) ||
                  null,
              },
            )
          : currentChar.portraitMetadata || {};

        // When a quick-create portrait finishes, immediately prefer ASCII view
        // so players see the freshly generated text art instead of the PNG.
        if (window.StorageService && StorageService.setPortraitViewMode) {
          try {
            StorageService.setPortraitViewMode('ascii');
          } catch (e) {
            console.warn('Failed to set portrait view mode to ASCII after quick AI portrait', e);
          }
        }

        CharacterState.updateCharacter({
          originalPortraitUrl: result.imageUrl || null,
          customPortraitAscii: result.asciiArt,
          customPortraitCount: currentCount + 1,
          portraitMetadata: updatedMetadata,
        });

        // Reset last portrait so the new AI art re-animates in the panel.
        this._lastPortraitArt = null;
      }
    } catch (error) {
      console.error('Quick-create AI portrait generation error:', error);
      
      // Show user-facing error message based on error type
      if (error.isSafetyRejection) {
        console.group('🚫 OpenAI Content Safety Rejection - Quick Create Mode');
        console.error('Rejected prompt:', error.rejectedPrompt || 'Unknown');
        console.error('Original error:', error.originalMessage);
        if (error.promptAnalysis) {
          console.log('Analysis included above ↑');
        }
        console.groupEnd();
        
        // Build user message with helpful context
        let userMessage = 'OpenAI flagged this portrait request. ';
        
        if (error.promptAnalysis && error.promptAnalysis.hasKnownProblematicTerms) {
          const issues = error.promptAnalysis.potentialIssues;
          const categories = issues.map(i => i.category).join(', ');
          userMessage += `Possible triggers: ${categories}. `;
        }
        
        userMessage += 'Check browser console for detailed analysis and suggestions.';
        
        this.showSystemMessage(userMessage);
      } else if (error.isRateLimit) {
        this.showSystemMessage(
          'AI portrait generation hit a rate limit, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      } else {
        this.showSystemMessage(
          'AI portrait generation failed, so we\'re using a pre-generated portrait for now. You can still create a custom one later from the character sheet.',
        );
      }
      
      // Ensure we at least have a pre-generated portrait to fall back to.
      await this._ensurePreGeneratedPortraitFallback(currentChar, { force: true });
    } finally {
      // Whatever happens above (success or failure), restore portrait font
      // size so the final ASCII art uses the default sizing from CSS.
      const portraitEl = document.getElementById('character-portrait');
      if (portraitEl) {
        portraitEl.style.fontSize = '';
        portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
      }
    }
  },

  async quickCreateCharacter() {
    const narratorPanel = document.getElementById('narrator-panel');
    if (!narratorPanel) return;

    // Clear any existing content for a clean quick-create experience
    narratorPanel.innerHTML = '';
    
    // Reset portrait tracking to ensure animation happens
    this._lastPortraitArt = null;

    // In quick-create, we never want to show pre-generated portrait templates.
    // Start by clearing any existing portrait fields on the in-progress
    // character so the sheet renders with *no* art until custom AI kicks in.
    if (window.CharacterState && typeof CharacterState.updateCharacter === 'function') {
      CharacterState.updateCharacter({
        asciiPortrait: null,
        asciiPortraitKey: null,
        customPortraitAscii: null,
        originalPortraitUrl: null,
        portrait: null,
        portraitMetadata: null,
        customPortraitCount: 0,
      });
    }

    // Intro message for quick create (narrator-specific)
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const introEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      introEl,
      narrator.quickCreateIntro,
    );
    Utils.scrollToBottom(true);

    // Randomly choose race, class, background, alignment
    const race = Utils.randomChoice(DND_DATA.races);
    const cls = Utils.randomChoice(DND_DATA.classes);
    const background = Utils.randomChoice(DND_DATA.backgrounds);
    const alignment = Utils.randomChoice(DND_DATA.alignments);

    // Roll abilities using the existing rollAbility helper and apply racial bonuses
    let abilities = {
      str: this.rollAbility(),
      dex: this.rollAbility(),
      con: this.rollAbility(),
      int: this.rollAbility(),
      wis: this.rollAbility(),
      cha: this.rollAbility(),
    };

    Object.keys(race.abilityBonuses).forEach((ability) => {
      abilities[ability] += race.abilityBonuses[ability];
    });

    // Infer a coarse armor loadout from class equipment using the shared
    // helpers on KeyboardNav (where armor logic lives).
    const { armorCategory, hasShield } = KeyboardNav.inferArmorLoadoutForClass(
      cls.id,
    );

    // Calculate HP for level 1
    const conMod = Utils.abilityModifier(abilities.con);
    const hitPoints = cls.hitDie + conMod;

    // Calculate a default Armor Class based on class + abilities + armor
    const armorClass = KeyboardNav.calculateArmorClassForClass(
      cls.id,
      abilities,
      armorCategory,
      hasShield,
    );

    // Try to auto-generate a name
    let name = '';
    
    // Show thinking message for name generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(nameThinkingEl);
    
    try {
      const names = await AIService.generateNames(race.id, cls.id, 1);
      if (Array.isArray(names) && names[0]) {
        name = names[0];
      }
    } catch (e) {
      // Ignore AI errors; we'll fall back below
    }
    
    // Stop thinking and remove the message
    this.stopProgressiveThinking();
    nameThinkingEl.parentElement.remove();

    if (!name) {
      const fallbackNames = [
        'Ashen Vale',
        'Rin Thorn',
        'Kael Brightwind',
        'Lyra Nightbloom',
      ];
      name = Utils.randomChoice(fallbackNames);
    }

    // Update character state with all basic info at once to avoid multiple renders
    CharacterState.updateCharacter({
      race: race.id,
      class: cls.id,
      background: background.id,
      alignment: alignment.id,
      baseAbilities: { ...abilities },
      abilities,
      hitPoints,
      armorClass,
      armorCategory,
      hasShield,
      name,
      // Apply background benefits
      skillProficiencies: background.skillProficiencies || [],
      toolProficiencies: background.toolProficiencies || [],
      equipment: background.equipment || [],
      backgroundFeature: background.feature || null,
      languageChoices: background.languages || 0,
    });
    CharacterState.set({ abilityMethod: 'roll' });

    // Show a short summary of what we picked (narrator-specific)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const summaryEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(
      summaryEl,
      narrator.quickCreateSummary(race.name, cls.name, background.name, alignment.name),
    );
    Utils.scrollToBottom(true);

    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const nameEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(nameEl, narrator.quickCreateName(name));
    Utils.scrollToBottom(true);

    // Start generating AI portrait in background now (runs while backstory generates)
    this._quickCreatePortraitGeneration = this._generateQuickCreatePortrait();

    // Try to auto-generate a backstory
    let backstory = '';
    
    // Show thinking message for backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(backstoryThinkingEl);
    
    try {
      const current = CharacterState.get();
      backstory = await AIService.generateBackstory(current.character);
    } catch (e) {
      // Simple fallback backstory
      backstory =
        'A mysterious past, a questionable present, and a future that depends entirely on your dice.';
    }
    CharacterState.updateCharacter({ backstory });

    // Stop thinking and clear the message
    this.stopProgressiveThinking();
    backstoryThinkingEl.textContent = '';
    
    // Show the actual backstory
    await Utils.typewriter(backstoryThinkingEl, backstory);
    Utils.scrollToBottom(true);

    backstoryThinkingEl.classList.add('is-waiting');
    await Utils.sleep(1500);
    backstoryThinkingEl.classList.remove('is-waiting');

    // Auto-select spells if character is a spellcaster
    if (typeof SPELL_DATA !== 'undefined' && SPELL_DATA.isSpellcaster(cls.id)) {
      const spells = SPELL_DATA.getQuickModeSpells(cls.id);
      if (spells) {
        const config = SPELL_DATA.getSpellcastingConfig(cls.id);
        CharacterState.updateCharacter({
          spellcastingAbility: config.ability,
          cantrips: spells.cantrips,
          spellsKnown: spells.firstLevel,
          spellsPrepared: config.preparedSpells ? spells.firstLevel : [],
          spellSlots: config.spellSlots,
        });
        
        // Show a brief message about spell selection
        narratorPanel.insertAdjacentHTML(
          'beforeend',
          Components.renderNarratorMessage(''),
        );
        Utils.scrollToBottom(true);
        const spellsEl =
          narratorPanel.lastElementChild.querySelector('.narrator-text');
        await Utils.typewriter(
          spellsEl,
          `> Auto-selected ${spells.cantrips.length} cantrip${spells.cantrips.length !== 1 ? 's' : ''} and ${spells.firstLevel.length} 1st level spell${spells.firstLevel.length !== 1 ? 's' : ''} for your ${cls.name}.`,
        );
        Utils.scrollToBottom(true);
        
        await Utils.sleep(1000);
      }
    }

    // Wait for portrait generation to complete (if it was started)
    if (this._quickCreatePortraitGeneration) {
      try {
        await this._quickCreatePortraitGeneration;
      } catch (error) {
        // Error already handled in _generateQuickCreatePortrait
      }
      this._quickCreatePortraitGeneration = null;
    }

    // Jump straight to the completion screen
    const completeQuestion = QUESTIONS.find((q) => q.id === 'complete');
    if (completeQuestion) {
      await this.showComplete(completeQuestion);
    }
  },

  startNew() {
    const state = CharacterState.get();
    const character = state.character;

    // Only prompt to save if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Ask the user if they want to save before starting over.
      this.showConfirmationOverlay(
        'You have not saved this character yet. What would you like to do?',
        async () => {
          // User chose SAVE: first attempt to save; if save fails, we keep the current character.
          await this.saveCharacter(true);

          // Re-check that we now have an ID before clearing.
          const latest = CharacterState.get().character;
          if (!latest || !latest.id) {
            this.showSystemMessage(
              'Character was not saved. Staying on the current character.',
            );
            return;
          }

          this._startNewInternal();
        },
        () => {
          // User chose DISCARD: start a fresh character without saving.
          this._startNewInternal();
        },
        {
          primaryLabel: 'SAVE',
          secondaryLabel: 'DISCARD',
          // Both CTAs use the secondary visual style in this flow.
          primaryClass: 'terminal-btn',
        },
      );
    } else {
      // Character is already saved or incomplete; immediately start a new one.
      this._startNewInternal();
    }
  },

  _startNewInternal() {
    // User confirmed: clear current character and restart flow.
    // Clear panels BEFORE resetting state so the state change listener can properly re-render
    const narratorPanel = document.getElementById('narrator-panel');
    const characterPanel = document.getElementById('character-panel');
    if (narratorPanel) narratorPanel.innerHTML = '';
    
    // Reset state and caches
    CharacterState.reset();
    OptionVariationsCache.reset();
    if (window.AIService && typeof AIService.resetNarratorSession === 'function') {
      AIService.resetNarratorSession();
    }
    this._lastPortraitArt = null; // Reset portrait tracking for new character
    
    // Don't manually clear character panel - let the state change listener handle it
    // The CharacterState.reset() above will trigger updateCharacterPanel via the subscriber
    
    // Skip intro and go directly to entry-mode for returning users
    this.showQuestion('entry-mode');
  },

  showConfirmationOverlay(message, onConfirm, onCancel, options = {}) {
    // Support old signature where third param was options object
    if (typeof onCancel === 'object' && onCancel !== null && !options) {
      options = onCancel;
      onCancel = null;
    }

    const targetSelector = options.targetSelector;
    const primaryLabel = options.primaryLabel || 'YES';
    const secondaryLabel = options.secondaryLabel || 'NO';
    const primaryClass =
      options.primaryClass || 'terminal-btn terminal-btn-primary';
    const secondaryClass = options.secondaryClass || 'terminal-btn';

    // While a confirmation dialog is open, pause keyboard navigation so
    // arrow keys don't move focus behind the modal.
    KeyboardNav.deactivate();

    const overlayHTML = `
      <div id="confirmationModal" class="modal show confirmation-overlay">
        <div class="modal-content" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Confirm</h2>
          </div>
          <div class="modal-body">
            <p class="terminal-text">
              ${message}
            </p>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="${secondaryClass}" id="confirm-no">${secondaryLabel}</button>
            <button class="${primaryClass}" id="confirm-yes">${primaryLabel}</button>
          </div>
        </div>
      </div>`;
    const terminalContainer = document.querySelector('.terminal-container');
    terminalContainer.insertAdjacentHTML('beforeend', overlayHTML);

    const overlay = document.getElementById('confirmationModal');
    const primaryBtn = document.getElementById('confirm-yes');
    const cancelBtn = document.getElementById('confirm-no');

    // Mark this overlay as "just opened" so the same Enter key event that
    // triggered it does NOT immediately auto-confirm. The flag is cleared
    // on the next tick.
    overlay.classList.add('just-opened');
    setTimeout(() => {
      if (overlay && overlay.classList) {
        overlay.classList.remove('just-opened');
      }
    }, 0);

    // Move keyboard focus into the modal so Enter presses are scoped correctly.
    if (primaryBtn) {
      primaryBtn.focus();
    }

    const runCloseAnimation = (onClosed) => {
      if (!overlay || overlay.classList.contains('closing')) {
        return;
      }

      overlay.classList.add('closing');

      const content = overlay.querySelector('.modal-content') || overlay;

      const handleClose = () => {
        if (overlay && overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }

        // Reactivate keyboard navigation now that the modal is gone.
        KeyboardNav.activate();

        if (typeof onClosed === 'function') {
          onClosed();
        }
      };

      if (content && content.addEventListener) {
        content.addEventListener('animationend', handleClose, { once: true });
      } else {
        handleClose();
      }
    };

    primaryBtn.addEventListener('click', () => {
      runCloseAnimation(onConfirm);
    });

    cancelBtn.addEventListener('click', () => {
      runCloseAnimation(onCancel);
    });
  },

  async showChangeConfirmation(questionId, selectedIndex, isListChoice) {
    const message =
      'Changing this answer will reset subsequent choices. Are you sure?';
    const targetSelector = `.question-card[data-question-id="${questionId}"]`;

    this.showConfirmationOverlay(message, async () => {
      // User confirmed change
      const state = CharacterState.get();

      // Find the index of the current question in the QUESTIONS array
      const currentQuestionIndex = QUESTIONS.findIndex(
        (q) => q.id === questionId,
      );

      // Clear answers and character data for all subsequent questions
      for (let i = currentQuestionIndex; i < QUESTIONS.length; i++) {
        const q = QUESTIONS[i];
        delete state.answers[q.id];
        if (q.saveTo) {
          CharacterState.updateCharacter({ [q.saveTo]: '' });
        }
      }
      // Remove all narrator content AFTER this question card (dialog + options)
      const narratorPanel = document.getElementById('narrator-panel');
      if (narratorPanel) {
        const anchorCard = narratorPanel.querySelector(targetSelector);
        if (anchorCard) {
          const children = Array.from(narratorPanel.children);
          const anchorIndex = children.indexOf(anchorCard);
          if (anchorIndex !== -1) {
            const toRemove = children.slice(anchorIndex + 1);

            // Fade out downstream elements, then remove them before
            // replaying the flow from this question forward.
            const fadeDurationMs = 400;
            toRemove.forEach((el) => {
              el.classList.add('fade-out');
              // Rely on a simple timeout to guarantee removal
              setTimeout(() => {
                if (el.parentNode) {
                  el.remove();
                }
              }, fadeDurationMs);
            });

            // Wait until after the fade + removal before continuing,
            // so the new branch starts with a clean terminal.
            await Utils.sleep(fadeDurationMs + 50);

            // After cleanup, ensure the anchor question is centered and
            // keyboard navigation starts from that card.
            anchorCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      }

      // Reset recommendations and option variations cache
      state.recommendations = {};
      OptionVariationsCache.reset();

      // Re-process the selected answer for the current question
      if (isListChoice) {
        await this.handleListAnswer(questionId, selectedIndex);
      } else {
        await this.handleAnswer(questionId, selectedIndex);
      }
    }, { targetSelector });
  },

  // Helper to update status text in header
  updateStatus(text) {
    const statusText = document.getElementById('status-text');
    if (statusText) {
      statusText.textContent = text;
    }
  },

  // Character panel renderer (called on state changes)
  async updateCharacterPanel(character) {
    const panel = document.getElementById('character-panel');

    // Determine entry mode (guided vs quick) from shared state so we can
    // adjust portrait behavior. In quick-create we suppress pre-generated
    // portraits until an AI portrait generation has actually started.
    let entryMode = null;
    try {
      if (window.CharacterState && typeof CharacterState.get === 'function') {
        const state = CharacterState.get();
        entryMode = state?.answers?.['entry-mode'] || null;
      }
    } catch (e) {
      // If state lookup fails for any reason, fall back to default behavior.
      entryMode = null;
    }
    const isQuickMode = entryMode === 'quick';
    const isGuidedMode = entryMode === 'guided';

    // If a portrait animation is in progress, queue this update for after animation completes
    if (this._portraitAnimating) {
      this._pendingCharacterUpdate = character;
      return;
    }

    // Avoid redundant re-renders if the character has not actually changed.
    // This keeps us from re-running portrait generation when only transient
    // state (like answers or recommendations) changes.
    try {
      const serialized = JSON.stringify(character);
      if (this._lastRenderedCharacter === serialized) {
        return;
      }
      this._lastRenderedCharacter = serialized;
    } catch (e) {
      // If serialization fails for any reason, fall back to always rendering.
    }
    
    // If we have a race, normally we load a pre-generated portrait
    // (race+class combo or race-only) and fall back to the simple template.
    if (character.race) {
      // In quick-create and co-create (guided) modes, NEVER call the pre-generated 
      // portrait loader. We either show the final custom AI portrait (when available) 
      // or a placeholder message while gathering character information. We explicitly 
      // ignore any asciiPortrait that may have been set by older exports or background 
      // upgrades so templates/pre-generated art never appear during character creation.
      if (isQuickMode || isGuidedMode) {
        // Before custom AI portrait is generated, characters will not yet
        // have a custom portrait. In that case render the sheet with a placeholder
        // message in the portrait area. The placeholder will show:
        // "Your portrait will be generated once we learn more about your character"
        const portraitArt = character.customPortraitAscii || null;

        // Decide whether to animate: only when we have new portrait art that
        // differs from what was last rendered, and we're not explicitly
        // suppressing animation (such as after a save).
        const shouldAnimate =
          !!portraitArt &&
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);

        this._lastPortraitArt = portraitArt || null;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Only show the "★ Custom AI Portrait" button once the initial custom 
        // portrait has been generated and is ready to display. Until then, we 
        // keep the portrait frame but hide the button to avoid suggesting an 
        // action that is already in progress.
        const hasCustomPortrait = !!portraitArt;

        // Always show the portrait container so the placeholder message
        // or custom portrait has a place to render.
        
        // IMPORTANT: If portrait generation is in progress (in either quick or guided mode),
        // we need to preserve the current portrait HTML (the fast-spinning "Generating..." cube).
        // Otherwise the re-render will replace it with the slow "Waiting..." cube.
        const isGenerating =
          !!this._quickCreatePortraitGeneration || !!this._guidedPortraitGenerating;
        const portraitNode = document.getElementById('character-portrait');
        const currentPortraitHTML = isGenerating && portraitNode
          ? portraitNode.innerHTML
          : null;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          null,
          true,
          {
            showGeneratePortraitButton: hasCustomPortrait,
          },
        );

        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Restore the generating state if we captured it. We also need to
        // re-apply the loading class so the cube keeps its correct geometry
        // after the sheet re-renders (otherwise the container may revert to
        // the placeholder/layout styles and distort the cube on subsequent
        // generations).
        if (isGenerating && currentPortraitHTML && portraitEl) {
          portraitEl.innerHTML = currentPortraitHTML;
          // Keep both placeholder + loading classes in sync with the initial
          // loader render so the cube geometry doesn't get distorted after
          // a sheet re-render.
          portraitEl.classList.add('ascii-portrait--placeholder');
          portraitEl.classList.add('ascii-portrait--loading');
        }

        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }

        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character so new custom portraits "type in"
            this._portraitAnimating = true;
            this.typePortrait(portraitEl, portraitArt).then(async () => {
              this._portraitAnimating = false;
              // Process any pending updates that came in during animation
              if (this._pendingCharacterUpdate) {
                const pending = this._pendingCharacterUpdate;
                this._pendingCharacterUpdate = null;
                await this.updateCharacterPanel(pending);
              }
            });
          } else {
            // Just set it immediately if it hasn't changed
            portraitEl.textContent = portraitArt;
            // Match manager behavior: center the ASCII portrait horizontally
            if (
              window.CharacterSheet &&
              typeof CharacterSheet._centerPortraitScrollSafely === 'function'
            ) {
              CharacterSheet._centerPortraitScrollSafely(portraitEl);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        // once elements are wired up so we don't flash the teal background.
        this._applyPreferredPortraitViewBuilder(character);

        return;
      }

      // Legacy mode: Load pre-generated or fallback portrait text
      // This code path is only reached if entryMode is not set (shouldn't happen in normal flow)
      try {
        const portraitArt = await AsciiArtService.generateAIPortrait(character);
        
        // Check again if animation is in progress (might have started while we were loading)
        if (this._portraitAnimating) {
          return;
        }
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== portraitArt);
        
        // If we're about to animate, set the flag BEFORE rendering to prevent race conditions
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = portraitArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;

        // Render sheet skeleton, then inject ASCII as text to avoid HTML parsing
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          portraitArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && portraitArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, portraitArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            portraitEl.textContent = portraitArt;
            if (window.CharacterSheet && typeof CharacterSheet._centerPortraitScrollSafely === 'function') {
              CharacterSheet._centerPortraitScrollSafely(portraitEl);
            }
          }
        }
      } catch (error) {
        console.error('Error generating portrait:', error);

        // Check again if animation is in progress
        if (this._portraitAnimating) {
          return;
        }

        const fallbackArt = AsciiArtService.getFullPortrait(character);
        
        // Check if portrait has changed (only animate if it's different or first time)
        const shouldAnimate =
          !this._suppressNextPortraitAnimation &&
          (!this._lastPortraitArt || this._lastPortraitArt !== fallbackArt);
        
        // If we're about to animate, set the flag BEFORE rendering
        if (shouldAnimate) {
          this._portraitAnimating = true;
        }
        
        this._lastPortraitArt = fallbackArt;
        // Consume any pending suppression flag after we've decided.
        this._suppressNextPortraitAnimation = false;
        
        panel.innerHTML = Components.renderCharacterSheet(
          character,
          fallbackArt,
          true,
        );
        const portraitEl = document.getElementById('character-portrait');
        const originalPortraitEl = document.getElementById('original-portrait');
        
        // Set the original portrait image if URL exists
        if (originalPortraitEl && character.originalPortraitUrl) {
          originalPortraitEl.src = character.originalPortraitUrl;
        }
        
        if (portraitEl && fallbackArt) {
          if (shouldAnimate) {
            // Animate portrait character-by-character
            await this.typePortrait(portraitEl, fallbackArt);
            this._portraitAnimating = false;
            
            // Process any pending updates that came in during animation
            if (this._pendingCharacterUpdate) {
              const pending = this._pendingCharacterUpdate;
              this._pendingCharacterUpdate = null;
              await this.updateCharacterPanel(pending);
            }
          } else {
            // Just set it immediately if it hasn't changed
            portraitEl.textContent = fallbackArt;
            if (window.CharacterSheet && typeof CharacterSheet._centerPortraitScrollSafely === 'function') {
              CharacterSheet._centerPortraitScrollSafely(portraitEl);
            }
          }
        }

        // Apply preferred default portrait view (ASCII vs Original) in builder
        this._applyPreferredPortraitViewBuilder(character);
      }
      return;
    }

    // No race yet – show portrait container with placeholder during character creation.
    // Always show the placeholder in builder mode since user is actively creating a character.
    // The placeholder will display: "Your portrait will be generated once we learn more about your character"
    panel.innerHTML = Components.renderCharacterSheet(
      character,
      null,
      true, // Always show portrait placeholder during initial character creation
    );
  },

  // Animate ASCII portrait character-by-character, line-by-line
  async typePortrait(element, portraitText) {
    const lines = portraitText.split('\n');
    element.textContent = '';
    
    let currentText = '';
    const charsPerFrame = 15; // Type multiple characters per frame for speed
    let charCount = 0;
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      
      // Type characters in batches
      for (let charIndex = 0; charIndex < line.length; charIndex++) {
        currentText += line[charIndex];
        charCount++;

        // Update DOM every N characters
        if (charCount >= charsPerFrame) {
          element.textContent = currentText;
          charCount = 0;

          // Keep the portrait visually centered in its frame *while* it types
          // so there's no final "jump" when the animation completes.
          if (
            window.CharacterSheet &&
            typeof CharacterSheet._centerPortraitScrollSafely === 'function'
          ) {
            CharacterSheet._centerPortraitScrollSafely(element);
          }

          await new Promise(resolve => requestAnimationFrame(resolve));
        }
      }
      
      // Add newline after each line (except the last)
      if (lineIndex < lines.length - 1) {
        currentText += '\n';
      }
    }
    
    // Final update to ensure all text is shown
    element.textContent = currentText;

    // After animation completes, center the portrait horizontally to match
    // the Character Manager viewer behavior.
    if (window.CharacterSheet && typeof CharacterSheet._centerPortraitScrollSafely === 'function') {
      CharacterSheet._centerPortraitScrollSafely(element);
    }
  },

});

// ===== AUTHENTICATION & BOOTSTRAP (builder splash handling) =====

let builderSplashActive = true;

let loadingInterval = null;

function startLoadingAnimation() {
  const statusText = document.getElementById('status-text');
  // Previously showed rotating \"fun\" boot messages; now we keep this area quiet.
  if (statusText) {
    statusText.textContent = '';
  }
}

// Flag to suppress beforeunload warning during intentional navigation
let allowNavigationFlag = false;
window.suppressBeforeunloadWarning = () => {
  allowNavigationFlag = true;
};

// Exit back to the Character Manager app from builder mode
function exitToManager() {
  const state = CharacterState.get();
  const character = state.character;

  // Only prompt to save if character is complete (has name, race, class) and unsaved
  const isComplete = character && character.name && character.race && character.class;
  const hasUnsavedChanges = character && !character.id && isComplete;

  if (hasUnsavedChanges) {
    // Ask the user if they want to save before exiting
    App.showConfirmationOverlay(
      'You have unsaved changes. What would you like to do?',
      async () => {
        // User clicked "SAVE" (primary button) - attempt to save; if save fails, we stay in the builder
        await App.saveCharacter(true);

        // Re-check that we now have an ID before exiting
        const latest = CharacterState.get().character;
        if (!latest || !latest.id) {
          App.showSystemMessage(
            'Character was not saved. Staying in the builder.',
          );
          return;
        }

        // Character saved successfully, proceed to exit
        window.suppressBeforeunloadWarning();
        window.location.href = '../character-manager.html?from=builder';
      },
      () => {
        // User clicked "DISCARD" (secondary button) - exit without saving
        window.suppressBeforeunloadWarning();
        window.location.href = '../character-manager.html?from=builder';
      },
      {
        primaryLabel: 'SAVE',
        secondaryLabel: 'DISCARD'
      }
    );
  } else {
    // Character is already saved or incomplete; immediately exit
    window.suppressBeforeunloadWarning();
    window.location.href = '../character-manager.html?from=builder';
  }
}

function dismissBuilderSplash(instant = false) {
  const splash = document.getElementById('splash-content');
  const mainContent = document.getElementById('main-content');

  if (!splash || !builderSplashActive) return;
  builderSplashActive = false;

  if (instant) {
    splash.classList.add('is-hidden');
    if (mainContent) {
      mainContent.classList.remove('is-hidden');
    }
  } else {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('is-hidden');
      if (mainContent) {
        mainContent.classList.remove('is-hidden');
      }
    }, 300);
  }
}


// Initialize on page load
window.addEventListener('DOMContentLoaded', async () => {
  // Start loading animation
  startLoadingAnimation();
  
  // 🔥 Wake up the backend server early (Render cold start can take 30-50s)
  if (CONFIG.ENABLE_AI) {
    console.log('%c🚀 BOOT: Waking up backend server early...', 'color: #0ff; font-weight: bold');
    AIService.warmupBackend();
  }

  // Show main content immediately (behind splash)
  const mainContent = document.getElementById('main-content');
  if (mainContent) {
    mainContent.classList.remove('is-hidden');
  }

  // Splash screen handlers (press any key / click to begin)
  const splash = document.getElementById('splash-content');
  if (splash) {
    const keyHandler = (e) => {
      if (!builderSplashActive) return;
      e.preventDefault();
      e.stopPropagation();
      dismissBuilderSplash();
    };

    window.addEventListener('keydown', keyHandler);
    splash.addEventListener('click', () => dismissBuilderSplash(), { once: true });
  }

  // Initialize the builder app
  await App.init();

  // Stop loading animation once initialized
  if (loadingInterval) {
    clearInterval(loadingInterval);
  }
  const statusText = document.getElementById('status-text');
  if (statusText) {
    statusText.textContent = '';
  }

  // Keep narrator panel scrolled to bottom on resize
  window.addEventListener('resize', () => {
    Utils.scrollToBottom();
  });

  // Warn before leaving page if there are unsaved changes
  window.addEventListener('beforeunload', (e) => {
    // Skip warning if navigation is intentional (user clicked DISCARD/SAVE)
    if (allowNavigationFlag) return;

    const state = CharacterState.get();
    const character = state.character;

    // Only prompt if character is complete (has name, race, class) and unsaved
    const isComplete = character && character.name && character.race && character.class;
    const hasUnsavedChanges = character && !character.id && isComplete;

    if (hasUnsavedChanges) {
      // Modern browsers ignore custom messages and show a generic one
      e.preventDefault();
      e.returnValue = ''; // Chrome requires returnValue to be set
      return ''; // Some browsers require a return value
    }
  });

  // Keyboard navigation
  window.addEventListener('keydown', (e) => {
    // Don't interfere if there's any modal open
    if (document.querySelector('.modal.show')) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      KeyboardNav.moveUp();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      KeyboardNav.moveDown();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      KeyboardNav.moveLeft();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      KeyboardNav.moveRight();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      KeyboardNav.select();
    }
  });

  // When a modal is open, pressing Cmd/Ctrl+Enter should trigger its primary action.
  window.addEventListener('keydown', (e) => {
    if (!(e.key === 'Enter' && (e.metaKey || e.ctrlKey))) return;
    const modal = document.querySelector('.modal.show');
    if (!modal || modal.classList.contains('just-opened')) return;

    // Only trigger the modal's primary action if focus is currently inside
    // the modal.
    const activeElement = document.activeElement;
    if (!activeElement || !modal.contains(activeElement)) return;

    const primaryBtn = modal.querySelector('.modal-footer .terminal-btn-primary');
    if (primaryBtn) {
      e.preventDefault();
      primaryBtn.click();
    }
  });
});





// ===== BUNDLE PART: character-builder/character-builder-manager.js =====

// ========================================
// CHARACTER BUILDER - CLOUD INTEGRATION
// ========================================
// Handles authentication UI and cloud storage for Character Builder

// ========================================
// AUTHENTICATION UI HANDLERS
// ========================================

function showAuthModal() {
    document.getElementById('authModal').classList.add('show');
    showLoginForm();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authError').classList.add('is-hidden');
    // Clear form fields
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    if (registerPasswordConfirm) {
        registerPasswordConfirm.value = '';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ LOGIN ]';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ REGISTER ]';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');
}

async function handleLogin() {
    const errorEl = document.getElementById('authError');

    // If the login form is hidden (user is on the REGISTER tab), do nothing.
    // This avoids showing "Please enter both email and password" errors on
    // the register screen if some stray event fires the login handler.
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl && loginFormEl.classList.contains('is-hidden')) {
        return;
    }

    // See note in character-manager.js: password managers / autofill can race
    // with our click handler. Wait briefly before reading values to avoid
    // false "Please enter both email and password" errors.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('loginUsername');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.login(email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Logged in as ${email}`);
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Logged in as ${email}`, 'success');
            }
        } else {
            errorEl.textContent = result.error || 'Login failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    }
}

async function handleRegister() {
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const passwordConfirmEl = document.getElementById('registerPasswordConfirm');
    const passwordConfirm = passwordConfirmEl ? passwordConfirmEl.value : '';
    const errorEl = document.getElementById('authError');

    if (!email || !password || (passwordConfirmEl && !passwordConfirm)) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    if (passwordConfirmEl && password !== passwordConfirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.register(email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            console.log(`✓ Registered as ${email}`);
            
            // Show notification in Builder's terminal
            if (window.App && window.App.showNotification) {
                window.App.showNotification(`✓ Registered as ${email}`, 'success');
            }
        } else {
            errorEl.textContent = result.error || 'Registration failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Registration failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    }
}

function handleLogout() {
    if (!window.App || !window.App.showConfirmationOverlay) {
        // Fallback to immediate logout if confirmation UI is not available
        window.AuthService.logout();
        updateAuthUI();
        
        // Show login screen after logout
        if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
            window.AuthUI.showLogin(
                () => location.reload(),  // onSuccess
                () => {},                 // onSwitchToRegister (handled within AuthUI)
                () => {}                  // onGuestMode
            );
        }
        return;
    }

    window.App.showConfirmationOverlay(
        'Log out? Your character will be saved to the cloud before logging out.',
        async () => {
            // Save current character to cloud before logout if there is one
            if (window.CharacterState && window.CharacterState.current.character.name) {
                await saveCurrentCharacterToCloud();
            }

            window.AuthService.logout();
            updateAuthUI();
            console.log('✓ Logged out');

            if (window.App && window.App.showNotification) {
                window.App.showNotification('✓ Logged out', 'success');
            }
            
            // Show login screen after logout
            if (window.AuthUI && typeof window.AuthUI.showLogin === 'function') {
                window.AuthUI.showLogin(
                    () => location.reload(),  // onSuccess
                    () => {},                 // onSwitchToRegister (handled within AuthUI)
                    () => {}                  // onGuestMode
                );
            }
        },
    );
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const userStatusIcon = document.getElementById('userStatusIcon');
    const userStatusText = document.getElementById('userStatusText');

    // In the integrated app, the builder surface no longer exposes login/logout
    // UI. If these elements are missing, simply skip any header updates.
    if (!authBtn || !userInfoDisplay || !userStatusIcon || !userStatusText) {
        return;
    }

    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userStatusIcon.textContent = '☁';
        userStatusText.textContent = user ? user.email : 'Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;
    } else {
        userStatusIcon.textContent = '▣';
        userStatusText.textContent = 'Local Only';
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = showAuthModal;
    }
}

// ========================================
// CLOUD STORAGE INTEGRATION
// ========================================

async function saveCurrentCharacterToCloud() {
    try {
        if (!window.AuthService || !window.AuthService.isAuthenticated()) {
            console.log('💾 Not logged in - character saved to localStorage only');
            return false;
        }

        if (!window.CharacterCloudStorage) {
            console.error('☁️ CharacterCloudStorage not available');
            return false;
        }

        const character = window.CharacterState.current.character;
        
        // Don't save if no name yet (character not complete)
        if (!character.name) {
            console.log('☁️ Character has no name yet - skipping cloud save');
            return false;
        }

        console.log('☁️ Saving character to cloud:', character.name);

        // Check if this character already exists in cloud (by characterUid)
        const allCloudChars = await window.CharacterCloudStorage.getAll();
        const existingChar = allCloudChars.find(c => 
            c.characterUid === character.characterUid ||
            c.metadata?.characterUid === character.characterUid
        );

        if (existingChar) {
            // Update existing
            console.log('☁️ Updating existing character in cloud:', existingChar.id);
            await window.CharacterCloudStorage.update(existingChar.id, character);
            console.log('☁️ Character updated in cloud successfully');
        } else {
            // Create new
            console.log('☁️ Creating new character in cloud');
            const result = await window.CharacterCloudStorage.add(character);
            console.log('☁️ Character created in cloud with ID:', result.id);
        }

        return true;
    } catch (error) {
        console.error('☁️ Failed to save character to cloud:', error);
        return false;
    }
}

// ========================================
// INITIALIZATION
// ========================================

// Initialize auth UI when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateAuthUI);
} else {
    updateAuthUI();
}

console.log('☁️ Character Builder Cloud Integration loaded');
