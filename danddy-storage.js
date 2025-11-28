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





