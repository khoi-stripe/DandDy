// ========================================
// KEYBOARD NAVIGATION
// ========================================
const KeyboardNav = {
    currentFocusIndex: 0,
    isActive: true,
    mode: 'cards', // 'cards' or 'form'

    getCharacterCards() {
        return Array.from(document.querySelectorAll('.character-card'));
    },

    getFocusableElements() {
        // Return all focusable elements in the left panel
        return Array.from(document.querySelectorAll(
            '#searchInput, #sortBy, .character-card, #importBtn, #newCharacterBtn'
        ));
    },

    getCurrentlyFocusedElement() {
        return document.activeElement;
    },

    isInFormElement() {
        const activeEl = this.getCurrentlyFocusedElement();
        return activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT' ||
            activeEl.tagName === 'BUTTON'
        );
    },

    /**
     * Update visual keyboard focus on the grid.
     * @param {boolean} skipSheetUpdate - when true, do NOT update the character sheet.
     *                                    Used when focus is being synced from a sheet change
     *                                    (e.g. mouse click) to avoid recursion.
     */
    updateFocus(skipSheetUpdate = false) {
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Remove focus from all cards (immediate change)
        cards.forEach((card) => {
            card.classList.remove('is-keyboard-focused');
        });

        // Add focus to current index
        if (cards[this.currentFocusIndex]) {
            const focusedCard = cards[this.currentFocusIndex];
            focusedCard.classList.add('is-keyboard-focused');

            // When keyboard focus moves, treat that as "viewing" the character.
            // This keeps the right-hand character sheet in sync with the focused card.
            if (!skipSheetUpdate) {
                const id = focusedCard.getAttribute('data-id');
                if (id) {
                    // Avoid re-triggering keyboard focus sync inside viewCharacter
                    viewCharacter(id, { fromKeyboard: true, skipKeyboardSync: true });
                }
            }

            // Scroll into view
            focusedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
                inline: 'nearest',
            });
        }
    },

    moveUp() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move up by 3 (grid columns)
        this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 3);
        this.updateFocus();
    },

    moveDown() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move down by 3 (grid columns)
        this.currentFocusIndex = Math.min(cards.length - 1, this.currentFocusIndex + 3);
        this.updateFocus();
    },

    moveLeft() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move left, don't wrap
        this.currentFocusIndex = Math.max(0, this.currentFocusIndex - 1);
        this.updateFocus();
    },

    moveRight() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move right, don't wrap
        this.currentFocusIndex = Math.min(cards.length - 1, this.currentFocusIndex + 1);
        this.updateFocus();
    },

    select() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        const card = cards[this.currentFocusIndex];
        if (card) {
            card.click();
        }
    },

    focusSearch() {
        const searchInput = document.getElementById('searchInput');
        if (searchInput) {
            searchInput.focus();
            searchInput.select();
        }
    },

    focusFirstCard() {
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;
        
        this.currentFocusIndex = 0;
        this.updateFocus();
        
        // Remove browser focus from form elements
        const activeEl = document.activeElement;
        if (activeEl && (
            activeEl.tagName === 'INPUT' ||
            activeEl.tagName === 'TEXTAREA' ||
            activeEl.tagName === 'SELECT'
        )) {
            activeEl.blur();
        }
    },

    reset() {
        this.currentFocusIndex = 0;
        this.updateFocus();
    },

    clearAll() {
        // Clear keyboard focus from all cards (used when mouse takes over)
        const cards = this.getCharacterCards();
        cards.forEach(card => card.classList.remove('is-keyboard-focused'));
    }
};

