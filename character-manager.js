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
// STORAGE SERVICE
// ========================================
const CharacterStorage = {
    STORAGE_KEY: 'dnd_characters',

    // Get all characters from localStorage
    getAll() {
        const data = localStorage.getItem(this.STORAGE_KEY);
        const characters = data ? JSON.parse(data) : [];
        console.log('💾 STORAGE.GETALL: Retrieved', characters.length, 'characters from localStorage');
        return characters;
    },

    // Save all characters to localStorage
    saveAll(characters) {
        console.log('💾 STORAGE.SAVEALL: Saving', characters.length, 'characters to localStorage');
        console.log('💾 STORAGE.SAVEALL: Character names:', characters.map(c => c.name).join(', '));
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
        console.log('💾 STORAGE.SAVEALL: Save complete');
    },

    // Get single character by ID
    getById(id) {
        const characters = this.getAll();
        return characters.find(char => char.id === id);
    },

    // Add new character
    add(character) {
        console.log('💾 STORAGE.ADD: Adding character:', character.name);
        const characters = this.getAll();
        console.log('💾 STORAGE.ADD: Current storage has', characters.length, 'characters before add');
        character.id = this.generateId();
        character.createdAt = new Date().toISOString();
        character.updatedAt = new Date().toISOString();
        characters.push(character);
        console.log('💾 STORAGE.ADD: After push, array has', characters.length, 'characters');
        this.saveAll(characters);
        console.log('💾 STORAGE.ADD: Character added with ID:', character.id);
        return character;
    },

    // Update existing character
    update(id, updates) {
        const characters = this.getAll();
        const index = characters.findIndex(char => char.id === id);
        if (index !== -1) {
            characters[index] = {
                ...characters[index],
                ...updates,
                updatedAt: new Date().toISOString()
            };
            this.saveAll(characters);
            return characters[index];
        }
        return null;
    },

    // Delete character
    delete(id) {
        console.log('🗑️ STORAGE.DELETE: Deleting character with ID:', id);
        const characters = this.getAll();
        const toDelete = characters.find(char => char.id === id);
        if (toDelete) {
            console.log('🗑️ STORAGE.DELETE: Found character to delete:', toDelete.name);
        } else {
            console.log('🗑️ STORAGE.DELETE: Character not found!');
        }
        console.log('🗑️ STORAGE.DELETE: Storage had', characters.length, 'characters before delete');
        const filtered = characters.filter(char => char.id !== id);
        console.log('🗑️ STORAGE.DELETE: After filter, have', filtered.length, 'characters');
        this.saveAll(filtered);
        const success = filtered.length < characters.length;
        console.log('🗑️ STORAGE.DELETE: Delete', success ? 'successful' : 'failed');
        return success;
    },

    // Duplicate character
    duplicate(id) {
        const character = this.getById(id);
        if (!character) return null;
        
        const duplicate = {
            ...character,
            name: `${character.name} (Copy)`,
            id: this.generateId(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const characters = this.getAll();
        characters.push(duplicate);
        this.saveAll(characters);
        return duplicate;
    },

    // Generate unique ID
    generateId() {
        return `char_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    },

    // Export character as JSON
    export(id) {
        const character = this.getById(id);
        if (!character) return null;
        return JSON.stringify(character, null, 2);
    },

    // Import character from JSON
    import(jsonString) {
        try {
            console.log('📥 IMPORT: Starting import...');
            const character = JSON.parse(jsonString);
            console.log('📥 IMPORT: Parsed character:', character.name);

            // Always work with the latest list from storage
            const existing = this.getAll();

            // Extract stable character UID from metadata (preferred) or top-level field
            const importedUid =
                character.metadata?.characterUid ||
                character.characterUid ||
                null;

            console.log('📥 IMPORT: characterUid from JSON:', importedUid);

            if (importedUid) {
                // Look for an indisputable duplicate: same stable UID already stored
                const uidMatches = existing.filter(
                    c =>
                        c.metadata?.characterUid === importedUid ||
                        c.characterUid === importedUid
                );

                if (uidMatches.length > 0) {
                    const match = uidMatches[0];
                    console.warn('📥 IMPORT: Stable UID match found - this is the same logical character.');
                    console.warn('📥 IMPORT: Existing match:', {
                        id: match.id,
                        name: match.name,
                    });

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

            // If we get here, we treat this as a new character. We intentionally
            // do NOT block on name or stat similarity – only on stable UID.

            // Remove ID to generate new one (even if no duplicate found, we want a fresh ID)
            delete character.id;
            const result = this.add(character);
            console.log('📥 IMPORT: Added character with new ID:', result.id);
            const allChars = this.getAll();
            console.log('📥 IMPORT: Total characters in storage now:', allChars.length);
            return result;
        } catch (error) {
            console.error('Import error:', error);
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

    init() {
        this.loadCharacters();
    },

    loadCharacters() {
        this.characters = CharacterStorage.getAll();
        console.log('📚 LOAD: Loaded', this.characters.length, 'characters from storage');
        console.log('📚 LOAD: Full character list with IDs:');
        this.characters.forEach((c, i) => {
            console.log(`  ${i+1}. ${c.name} (ID: ${c.id})`);
        });
        const names = this.characters.map(c => c.name);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length > 0) {
            console.warn('⚠️ DUPLICATE NAMES DETECTED:', duplicates);
            // Show which IDs have duplicate names
            duplicates.forEach(dupName => {
                const matches = this.characters.filter(c => c.name === dupName);
                console.warn(`  "${dupName}" appears ${matches.length} times with IDs:`, matches.map(m => m.id));
            });
        }
        this.applyFilters();
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
            onDuplicate: true,
            onExport: true,
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

function viewCharacter(id) {
    const character = CharacterStorage.getById(id);
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

function editCharacter(id) {
    alert('Edit functionality coming soon!\n\nFor now, you can duplicate and modify the character.');
}

function renameCharacter(id) {
    const character = CharacterStorage.getById(id);
    if (!character) return;
    
    const newName = prompt('Enter new name for character:', character.name);
    if (newName && newName.trim() !== '') {
        CharacterStorage.update(id, { name: newName.trim() });
        AppState.loadCharacters();
        UI.render();
        viewCharacter(id);
        showNotification(`Character renamed to: ${newName.trim()}`);
    }
}

function generatePortraitForCharacter(id) {
    alert('AI Portrait generation coming soon!\n\nThis feature will allow you to generate custom AI portraits for your character.');
}

function duplicateCharacter(id) {
    if (confirm('Create a copy of this character?')) {
        const duplicate = CharacterStorage.duplicate(id);
        if (duplicate) {
            AppState.loadCharacters();
            UI.render();
            showNotification(`Created: ${duplicate.name}`);
        }
    }
}

function exportCharacter(id) {
    const json = CharacterStorage.export(id);
    if (json) {
        const character = CharacterStorage.getById(id);
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

function deleteCharacter(id) {
    const character = CharacterStorage.getById(id);
    if (character && confirm(`Delete ${character.name}?\n\nThis cannot be undone.`)) {
        CharacterStorage.delete(id);
        AppState.loadCharacters();
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

function handleOverwriteCharacter(existingId, importData) {
    console.log('🔄 OVERWRITE: Replacing existing character with ID:', existingId);
    
    // Delete the existing character
    CharacterStorage.delete(existingId);
    
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

    const result = CharacterStorage.add(character);
    
    if (result) {
        console.log('✅ OVERWRITE SUCCESS: Character replaced');
        AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Replaced: ${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

function handleKeepBothCharacters(importData) {
    console.log('📋 KEEP BOTH: Importing with modified name');
    
    // Parse and modify the character name
    const character = JSON.parse(importData);
    const originalName = character.name;
    
    // Find a unique name by adding (Copy N)
    const existing = CharacterStorage.getAll();
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
    
    const result = CharacterStorage.add(character);
    
    if (result) {
        console.log('✅ KEEP BOTH SUCCESS: Character imported as', newName);
        AppState.loadCharacters();
        UI.render();
        closeImportModal();
        showNotification(`Imported as: ${result.name}`);
        setTimeout(() => viewCharacter(result.id), 100);
    }
}

function importCharacter() {
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
        reader.onload = (e) => {
            console.log('📖 READER.ONLOAD: Callback triggered, isImporting =', isImporting);
            const importData = e.target.result;
            const result = CharacterStorage.import(importData);
            
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
                AppState.loadCharacters();
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

function showNotification(message) {
    // Simple console notification for now
    console.log('✓', message);
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
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', () => {
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
    
    // Initialize app state
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
