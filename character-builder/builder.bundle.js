

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










// ===== BUNDLE PART: portrait-prompts.js =====

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
    apiSyncAttempted = true;

    if (!isAuthenticated()) return;

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

  // Sync entries from API to localStorage (for authenticated users)
  // Call this during app init to ensure cloud data is available locally
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
  // to localStorage so they're available for prompt generation.
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






// ===== BUNDLE PART: shared-portrait-data.js =====

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



// ===== BUNDLE PART: character-name-data.js =====

// ========================================
// SHARED CHARACTER NAME DATA
// ========================================
// Fantasy name patterns for D&D races.
// Used by AIService.generateFallbackNames for offline name generation.

const CharacterNameData = (window.CharacterNameData = {
  // Name patterns indexed by race
  patterns: {
    dwarf: {
      first: [
        'Thorin', 'Gimli', 'Balin', 'Dwalin', 'Thrain', 'Dain', 'Bombur',
        'Bofur', 'Kili', 'Fili', 'Oin', 'Gloin', 'Bruenor', 'Morgran',
        'Rurik', 'Einkil', 'Barendd', 'Baern', 'Harbek', 'Rumnar',
      ],
      last: [
        'Ironforge', 'Stonehelm', 'Deepdelver', 'Mountainheart', 'Goldseeker',
        'Ironfoot', 'Hammerhand', 'Oakenshield', 'Battlehammer', 'Fireforge',
        'Stormdelver', 'Stonebreaker', 'Coppervein', 'Bronzebrow', 'Rockseeker',
      ],
    },
    elf: {
      first: [
        'Legolas', 'Galadriel', 'Elrond', 'Arwen', 'Thranduil', 'Celeborn',
        'Elessar', 'Elendil', 'Finrod', 'Luthien', 'Faelar', 'Aelar',
        'Mialee', 'Syllin', 'Thia', 'Varis', 'Althaea', 'Enna', 'Nelar',
      ],
      last: [
        'Greenleaf', 'Starweaver', 'Moonwhisper', 'Silverbow', 'Nightbreeze',
        'Sunshadow', 'Stormwind', 'Brightwood', 'Dawnpetal', 'Evenwood',
        'Silverfrond', 'Nightstar', 'Willowshade', 'Starfall', 'Moonbrook',
      ],
    },
    human: {
      first: [
        'Aragorn', 'Boromir', 'Eowyn', 'Faramir', 'Theodred', 'Eomer',
        'Eddard', 'Catelyn', 'Jon', 'Sansa', 'Alaric', 'Rowan', 'Serena',
        'Garrick', 'Lysa', 'Marcus', 'Elena', 'Corin', 'Brynn',
      ],
      last: [
        'Stormborn', 'Blackwood', 'Riverrun', 'Ironwall', 'Longstrider',
        'Stormblade', 'Brightshield', 'Greywind', 'Highvale', 'Steelguard',
        'Duskwalker', 'Redcrest', 'Stoneward', 'Ashborne', 'Hawkspear',
      ],
    },
    halfling: {
      first: [
        'Bilbo', 'Frodo', 'Sam', 'Merry', 'Pippin', 'Rosie', 'Hamfast',
        'Belladonna', 'Lobelia', 'Fredegar', 'Milo', 'Daisy', 'Rosa',
        'Cora', 'Perrin', 'Tansy', 'Dodo', 'Seraphina', 'Odo',
      ],
      last: [
        'Baggins', 'Took', 'Brandybuck', 'Gamgee', 'Goodbody', 'Proudfoot',
        'Burrows', 'Underhill', 'Greenhill', 'Fairbairn', 'Hilltopple',
        'Brushgather', 'Tealeaf', 'Thorngage', 'Goodbarrel', 'Hearthcoat',
      ],
    },
    dragonborn: {
      first: [
        'Drax', 'Razax', 'Thordak', 'Torinn', 'Balasar', 'Kriv', 'Nadarr',
        'Heskan', 'Shedinn', 'Ghesh', 'Arjhan', 'Medrash', 'Rhogar',
        'Tarhun', 'Akra', 'Miirym', 'Sora', 'Vezera', 'Zorvath',
      ],
      last: [
        'Flameheart', 'Ironclaw', 'Stormsinger', 'Ashborn', 'Dragonfall',
        'Firebreath', 'Scaleborn', 'Wyrmblood', 'Skyscale', 'Embermaw',
        'Stormscale', 'Brightflame', 'Stoneclaw', 'Cloudsunder', 'Blazewing',
      ],
    },
    gnome: {
      first: [
        'Glim', 'Boddynock', 'Dimble', 'Fonkin', 'Seebo', 'Zook', 'Eldon',
        'Brocc', 'Burgell', 'Jebeddo', 'Alston', 'Bimpnottin', 'Fizzik',
        'Carlin', 'Nissa', 'Wrenn', 'Tavi', 'Ellyjobell', 'Zanna',
      ],
      last: [
        'Tinkertop', 'Sparklegem', 'Nimblefingers', 'Brightgear', 'Gadgetwhiz',
        'Fizzlebang', 'Cogsworth', 'Glimmergold', 'Whistlewhirr', 'Gadgetgrind',
        'Janglecoin', 'Copperbolt', 'Mithrilspanner', 'Quickwidget', 'Proudgear',
      ],
    },
    'half-elf': {
      first: [
        'Tanis', 'Raistlin', 'Laurana', 'Gilthanas', 'Tanthalas', 'Silvara',
        'Eliana', 'Korrin', 'Faelyn', 'Soveliss', 'Ilanis', 'Kael', 'Myla',
        'Tharos', 'Elira', 'Daeris', 'Rian', 'Caelynn', 'Torren',
      ],
      last: [
        'Half-Elven', 'Moonbrook', 'Starfall', 'Whisperwind', 'Shadowvale',
        'Dawnbringer', 'Twilightbane', 'Silvermoon', 'Nightbloom', 'Duskwillow',
        'Starcrest', 'Eveningfall', 'Shadeglade', 'Brightglen', 'Silvershade',
      ],
    },
    'half-orc': {
      first: [
        'Grognak', 'Throk', 'Ugak', 'Krod', 'Sharn', 'Dench', 'Grul', 'Drog',
        'Feng', 'Shump', 'Ghorbash', 'Mazog', 'Uglar', 'Ruk', 'Karash',
        'Vorag', 'Yagra', 'Shautha', 'Ovak',
      ],
      last: [
        'Ironhide', 'Bonecrusher', 'Skullsplitter', 'Bloodaxe', 'Stonefist',
        'Grimjaw', 'Warbringer', 'Doomhammer', 'Boulderfist', 'Skullbrand',
        'Gorefang', 'Bloodfury', 'Ironmaw', 'Steelgrip', 'Rageborn',
      ],
    },
    tiefling: {
      first: [
        'Zevlor', 'Raven', 'Damakos', 'Akta', 'Therai', 'Nemeia', 'Kallista',
        'Leucis', 'Orianna', 'Morthos', 'Azazel', 'Seraphine', 'Xathos',
        'Riven', 'Lyra', 'Caelum', 'Naeris', 'Vexria', 'Zheren',
      ],
      last: [
        'Hellborn', 'Darkflame', 'Shadowhorn', 'Nightwhisper', 'Embersoul',
        'Dreadfire', 'Ashenborn', 'Voidwalker', 'Grimshroud', 'Duskwreath',
        'Soulbrand', 'Cindertongue', 'Nightreign', 'Gloomsigil', 'Shadebinder',
      ],
    },
  },

  /**
   * Get the name pattern for a race.
   * Falls back to human names if the race isn't found.
   * @param {string} race - The character race
   * @returns {{ first: string[], last: string[] }}
   */
  getPattern(race) {
    const key = (race || '').toLowerCase();
    return this.patterns[key] || this.patterns.human;
  },

  /**
   * Get all available races.
   * @returns {string[]}
   */
  getRaces() {
    return Object.keys(this.patterns);
  },
});




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
  DEFAULT_PORTRAIT_VIEW_MODE: 'original',

  // Default portrait prompt theme when no explicit preference has been saved yet.
  // This should match one of PortraitPrompt.getThemes().id values.
  DEFAULT_PORTRAIT_PROMPT_THEME: 'cinematic-inks',
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

  // Preferred portrait prompt theme for AI portraits.
  // Stored per-browser so builder + manager can share the same choice.
  getPortraitPromptTheme() {
    try {
      const raw = localStorage.getItem('dnd_portrait_prompt_theme');
      const fallback =
        (CONFIG && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) || null;
      if (!raw) return fallback;
      const value = String(raw).trim();

      // If the shared PortraitPrompt helper is available, validate against it
      // so we gracefully fall back when themes change.
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getThemes === 'function'
      ) {
        try {
          const themes = window.PortraitPrompt.getThemes();
          const allowedIds = Array.isArray(themes)
            ? themes.map((t) => t.id)
            : [];
          if (allowedIds.includes(value)) {
            return value;
          }
          return fallback;
        } catch (e) {
          // Non-fatal – fall through to returning the raw value.
        }
      }

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

      // If the shared PortraitPrompt helper is available, validate against it.
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.getThemes === 'function'
      ) {
        try {
          const themes = window.PortraitPrompt.getThemes();
          const allowedIds = Array.isArray(themes)
            ? themes.map((t) => t.id)
            : [];
          if (!allowedIds.includes(value)) {
            console.warn(
              'StorageService.setPortraitPromptTheme: ignoring unknown theme id',
              value,
            );
            localStorage.removeItem('dnd_portrait_prompt_theme');
            return;
          }
        } catch (e) {
          // Non-fatal – if validation fails, still store the value.
        }
      }

      localStorage.setItem('dnd_portrait_prompt_theme', value);
    } catch (e) {
      console.warn('StorageService.setPortraitPromptTheme failed', e);
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
      
        // Quality setting differs by model:
        // - DALL-E: 'standard' or 'hd'
        // - GPT Image 1: 'low', 'medium', 'high'
        const quality = model.startsWith('dall-e') ? 'standard' : 'medium';

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
          }),
        }, 70000); // 70 seconds for image generation (DALL-E can be very slow, plus R2 upload)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 IMAGE (Error)', 'color: #f00; font-weight: bold');
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
          const rateLimitError = new Error(errorMessage || 'Rate limit exceeded');
          rateLimitError.isRateLimit = true;
          throw rateLimitError;
        }
        
        // Check for safety system rejection (handle both string and array detail)
        const detailStr = typeof errorData.detail === 'string' ? errorData.detail : errorMessage;
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

    // Add D&D context header to help LLM understand class names like "Monk" are fantasy classes
    parts.push('Dungeons & Dragons fantasy character:');

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