// ========================================
// HYBRID STORAGE SERVICE (Cloud + Local)
// ========================================
// Local sort metadata helper – tracks last-modified timestamps per character
// so "Date modified" sorting works even when the backend doesn't provide
// created/updated fields (or when running against older data).
const SortMeta = (window.SortMeta = {
    KEY: 'dnd_character_sort_meta',
    _cache: null,

    _load() {
        if (!this._cache) {
            try {
                const raw = localStorage.getItem(this.KEY);
                this._cache = raw ? JSON.parse(raw) : {};
            } catch (e) {
                console.warn('SortMeta: failed to parse cache', e);
                this._cache = {};
            }
        }
        return this._cache;
    },

    touch(id) {
        if (!id) return;
        const map = this._load();
        const now = new Date().toISOString();
        map[id] = { updatedAt: now };
        try {
            localStorage.setItem(this.KEY, JSON.stringify(map));
        } catch (e) {
            console.warn('SortMeta: failed to persist cache', e);
        }
        return now;
    },

    getUpdatedAt(id) {
        if (!id) return null;
        const map = this._load();
        return map[id]?.updatedAt || null;
    },
});
const CharacterStorage = {
    STORAGE_KEY: 'dnd_characters',
    
    // Check if user is authenticated and should use cloud
    useCloud() {
        return window.AuthService && window.AuthService.isAuthenticated();
    },

    // Get all characters (cloud or local)
    async getAll() {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.getAll();
            } catch (error) {
                console.error('☁️ Cloud fetch failed, falling back to local:', error);
                showNotification('⚠️ Cloud sync failed. Showing local data.');
                return this._getLocalAll();
            }
        }
        return this._getLocalAll();
    },

    // Get single character by ID
    async getById(id) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.getById(id);
            } catch (error) {
                console.error('☁️ Cloud fetch failed, falling back to local:', error);
                return this._getLocalById(id);
            }
        }
        return this._getLocalById(id);
    },

    // Add new character
    async add(character) {
        if (this.useCloud()) {
            try {
                const created = await window.CharacterCloudStorage.add(character);
                if (created && created.id) {
                    SortMeta.touch(String(created.id));
                }
                return created;
            } catch (error) {
                console.error('☁️ Cloud add failed:', error);
                showNotification('❌ Failed to save to cloud. Please try again.');
                throw error;
            }
        }
        const created = this._localAdd(character);
        if (created && created.id) {
            SortMeta.touch(String(created.id));
        }
        return created;
    },

    // Update existing character
    async update(id, updates) {
        const idStr = String(id);
        if (this.useCloud()) {
            // Guard against invalid cloud IDs (e.g. "null", "undefined", or local-only IDs)
            const isInvalidCloudId =
                !idStr ||
                idStr === 'null' ||
                idStr === 'undefined' ||
                idStr.startsWith('local_');

            if (isInvalidCloudId) {
                console.warn(
                    '⚠️ Skipping cloud update for character with invalid id; falling back to local update:',
                    id,
                );
                const updatedLocal = this._localUpdate(id, updates);
                if (updatedLocal && updatedLocal.id) {
                    SortMeta.touch(String(updatedLocal.id));
                }
                return updatedLocal;
            }

            try {
                const updated = await window.CharacterCloudStorage.update(id, updates);
                if (updated && updated.id) {
                    SortMeta.touch(String(updated.id));
                } else {
                    SortMeta.touch(idStr);
                }
                return updated;
            } catch (error) {
                console.error('☁️ Cloud update failed:', error);
                showNotification('❌ Failed to update in cloud. Please try again.');
                throw error;
            }
        }
        const updatedLocal = this._localUpdate(id, updates);
        if (updatedLocal && updatedLocal.id) {
            SortMeta.touch(String(updatedLocal.id));
        } else {
            SortMeta.touch(idStr);
        }
        return updatedLocal;
    },

    // Delete character
    async delete(id) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.delete(id);
            } catch (error) {
                console.error('☁️ Cloud delete failed:', error);
                showNotification('❌ Failed to delete from cloud. Please try again.');
                throw error;
            }
        }
        return this._localDelete(id);
    },

    // Duplicate character
    async duplicate(id) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.duplicate(id);
            } catch (error) {
                console.error('☁️ Cloud duplicate failed:', error);
                showNotification('❌ Failed to duplicate in cloud. Please try again.');
                throw error;
            }
        }
        return this._localDuplicate(id);
    },

    // Export character as JSON
    async export(id) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.export(id);
            } catch (error) {
                console.error('☁️ Cloud export failed:', error);
                const character = this._getLocalById(id);
                return character ? JSON.stringify(character, null, 2) : null;
            }
        }
        const character = this._getLocalById(id);
        return character ? JSON.stringify(character, null, 2) : null;
    },

    // Import character from JSON
    async import(jsonString) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.import(jsonString);
            } catch (error) {
                console.error('☁️ Cloud import failed:', error);
                showNotification('❌ Failed to import to cloud. Please try again.');
                return null;
            }
        }
        return this._localImport(jsonString);
    },

    // Generate unique ID
    generateId() {
        return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // ========================================
    // LOCAL STORAGE IMPLEMENTATIONS (Fallback)
    // ========================================

    _getLocalAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        const characters = data ? JSON.parse(data) : [];
        console.log('💾 LOCAL.GETALL: Retrieved', characters.length, 'characters from localStorage');

        // Normalize timestamps so we can reliably sort by recency.
        // Older builder-saved characters may not have createdAt/updatedAt.
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

        characters.forEach((char, index) => {
            if (!char.createdAt) {
                // Treat characters without timestamps as *newer* than anything
                // we've seen so far so they float to the top of the grid.
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
            // Persist normalized timestamps so future loads are consistent.
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
        }

        return characters;
    },

    _getLocalById(id) {
        const characters = this._getLocalAll();
        return characters.find(char => char.id === id);
    },

    _localSaveAll(characters) {
        console.log('💾 LOCAL.SAVEALL: Saving', characters.length, 'characters to localStorage');
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
    },

    _localAdd(character) {
        console.log('💾 LOCAL.ADD: Adding character:', character.name);
        const characters = this._getLocalAll();
        character.id = this.generateId();
        character.createdAt = new Date().toISOString();
        character.updatedAt = new Date().toISOString();
        characters.push(character);
        this._localSaveAll(characters);
        console.log('💾 LOCAL.ADD: Character added with ID:', character.id);
        return character;
    },

    _localUpdate(id, updates) {
        const characters = this._getLocalAll();
        const index = characters.findIndex(char => char.id === id);
        if (index !== -1) {
            characters[index] = {
                ...characters[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this._localSaveAll(characters);
            return characters[index];
        }
        return null;
    },

    _localDelete(id) {
        console.log('🗑️ LOCAL.DELETE: Deleting character with ID:', id);
        const characters = this._getLocalAll();
        const filtered = characters.filter(char => char.id !== id);
        this._localSaveAll(filtered);
        return filtered.length < characters.length;
    },

    _localDuplicate(id) {
        const character = this._getLocalById(id);
        if (!character) return null;
        
        const duplicate = {
            ...character,
            name: `${character.name} (Copy)`,
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const characters = this._getLocalAll();
        characters.push(duplicate);
        this._localSaveAll(characters);
        return duplicate;
    },

    _localImport(jsonString) {
        try {
            console.log('📥 LOCAL.IMPORT: Starting import...');
            const character = JSON.parse(jsonString);
            console.log('📥 LOCAL.IMPORT: Parsed character:', character.name);

            const existing = this._getLocalAll();
            const importedUid = character.metadata?.characterUid || character.characterUid || null;

            if (importedUid) {
                const uidMatches = existing.filter(
                    c => c.metadata?.characterUid === importedUid || c.characterUid === importedUid
                );

                if (uidMatches.length > 0) {
                    const match = uidMatches[0];
                    return {
                        isDuplicate: true,
                        reason: 'uid',
                        name: character.name || match.name,
                        existingIds: uidMatches.map(d => d.id),
                        characterUid: importedUid,
                        importedCharacter: character,
                    };
                }
            }

            delete character.id;
            const result = this._localAdd(character);
            console.log('📥 LOCAL.IMPORT: Added character with new ID:', result.id);
            return result;
        } catch (error) {
            console.error('Local import error:', error);
            return null;
        }
    }
};

// ========================================
// APP STATE
// ========================================
const AppState = {
    characters: [],
    filteredCharacters: [],
    searchTerm: '',
    sortMode: 'dateModified', // 'alphabetical' | 'dateModified'
    loading: false,

    async init() {
        await this.loadCharacters();
    },

    async loadCharacters() {
        try {
            this.loading = true;
            this.characters = await CharacterStorage.getAll();
            console.log('📚 LOAD: Loaded', this.characters.length, 'characters from storage');
            console.log('📚 LOAD: Full character list with IDs:');
            this.characters.forEach((c, i) => {
                console.log(`  ${i+1}. ${c.name} (ID: ${c.id})`);
            });
            const names = this.characters.map(c => c.name);
            const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
            if (duplicates.length > 0) {
                console.warn('⚠️ DUPLICATE NAMES DETECTED:', duplicates);
                duplicates.forEach(dupName => {
                    const matches = this.characters.filter(c => c.name === dupName);
                    console.warn(`  "${dupName}" appears ${matches.length} times with IDs:`, matches.map(m => m.id));
                });
            }
            this.applyFilters();
            this.loading = false;
            UI.render(); // Re-render after characters load
        } catch (error) {
            console.error('Failed to load characters:', error);
            this.loading = false;
            showNotification('❌ Failed to load characters');
            UI.render(); // Render empty state on error
        }
    },

    applyFilters() {
        let filtered = [...this.characters];

        // Search filter
        if (this.searchTerm) {
            const search = this.searchTerm.toLowerCase();
            filtered = filtered.filter(char => 
                char.name?.toLowerCase().includes(search) ||
                char.class?.toLowerCase().includes(search) ||
                char.race?.toLowerCase().includes(search)
            );
        }

        // Sort according to current mode
        if (this.sortMode === 'alphabetical') {
            filtered.sort((a, b) => {
                const nameA = (a.name || '').toLowerCase();
                const nameB = (b.name || '').toLowerCase();
                if (nameA === nameB) {
                    return (a.id || '').toString().localeCompare((b.id || '').toString());
                }
                return nameA.localeCompare(nameB);
            });
        } else if (this.sortMode === 'dateModified') {
            // Sort by most recently modified, using local SortMeta when available
            filtered.sort((a, b) => {
                const aMeta = SortMeta.getUpdatedAt(a.id);
                const bMeta = SortMeta.getUpdatedAt(b.id);
                const aTime = new Date(aMeta || a.updatedAt || a.createdAt || 0).getTime();
                const bTime = new Date(bMeta || b.updatedAt || b.createdAt || 0).getTime();
                if (aTime === bTime) {
                    return (a.name || '').localeCompare(b.name || '');
                }
                return bTime - aTime; // newest first
            });
        }

        this.filteredCharacters = filtered;
    }
};

// ========================================
// UI RENDERING
// ========================================
const UI = {
    render() {
        this.renderCharacterGrid();
        this.updateCount();
        
        // Auto-select first character if available
        const characters = AppState.filteredCharacters;
        if (characters.length > 0) {
            const firstCharId = characters[0].id;
            // Check if a character is already selected
            const hasSelected = document.querySelector('.character-card.is-selected');
            if (!hasSelected) {
                viewCharacter(firstCharId);
            }
        } else {
            // Hide character sheet if no characters
            document.querySelector('.sheet-placeholder').classList.remove('is-hidden');
            document.getElementById('characterSheet').classList.add('is-hidden');
        }
    },

    renderCharacterGrid() {
        console.log('🎨 RENDER: Starting grid render with', AppState.filteredCharacters.length, 'characters');
        console.log('🎨 RENDER: Character names:', AppState.filteredCharacters.map(c => c.name).join(', '));
        const grid = document.getElementById('characterGrid');
        const emptyState = document.getElementById('emptyState');
        const characters = AppState.filteredCharacters;

        if (characters.length === 0) {
            // Show a single "New Character" card in the grid, positioned as the
            // first card would be when characters exist.
            grid.innerHTML = `
                <div class="character-card new-character-card" onclick="createNewCharacter()">
                    <div class="card-details">
                        <div class="card-name">+ New Character</div>
                    </div>
                </div>
            `;

            if (emptyState) {
                emptyState.classList.remove('show');
            }
            KeyboardNav.isActive = true;
            KeyboardNav.reset();
            return;
        }

        emptyState.classList.remove('show');
        grid.innerHTML = characters.map(char => this.renderCharacterCard(char)).join('');
        
        // Populate ASCII thumbnails after rendering
        characters.forEach(char => {
            const asciiPortrait = char.portrait?.ascii || char.customPortraitAscii || char.asciiPortrait || null;
            if (asciiPortrait) {
                const thumbnailEl = document.getElementById(`card-thumb-${char.id}`);
                if (thumbnailEl) {
                    thumbnailEl.textContent = this.cropAsciiForThumbnail(asciiPortrait);
                }
            }
        });
        
        // Reset keyboard navigation to first card
        KeyboardNav.isActive = true;
        KeyboardNav.reset();
    },
    
    cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
        // Split into lines
        const lines = asciiArt.split('\n');
        
        // CROP FROM BOTTOM: Keep the top portion, discard bottom
        // This ensures faces/heads are visible in the thumbnail
        const totalLines = lines.length;
        const startLine = 0;  // Always start from the top (keep heads/faces)
        const endLine = Math.min(totalLines, heightLines);  // Crop bottom if needed
        
        // Get lines from top
        const topLines = lines
            .slice(startLine, endLine)
            .map(line => line.slice(0, widthChars));
        
        return topLines.join('\n');
    },

    renderCharacterCard(character) {
        // Handle race/class names (enhanced export has nested data)
        const raceName = character.raceData?.name || character.race || '?';
        const className = character.classData?.name || character.class || '?';
        
        // Get ASCII portrait for thumbnail
        const asciiPortrait = character.portrait?.ascii || character.customPortraitAscii || character.asciiPortrait || null;
        const hasPortrait = asciiPortrait && asciiPortrait.length > 0;

        return `
            <div class="character-card" data-id="${character.id}" onclick="viewCharacter('${character.id}')">
                ${hasPortrait ? `
                    <div class="card-thumbnail" id="card-thumb-${character.id}"></div>
                ` : ''}
                <div class="card-details">
                    <div class="card-name">${character.name || 'Unnamed Character'}</div>
                    <div class="card-info">
                        ${raceName} ${className}${character.level ? ` • Lvl ${character.level}` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    updateCount() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const total = AppState.characters.length;
        const filtered = AppState.filteredCharacters.length;

        // Disable search when there are no characters at all
        if (searchInput) {
            searchInput.disabled = total === 0;
        }
        if (clearSearchBtn) {
            clearSearchBtn.disabled = total === 0;
        }

        if (total === filtered) {
            searchInput.placeholder = `⌕ Search ${total} character${total !== 1 ? 's' : ''}`;
        } else {
            searchInput.placeholder = `⌕ Search ${filtered} of ${total} character${total !== 1 ? 's' : ''}`;
        }
    },

    showCharacterSheet(character) {
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetContainer = document.getElementById('characterSheet');

        placeholder.classList.add('is-hidden');
        sheetContainer.classList.remove('is-hidden');
        
        // Use the shared CharacterSheet component
        sheetContainer.innerHTML = CharacterSheet.render(character, {
            context: 'manager',
            showPortrait: true,
            onRename: true,
            onEdit: true,
            onDelete: true,
            onGeneratePortrait: true,
            onPrint: true,
        });
        
        // Populate ASCII portrait after rendering
        CharacterSheet.populatePortrait(character);
    }
};

// Simple print helper for manager context – relies on print-specific CSS
// to hide the left panel and UI chrome, focusing on the sheet content.
function printCharacterSheet() {
    if (!document.querySelector('.character-sheet')) {
        alert('No character sheet to print yet.');
        return;
    }
    window.print();
}

// ========================================
// EVENT HANDLERS
// ========================================

function createNewCharacter() {
    // Launch the Character Builder in the same tab.
    // The builder has an EXIT button to return to the manager view.
    window.location.href = 'character-builder/index.html';
}

async function viewCharacter(id, options = {}) {
    const { fromKeyboard = false, skipKeyboardSync = false } = options;

    // Prefer the already-loaded characters from AppState to avoid extra storage/API calls
    let character = null;
    if (typeof AppState !== 'undefined' && AppState && Array.isArray(AppState.filteredCharacters)) {
        character =
            AppState.filteredCharacters.find(c => c.id === id) ||
            AppState.characters.find(c => c.id === id) ||
            null;
    }

    if (!character) {
        // Fallback to storage lookup (cloud/local)
        character = await CharacterStorage.getById(id);
    }

    if (character) {
        UI.showCharacterSheet(character);
        
        // Highlight selected card
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('is-selected');
        });
        const selectedCard = document.querySelector(`[data-id="${id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('is-selected');

            // When selection changes via mouse or programmatic calls, keep the
            // keyboard focus index in sync without re-triggering a sheet update.
            if (!skipKeyboardSync && typeof KeyboardNav !== 'undefined' && KeyboardNav.getCharacterCards) {
                const allCards = KeyboardNav.getCharacterCards();
                const cardIndex = allCards.indexOf(selectedCard);
                if (cardIndex !== -1) {
                    KeyboardNav.currentFocusIndex = cardIndex;
                    KeyboardNav.updateFocus(true); // true => don't update sheet again
                }
            }
        }
    }
}

let currentEditCharacterId = null;

async function editCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    currentEditCharacterId = id;

    // Use parsed data to pre-fill, so we respect any derived values
    const parsed = CharacterSheet._parseCharacterData(character);

    // Helper to safely set textarea values
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    // SKILL PROFICIENCIES (text-only list, one per line)
    const skillList = (parsed.skillProficiencies || []).map(s => CharacterSheet.formatSkillName(s)).join('\n');
    setValue('editSkills', skillList);

    // CLASS EQUIPMENT / EQUIPMENT (one per line)
    const equipmentList = (parsed.equipment || []).join('\n');
    setValue('editEquipment', equipmentList);

    // TOOL PROFICIENCIES (one per line)
    const toolList = (parsed.toolProficiencies || []).map(t => CharacterSheet.formatSkillName(t)).join('\n');
    setValue('editTools', toolList);

    // LANGUAGES (one per line)
    const languageList = (parsed.languages || []).join('\n');
    setValue('editLanguages', languageList);

    // BACKSTORY (free text)
    setValue('editBackstory', character.backstory || '');

    // Show modal
    const modal = document.getElementById('editDetailsModal');
    if (modal) {
        modal.classList.add('show');
    }
}

function closeEditDetailsModal() {
    const modal = document.getElementById('editDetailsModal');
    if (modal) {
        modal.classList.remove('show');
    }
    currentEditCharacterId = null;
}

async function saveEditDetails() {
    if (!currentEditCharacterId) {
        closeEditDetailsModal();
        return;
    }

    const character = await CharacterStorage.getById(currentEditCharacterId);
    if (!character) {
        closeEditDetailsModal();
        return;
    }

    const getLines = (id) => {
        const el = document.getElementById(id);
        if (!el) return [];
        return el.value
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
    };

    const skillLines = getLines('editSkills');
    const equipmentLines = getLines('editEquipment');
    const toolLines = getLines('editTools');
    const languageLines = getLines('editLanguages');

    const backstoryEl = document.getElementById('editBackstory');
    const backstoryText = backstoryEl ? backstoryEl.value.trim() : '';

    const updates = {
        // Store raw IDs/names; CharacterSheet will format as needed
        skillProficiencies: skillLines.map(s => s.toLowerCase().replace(/\s+/g, '-')),
        equipment: equipmentLines,
        toolProficiencies: toolLines.map(t => t.toLowerCase().replace(/\s+/g, '-')),
        languages: languageLines,
        backstory: backstoryText,
    };

    await CharacterStorage.update(currentEditCharacterId, updates);
    await AppState.loadCharacters();
    UI.render();
    viewCharacter(currentEditCharacterId);
    showNotification('Character details updated');
    closeEditDetailsModal();
}

async function renameCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    const existing = document.getElementById('renameModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="renameModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">[ RENAME CHARACTER ]</h2>
            <button class="modal-close" onclick="document.getElementById('renameModal').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text-small modal-section-label">New name:</p>
            <input type="text" id="renameInput" class="terminal-input" value="${character.name || ''}">
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" id="renameCancel">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" id="renameOk">APPLY</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');
    const cancelBtn = document.getElementById('renameCancel');
    const okBtn = document.getElementById('renameOk');

    const close = () => {
        if (modal) modal.remove();
    };

    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', async () => {
        const newName = input.value.trim();
        if (!newName) {
            return;
        }
        close();
        await CharacterStorage.update(id, { name: newName });
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(id);
        showNotification('Character renamed to: ' + newName);
    });

    // Focus first field in the rename modal
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    } else if (input) {
        input.focus();
        input.select();
    }
}

