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

    updateFocus() {
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
                return await window.CharacterCloudStorage.add(character);
            } catch (error) {
                console.error('☁️ Cloud add failed:', error);
                showNotification('❌ Failed to save to cloud. Please try again.');
                throw error;
            }
        }
        return this._localAdd(character);
    },

    // Update existing character
    async update(id, updates) {
        if (this.useCloud()) {
            try {
                return await window.CharacterCloudStorage.update(id, updates);
            } catch (error) {
                console.error('☁️ Cloud update failed:', error);
                showNotification('❌ Failed to update in cloud. Please try again.');
                throw error;
            }
        }
        return this._localUpdate(id, updates);
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
    loading: false,

    init() {
        this.loadCharacters();
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
        } catch (error) {
            console.error('Failed to load characters:', error);
            this.loading = false;
            showNotification('❌ Failed to load characters');
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
            grid.innerHTML = '';
            emptyState.classList.add('show');
            KeyboardNav.isActive = false;
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
        const topLines = lines.slice(startLine, endLine);
        
        // Use full width - don't crop horizontally
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
        const total = AppState.characters.length;
        const filtered = AppState.filteredCharacters.length;
        
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
        });
        
        // Populate ASCII portrait after rendering
        CharacterSheet.populatePortrait(character);
    },


    renderCharacterDetails_OLD(char) {
        const abilities = char.abilityScores || {};
        const skills = char.skills || {};
        const equipment = char.equipment || [];
        const spells = char.spells || [];

        return `
            <div class="detail-section">
                <h3>📊 Basic Info</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Race</div>
                        <div class="detail-value">${char.race || 'Unknown'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Class</div>
                        <div class="detail-value">${char.class || 'Unknown'}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Level</div>
                        <div class="detail-value">${char.level || 1}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Background</div>
                        <div class="detail-value">${char.background || 'None'}</div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>⚔️ Combat Stats</h3>
                <div class="detail-grid">
                    <div class="detail-item">
                        <div class="detail-label">Hit Points</div>
                        <div class="detail-value">${char.hitPoints?.current || 0} / ${char.hitPoints?.max || 0}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Armor Class</div>
                        <div class="detail-value">${char.armorClass || 10}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Initiative</div>
                        <div class="detail-value">+${char.initiative || 0}</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Speed</div>
                        <div class="detail-value">${char.speed || 30} ft</div>
                    </div>
                </div>
            </div>

            <div class="detail-section">
                <h3>💪 Ability Scores</h3>
                <div class="detail-grid">
                    ${['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ability => {
                        const score = abilities[ability] || 10;
                        const modifier = Math.floor((score - 10) / 2);
                        const modStr = modifier >= 0 ? `+${modifier}` : modifier;
                        return `
                            <div class="detail-item">
                                <div class="detail-label">${ability.toUpperCase()}</div>
                                <div class="detail-value">${score} (${modStr})</div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            ${Object.keys(skills).length > 0 ? `
                <div class="detail-section">
                    <h3>🎯 Skills</h3>
                    <div class="detail-grid">
                        ${Object.entries(skills).map(([skill, value]) => `
                            <div class="detail-item">
                                <div class="detail-label">${skill}</div>
                                <div class="detail-value">${value >= 0 ? '+' : ''}${value}</div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${equipment.length > 0 ? `
                <div class="detail-section">
                    <h3>🎒 Equipment</h3>
                    <div class="terminal-text">
                        ${equipment.map(item => `• ${item}`).join('<br>')}
                    </div>
                </div>
            ` : ''}

            ${spells.length > 0 ? `
                <div class="detail-section">
                    <h3>✨ Spells</h3>
                    <div class="terminal-text">
                        ${spells.map(spell => `• ${spell}`).join('<br>')}
                    </div>
                </div>
            ` : ''}

            ${char.backstory ? `
                <div class="detail-section">
                    <h3>📖 Backstory</h3>
                    <div class="terminal-text">${char.backstory}</div>
                </div>
            ` : ''}
        `;
    }
};

// ========================================
// EVENT HANDLERS
// ========================================

function createNewCharacter() {
    alert('This will link to your character builder!\n\nFor now, use Import to add characters.');
}

async function viewCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (character) {
        UI.showCharacterSheet(character);
        
        // Highlight selected card
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('is-selected');
        });
        const selectedCard = document.querySelector(`[data-id="${id}"]`);
        if (selectedCard) {
            selectedCard.classList.add('is-selected');
            
            // Move keyboard focus to the selected card
            const allCards = KeyboardNav.getCharacterCards();
            const cardIndex = allCards.indexOf(selectedCard);
            if (cardIndex !== -1) {
                KeyboardNav.currentFocusIndex = cardIndex;
                KeyboardNav.updateFocus();
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
    
    const newName = prompt('Enter new name for character:', character.name);
    if (newName && newName.trim() !== '') {
        await CharacterStorage.update(id, { name: newName.trim() });
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(id);
        showNotification(`Character renamed to: ${newName.trim()}`);
    }
}

let currentPortraitCharacterId = null;

async function generatePortraitForCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    // Check if race and class are defined
    if (!character.race || !character.class) {
        alert('This character needs both a race and class to generate a custom portrait.');
        return;
    }

    // Check portrait generation limit (3 per character)
    const portraitCount = character.customPortraitCount || 0;
    if (portraitCount >= 3) {
        alert('Portrait limit reached. You can generate up to 3 custom AI portraits per character.');
        return;
    }

    // Check if backend is available
    try {
        const statusCheck = await fetch(`${window.CONFIG.BACKEND_URL}/api/ai/status`);
        if (!statusCheck.ok) {
            alert('Backend server is not available. Make sure the backend is running on port 8000.');
            return;
        }
        const statusData = await statusCheck.json();
        if (!statusData.available) {
            alert('AI features are not available. The backend server is not configured properly.');
            return;
        }
    } catch (error) {
        alert('Cannot connect to backend server. Make sure it is running on http://localhost:8000');
        return;
    }

    // Show prompt modal
    currentPortraitCharacterId = id;
    
    // Build default prompt using character data
    const defaultPrompt = window.AIService && window.AIService.buildCharacterDescription
        ? window.AIService.buildCharacterDescription(character)
        : `${character.race} ${character.class}`;
    
    document.getElementById('portraitPrompt').value = defaultPrompt;
    document.getElementById('portraitPromptModal').classList.add('show');
}

function closePortraitPromptModal() {
    document.getElementById('portraitPromptModal').classList.remove('show');
    document.getElementById('portraitPrompt').value = '';
    currentPortraitCharacterId = null;
}

async function confirmGeneratePortrait() {
    if (!currentPortraitCharacterId) {
        closePortraitPromptModal();
        return;
    }

    const character = CharacterStorage.getById(currentPortraitCharacterId);
    if (!character) {
        closePortraitPromptModal();
        return;
    }

    const customPrompt = document.getElementById('portraitPrompt').value.trim();
    if (!customPrompt) {
        alert('Please enter a description for your character portrait.');
        return;
    }

    // Close modal
    closePortraitPromptModal();

    // Show loading state in the portrait area
    const portraitId = `character-portrait-${currentPortraitCharacterId}`;
    const portraitEl = document.getElementById(portraitId);
    
    let portraitLoadingInterval;
    let portraitElapsed = 0;
    
    const updatePortraitLoading = () => {
        if (!portraitEl) return;
        
        if (portraitElapsed < 5) {
            portraitEl.textContent = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...\n\n  Calling DALL-E...`;
        } else if (portraitElapsed < 15) {
            portraitEl.innerHTML = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...\n\n  DALL-E is working...\n  (this takes 20-30 seconds)`;
        } else if (portraitElapsed < 25) {
            portraitEl.innerHTML = `[<span class="spinner">↻</span>] GENERATING AI PORTRAIT...\n\n  Converting to ASCII art...`;
        } else {
            portraitEl.innerHTML = `[<span class="spinner">↻</span>] ALMOST DONE...\n\n  . . . ( ._.)`;
        }
        portraitElapsed++;
    };
    
    if (portraitEl) {
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

        console.log('%c🎨 PORTRAIT (Success) ✨', 'color: #0f0; font-weight: bold');

        // Update character in storage
        const currentCount = character.customPortraitCount || 0;
        const updates = {
            originalPortraitUrl: result.imageUrl,
            customPortraitAscii: result.asciiArt,
            customPortraitCount: currentCount + 1,
        };

        // Also update portrait object for consistency
        if (!updates.portrait) {
            updates.portrait = {};
        }
        updates.portrait = {
            ...character.portrait,
            url: result.imageUrl,
            ascii: result.asciiArt,
        };

        await CharacterStorage.update(currentPortraitCharacterId, updates);
        
        // Reload characters and UI
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(currentPortraitCharacterId);
        
        showNotification(`Custom AI portrait generated! (${3 - (currentCount + 1)} remaining)`);
    } catch (error) {
        console.error('Error generating custom AI portrait:', error);
        
        // Stop the loading animation
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
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

async function duplicateCharacter(id) {
    if (confirm('Create a copy of this character?')) {
        const duplicate = await CharacterStorage.duplicate(id);
        if (duplicate) {
            await AppState.loadCharacters();
            UI.render();
            showNotification(`Created: ${duplicate.name}`);
        }
    }
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
    if (character && confirm(`Delete ${character.name}?\n\nThis cannot be undone.`)) {
        await CharacterStorage.delete(id);
        await AppState.loadCharacters();
        UI.render();
        showNotification('Character deleted');
    }
}

let isImporting = false;  // Flag to prevent concurrent imports

function showImportModal() {
    document.getElementById('importModal').classList.add('show');
    
    // Disable import button until file is selected
    const importButton = document.querySelector('#importModal .modal-footer .terminal-btn-primary');
    if (importButton) {
        importButton.disabled = true;
    }
}

function closeImportModal() {
    console.log('🚪 closeImportModal() called, isImporting was:', isImporting);
    document.getElementById('importModal').classList.remove('show');
    document.getElementById('importFile').value = '';
    document.getElementById('fileName').textContent = '';
    
    // Re-enable the import button and reset text
    const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
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
    document.getElementById('duplicateModal').classList.add('show');
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
    const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
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
                const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
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
                alert('Invalid character file!');
                // Re-enable button on error
                const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
                if (importButton) {
                    importButton.disabled = false;
                    importButton.textContent = 'IMPORT';
                }
                isImporting = false;  // Reset on error
            }
        };
        reader.onerror = () => {
            alert('Error reading file!');
            // Re-enable button on error
            const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
            if (importButton) {
                importButton.disabled = false;
                importButton.textContent = 'IMPORT';
            }
            isImporting = false;  // Reset on error
        };
        console.log('📖 READER: Starting readAsText()');
        reader.readAsText(file);
    } else {
        alert('Please select a file to import.');
        // Re-enable button and reset flag
        const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
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
        toggleBtn.textContent = '👁 View Original';
        toggleBtn.title = 'Toggle between ASCII and original art';
    }
}

function showNotification(message) {
    // Console notification with visual styling
    console.log('%c✓ ' + message, 'color: #0f0; font-weight: bold');
    
    // TODO: Could add a toast notification UI element here in the future
    // For now, console is sufficient for debugging
}

// ========================================
// SPLASH SCREEN
// ========================================

let splashActive = true;

function dismissSplash() {
    const splash = document.getElementById('splash-content');
    const mainContent = document.getElementById('main-content');
    
    if (splash && splashActive) {
        splashActive = false;
        
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

function handleLogout() {
    if (confirm('Log out? Your characters will remain in the cloud and can be accessed after logging back in.')) {
        window.AuthService.logout();
        updateAuthUI();
        showNotification('✓ Logged out');
        
        // Reload with local storage
        AppState.loadCharacters();
        UI.render();
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userInfoDisplay.textContent = user ? `☁ ${user.username}` : '☁ Logged In';
        authBtn.textContent = 'LOGOUT';
        authBtn.onclick = handleLogout;
    } else {
        userInfoDisplay.textContent = '▣ Local Storage';
        authBtn.textContent = 'LOGIN';
        authBtn.onclick = showAuthModal;
    }
}

// ========================================
// MIGRATION UI HANDLERS
// ========================================

function showMigrationModal() {
    const count = window.MigrationService.getLocalCharacterCount();
    document.getElementById('migrationCount').textContent = count;
    document.getElementById('migrationModal').classList.add('show');
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

document.addEventListener('DOMContentLoaded', () => {
    // Initialize auth UI
    updateAuthUI();
    
    // Splash screen handlers
    const splash = document.getElementById('splash-content');
    if (splash) {
        // Dismiss on any key press (and don't let that key also trigger app shortcuts)
        const keyHandler = (e) => {
            if (!splashActive) return;
            
            // Prevent browser find/scroll and our main key handler
            e.preventDefault();
            e.stopPropagation();
            
            dismissSplash();
            
            // After main content fades in, move focus to search for immediate typing
            setTimeout(() => {
                if (!splashActive && typeof KeyboardNav !== 'undefined' && KeyboardNav.focusSearch) {
                    KeyboardNav.focusSearch();
                }
            }, 350);
        };
        window.addEventListener('keydown', keyHandler);
        
        // Dismiss on click
        splash.addEventListener('click', dismissSplash, { once: true });
    }
    
    // Initialize app state (async)
    AppState.init();
    UI.render();

    // Setup event listeners
    document.getElementById('searchInput').addEventListener('input', (e) => {
        AppState.searchTerm = e.target.value;
        AppState.applyFilters();
        UI.render();
    });

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
    
    // Clear keyboard focus when hovering over any card (mouse takes over)
    const characterGrid = document.getElementById('characterGrid');
    characterGrid.addEventListener('mouseenter', (e) => {
        const card = e.target.closest('.character-card');
        if (card) {
            // Clear keyboard focus from all cards when mouse is active
            KeyboardNav.clearAll();
        }
    }, true); // Use capture phase
    
    // Keyboard navigation (only after splash is dismissed)
    window.addEventListener('keydown', (e) => {
        if (splashActive) return; // Don't interfere with splash screen
        
        // Don't interfere if import modal is open
        const importModal = document.getElementById('importModal');
        if (importModal && importModal.classList.contains('show')) {
            // ESC to close modal
            if (e.key === 'Escape') {
                closeImportModal();
            }
            return;
        }
        
        // Don't interfere if duplicate modal is open
        const duplicateModal = document.getElementById('duplicateModal');
        if (duplicateModal && duplicateModal.classList.contains('show')) {
            // ESC to close modal
            if (e.key === 'Escape') {
                closeDuplicateModal();
            }
            return;
        }
        
        // Don't interfere if portrait prompt modal is open
        const portraitPromptModal = document.getElementById('portraitPromptModal');
        if (portraitPromptModal && portraitPromptModal.classList.contains('show')) {
            // ESC to close modal
            if (e.key === 'Escape') {
                closePortraitPromptModal();
            }
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