// Session persistence key (using localStorage for cross-tab and browser restart persistence)
const SESSION_STORAGE_KEY = 'danddy_builder_session';

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
    currentQuestionId: null, // Track current question for session resume
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
  
  // Flag to prevent auto-save during restore
  _restoring: false,

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

  // Set the current question ID (called by App.showQuestion)
  setCurrentQuestion(questionId) {
    this.current.currentQuestionId = questionId;
    this._saveSession();
  },

  subscribe(listener) {
    this.listeners.push(listener);
  },

  notify() {
    this.listeners.forEach((listener) => listener(this.current));
    // Auto-save to session on every state change (unless restoring)
    if (!this._restoring) {
      this._saveSession();
    }
  },

  // ===== Session Persistence =====

  // Check if there's an in-progress session to resume
  hasSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      const session = JSON.parse(raw);
      // Consider it a valid session if we have meaningful progress
      // (past the intro, or have any character data)
      const hasProgress = session.currentQuestionId && session.currentQuestionId !== 'intro';
      const hasCharacterData = session.character && (
        session.character.name ||
        session.character.race ||
        session.character.class
      );
      return hasProgress || hasCharacterData;
    } catch {
      return false;
    }
  },

  // Get session metadata for display (without fully loading)
  getSessionPreview() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const session = JSON.parse(raw);
      return {
        characterName: session.character?.name || null,
        race: session.character?.race || null,
        class: session.character?.class || null,
        currentQuestionId: session.currentQuestionId,
        savedAt: session._savedAt || null,
      };
    } catch {
      return null;
    }
  },

  // Save current state to localStorage
  _saveSession() {
    try {
      const toSave = {
        ...this.current,
        _savedAt: new Date().toISOString(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(toSave));
    } catch (e) {
      console.warn('[CharacterState] Failed to save session:', e);
    }
  },

  // Restore state from localStorage
  restoreSession() {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return false;
      
      const session = JSON.parse(raw);
      this._restoring = true;
      this.current = {
        id: session.id || Date.now().toString(),
        step: session.step || 0,
        abilityMethod: session.abilityMethod || null,
        answers: session.answers || {},
        currentQuestionId: session.currentQuestionId || null,
        character: {
          characterUid: session.character?.characterUid || `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          name: session.character?.name || '',
          race: session.character?.race || '',
          class: session.character?.class || '',
          background: session.character?.background || '',
          alignment: session.character?.alignment || '',
          baseAbilities: session.character?.baseAbilities || null,
          abilities: session.character?.abilities || {
            str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10,
          },
          level: session.character?.level || 1,
          hitPoints: session.character?.hitPoints || 0,
          personalityTrait: session.character?.personalityTrait || '',
          backstory: session.character?.backstory || '',
          skillProficiencies: session.character?.skillProficiencies || [],
          toolProficiencies: session.character?.toolProficiencies || [],
          languages: session.character?.languages || [],
          equipment: session.character?.equipment || [],
          backgroundFeature: session.character?.backgroundFeature || null,
          spellcastingAbility: session.character?.spellcastingAbility || null,
          cantrips: session.character?.cantrips || [],
          spellsKnown: session.character?.spellsKnown || [],
          spellsPrepared: session.character?.spellsPrepared || [],
          spellSlots: session.character?.spellSlots || {},
          // Preserve portrait data if it exists
          asciiArt: session.character?.asciiArt || null,
          portraitUrl: session.character?.portraitUrl || null,
        },
      };
      this._restoring = false;
      this.notify();
      return session.currentQuestionId || 'intro';
    } catch (e) {
      console.warn('[CharacterState] Failed to restore session:', e);
      this._restoring = false;
      return false;
    }
  },

  // Clear the saved session (call after save/discard)
  clearSession() {
    try {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('[CharacterState] Failed to clear session:', e);
    }
  },

  reset() {
    this.current = {
      id: Date.now().toString(),
      step: 0,
      abilityMethod: null,
      answers: {},
      currentQuestionId: null,
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
    // Clear session when explicitly resetting
    this.clearSession();
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

      // Restore menu to original parent if it was moved (any modal)
      if (m._originalParent) {
        m.classList.remove('portrait-history-menu-detached');
        m.classList.remove('portrait-history-menu-detached--teal');
        m.classList.remove('selector-menu-detached');
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
      
      // Unlock scroll when menu closes
      CharacterSheet._updateScrollLock(false);
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
          // EXCEPTION: Search/sort bar uses absolute positioning so the
          // dropdown stays anchored to its button during page scroll.
          const inSearchActions = !!triggerEl.closest('.search-actions');
          const useFixedPositioning = !inSearchActions;

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
            // Use higher z-index when inside any modal to appear above modal backdrop.
            menu.style.zIndex = inModal ? '1100' : '1000';
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

            // Horizontal: align left edge of menu with left edge of trigger.
            const left = triggerRect.left - shellRect.left;
            menu.style.left = `${left}px`;
            menu.style.right = 'auto';

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
          menu.style.zIndex = inModal ? '1100' : '1000';
        }

        shell.classList.add('is-open');
        triggerEl.classList.add('is-open');
        menu.classList.add('is-open');
        menu.setAttribute('aria-hidden', 'false');
        triggerEl.setAttribute('aria-expanded', 'true');
        
        // Lock scroll when menu opens
        CharacterSheet._updateScrollLock(true);

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
          return activeVersion.ascii;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

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
          return activeVersion.url;
        }
      }
    } catch (e) {
      // Non-fatal; fall through to legacy fields.
    }

    // 1) Explicit custom portrait URL
    if (character.originalPortraitUrl) {
      return character.originalPortraitUrl;
    }

    // 2) Exported portrait object from builder
    if (character.portrait && character.portrait.url) {
      return character.portrait.url;
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




// ===== BUNDLE PART: portraits-ui.js =====

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
        console.log('%c🎨 MANAGER PORTRAIT HISTORY OPEN', 'color:#0ff;font-weight:bold;');
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
              <h2 class="modal-title">[ Portrait History ]</h2>
              <button class="modal-close" onclick="PortraitUI.closeHistory()">&times;</button>
            </div>
            <div class="modal-body">
              <p class="terminal-text-small terminal-text-dim">
                View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
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
              <button class="terminal-btn" onclick="PortraitUI.closeHistory()">CANCEL</button>
              <button class="terminal-btn terminal-btn-primary" onclick="PortraitUI.confirmSelection()">USE SELECTED</button>
            </div>
          </div>
        </div>
      `;

      // Attach the portrait history modal to the terminal frame/container so
      // its overlay and content stay within the app window instead of the
      // full browser viewport.
      const host =
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
      const startLine = 0; // Always start from the top (keep heads/faces)
      const endLine = Math.min(totalLines, heightLines);

      const topLines = lines
        .slice(startLine, endLine)
        .map((line) => line.slice(0, widthChars));

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

      if (!imgEl || !asciiEl) return;

      const showingAscii = imgEl.classList.contains('is-hidden');

      if (showingAscii) {
        // Switch to original image
        asciiEl.classList.add('is-hidden');
        imgEl.classList.remove('is-hidden');
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
        console.log('%c🎨 MANAGER PORTRAIT USE SELECTED', 'color:#0ff;font-weight:bold;');
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

    async viewPrompt(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      const character = await CharacterStorage.getById(characterId);
      if (!character) return;

      const metadata = character.portraitMetadata || {};
      const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
      const version = versions.find((v) => v.id === versionId);

      if (!version || !version.prompt) {
        if (typeof window.showNotification === 'function') {
          window.showNotification('No saved prompt for this portrait.');
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

      // Build style label for header - format to sentence case
      const rawStyle = version.style || 'default';
      const formatStyleLabel = (str) => {
        if (!str) return 'Default';
        // Replace dashes/underscores with spaces
        let cleaned = str.replace(/[-_]/g, ' ');
        // Sentence case: capitalize first letter, lowercase the rest
        if (cleaned.length > 0) {
          cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
        }
        return cleaned;
      };
      const styleLabel = formatStyleLabel(rawStyle);

      // Escape prompt text for safe display
      const escapedPrompt = (version.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      const promptHeaderHtml = `
        <h2 class="modal-title">[ Portrait Prompt ]</h2>
        <span class="portrait-prompt-style-label">Style: ${styleLabel}</span>
        <button class="modal-close" onclick="PortraitUI.closeHistory()">&times;</button>
      `;

      const promptBodyHtml = `
        <pre class="terminal-text portrait-prompt-display">${escapedPrompt}</pre>
      `;

      const promptFooterHtml = `
        <button class="terminal-btn" id="portrait-prompt-back">BACK</button>
        <button class="terminal-btn" id="portrait-prompt-copy">COPY PROMPT</button>
      `;

      // Transform modal to prompt view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalHeader) modalHeader.innerHTML = promptHeaderHtml;
        modalBody.innerHTML = promptBodyHtml;
        if (modalFooter) modalFooter.innerHTML = promptFooterHtml;
      });

      const backBtn = document.getElementById('portrait-prompt-back');
      const copyBtn = document.getElementById('portrait-prompt-copy');

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
            console.error('PortraitUI.viewPrompt: failed to copy prompt', error);
            if (typeof window.showNotification === 'function') {
              window.showNotification('Could not copy prompt.');
            }
          }
        };
      }
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
          <button class="terminal-btn" id="portrait-delete-cancel">CANCEL</button>
          <button class="terminal-btn terminal-btn-primary" id="portrait-create-new">CREATE NEW</button>
        `;

        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = '[ Create a New Portrait? ]';
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
          Delete this saved portrait version? This cannot be undone.
        </p>
      `;

      const confirmationFooterHtml = `
        <button class="terminal-btn" id="portrait-delete-cancel">NO</button>
        <button class="terminal-btn terminal-btn-primary" id="portrait-delete-confirm">YES</button>
      `;

      // Transform modal to confirmation view
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = '[ Confirm Delete ]';
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
          const character = await CharacterStorage.getById(characterId);
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
                <li>• Save your current portrait as Version 1</li>
                <li>• Add the new portrait as Version 2</li>
                <li>• Enable portrait version switching</li>
              </ul>
            </div>`;
        }

        return `<p class="terminal-text-small terminal-text-dim portrait-history-callout">
              No saved portraits yet.<br><br>
              Generate a custom AI portrait to start building a history.
            </p>`;
      }

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

          const thumbHtml = `
            <div class="card-thumbnail">
              <div class="ascii-portrait portrait-history-preview" data-version-id="${v.id}"></div>
              ${
                hasImage
                  ? `<img src="${v.url}" alt="${title}" class="portrait-history-image is-hidden" data-version-id="${v.id}">`
                  : ''
              }
            </div>`;

          // Overflow menu for per-version actions (View, Prompt, Delete)
          const actionItems = [];

          if (hasImage) {
            actionItems.push(`
              <button
                class="selector-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); PortraitUI.toggleView('${v.id}')"
                data-toggle-version-id="${v.id}"
              >
                <span class="selector-option-icon">◉</span>
                <span class="selector-option-label">View original</span>
              </button>
            `);
          }

          if (hasPrompt) {
            actionItems.push(`
              <button
                class="selector-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); PortraitUI.viewPrompt('${characterId}', '${v.id}')"
                title="View this portrait's prompt"
              >
                <span class="selector-option-icon">✎</span>
                <span class="selector-option-label">View prompt</span>
              </button>
            `);
          }

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
              <div class="portrait-history-actions selector-shell">
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
          el.textContent = this.cropAsciiForThumbnail(v.ascii);
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

      const character = await CharacterStorage.getById(characterId);
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
        console.log('%c🎨 MANAGER PORTRAIT APPLY VERSION', 'color:#0ff;font-weight:bold;');
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
          asciiEl.textContent = version.ascii;
          if (
            window.CharacterSheet &&
            typeof CharacterSheet._centerPortraitScrollSafely === 'function'
          ) {
            CharacterSheet._centerPortraitScrollSafely(asciiEl);
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
        const thumbEl = document.getElementById(`card-thumb-${characterId}`);
        if (thumbEl && version.ascii) {
          try {
            if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
              thumbEl.textContent = UI.cropAsciiForThumbnail(version.ascii);
            } else {
              // Fallback: simple top-crop similar to CharacterSheet behavior
              const lines = version.ascii.split('\n');
              const topLines = lines.slice(0, 80).map((line) => line.slice(0, 160));
              thumbEl.textContent = topLines.join('\n');
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
      try {
        const nextCharacter = { ...character, ...updates };

        if (window.AppState) {
          if (Array.isArray(AppState.characters)) {
            const idx = AppState.characters.findIndex(
              (c) => c && c.id === characterId,
            );
            if (idx !== -1) {
              AppState.characters[idx] = nextCharacter;
            }
          }
          if (Array.isArray(AppState.filteredCharacters)) {
            const fIdx = AppState.filteredCharacters.findIndex(
              (c) => c && c.id === characterId,
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

    return `
      <div id="settingsModal" class="modal show" onclick="SettingsModal.close()">
        <div class="modal-content builder-settings-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <div class="modal-header-main">
              <h2 class="modal-title">[ ⚙ Settings ]</h2>
            </div>
            <button class="modal-close" onclick="SettingsModal.close()" aria-label="Close settings">&times;</button>
          </div>
          <div class="modal-body">
            <div class="settings-layout">
              <div class="settings-grid">
                <div class="settings-group">
                  <div class="settings-group-label">[ Builder ]</div>
                  <section class="settings-section">
                    <div class="settings-row-inline">
                      <div class="settings-inline-field">
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
                  <div class="settings-group-label">[ Image generation ]</div>
                  <section class="settings-section">
                    <div class="settings-row settings-row--stacked mb-lg">
                      <div class="settings-label">Style</div>
                      <div class="settings-field">
                        <div class="selector-shell selector-shell--match-width" style="width: 100%;">
                          <button
                            class="terminal-btn selector-trigger"
                            id="portrait-theme-select-trigger"
                            type="button"
                            aria-haspopup="listbox"
                            aria-expanded="false"
                            onclick="CharacterSheet.toggleSelectorMenu(this)"
                            style="width: 100%;"
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
                            style="width: 100%;"
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
                    <div class="settings-row mb-lg">
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

    // Save portrait prompt theme selection
    const portraitThemeSelect = document.getElementById('portrait-theme-select');
    if (
      portraitThemeSelect &&
      window.StorageService &&
      StorageService.setPortraitPromptTheme
    ) {
      StorageService.setPortraitPromptTheme(portraitThemeSelect.value);
    }

    // Use a non-intrusive toast for settings changes instead of a narrator line
    if (window.App && typeof App.showToast === 'function') {
      App.showToast('Settings saved');
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

    // Check URL for explicit resume parameter
    const urlParams = new URLSearchParams(window.location.search);
    const forceResume = urlParams.get('resume') === 'true';
    const forceNew = urlParams.get('new') === 'true';

    // Check for existing session to resume
    if (!forceNew && CharacterState.hasSession()) {
      const preview = CharacterState.getSessionPreview();
      
      if (forceResume) {
        // URL says resume - do it immediately
        await this._resumeSession();
        return;
      }
      
      // Show resume prompt
      await this._showResumePrompt(preview);
      return;
    }

    // Start fresh
    await this._startNewCharacter();
  },

  // Resume from saved session
  async _resumeSession() {
    console.log('Resuming character builder session...');
    const resumeQuestionId = CharacterState.restoreSession();
    OptionVariationsCache.reset(); // Clear variation cache (may regenerate)
    this._lastPortraitArt = null;
    
    // Update character panel with restored data
    this.updateCharacterPanel(CharacterState.get().character);
    
    // Show a brief "resuming" message then continue
    const narratorPanel = document.getElementById('narrator-panel');
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    const messageEl = narratorPanel.lastElementChild.querySelector('.narrator-text');
    await Utils.typewriter(messageEl, '> SESSION RESTORED. Let\'s continue where we left off...');
    Utils.scrollToBottom(true);
    await Utils.sleep(1000);
    
    // Jump to the question we were on
    await this.showQuestion(resumeQuestionId || 'intro');
  },

  // Start a brand new character
  async _startNewCharacter() {
    CharacterState.reset();
    OptionVariationsCache.reset();
    this._lastPortraitArt = null;
    await this.showQuestion('intro');
  },

  // Show modal asking user if they want to resume
  async _showResumePrompt(preview) {
    const modal = document.getElementById('sessionResumeModal');
    const timeStampEl = document.getElementById('sessionTimeStamp');
    const resumeBtn = document.getElementById('sessionResumeBtn');
    const discardBtn = document.getElementById('sessionDiscardBtn');
    
    // Format the time if available
    let timeNote = '';
    if (preview.savedAt) {
      const savedDate = new Date(preview.savedAt);
      const now = new Date();
      const diffMs = now - savedDate;
      const diffMins = Math.floor(diffMs / 60000);
      const diffHours = Math.floor(diffMs / 3600000);
      
      if (diffMins < 1) {
        timeNote = 'saved moments ago';
      } else if (diffMins < 60) {
        timeNote = `saved ${diffMins}m ago`;
      } else if (diffHours < 24) {
        timeNote = `saved ${diffHours}h ago`;
      } else {
        timeNote = `saved ${savedDate.toLocaleDateString()}`;
      }
    }

    // Update timestamp in header
    timeStampEl.textContent = timeNote;
    
    // Show the modal
    modal.classList.add('show');
    
    // Handle button clicks
    return new Promise((resolve) => {
      const handleResume = async () => {
        cleanup();
        modal.classList.remove('show');
        await this._resumeSession();
        resolve();
      };
      
      const handleDiscard = async () => {
        cleanup();
        modal.classList.remove('show');
        CharacterState.clearSession();
        await this._startNewCharacter();
        resolve();
      };
      
      const cleanup = () => {
        resumeBtn.removeEventListener('click', handleResume);
        discardBtn.removeEventListener('click', handleDiscard);
      };
      
      resumeBtn.addEventListener('click', handleResume);
      discardBtn.addEventListener('click', handleDiscard);
    });
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
    // Track current question for session persistence
    CharacterState.setCurrentQuestion(questionId);
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
          // at least as wide as the trigger, and constrained to the viewport
          // with internal scrolling if it can't fully fit on-screen.
          const shell =
            trigger.closest('.selector-shell') || trigger.parentElement;
          if (shell) {
            const shellRect = shell.getBoundingClientRect();
            const triggerRect = trigger.getBoundingClientRect();

            // Measure menu size without affecting final animation. Temporarily
            // neutralize transforms so we get the full height instead of the
            // scaled (collapsed) height from CSS. Also clear any previous
            // inline sizing so each open starts from a clean baseline.
            const prevDisplay = listbox.style.display;
            const prevVisibility = listbox.style.visibility;
            const prevTransform = listbox.style.transform;

            listbox.style.maxHeight = '';
            listbox.style.overflowY = '';
            listbox.style.position = 'fixed';
            listbox.style.top = '0';
            listbox.style.left = '0';
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
            const padding = 8; // breathing room from edges
            const gapY = 4; // small gap between trigger and menu when opening below

            // Treat the nearest terminal frame/container as the visual "viewport"
            // so the listbox never extends outside the green app frame.
            const host =
              trigger.closest('.terminal-frame, .terminal-container') ||
              document.documentElement;
            const hostRect = host.getBoundingClientRect();
            const hostTop = hostRect.top + padding;
            const hostBottom = hostRect.bottom - padding;

            // Space available above and below the trigger within the host.
            const spaceAbove = triggerRect.top - hostTop;
            const spaceBelow = hostBottom - triggerRect.bottom;

            const fitsBelow = spaceBelow >= menuHeight + gapY;
            const fitsAbove = spaceAbove >= menuHeight + gapY;

            // Choose direction: prefer below when possible, but fall back to
            // whichever side has room, similar to the shared selector menus.
            const triggerCenterY = triggerRect.top + triggerRect.height / 2;
            const inTopHalf = triggerCenterY < viewportHeight / 2;

            let openBelow;
            if (fitsBelow && fitsAbove) {
              openBelow = inTopHalf;
            } else if (fitsBelow) {
              openBelow = true;
            } else if (fitsAbove) {
              openBelow = false;
            } else {
              // Neither direction fits perfectly: use the side with more space.
              openBelow = spaceBelow >= spaceAbove;
            }

            // Position using a single top coordinate, clamped so the menu stays
            // fully inside the host. If there's not enough room for full height,
            // we'll cap height and enable internal scrolling.
            const maxTop = hostBottom - menuHeight;
            let topInViewport;

            if (openBelow) {
              topInViewport = triggerRect.bottom + gapY;
              if (topInViewport > maxTop) {
                topInViewport = Math.max(hostTop, maxTop);
              }
            } else {
              topInViewport = triggerRect.top - gapY - menuHeight;
              if (topInViewport < hostTop) {
                topInViewport = hostTop;
              }
            }

            // If the menu would extend past the host, cap its height so it scrolls
            // instead of being clipped by the terminal container.
            const availableHeight = hostBottom - topInViewport;
            if (menuHeight > availableHeight && availableHeight > 0) {
              listbox.style.maxHeight = `${availableHeight}px`;
              listbox.style.overflowY = 'auto';
            } else {
              listbox.style.maxHeight = '';
              listbox.style.overflowY = '';
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
   * Stop the portrait loading animation interval.
   */
  _stopPortraitLoadingAnimation() {
    if (this._portraitLoadingInterval) {
      clearInterval(this._portraitLoadingInterval);
      this._portraitLoadingInterval = null;
    }
    this._portraitElapsed = 0;
  },

  /**
   * Render the standard AI portrait loading state in the portrait panel.
   * Uses the glowing, fast-spinning cube plus animated dots matching
   * the manager view and shared PortraitUI helper.
   */
  _renderPortraitGeneratingLoader(portraitEl) {
    if (!portraitEl) return;

    // Stop any existing animation interval before starting a new one.
    this._stopPortraitLoadingAnimation();

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

    // Use standardized message matching manager view.
    const baseMessage = 'Generating character art';
    
    // Model-aware subtext: GPT Image 1 takes longer than DALL·E 3.
    let subtext = '(This usually takes 20–30 seconds)';
    try {
      if (
        window.PortraitUI &&
        typeof PortraitUI.getImageModelSubtext === 'function'
      ) {
        subtext = PortraitUI.getImageModelSubtext();
      } else {
        // Inline fallback if PortraitUI not available.
        let imageModel = 'dall-e-3';
        if (window.StorageService && typeof StorageService.getImageModel === 'function') {
          imageModel = StorageService.getImageModel();
        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
          imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
        }
        if (imageModel === 'gpt-image-1') {
          subtext = '(This can take up to a minute)';
        }
      }
    } catch (e) {
      // Fall back to default subtext on any error.
    }

    // Initialize elapsed counter for dot animation.
    this._portraitElapsed = 0;

    // Update function that animates the dots (cycles 1→2→3).
    const updatePortraitLoading = () => {
      if (!portraitEl) return;
      const dotCount = (this._portraitElapsed % 3) + 1;

      if (
        window.PortraitUI &&
        typeof PortraitUI.renderGeneratingLoader === 'function'
      ) {
        PortraitUI.renderGeneratingLoader(portraitEl, {
          baseMessage,
          subtext,
          dotCount,
          isLoading: true,
        });
      } else {
        // Fallback: update dot state manually if shared helper unavailable.
        // Check for the generating-specific class to know if loader is already rendered.
        let cubeEl = portraitEl.querySelector('.portrait-placeholder-cube--generating');
        let textEl = portraitEl.querySelector('.portrait-placeholder-text');
        if (!cubeEl) {
          // Loader not yet rendered - replace the placeholder with loader HTML
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
        } else if (textEl) {
          // Loader already rendered - just update dot count
          textEl.setAttribute('data-dots', String(dotCount));
        }
      }

      this._portraitElapsed++;
    };

    // Render immediately, then start interval for animation.
    updatePortraitLoading();
    this._portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
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

        // Get the current style theme for tagging
        let guidedStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            guidedStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
        }

        const updatedMetadata =
          window.PortraitHistory && typeof PortraitHistory.addVersion === 'function'
            ? PortraitHistory.addVersion(
                character,
                result.asciiArt,
                result.imageUrl || null,
                {
                  source: 'guided-auto',
                  prompt:
                    (AIService.buildPortraitPrompt &&
                      AIService.buildPortraitPrompt(character)) ||
                    null,
                  style: guidedStyle,
                },
              )
            : character.portraitMetadata || {};

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
      
      // Stop the animated dots interval.
      this._stopPortraitLoadingAnimation();
      
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

            // Overflow menu for per-version actions (View, Prompt, Delete)
            const actionItems = [];

            if (hasImage) {
              actionItems.push(`
                <button
                  class="selector-option"
                  type="button"
                  role="menuitem"
                  onclick="event.stopPropagation(); App.togglePortraitHistoryView('${v.id}')"
                  data-toggle-version-id="${v.id}"
                >
                  <span class="selector-option-icon">◉</span>
                  <span class="selector-option-label">View original</span>
                </button>
              `);
            }

            if (hasPrompt) {
              actionItems.push(`
                <button
                  class="selector-option"
                  type="button"
                  role="menuitem"
                  onclick="event.stopPropagation(); App.viewPortraitPrompt('${v.id}')"
                  title="View this portrait's prompt"
                >
                  <span class="selector-option-icon">✎</span>
                  <span class="selector-option-label">View prompt</span>
                </button>
              `);
            }

            actionItems.push(`
              <button
                class="selector-option portrait-history-delete-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); App.deletePortraitVersion('${v.id}')"
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
                <div class="portrait-history-actions selector-shell">
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
            }" data-version-id="${v.id}" onclick="App.selectPortraitHistoryCard('${
              v.id
            }')">
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
            <h2 class="modal-title">[ Portrait History ]</h2>
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

    // If this is the only portrait, show "create new" prompt instead of delete confirmation
    if (versions.length === 1) {
      const createNewBodyHtml = `
        <p class="terminal-text">
          To delete this portrait, create a new one first.
        </p>
      `;

      const createNewFooterHtml = `
        <button class="terminal-btn" id="portrait-delete-cancel">CANCEL</button>
        <button class="terminal-btn terminal-btn-primary" id="portrait-create-new">CREATE NEW</button>
      `;

      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalTitle) modalTitle.textContent = '[ Create a New Portrait? ]';
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
          if (Array.isArray(versions) && versions.length > 0 &&
              window.PortraitHistory &&
              typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
            PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
              this.cropAsciiForThumbnail(ascii),
            );
          }

          const cards = this.getPortraitHistoryCards();
          if (cards.length > 0) {
            this._portraitHistoryFocusIndex = 0;
            this.updatePortraitHistoryFocus();
          }
        };
      }

      if (createNewBtn) {
        createNewBtn.onclick = () => {
          this.closePortraitHistory();
          this.generateCustomAIPortrait();
        };
      }

      return;
    }

    // Build the confirmation view using standard modal structure
    const confirmationBodyHtml = `
      <p class="terminal-text">
        Delete this saved portrait version? This cannot be undone.
      </p>
    `;

    const confirmationFooterHtml = `
      <button class="terminal-btn" id="portrait-delete-cancel">NO</button>
      <button class="terminal-btn terminal-btn-primary" id="portrait-delete-confirm">YES</button>
    `;

    // Transform modal to confirmation view
    this._animateModalContentResize('portraitHistoryModal', () => {
      if (modalTitle) modalTitle.textContent = '[ Confirm Delete ]';
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

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
    };

    if (cancelBtn) {
      cancelBtn.onclick = restoreOriginal;
    }

    if (confirmBtn) {
      confirmBtn.onclick = async () => {
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

        // If no remaining versions, close the modal entirely
        if (!remaining.length) {
          this.closePortraitHistory();
          return;
        }

        // Rebuild normalized metadata from the latest state
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

        // Transform back to history view with updated content
        this._animateModalContentResize('portraitHistoryModal', () => {
          if (modalTitle) modalTitle.textContent = originalTitle;
          modalBody.innerHTML = this._buildPortraitHistoryBody(latestNormalized);
          if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
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
    }
  },

  viewPortraitPrompt(versionId) {
    const state = CharacterState.get();
    const character = state.character || {};
    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version || !version.prompt) {
      this.showToast('No saved prompt for this portrait.');
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

    // Build style label for header - format to sentence case
    const rawStyle = version.style || 'default';
    const formatStyleLabel = (str) => {
      if (!str) return 'Default';
      // Replace dashes/underscores with spaces
      let cleaned = str.replace(/[-_]/g, ' ');
      // Sentence case: capitalize first letter, lowercase the rest
      if (cleaned.length > 0) {
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1).toLowerCase();
      }
      return cleaned;
    };
    const styleLabel = formatStyleLabel(rawStyle);

    // Escape prompt text for safe display
    const escapedPrompt = (version.prompt || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const promptHeaderHtml = `
      <h2 class="modal-title">[ Portrait Prompt ]</h2>
      <span class="portrait-prompt-style-label">Style: ${styleLabel}</span>
      <button class="modal-close" onclick="App.closePortraitHistory()">&times;</button>
    `;

    const promptBodyHtml = `
      <pre class="terminal-text portrait-prompt-display">${escapedPrompt}</pre>
    `;

    const promptFooterHtml = `
      <button class="terminal-btn" id="portrait-prompt-back">BACK</button>
      <button class="terminal-btn" id="portrait-prompt-copy">COPY PROMPT</button>
    `;

    // Transform modal to prompt view
    this._animateModalContentResize('portraitHistoryModal', () => {
      if (modalHeader) modalHeader.innerHTML = promptHeaderHtml;
      modalBody.innerHTML = promptBodyHtml;
      if (modalFooter) modalFooter.innerHTML = promptFooterHtml;
    });

    const backBtn = document.getElementById('portrait-prompt-back');
    const copyBtn = document.getElementById('portrait-prompt-copy');

    const goBack = () => {
      this._animateModalContentResize('portraitHistoryModal', () => {
        if (modalHeader) modalHeader.innerHTML = originalHeaderHtml;
        modalBody.innerHTML = originalBodyHtml;
        if (modalFooter) modalFooter.innerHTML = originalFooterHtml;
      });

      // Re-populate ASCII previews after restoring
      if (Array.isArray(versions) && versions.length > 0 &&
          window.PortraitHistory &&
          typeof PortraitHistory.batchPopulateAsciiPreviews === 'function') {
        PortraitHistory.batchPopulateAsciiPreviews(versions, (ascii) =>
          this.cropAsciiForThumbnail(ascii),
        );
      }

      const cards = this.getPortraitHistoryCards();
      if (cards.length > 0) {
        this._portraitHistoryFocusIndex = 0;
        this.updatePortraitHistoryFocus();
      }
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
          this.showToast('Prompt copied.');
        } catch (error) {
          console.error('Failed to copy portrait prompt:', error);
          this.showToast('Could not copy prompt.', 5000);
        }
      };
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
            <h2 class="modal-title">[ ★ Customize AI Portrait ]</h2>
            <button class="modal-close" onclick="App.closePromptModal(false)">&times;</button>
          </div>
          <div class="modal-body">
            <textarea
              class="terminal-textarea terminal-input"
              id="custom-prompt"
              rows="12"
            >${defaultPrompt}</textarea>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="App.surpriseMePortrait()">SURPRISE ME</button>
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

      let portraitViewMode = 'original';
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
      // Use shared pose + camera data from PortraitPoseData module
      const character = CharacterState.get().character || {};
      const classKey = (character.class || 'default').toLowerCase();

      const { pose: posePrompt, camera: cameraPrompt } =
        window.PortraitPoseData && typeof PortraitPoseData.getRandomPoseAndCamera === 'function'
          ? PortraitPoseData.getRandomPoseAndCamera(classKey)
          : {
              pose: 'standing in a relaxed but heroic stance',
              camera: 'Camera angle: three-quarter view that clearly shows the full silhouette.',
            };

      let renderingInstructions;
      if (
        typeof window !== 'undefined' &&
        window.PortraitPrompt &&
        typeof window.PortraitPrompt.buildCustomPortraitInstructions ===
          'function'
      ) {
        // Shared helper so builder + manager use the exact same STYLE / Scene
        // logic (including admin-defined prompt styles) for custom prompts.
        let promptThemeId = null;
        try {
          if (
            typeof window !== 'undefined' &&
            window.StorageService &&
            typeof window.StorageService.getPortraitPromptTheme === 'function'
          ) {
            promptThemeId = window.StorageService.getPortraitPromptTheme();
          } else if (
            typeof CONFIG !== 'undefined' &&
            CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME
          ) {
            promptThemeId = CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME;
          }
        } catch (e) {
          // Non-fatal: fall back to default theme behavior below.
        }

        renderingInstructions =
          window.PortraitPrompt.buildCustomPortraitInstructions({
            posePrompt,
            cameraPrompt,
            themeId: promptThemeId,
          });
      } else {
        // Fallback if PortraitPrompt is not loaded for some reason.
        // Note: Camera temporarily disabled - may interfere with pose
        renderingInstructions = [
          'Create a high-contrast black-and-white fantasy illustration.',
          'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
          'Include some controlled, directional hatching to define form (light mid-tone texture only).',
          `Pose: ${posePrompt}`,
          // cameraPrompt,
          'Background should be simple, entirely black, and free of symbols or text.',
          'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
          'Aspect ratio 3:4.',
        ];
      }
      
      // Combine character description with rendering instructions.
      // Character info comes first, then style/pose/camera instructions.
      // The backend has a 4000 character limit on prompts, so we need to truncate
      // if necessary. Prioritize keeping the character description (customPrompt)
      // and trim style instructions if we exceed the limit.
      const MAX_PROMPT_LENGTH = 3900; // Leave some margin below the 4000 limit
      let fullPrompt = [customPrompt, ...renderingInstructions].join(' ');
      
      if (fullPrompt.length > MAX_PROMPT_LENGTH) {
        console.warn(`Portrait prompt exceeds ${MAX_PROMPT_LENGTH} chars (${fullPrompt.length}), truncating...`);
        // Try to keep the custom prompt intact and reduce style instructions
        const styleInstructionsText = renderingInstructions.join(' ');
        const availableForStyle = MAX_PROMPT_LENGTH - customPrompt.length - 50; // 50 chars buffer
        
        if (availableForStyle > 200) {
          // We have room for some style instructions
          const truncatedStyle = styleInstructionsText.substring(0, availableForStyle);
          fullPrompt = truncatedStyle + ' ' + customPrompt;
        } else {
          // Not much room - just use the custom prompt with minimal style
          const minimalStyle = 'High-contrast black-and-white fantasy ink illustration.';
          fullPrompt = minimalStyle + ' ' + customPrompt.substring(0, MAX_PROMPT_LENGTH - minimalStyle.length - 1);
        }
        console.log(`Truncated prompt length: ${fullPrompt.length}`);
      }
      
      // Generate custom portrait with full prompt (including hidden rendering instructions)
      const result =
        await AsciiArtService.generateCustomAIPortraitWithPrompt(
          fullPrompt,
        );

      // Store both the original image URL and custom ASCII art in character state
      // Also increment the custom portrait counter and append to portrait history
      const current = CharacterState.get().character;
      const currentCount = current.customPortraitCount || 0;

      // Get the current style theme for tagging
      let currentStyle = null;
      try {
        if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
          currentStyle = StorageService.getPortraitPromptTheme();
        }
      } catch (e) {
        // Non-fatal
      }

      const updatedMetadata = window.PortraitHistory
        ? window.PortraitHistory.addVersion(
            current,
            result.asciiArt,
            result.imageUrl,
            {
              source: 'custom-ai',
              prompt: fullPrompt,
              style: currentStyle,
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
        // Stop the animated dots interval and restore portrait font size back
        // to ASCII default; the sheet will re-render for the newly generated art.
        this._stopPortraitLoadingAnimation();
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

  // "Surprise Me" - generate a fresh randomized prompt and immediately generate portrait
  async surpriseMePortrait() {
    const state = CharacterState.get();
    const character = state && state.character ? state.character : {};

    if (!character.race || !character.class) {
      this.showSystemMessage('Select a race and class first.');
      return;
    }

    // Build a fresh randomized character description for the user to edit.
    // NOTE: Use buildCharacterDescription (not buildPortraitPrompt) so that
    // rendering instructions (Pose/Camera/STYLE/Scene) are only added once
    // by confirmPromptModal, avoiding duplication in the final prompt.
    let templatePrompt = '';
    try {
      if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
        templatePrompt = AIService.buildCharacterDescription(character);
      } else {
        templatePrompt = `${character.race} ${character.class}`;
      }
    } catch (e) {
      templatePrompt = `${character.race} ${character.class}`;
    }

    // Update the prompt input field so user can see what was generated
    const promptInput = document.getElementById('custom-prompt');
    if (promptInput) {
      promptInput.value = templatePrompt;
    }

    // Immediately trigger generation with the new prompt
    await this.confirmPromptModal();
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

      // Clear the in-progress session since character is now saved
      CharacterState.clearSession();

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
  showToast(rawMessage, duration = 4000) {
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

      // Auto-dismiss after specified duration (default 4s for success messages)
      App._toastTimeout = setTimeout(() => {
        toast.classList.remove('show');
        App._toastTimeout = null;
      }, duration);
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
            <h2 class="modal-title">[ Change Character Level ]</h2>
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
            <h2 class="modal-title">[ Change Character Name ]</h2>
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

      // Wait for DOM to update before trying to render the loader.
      // The character sheet may not exist yet if state changes are still pending.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      let portraitEl = document.getElementById('character-portrait');

      // Retry a few times if the element doesn't exist yet (DOM may still be updating)
      if (!portraitEl) {
        for (let i = 0; i < 5 && !portraitEl; i++) {
          await Utils.sleep(100);
          portraitEl = document.getElementById('character-portrait');
        }
      }

      // Show a loading state in the portrait panel while the AI image
      // is being generated and converted to ASCII. Use the placeholder container
      // with the cube spinning faster and glowing.
      if (portraitEl) {
        this._renderPortraitGeneratingLoader(portraitEl);
      }

      const result = await AsciiArtService.generateCustomAIPortrait(currentChar);

      if (result && result.asciiArt) {
        const currentCount = currentChar.customPortraitCount || 0;

        // Get the current style theme for tagging
        let quickStyle = null;
        try {
          if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
            quickStyle = StorageService.getPortraitPromptTheme();
          }
        } catch (e) {
          // Non-fatal
        }

        const updatedMetadata = window.PortraitHistory
          ? window.PortraitHistory.addVersion(
              currentChar,
              result.asciiArt,
              result.imageUrl || null,
              {
                source: 'quick-ai',
                prompt:
                  (AIService.buildPortraitPrompt &&
                    AIService.buildPortraitPrompt(currentChar)) ||
                  null,
                style: quickStyle,
              },
            )
          : currentChar.portraitMetadata || {};

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
      // Whatever happens above (success or failure), stop the animated dots
      // and restore portrait font size so the ASCII art uses CSS defaults.
      this._stopPortraitLoadingAnimation();
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

    // Try to auto-generate name + backstory in a SINGLE API call
    // (uses the combined /characters/summary endpoint to save rate limit)
    let name = '';
    let backstory = '';
    
    // Show thinking message for name + backstory generation
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const thinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    this.showProgressiveThinking(thinkingEl);
    
    try {
      // Build a temporary character object for the summary call
      const tempChar = {
        race: race.id,
        class: cls.id,
        background: background.id,
        alignment: alignment.id,
      };
      const summary = await AIService.generateCharacterSummary(tempChar, { nameCount: 3 });
      
      // Pick a random name from suggestions
      if (summary && Array.isArray(summary.names) && summary.names.length) {
        name = Utils.randomChoice(summary.names);
      }
      
      // Substitute {{NAME}} in the backstory template
      if (summary && summary.backstoryTemplate) {
        backstory = summary.backstoryTemplate.replace(/\{\{NAME\}\}/g, name || 'The adventurer');
      }
    } catch (e) {
      // Ignore AI errors; we'll fall back below
      console.error('Quick create summary error:', e);
    }
    
    // Stop thinking and remove the message
    this.stopProgressiveThinking();
    thinkingEl.parentElement.remove();

    // Fallback name if AI failed
    if (!name) {
      const fallbackNames = [
        'Ashen Vale',
        'Rin Thorn',
        'Kael Brightwind',
        'Lyra Nightbloom',
      ];
      name = Utils.randomChoice(fallbackNames);
    }
    
    // Fallback backstory if AI failed
    if (!backstory) {
      backstory =
        'A mysterious past, a questionable present, and a future that depends entirely on your dice.';
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
      backstory,
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

    // Start generating AI portrait in background now (runs while backstory displays)
    // IMPORTANT: Render the loader immediately (synchronously) before starting async generation
    // to avoid race conditions where state updates overwrite the loader.
    const portraitEl = document.getElementById('character-portrait');
    if (portraitEl) {
      this._renderPortraitGeneratingLoader(portraitEl);
    }
    this._quickCreatePortraitGeneration = this._generateQuickCreatePortrait();

    // Show thinking message for backstory (just displaying, no API call needed)
    narratorPanel.insertAdjacentHTML(
      'beforeend',
      Components.renderNarratorMessage(''),
    );
    Utils.scrollToBottom(true);
    const backstoryThinkingEl =
      narratorPanel.lastElementChild.querySelector('.narrator-text');
    
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
            <h2 class="modal-title">[ Confirm ]</h2>
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
        // Only capture HTML if it's actually the loader (has the --generating class on the cube)
        const hasLoaderRendered = portraitNode && 
          portraitNode.querySelector('.portrait-placeholder-cube--generating');
        const currentPortraitHTML = isGenerating && hasLoaderRendered
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
        
        // Restore the generating state if we captured it, OR render it fresh
        // if we're generating but don't have captured HTML (first render after
        // generation started). This ensures the loader shows even if the sheet
        // is rendered for the first time after portrait generation began.
        if (isGenerating && portraitEl) {
          if (currentPortraitHTML) {
            // Restore previously captured loader HTML
            portraitEl.innerHTML = currentPortraitHTML;
          } else {
            // First render after generation started - render loader fresh
            this._renderPortraitGeneratingLoader(portraitEl);
          }
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
    const charsPerFrame = 40; // Type multiple characters per frame for speed
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
        window.location.href = '../index.html?from=builder';
      },
      () => {
        // User clicked "DISCARD" (secondary button) - exit without saving
        window.suppressBeforeunloadWarning();
        window.location.href = '../index.html?from=builder';
      },
      {
        primaryLabel: 'SAVE',
        secondaryLabel: 'DISCARD'
      }
    );
  } else {
    // Character is already saved or incomplete; immediately exit
    window.suppressBeforeunloadWarning();
    window.location.href = '../index.html?from=builder';
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