let currentPortraitCharacterId = null;

async function generatePortraitForCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    // Check if race and class are defined
    if (!character.race || !character.class) {
        showAlertDialog('This character needs both a race and class to generate a custom portrait.');
        return;
    }

    // Check if backend is available
    try {
        const statusCheck = await fetch(`${window.CONFIG.BACKEND_URL}/api/ai/status`);
        if (!statusCheck.ok) {
            showAlertDialog('Backend server is not available. Make sure the backend is running on port 8000.');
            return;
        }
        const statusData = await statusCheck.json();
        if (!statusData.available) {
            showAlertDialog('AI features are not available. The backend server is not configured properly.');
            return;
        }
    } catch (error) {
        showAlertDialog('Cannot connect to backend server. Make sure it is running on http://localhost:8000');
        return;
    }

    // Show prompt modal
    currentPortraitCharacterId = id;
    
    // Build default prompt using character data
    const defaultPrompt = window.AIService && window.AIService.buildCharacterDescription
        ? window.AIService.buildCharacterDescription(character)
        : `${character.race} ${character.class}`;
    
    document.getElementById('portraitPrompt').value = defaultPrompt;
    const promptModal = document.getElementById('portraitPromptModal');
    if (promptModal) {
        promptModal.classList.add('show');
        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(promptModal);
        }
    }
}

function closePortraitPromptModal() {
    document.getElementById('portraitPromptModal').classList.remove('show');
    document.getElementById('portraitPrompt').value = '';
    currentPortraitCharacterId = null;
}

