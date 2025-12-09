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