async function confirmGeneratePortrait() {
    // Capture the current character ID in a local variable so it's not lost
    // when we close the modal (which resets currentPortraitCharacterId to null).
    const portraitCharacterId = currentPortraitCharacterId;
    
    if (!portraitCharacterId) {
        closePortraitPromptModal();
        return;
    }

    const character = await CharacterStorage.getById(portraitCharacterId);
    if (!character) {
        closePortraitPromptModal();
        return;
    }

    const customPrompt = document.getElementById('portraitPrompt').value.trim();
    if (!customPrompt) {
        showAlertDialog('Please enter a description for your character portrait.');
        return;
    }

    // Close modal
    closePortraitPromptModal();

    // Show loading state in the portrait area
    const portraitId = `character-portrait-${portraitCharacterId}`;
    const portraitEl = document.getElementById(portraitId);
    
    let portraitLoadingInterval;
    let portraitElapsed = 0;
    
    const updatePortraitLoading = () => {
        if (!portraitEl) return;
        
        const phaseOne = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...<br><br>  Contacting image service...`;
        const phaseTwo = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...<br><br>  Image is being generated...<br>  (this takes 20-30 seconds)`;
        const phaseThree = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...<br><br>  Converting to ASCII art...`;
        const phaseFour = `[<span class="spinner">↻</span>] ALMOST DONE...<br><br>  . . . ( ._.)`;
        
        if (portraitElapsed < 5) {
            portraitEl.innerHTML = phaseOne;
        } else if (portraitElapsed < 15) {
            portraitEl.innerHTML = phaseTwo;
        } else if (portraitElapsed < 25) {
            portraitEl.innerHTML = phaseThree;
        } else {
            portraitEl.innerHTML = phaseFour;
        }
        portraitElapsed++;
    };
    
    if (portraitEl) {
        // Enlarge font to match button/body copy while we're showing the loading message.
        portraitEl.style.fontSize = 'var(--font-size-small)';
        updatePortraitLoading();
        portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
    }

    console.log('%c🎨 PORTRAIT: Starting AI portrait generation...', 'color: #0ff; font-weight: bold');
    console.log('  Note: DALL-E takes 20-30s when backend is warm, 60s+ on cold start...');
    showNotification('Generating custom AI portrait... This may take 20-30 seconds.');

    try {
        // Add rendering instructions to the user's character description
        const renderingInstructions = [
            'Fantasy D&D character portrait',
            'Create a high-contrast, grayscale illustration on a pure black background',
            'Use bold, graphic shapes with thick outlines and minimal fine detail',
            'The image should have bright highlights and deep shadows to maximize tonal separation',
            'Center the subject in the frame and avoid background texture',
            'Style should be simple, iconic, and optimized for ASCII art conversion',
        ];
        
        const fullPrompt = [...renderingInstructions, customPrompt].join(', ');
        
        // Generate custom portrait with full prompt
        const result = await window.AsciiArtService.generateCustomAIPortraitWithPrompt(fullPrompt);

        // Check if generation actually succeeded
        if (!result || !result.asciiArt || !result.imageUrl) {
            throw new Error('Portrait generation returned incomplete result');
        }

        // Stop the loading animation
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }
        // Restore portrait font size back to ASCII default; the sheet will
        // re-render the portrait element for the newly generated art.
        if (portraitEl) {
            portraitEl.style.fontSize = '';
        }

        console.log('%c🎨 PORTRAIT (Success) ✨', 'color: #0f0; font-weight: bold');

        // Update character in storage and append a new portrait version
        const currentCount = character.customPortraitCount || 0;

        let updatedMetadata;
        if (window.PortraitHistory && typeof window.PortraitHistory.addVersion === 'function') {
            const existingMetadata = character.portraitMetadata || {};
            const existingVersions = Array.isArray(existingMetadata.versions)
                ? existingMetadata.versions
                : [];

            let baseCharacterForHistory = character;

            // If this character already has a portrait but no version history yet,
            // seed the history with the *current* portrait before we overwrite it.
            if (existingVersions.length === 0) {
                const priorAscii =
                    character.customPortraitAscii ||
                    character.asciiPortrait ||
                    character.portrait?.ascii ||
                    '';
                const priorUrl =
                    character.originalPortraitUrl ||
                    character.portrait?.url ||
                    null;

                if (priorAscii || priorUrl) {
                    const seededMetadata = window.PortraitHistory.addVersion(
                        character,
                        priorAscii,
                        priorUrl,
                        {
                            source: 'original-ai',
                            prompt: null,
                        },
                    );

                    baseCharacterForHistory = {
                        ...character,
                        portraitMetadata: seededMetadata,
                    };
                }
            }

            updatedMetadata = window.PortraitHistory.addVersion(
                baseCharacterForHistory,
                result.asciiArt,
                result.imageUrl,
                {
                    source: 'custom-ai',
                    prompt: customPrompt,
                },
            );
        } else {
            updatedMetadata = character.portraitMetadata || {};
        }

        const updates = {
            originalPortraitUrl: result.imageUrl,
            customPortraitAscii: result.asciiArt,
            customPortraitCount: currentCount + 1,
            portraitMetadata: updatedMetadata,
            // Keep portrait object in sync for manager sheet rendering
            portrait: {
                ...(character.portrait || {}),
                url: result.imageUrl,
                ascii: result.asciiArt,
            },
        };

        await CharacterStorage.update(portraitCharacterId, updates);
        
        // Reload characters and UI
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(portraitCharacterId);
        
        showNotification(`Custom AI portrait generated! (${3 - (currentCount + 1)} remaining)`);
        
        // Clear the global pointer once we're done
        currentPortraitCharacterId = null;
    } catch (error) {
        console.error('Error generating custom AI portrait:', error);
        
        // Stop the loading animation
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }
        // Restore portrait font size on error as well
        if (portraitEl) {
            portraitEl.style.fontSize = '';
        }
        
        // Restore previous portrait first
        if (portraitEl) {
            const asciiPortrait = window.CharacterSheet.getAsciiPortrait(character);
            if (asciiPortrait) {
                portraitEl.textContent = asciiPortrait;
            } else {
                portraitEl.textContent = '[ NO PORTRAIT ]';
            }
        }
        
        // Graceful error handling - inform but don't block
        if (error.isRateLimit) {
            console.log('%c🎨 PORTRAIT (Rate Limited)', 'color: #fa0; font-weight: bold');
            showNotification('⚠️ Rate limit exceeded. Please wait a few minutes before trying again.');
        } else if (error.name === 'AbortError' || (error.message && error.message.includes('timed out'))) {
            console.log('%c🎨 PORTRAIT (Timeout - Backend Waking Up)', 'color: #fa0; font-weight: bold');
            console.log('  ⏰ Request timed out. Backend may be waking up from cold start.');
            console.log('  ✅ Try again in a moment - server should be warm now!');
            showNotification('⏰ Request timed out. Backend may be waking up. Try again in a moment!');
            
            // Trigger background warmup like other AI features
            if (window.AIService && window.AIService.warmupBackend) {
                window.AIService.warmupBackend();
            }
        } else if (error.message && error.message.includes('fetch')) {
            console.log('%c🎨 PORTRAIT (Connection Error)', 'color: #f00; font-weight: bold');
            console.log('  Cannot connect to backend server');
            showNotification('🔌 Cannot connect to backend server. Check that it\'s running.');
        } else {
            console.log('%c🎨 PORTRAIT (Failed)', 'color: #f00; font-weight: bold');
            console.log('  Error:', error.message);
            showNotification('❌ Portrait generation failed. Check console for details and try again.');
        }
    }
}

// ===== PORTRAIT HISTORY (MANAGER) =====
async function openPortraitHistory(characterId) {
    const character = await CharacterStorage.getById(characterId);
    if (!character) return;

    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    if (document.getElementById('portraitHistoryModal')) {
        return;
    }

    const hasVersions = versions.length > 0;

    const listHtml = hasVersions
        ? versions
              .map((v, index) => {
                  const isActive = metadata.activeVersionId === v.id;
                  const createdLabel = v.createdAt
                      ? new Date(v.createdAt).toLocaleString()
                      : '';
                  // Use only the generation date/time as the label for each version.
                  const title = createdLabel || 'Unknown time';
                  const infoText = '';

                  const hasImage = !!v.url;
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
            <div class="character-card portrait-history-card${isActive ? ' is-selected' : ''}" data-version-id="${v.id}" onclick="selectPortraitHistoryCard('${v.id}')">
              ${thumbHtml}
              <div class="card-details">
                <div class="card-name">${title}</div>
                <div class="card-info">${infoText || '&nbsp;'}</div>
              </div>
              <div class="portrait-history-actions">
                ${
                  hasImage
                    ? `<button class="terminal-btn terminal-btn-small" data-toggle-version-id="${v.id}" onclick="togglePortraitHistoryView('${v.id}')">
                  View Original
                </button>`
                    : ''
                }
                <button class="terminal-btn terminal-btn-small portrait-history-delete-btn" onclick="deletePortraitVersion('${characterId}', '${v.id}')" title="Delete this portrait version" aria-label="Delete portrait version">
                  Del
                </button>
              </div>
            </div>
          `;
              })
              .join('')
        : `<p class="terminal-text-small terminal-text-dim">No saved portraits yet. Generate a custom AI portrait to start a history.</p>`;

    const modalHTML = `
      <div id="portraitHistoryModal" class="modal show" onclick="closePortraitHistory()">
        <div class="modal-content portrait-history-modal" onclick="event.stopPropagation();">
          <div class="modal-header">
            <h2 class="modal-title">Portrait History</h2>
            <button class="modal-close" onclick="closePortraitHistory()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text-small terminal-text-dim">
              View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
            </p>
            <div class="portrait-history-card-row${versions.length === 1 ? ' is-single' : ''}">
              ${listHtml}
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" onclick="closePortraitHistory()">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" onclick="confirmPortraitHistorySelection('${characterId}')">USE SELECTED</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Populate ASCII previews (for versions without an image URL) as plain text,
    // cropped to the same thumbnail framing as the main character cards.
    versions.forEach((v) => {
        const el = document.querySelector(
            `.portrait-history-preview.ascii-portrait[data-version-id="${v.id}"]`,
        );
        if (el && v.ascii) {
            if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                el.textContent = UI.cropAsciiForThumbnail(v.ascii);
            } else {
                el.textContent = v.ascii;
            }
        }
    });

    // Initialize keyboard-style focus on the first card
    const cards = getPortraitHistoryCards();
    if (cards.length > 0) {
        window._portraitHistoryFocusIndex = 0;
        updatePortraitHistoryFocus();
    }

    // ESC / arrow keys / Enter inside the history modal
    window._portraitHistoryEscHandler = (e) => {
        if (e.key === 'Escape') closePortraitHistory();
    };
    window._portraitHistoryKeyHandler = (e) => {
        const modal = document.getElementById('portraitHistoryModal');
        if (!modal) return;

        if (e.key === 'ArrowLeft') {
            e.preventDefault();
            movePortraitHistoryFocus(-1);
        } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            movePortraitHistoryFocus(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            movePortraitHistoryFocus(-1);
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            movePortraitHistoryFocus(1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            confirmPortraitHistorySelection(characterId);
        }
    };

    document.addEventListener('keydown', window._portraitHistoryEscHandler);
    document.addEventListener('keydown', window._portraitHistoryKeyHandler);
}

function closePortraitHistory() {
    const modal = document.getElementById('portraitHistoryModal');
    if (modal) modal.remove();

    if (window._portraitHistoryEscHandler) {
        document.removeEventListener('keydown', window._portraitHistoryEscHandler);
        window._portraitHistoryEscHandler = null;
    }
    if (window._portraitHistoryKeyHandler) {
        document.removeEventListener('keydown', window._portraitHistoryKeyHandler);
        window._portraitHistoryKeyHandler = null;
    }
    window._portraitHistoryFocusIndex = 0;
}

function getPortraitHistoryCards() {
    return Array.from(
        document.querySelectorAll('#portraitHistoryModal .character-card'),
    );
}

function updatePortraitHistoryFocus() {
    const cards = getPortraitHistoryCards();
    if (cards.length === 0) return;

    const index =
        typeof window._portraitHistoryFocusIndex === 'number'
            ? window._portraitHistoryFocusIndex
            : 0;

    cards.forEach((card, i) => {
        const isFocused = i === index;
        card.classList.toggle('is-keyboard-focused', isFocused);
        card.classList.toggle('is-selected', isFocused);
    });
}

function movePortraitHistoryFocus(delta) {
    const cards = getPortraitHistoryCards();
    if (cards.length === 0) return;

    const current =
        typeof window._portraitHistoryFocusIndex === 'number'
            ? window._portraitHistoryFocusIndex
            : 0;
    const next = Math.max(0, Math.min(cards.length - 1, current + delta));
    window._portraitHistoryFocusIndex = next;
    updatePortraitHistoryFocus();
}

function selectPortraitHistoryCard(versionId) {
    const cards = getPortraitHistoryCards();
    if (cards.length === 0) return;

    let targetIndex = 0;
    cards.forEach((card, i) => {
        const matches = card.getAttribute('data-version-id') === versionId;
        if (matches) {
            targetIndex = i;
        }
    });

    window._portraitHistoryFocusIndex = targetIndex;
    updatePortraitHistoryFocus();
}

function togglePortraitHistoryView(versionId) {
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
}

async function confirmPortraitHistorySelection(characterId) {
    const cards = getPortraitHistoryCards();
    if (cards.length === 0) {
        closePortraitHistory();
        return;
    }

    const index =
        typeof window._portraitHistoryFocusIndex === 'number'
            ? window._portraitHistoryFocusIndex
            : 0;
    const card = cards[index];
    if (!card) {
        closePortraitHistory();
        return;
    }

    const versionId = card.getAttribute('data-version-id');
    if (!versionId) {
        closePortraitHistory();
        return;
    }

    await usePortraitVersion(characterId, versionId);
}

async function usePortraitVersion(characterId, versionId) {
    const character = await CharacterStorage.getById(characterId);
    if (!character) return;

    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
    const version = versions.find((v) => v.id === versionId);

    if (!version) {
        showNotification('Portrait version not found.');
        return;
    }

    const updatedMetadata = {
        ...metadata,
        activeVersionId: version.id,
    };

    const updates = {
        originalPortraitUrl: version.url || character.originalPortraitUrl || null,
        customPortraitAscii: version.ascii || character.customPortraitAscii || '',
        portraitMetadata: updatedMetadata,
        portrait: {
            ...(character.portrait || {}),
            url: version.url || (character.portrait && character.portrait.url) || null,
            ascii: version.ascii || (character.portrait && character.portrait.ascii) || '',
        },
    };

    await CharacterStorage.update(characterId, updates);
    await AppState.loadCharacters();
    UI.render();
    viewCharacter(characterId);
    closePortraitHistory();
}

async function deletePortraitVersion(characterId, versionId) {
    const character = await CharacterStorage.getById(characterId);
    if (!character) return;

    const metadata = character.portraitMetadata || {};
    const versions = Array.isArray(metadata.versions) ? metadata.versions : [];

    if (!versions.length) {
        closePortraitHistory();
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
                updates.portrait = {
                    ...(character.portrait || {}),
                    url: remaining[0].url || (character.portrait && character.portrait.url) || null,
                    ascii:
                        remaining[0].ascii || (character.portrait && character.portrait.ascii) || '',
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
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(characterId);

        closePortraitHistory();
        if (remaining.length) {
            openPortraitHistory(characterId);
        }
    };

    showConfirmDialog(
        'Delete this saved portrait version? This cannot be undone.',
        onConfirm,
    );
}

async function duplicateCharacter(id) {
    showConfirmDialog('Create a copy of this character?', async () => {
        const duplicate = await CharacterStorage.duplicate(id);
        if (duplicate) {
            await AppState.loadCharacters();
            UI.render();
            showNotification(`Created: ${duplicate.name}`);
        }
    });
}

async function exportCharacter(id) {
    const json = await CharacterStorage.export(id);
    if (json) {
        const character = await CharacterStorage.getById(id);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${character.name || 'character'}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Character exported!');
    }
}

async function deleteCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    showConfirmDialog(`Delete ${character.name}?\n\nThis cannot be undone.`, async () => {
        await CharacterStorage.delete(id);
        await AppState.loadCharacters();
        UI.render();
        showNotification('Character deleted');
    });
}

let isImporting = false;  // Flag to prevent concurrent imports

// Helper: get the primary action button inside the Import modal only.
// This avoids accidentally targeting primary buttons from other modals.
function getImportModalPrimaryButton() {
    const importModal = document.getElementById('importModal');
    return importModal
        ? importModal.querySelector('.modal-footer .terminal-btn-primary')
        : null;
}

function showImportModal() {
    const modal = document.getElementById('importModal');
    if (modal) {
        modal.classList.add('show');

        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(modal);
        }

        // Disable import button until file is selected
        const importButton = modal.querySelector('.modal-footer .terminal-btn-primary');
        if (importButton) {
            importButton.disabled = true;
        }
    }
}

function closeImportModal() {
    console.log('🚪 closeImportModal() called, isImporting was:', isImporting);
    document.getElementById('importModal').classList.remove('show');
    document.getElementById('importFile').value = '';
    document.getElementById('fileName').textContent = '';
    
    // Re-enable the import button and reset text
    const importButton = getImportModalPrimaryButton();
    if (importButton) {
        importButton.disabled = true;  // Disable for next time modal opens
        importButton.textContent = 'IMPORT';
    }
    
    isImporting = false;  // Reset flag when closing
    console.log('🚪 closeImportModal() done, isImporting now:', isImporting);
}

// Store duplicate resolution data temporarily
let pendingDuplicateResolution = null;

function showDuplicateResolutionModal(characterName, existingId, importData) {
    console.log('⚠️ DUPLICATE MODAL: Showing resolution options for', characterName);
    
    // Store the data for resolution
    pendingDuplicateResolution = {
        characterName,
        existingId,
        importData
    };
    
    // Update modal content
    document.getElementById('duplicateCharName').textContent = characterName;
    
    // Close import modal and show duplicate modal
    document.getElementById('importModal').classList.remove('show');
    const duplicateModal = document.getElementById('duplicateModal');
    if (duplicateModal) {
        duplicateModal.classList.add('show');
        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(duplicateModal);
        }
    }
}

function closeDuplicateModal() {
    console.log('🚪 DUPLICATE MODAL: Closing');
    document.getElementById('duplicateModal').classList.remove('show');
    pendingDuplicateResolution = null;
    isImporting = false;  // Reset flag
}

function resolveDuplicate(action) {
    if (!pendingDuplicateResolution) {
        console.error('No pending duplicate resolution!');
        return;
    }
    
    const { existingId, importData } = pendingDuplicateResolution;
    
    console.log('🔧 DUPLICATE RESOLUTION: Action =', action);
    
    if (action === 'overwrite') {
        handleOverwriteCharacter(existingId, importData);
    } else if (action === 'keep-both') {
        handleKeepBothCharacters(importData);
    }
    
    // Close modal and cleanup
    closeDuplicateModal();
}

async function handleOverwriteCharacter(existingId, importData) {
    console.log('🔄 OVERWRITE: Replacing existing character with ID:', existingId);
    
    // Delete the existing character
    await CharacterStorage.delete(existingId);
    
    // Import the new one (bypassing duplicate check but preserving stable UID)
    const character = JSON.parse(importData);
    delete character.id;
    
    // Preserve stable UID on overwrite so future exports/imports still match
    const importedUid =
        character.metadata?.characterUid ||
        character.characterUid ||
        null;
    if (importedUid) {
        if (!character.metadata) character.metadata = {};
        character.metadata.characterUid = importedUid;
        character.characterUid = importedUid;
    }

    const result = await CharacterStorage.add(character);
    
    if (result) {
        console.log('✅ OVERWRITE SUCCESS: Character replaced');
        await AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Replaced: ${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

async function handleKeepBothCharacters(importData) {
    console.log('📋 KEEP BOTH: Importing with modified name');
    
    // Parse and modify the character name
    const character = JSON.parse(importData);
    const originalName = character.name;
    
    // Find a unique name by adding (Copy N)
    const existing = await CharacterStorage.getAll();
    let copyNumber = 1;
    let newName = `${originalName} (Copy)`;
    
    while (existing.some(c => c.name === newName)) {
        copyNumber++;
        newName = `${originalName} (Copy ${copyNumber})`;
    }
    
    character.name = newName;
    
    // For "keep both", treat this as a new logical character: give it a new UID
    const newUid = `danddy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    if (!character.metadata) character.metadata = {};
    character.metadata.characterUid = newUid;
    character.characterUid = newUid;
    delete character.id;
    
    const result = await CharacterStorage.add(character);
    
    if (result) {
        console.log('✅ KEEP BOTH SUCCESS: Character imported as', newName);
        await AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Imported as: ${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

async function importCharacter() {
    console.log('🔵 importCharacter() called, isImporting =', isImporting);
    
    // Prevent concurrent imports
    if (isImporting) {
        console.log('⚠️ Import already in progress, blocking duplicate call');
        return;
    }
    
    // Set flag IMMEDIATELY to prevent race condition
    isImporting = true;
    console.log('🔒 Import locked, isImporting =', isImporting);
    
    // Disable the import button immediately
    const importButton = getImportModalPrimaryButton();
    if (importButton) {
        importButton.disabled = true;
        importButton.textContent = 'IMPORTING...';
    }
    
    const fileInput = document.getElementById('importFile');

    if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        console.log('📂 FILE: Selected file:', file.name, 'Size:', file.size);
        const reader = new FileReader();
        console.log('📖 READER: Created new FileReader');
        reader.onload = async (e) => {
            console.log('📖 READER.ONLOAD: Callback triggered, isImporting =', isImporting);
            const importData = e.target.result;
            const result = await CharacterStorage.import(importData);
            
            // Check if it's a duplicate
            if (result && result.isDuplicate) {
                console.warn('⚠️ DUPLICATE: Character already exists');
                
                // Show duplicate resolution modal instead of simple alert
                showDuplicateResolutionModal(result.name, result.existingIds[0], importData);
                
                // Re-enable button
                const importButton = getImportModalPrimaryButton();
                if (importButton) {
                    importButton.disabled = false;
                    importButton.textContent = 'IMPORT';
                }
                isImporting = false;  // Reset flag
                return;
            }
            
            if (result) {
                console.log('✅ SUCCESS: Character imported, calling loadCharacters()');
                await AppState.loadCharacters();
                console.log('🎨 RENDER: Calling UI.render()');
                UI.render();
                console.log('🚪 MODAL: Calling closeImportModal()');
                closeImportModal();
                showNotification(`Imported: ${result.name}`);
                // Auto-select the imported character
                setTimeout(() => viewCharacter(result.id), 100);
            } else {
                showAlertDialog('Invalid character file!');
                // Re-enable button on error
                const importButton = getImportModalPrimaryButton();
                if (importButton) {
                    importButton.disabled = false;
                    importButton.textContent = 'IMPORT';
                }
                isImporting = false;  // Reset on error
            }
        };
        reader.onerror = () => {
            showAlertDialog('Error reading file!');
            // Re-enable button on error
            const importButton = getImportModalPrimaryButton();
            if (importButton) {
                importButton.disabled = false;
                importButton.textContent = 'IMPORT';
            }
            isImporting = false;  // Reset on error
        };
        console.log('📖 READER: Starting readAsText()');
        reader.readAsText(file);
    } else {
        showAlertDialog('Please select a file to import.');
        // Re-enable button and reset flag
        const importButton = getImportModalPrimaryButton();
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = 'IMPORT';
        }
        isImporting = false;  // Reset flag
    }
}

function togglePortraitView(characterId) {
    const asciiPortrait = document.getElementById(`character-portrait-${characterId}`);
    const originalPortrait = document.getElementById(`original-portrait-${characterId}`);
    const toggleBtn = document.getElementById(`toggle-portrait-btn-${characterId}`);

    if (!asciiPortrait || !originalPortrait || !toggleBtn) {
        console.warn('Portrait elements not found for character:', characterId);
        return;
    }

    const isShowingAscii = !asciiPortrait.classList.contains('is-hidden');

    if (isShowingAscii) {
        // Switch to original
        asciiPortrait.classList.add('is-hidden');
        originalPortrait.classList.remove('is-hidden');
        toggleBtn.textContent = '≡ View ASCII Art';
        toggleBtn.title = 'Toggle between ASCII and original art';
    } else {
        // Switch to ASCII
        asciiPortrait.classList.remove('is-hidden');
        originalPortrait.classList.add('is-hidden');
        toggleBtn.textContent = '◉ View Original';
        toggleBtn.title = 'Toggle between ASCII and original art';
    }
}

function showNotification(message) {
    // Console notification with visual styling
    console.log('%c✓ ' + message, 'color: #0f0; font-weight: bold');
    
    // TODO: Could add a toast notification UI element here in the future
    // For now, console is sufficient for debugging
}

// Focus the first meaningful field inside a modal (inputs/textareas/selects first, then primary button).
function focusFirstFieldInModal(modal) {
    if (!modal || typeof modal.querySelector !== 'function') return;

    const fieldSelectors = [
        // High-priority: styled terminal inputs
        'input.terminal-input:not([type="hidden"]):not(.file-input-hidden):not([disabled])',
        'textarea.terminal-input:not([disabled])',
        'textarea.terminal-textarea:not([disabled])',
        'select.terminal-select:not([disabled])',
        // Generic fallbacks
        'input:not([type="hidden"]):not(.file-input-hidden):not([disabled])',
        'textarea:not([disabled])',
        'select:not([disabled])',
    ];

    let target = null;
    for (const selector of fieldSelectors) {
        target = modal.querySelector(selector);
        if (target) break;
    }

    if (!target) {
        const fallbackSelectors = [
            '.modal-footer .terminal-btn-primary:not([disabled])',
            '.modal-footer button:not([disabled])',
            'button.terminal-btn-primary:not([disabled])',
            'button:not([disabled])',
            '[tabindex]:not([tabindex="-1"])',
        ];
        for (const selector of fallbackSelectors) {
            target = modal.querySelector(selector);
            if (target) break;
        }
    }

    if (target && typeof target.focus === 'function') {
        setTimeout(() => {
            try {
                target.focus();
                if (
                    typeof target.select === 'function' &&
                    (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')
                ) {
                    target.select();
                }
            } catch (e) {
                // Non-fatal
            }
        }, 0);
    }
}

// Generic confirmation modal using terminal modal styles
function showConfirmDialog(message, onConfirm) {
    const existing = document.getElementById('genericConfirmModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="genericConfirmModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">[ CONFIRM ]</h2>
            <button class="modal-close" onclick="document.getElementById('genericConfirmModal').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">${message}</p>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" id="genericConfirmCancel">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" id="genericConfirmOk">OK</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericConfirmModal');
    const cancelBtn = document.getElementById('genericConfirmCancel');
    const okBtn = document.getElementById('genericConfirmOk');

    const close = () => {
        if (modal) modal.remove();
    };

    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', async () => {
        close();
        if (onConfirm) {
            await onConfirm();
        }
    });

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// Generic alert modal using terminal modal styles
function showAlertDialog(message) {
    const existing = document.getElementById('genericAlertModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="genericAlertModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">[ NOTICE ]</h2>
            <button class="modal-close" onclick="document.getElementById('genericAlertModal').remove()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">${message}</p>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn terminal-btn-primary" id="genericAlertOk">OK</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericAlertModal');
    const okBtn = document.getElementById('genericAlertOk');

    const close = () => {
        if (modal) modal.remove();
    };

    okBtn.addEventListener('click', close);

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// Dismiss the guest notice banner (per-session only)
function dismissGuestNotice() {
    const guestNotice = document.getElementById('guestNotice');
    if (guestNotice) {
        guestNotice.classList.add('is-hidden');
    }
}

// ========================================
// SPLASH SCREEN (manager uses welcome modal instead of a full-page splash)
// ========================================

// In the manager we don't actually block interaction behind a separate splash
// screen, so keep this false to ensure global keyboard shortcuts always work.
let splashActive = false;

function dismissSplash(instant = false) {
    const splash = document.getElementById('splash-content');
    const mainContent = document.getElementById('main-content');
    
    if (splash && splashActive) {
        splashActive = false;
        
        if (instant) {
            // Skip animation entirely (used when returning from builder)
            splash.classList.add('is-hidden');
            mainContent.classList.remove('is-hidden');
            mainContent.classList.add('fade-in');
        } else {
            // Fade out splash
            splash.classList.add('fade-out');
            
            setTimeout(() => {
                splash.classList.add('is-hidden');
                mainContent.classList.remove('is-hidden');
                
                // Fade in main content
                setTimeout(() => {
                    mainContent.classList.add('fade-in');
                }, 50);
            }, 300);
        }
    }
}

// ========================================
// AUTHENTICATION UI HANDLERS
// ========================================

function showAuthModal() {
    const modal = document.getElementById('authModal');
    if (modal) {
        modal.classList.add('show');
    }
    showLoginForm();
}

function closeAuthModal() {
    document.getElementById('authModal').classList.remove('show');
    document.getElementById('authError').classList.add('is-hidden');
    // Clear form fields
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('registerUsername').value = '';
    document.getElementById('registerEmail').value = '';
    document.getElementById('registerPassword').value = '';
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ LOGIN ]';
    document.getElementById('loginBtn').classList.remove('is-hidden');
    document.getElementById('registerBtn').classList.add('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');

    const modal = document.getElementById('authModal');
    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

function showRegisterForm() {
    document.getElementById('loginForm').classList.add('is-hidden');
    document.getElementById('registerForm').classList.remove('is-hidden');
    document.getElementById('authModalTitle').textContent = '[ REGISTER ]';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');

    const modal = document.getElementById('authModal');
    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

async function handleLogin() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('authError');

    if (!username || !password) {
        errorEl.textContent = 'Please enter both username and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.login(username, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            showNotification(`✓ Logged in as ${username}`);
            
            // Check if should migrate
            if (window.MigrationService.hasLocalCharacters()) {
                showMigrationModal();
            } else {
                // Reload characters from cloud
                await AppState.loadCharacters();
                UI.render();
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
    const username = document.getElementById('registerUsername').value.trim();
    const email = document.getElementById('registerEmail').value.trim();
    const password = document.getElementById('registerPassword').value;
    const errorEl = document.getElementById('authError');

    if (!username || !email || !password) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    try {
        const result = await window.AuthService.register(username, email, password);
        if (result.success) {
            closeAuthModal();
            updateAuthUI();
            showNotification(`✓ Registered as ${username}`);
            
            // Check if should migrate
            if (window.MigrationService.hasLocalCharacters()) {
                showMigrationModal();
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

// ========================================
// PASSWORD RESET UI HANDLERS
// ========================================

function openPasswordResetFromLogin() {
    // Close the auth modal to reduce clutter and then open the reset flow.
    closeAuthModal();
    showPasswordResetModal();
}

function showPasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    if (!modal) return;

    // Reset sections and fields to initial state
    const requestSection = document.getElementById('passwordResetRequestSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const messageEl = document.getElementById('passwordResetMessage');
    const emailInput = document.getElementById('passwordResetEmail');
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');

    if (requestSection) requestSection.classList.remove('is-hidden');
    if (confirmSection) confirmSection.classList.add('is-hidden');
    if (requestBtn) requestBtn.classList.remove('is-hidden');
    if (confirmBtn) confirmBtn.classList.add('is-hidden');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.classList.remove('terminal-text-error');
        messageEl.classList.add('terminal-text-dim');
    }
    if (emailInput) emailInput.value = '';
    if (tokenInput) tokenInput.value = '';
    if (newPasswordInput) newPasswordInput.value = '';

    modal.classList.add('show');
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    }
}

function closePasswordResetModal() {
    const modal = document.getElementById('passwordResetModal');
    if (!modal) return;
    modal.classList.remove('show');
}

async function handlePasswordResetRequest() {
    const emailInput = document.getElementById('passwordResetEmail');
    const messageEl = document.getElementById('passwordResetMessage');
    if (!emailInput || !messageEl) return;

    const email = emailInput.value.trim();
    if (!email) {
        messageEl.textContent = 'Please enter your email address.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    messageEl.textContent = 'Requesting password reset...';
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');

    const result = await window.AuthService.forgotPassword(email);

    if (!result.success) {
        messageEl.textContent = result.error || 'Password reset request failed. Please try again.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    // Move to the confirm step
    const requestSection = document.getElementById('passwordResetRequestSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const tokenInput = document.getElementById('passwordResetToken');

    if (requestSection) requestSection.classList.add('is-hidden');
    if (confirmSection) confirmSection.classList.remove('is-hidden');
    if (requestBtn) requestBtn.classList.add('is-hidden');
    if (confirmBtn) confirmBtn.classList.remove('is-hidden');

    let message = result.message;

    // In development the backend may return a debug token - surface it to
    // simplify local testing and optionally auto-fill the token field.
    if (result.debugToken && tokenInput) {
        tokenInput.value = result.debugToken;
        message += `\n\nDebug reset token (dev only): ${result.debugToken}`;
    }

    messageEl.textContent = message;
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');
}

async function handlePasswordResetConfirm() {
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');
    const messageEl = document.getElementById('passwordResetMessage');
    if (!tokenInput || !newPasswordInput || !messageEl) return;

    const token = tokenInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!token || !newPassword) {
        messageEl.textContent = 'Please enter both the reset token and a new password.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    messageEl.textContent = 'Resetting password...';
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');

    const result = await window.AuthService.resetPassword(token, newPassword);

    if (!result.success) {
        messageEl.textContent = result.error || 'Password reset failed. Please check your token and try again.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    // User now has a fresh token and profile; update UI and close the modal.
    if (typeof updateAuthUI === 'function') {
        updateAuthUI();
    }

    showNotification('✓ Password updated. You are now logged in.');
    closePasswordResetModal();

    // Reload characters from cloud if authenticated
    if (window.AuthService && window.AuthService.isAuthenticated && window.AuthService.isAuthenticated()) {
        await AppState.loadCharacters();
        UI.render();
    }
}

function handleLogout() {
    showConfirmDialog('Log out? Your characters will remain in the cloud and can be accessed after logging back in.', async () => {
        window.AuthService.logout();
        updateAuthUI();
        showNotification('✓ Logged out');
        
        // Reload with local storage
        await AppState.loadCharacters();
        UI.render();
    });
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const guestNotice = document.getElementById('guestNotice');
    
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userInfoDisplay.textContent = user ? `☁ ${user.username}` : '☁ Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;

        // Hide guest notice when logged in
        if (guestNotice) {
            guestNotice.classList.add('is-hidden');
        }
    } else {
        userInfoDisplay.textContent = '▣ Local Storage';
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = showAuthModal;

        // Show guest notice when not authenticated
        if (guestNotice) {
            guestNotice.classList.remove('is-hidden');
        }
    }
}

// ========================================
// MIGRATION UI HANDLERS
// ========================================

function showMigrationModal() {
    const count = window.MigrationService.getLocalCharacterCount();
    document.getElementById('migrationCount').textContent = count;
    const modal = document.getElementById('migrationModal');
    if (modal) {
        modal.classList.add('show');
        focusFirstFieldInModal(modal);
    }
}

function closeMigrationModal() {
    document.getElementById('migrationModal').classList.remove('show');
    // Reload characters after closing (whether migrated or not)
    AppState.loadCharacters().then(() => UI.render());
}

async function startMigration() {
    const statusEl = document.getElementById('migrationStatus');
    statusEl.classList.remove('is-hidden');
    statusEl.textContent = '📦 Creating backup...';
    
    try {
        // Create backup first
        window.MigrationService.backupLocalStorage();
        
        statusEl.textContent = '☁️ Migrating to cloud...';
        
        // Migrate
        const results = await window.MigrationService.migrateToCloud();
        
        if (results.success > 0) {
            statusEl.textContent = `✓ Migrated ${results.success} character(s) successfully!`;
            
            if (results.failed > 0) {
                statusEl.textContent += `\n⚠️ ${results.failed} character(s) failed to migrate.`;
            }
            
            // Clear local storage after successful migration
            if (results.failed === 0) {
                setTimeout(() => {
                    window.MigrationService.clearLocalStorage();
                    showNotification(`✓ Migrated ${results.success} characters to cloud`);
                    closeMigrationModal();
                }, 2000);
            } else {
                setTimeout(() => {
                    showNotification(`⚠️ Migration completed with ${results.failed} error(s)`);
                    closeMigrationModal();
                }, 3000);
            }
        } else {
            statusEl.textContent = '❌ Migration failed. Your local data is safe.';
            setTimeout(() => closeMigrationModal(), 2000);
        }
    } catch (error) {
        console.error('Migration error:', error);
        statusEl.textContent = '❌ Migration failed: ' + error.message;
        setTimeout(() => closeMigrationModal(), 3000);
    }
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Apply app version to header and welcome modal from global version config.
    try {
        const version = window.DANDDY_VERSION || '2.0.0';
        const headerTitle = document.querySelector('.terminal-title');
        const welcomeVersion = document.querySelector('.welcome-version');
        if (headerTitle) {
            headerTitle.textContent = `[ DandDy v${version} ]`;
        }
        if (welcomeVersion) {
            welcomeVersion.textContent = `DandDy v${version}`;
        }
    } catch (e) {
        console.warn('Version banner update failed:', e);
    }

    // Determine auth state up front (and validate token) so the UI and
    // storage mode (cloud vs local) start in a consistent state.
    let isAuthenticated = false;
    if (window.AuthService) {
        if (typeof window.AuthService.verifyToken === 'function') {
            try {
                isAuthenticated = await window.AuthService.verifyToken();
            } catch (e) {
                isAuthenticated = false;
            }
        } else if (typeof window.AuthService.isAuthenticated === 'function') {
            isAuthenticated = window.AuthService.isAuthenticated();
        }
    }

    // Sync header / guest notice with actual auth state
    updateAuthUI();

    // Show welcome modal (splash art + three choices) only when not logged in.
    const welcomeModal = document.getElementById('welcomeModal');
    // Wire welcome modal buttons: LOG IN, CREATE ACCOUNT, DEMO MODE
    const welcomeLoginBtn = document.getElementById('welcomeLoginBtn');
    if (welcomeLoginBtn) {
        welcomeLoginBtn.addEventListener('click', () => {
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
        });
    }

    const welcomeRegisterBtn = document.getElementById('welcomeRegisterBtn');
    if (welcomeRegisterBtn) {
        welcomeRegisterBtn.addEventListener('click', () => {
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
            showRegisterForm();
        });
    }

    const welcomeDemoBtn = document.getElementById('welcomeDemoBtn');
    if (welcomeDemoBtn) {
        welcomeDemoBtn.addEventListener('click', () => {
            // Simply close the modal; user continues in local "demo" mode.
            if (welcomeModal) welcomeModal.classList.remove('show');
        });
    }

    // Keyboard navigation inside welcome modal (splash screen)
    if (welcomeModal) {
        const welcomeButtons = Array.from(
            welcomeModal.querySelectorAll('.welcome-actions .terminal-btn'),
        );
        let welcomeIndex = 0;

        const focusWelcomeButton = (index) => {
            if (!welcomeButtons.length) return;
            const clamped = (index + welcomeButtons.length) % welcomeButtons.length;
            welcomeIndex = clamped;
            const btn = welcomeButtons[clamped];
            if (btn) {
                btn.focus();
            }
        };

        // If not authenticated, show modal and focus the first button.
        if (!isAuthenticated) {
            welcomeModal.classList.add('show');
            if (welcomeButtons.length) {
                focusWelcomeButton(0);
            } else if (typeof focusFirstFieldInModal === 'function') {
                focusFirstFieldInModal(welcomeModal);
            }
        }

        welcomeModal.addEventListener('keydown', (e) => {
            if (!welcomeModal.classList.contains('show')) return;

            // Limit handling to arrow keys and Enter. We intentionally do NOT
            // handle Escape here so users must make an explicit choice.
            const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'];
            if (!navKeys.includes(e.key)) return;

            e.preventDefault();
            e.stopPropagation();

            if (e.key === 'Enter') {
                const btn = document.activeElement.classList.contains('terminal-btn')
                    ? document.activeElement
                    : welcomeButtons[welcomeIndex] || welcomeButtons[0];
                if (btn && typeof btn.click === 'function') {
                    btn.click();
                }
                return;
            }

            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                focusWelcomeButton(welcomeIndex - 1);
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                focusWelcomeButton(welcomeIndex + 1);
            }
        });
    }

    // Initialize app state (async) - will render when done
    await AppState.init();

    // Setup event listeners
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('clearSearchBtn');
    const sortToggleBtn = document.getElementById('sortToggleBtn');
    const sortDropdown = document.getElementById('sortDropdown');

    const updateClearSearchVisibility = () => {
        if (!clearSearchBtn || !searchInput) return;
        const hasValue = searchInput.value.trim().length > 0;
        const isDisabled = searchInput.disabled;
        clearSearchBtn.classList.toggle('is-hidden', !hasValue || isDisabled);
    };

    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            AppState.searchTerm = e.target.value;
            AppState.applyFilters();
            UI.render();
            updateClearSearchVisibility();
        });
    }

    if (clearSearchBtn && searchInput) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput.disabled) return;
            searchInput.value = '';
            AppState.searchTerm = '';
            AppState.applyFilters();
            UI.render();
            searchInput.focus();
            updateClearSearchVisibility();
        });
        updateClearSearchVisibility();
    }

    // Sort dropdown behavior
    if (sortToggleBtn && sortDropdown) {
        const updateSortUI = () => {
            sortToggleBtn.classList.toggle('is-active', sortDropdown.classList.contains('is-open'));
            sortToggleBtn.setAttribute(
                'aria-expanded',
                sortDropdown.classList.contains('is-open') ? 'true' : 'false',
            );

            const options = sortDropdown.querySelectorAll('.sort-option');
            options.forEach((opt) => {
                const value = opt.getAttribute('data-sort-value');
                opt.classList.toggle('is-selected', value === AppState.sortMode);
            });
        };

        sortToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            sortDropdown.classList.toggle('is-open');
            updateSortUI();
        });

        sortDropdown.querySelectorAll('.sort-option').forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.getAttribute('data-sort-value');
                if (value === 'alphabetical' || value === 'dateModified') {
                    AppState.sortMode = value;
                    AppState.applyFilters();
                    UI.render();
                }
                sortDropdown.classList.remove('is-open');
                updateSortUI();
            });
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!sortDropdown.classList.contains('is-open')) return;
            if (
                e.target === sortDropdown ||
                sortDropdown.contains(e.target) ||
                e.target === sortToggleBtn ||
                sortToggleBtn.contains(e.target)
            ) {
                return;
            }
            sortDropdown.classList.remove('is-open');
            updateSortUI();
        });

        // Initialize selection state
        updateSortUI();
    }

    document.getElementById('newCharacterBtn').addEventListener('click', createNewCharacter);
    document.getElementById('importBtn').addEventListener('click', showImportModal);
    
    // Update filename display when file is selected
    document.getElementById('importFile').addEventListener('change', (e) => {
        const fileNameDisplay = document.getElementById('fileName');
        const importButton = document.querySelector('#importModal .modal-footer .terminal-btn-primary');
        
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
            // Enable import button when file is selected
            if (importButton) {
                importButton.disabled = false;
            }
        } else {
            fileNameDisplay.textContent = '';
            // Disable import button when no file
            if (importButton) {
                importButton.disabled = true;
            }
        }
    });

    // Close import modal on outside click
    document.getElementById('importModal').addEventListener('click', (e) => {
        if (e.target.id === 'importModal') {
            closeImportModal();
        }
    });
    
    // Close duplicate modal on outside click
    document.getElementById('duplicateModal').addEventListener('click', (e) => {
        if (e.target.id === 'duplicateModal') {
            closeDuplicateModal();
        }
    });
    
    // Close portrait prompt modal on outside click
    document.getElementById('portraitPromptModal').addEventListener('click', (e) => {
        if (e.target.id === 'portraitPromptModal') {
            closePortraitPromptModal();
        }
    });
    
    // Close password reset modal on outside click
    document.getElementById('passwordResetModal').addEventListener('click', (e) => {
        if (e.target.id === 'passwordResetModal') {
            closePasswordResetModal();
        }
    });
    
    // Hover behavior for character cards:
    // - Adds/removes a visual `is-hovered` class
    // - Does NOT change focus or update the character sheet
    // - Clears keyboard focus when mouse takes over
    const characterGrid = document.getElementById('characterGrid');
    if (characterGrid) {
        characterGrid.addEventListener('mouseover', (e) => {
            const card = e.target.closest('.character-card');

            // Clear previous hover states
            document.querySelectorAll('.character-card.is-hovered').forEach(el => {
                if (el !== card) {
                    el.classList.remove('is-hovered');
                }
            });

            if (card) {
                card.classList.add('is-hovered');
                // Clear keyboard focus from all cards when mouse is active
                if (typeof KeyboardNav !== 'undefined' && KeyboardNav.clearAll) {
                    KeyboardNav.clearAll();
                }
            }
        });

        characterGrid.addEventListener('mouseleave', () => {
            document.querySelectorAll('.character-card.is-hovered').forEach(el => {
                el.classList.remove('is-hovered');
            });
        });
    }
    
    // Keyboard navigation (only after splash is dismissed)
    window.addEventListener('keydown', (e) => {
        if (splashActive) return; // Don't interfere with splash screen

        // If any modal is open, handle ESC and Cmd+Enter inside that modal only
        const openModal = document.querySelector('.modal.show');
        if (openModal) {
            const modalId = openModal.id;

            // ESC closes whichever modal is active
            if (e.key === 'Escape') {
                e.preventDefault();
                if (modalId === 'importModal') {
                    closeImportModal();
                } else if (modalId === 'duplicateModal') {
                    closeDuplicateModal();
                } else if (modalId === 'editDetailsModal') {
                    closeEditDetailsModal();
                } else if (modalId === 'authModal') {
                    closeAuthModal();
                } else if (modalId === 'migrationModal') {
                    closeMigrationModal();
                } else if (modalId === 'passwordResetModal') {
                    closePasswordResetModal();
                } else if (modalId === 'portraitPromptModal') {
                    closePortraitPromptModal();
                }
                return;
            }

            // Cmd+Enter (mac-style) triggers the primary CTA in the active modal
            if (e.key === 'Enter' && e.metaKey) {
                const primaryBtn = openModal.querySelector('.modal-footer .terminal-btn-primary');
                if (primaryBtn && !primaryBtn.disabled) {
                    e.preventDefault();
                    primaryBtn.click();
                }
                return;
            }

            // When a modal is open, don't process global shortcuts
            return;
        }

        // Handle keyboard shortcuts when in form elements
        const inFormElement = document.activeElement && (
            document.activeElement.tagName === 'INPUT' ||
            document.activeElement.tagName === 'TEXTAREA' ||
            document.activeElement.tagName === 'SELECT'
        );
        
        if (inFormElement) {
            // Escape to return to character grid from search
            if (e.key === 'Escape') {
                e.preventDefault();
                document.activeElement.blur();
                KeyboardNav.focusFirstCard();
            }
            return; // Don't process other keys when in form
        }

        // Keyboard shortcuts (when not in form elements)
        if (e.key === '/' || (e.key === 'f' && e.ctrlKey)) {
            // "/" or Ctrl+F to focus search
            e.preventDefault();
            KeyboardNav.focusSearch();
        } else if (e.key === 'ArrowUp') {
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
});
