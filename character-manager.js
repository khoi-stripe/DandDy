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
        return data ? JSON.parse(data) : [];
    },

    // Save all characters to localStorage
    saveAll(characters) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(characters));
    },

    // Get single character by ID
    getById(id) {
        const characters = this.getAll();
        return characters.find(char => char.id === id);
    },

    // Add new character
    add(character) {
        const characters = this.getAll();
        character.id = this.generateId();
        character.createdAt = new Date().toISOString();
        character.updatedAt = new Date().toISOString();
        characters.push(character);
        this.saveAll(characters);
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
        const characters = this.getAll();
        const filtered = characters.filter(char => char.id !== id);
        this.saveAll(filtered);
        return filtered.length < characters.length;
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
            // Remove ID to generate new one
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
        const names = this.characters.map(c => c.name);
        const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
        if (duplicates.length > 0) {
            console.warn('⚠️ DUPLICATE NAMES DETECTED:', duplicates);
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
        const countText = document.getElementById('countText');
        const total = AppState.characters.length;
        const filtered = AppState.filteredCharacters.length;
        
        if (total === filtered) {
            countText.textContent = `${total} character${total !== 1 ? 's' : ''}`;
        } else {
            countText.textContent = `${filtered} of ${total} character${total !== 1 ? 's' : ''}`;
        }
    },

    showCharacterSheet(character) {
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetContainer = document.getElementById('characterSheet');

        placeholder.classList.add('is-hidden');
        sheetContainer.classList.remove('is-hidden');
        sheetContainer.innerHTML = this.renderCharacterSheet(character);
        
        // Set ASCII portrait text content after rendering (to avoid HTML escaping issues)
        const portraitEl = document.getElementById(`character-portrait-${character.id || 'current'}`);
        const asciiPortrait = character.portrait?.ascii || character.customPortraitAscii || character.asciiPortrait || null;
        if (portraitEl && asciiPortrait) {
            portraitEl.textContent = asciiPortrait;
        }
    },

    renderCharacterSheet(char) {
        // Handle both old and new format
        const hp = char.hitPoints || { current: 0, max: 0 };
        const hpValue = typeof hp === 'number' ? hp : hp.max || 0;
        const hpCurrent = typeof hp === 'number' ? hp : hp.current || hpValue;
        
        // Abilities (handle both old 'abilityScores' and new 'abilities' format)
        const abilities = char.abilities || char.abilityScores || {};
        const abilityMods = char.abilityModifiers || {};
        
        // Skills (use skillModifiers from enhanced export if available)
        const skills = char.skillModifiers || char.skills || {};
        const skillProfs = char.skillProficiencies || [];
        
        // Equipment
        const equipment = char.equipment || [];
        const classEquipment = char.classData?.equipment || [];
        const allEquipment = [...new Set([...equipment, ...classEquipment])];
        
        // Other data
        const raceName = char.raceData?.name || char.race || 'Unknown';
        const className = char.classData?.name || char.class || 'Unknown';
        const backgroundName = char.backgroundData?.name || char.background || 'None';
        const profBonus = char.proficiencyBonus || 2;
        const speed = char.speed || 30;
        
        // Get ASCII portrait from various possible sources
        const asciiPortrait = char.portrait?.ascii || char.customPortraitAscii || char.asciiPortrait || null;
        const originalPortraitUrl = char.portrait?.url || char.originalPortraitUrl || null;

        return `
            <div class="sheet-title-header">
                <div class="sheet-title">${char.name || 'Unnamed Character'}</div>
                <div class="sheet-title-buttons">
                    <button class="button-secondary" onclick="editCharacter('${char.id}')">✎ EDIT</button>
                    <button class="button-secondary" onclick="duplicateCharacter('${char.id}')">⎘ COPY</button>
                    <button class="button-secondary" onclick="exportCharacter('${char.id}')">↑ EXPORT</button>
                    <button class="button-secondary" onclick="deleteCharacter('${char.id}')">× DELETE</button>
                </div>
            </div>

            ${asciiPortrait ? `
                <div class="portrait-container">
                    <div class="ascii-portrait" id="character-portrait-${char.id || 'current'}"></div>
                    ${originalPortraitUrl ? `
                        <div class="portrait-actions">
                            <a href="${originalPortraitUrl}" target="_blank" class="button-secondary">
                                👁 View Original Art
                            </a>
                        </div>
                    ` : ''}
                </div>
            ` : ''}

            <div class="sheet-section">
                <div class="sheet-header">
                </div>
                <div class="sheet-content">
                    ${raceName && raceName !== 'Unknown' ? `<div class="stat-line"><span class="stat-label">Race:</span> <span class="stat-value">${raceName}</span></div>` : ''}
                    ${className && className !== 'Unknown' ? `<div class="stat-line"><span class="stat-label">Class:</span> <span class="stat-value">${className}</span></div>` : ''}
                    ${backgroundName && backgroundName !== 'None' ? `<div class="stat-line"><span class="stat-label">Background:</span> <span class="stat-value">${backgroundName}</span></div>` : ''}
                    ${char.alignment ? `<div class="stat-line"><span class="stat-label">Alignment:</span> <span class="stat-value">${char.alignment}</span></div>` : ''}
                    <div class="stat-line">
                        <span class="stat-label">Level:</span>
                        <span class="stat-value">${char.level || 1}</span>
                    </div>
                </div>
            </div>

            <div class="sheet-section">
                <div class="sheet-header">
                    <div class="sheet-header-title">[ COMBAT STATS ]</div>
                </div>
                <div class="stat-grid">
                    <div class="stat-box">
                        <div class="stat-box-label">HIT POINTS</div>
                        <div class="stat-box-value">${hpCurrent} / ${hpValue}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">ARMOR CLASS</div>
                        <div class="stat-box-value">${char.armorClass || 10}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">INITIATIVE</div>
                        <div class="stat-box-value">${this.formatModifier(char.initiative || 0)}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">SPEED</div>
                        <div class="stat-box-value">${speed} ft</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">PROF BONUS</div>
                        <div class="stat-box-value">+${profBonus}</div>
                    </div>
                    <div class="stat-box">
                        <div class="stat-box-label">HIT DIE</div>
                        <div class="stat-box-value">d${char.classData?.hitDie || 6}</div>
                    </div>
                </div>
            </div>

            <div class="sheet-section">
                <div class="sheet-header">
                    <div class="sheet-header-title">[ ABILITY SCORES ]</div>
                </div>
                <div class="ability-grid">
                    ${['str', 'dex', 'con', 'int', 'wis', 'cha'].map(ability => {
                        const score = abilities[ability] || 10;
                        const modifier = abilityMods[ability] !== undefined 
                            ? abilityMods[ability] 
                            : Math.floor((score - 10) / 2);
                        const modStr = this.formatModifier(modifier);
                        return `
                            <div class="ability-box">
                                <div class="ability-name">${ability.toUpperCase()}</div>
                                <div class="ability-score">${score} <span class="ability-modifier">(${modStr})</span></div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>

            ${char.savingThrowModifiers ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ SAVING THROWS ]</div>
                    </div>
                    <div class="sheet-content">
                        ${Object.entries(char.savingThrowModifiers).map(([ability, value]) => {
                            const isProficient = char.savingThrows?.includes(ability);
                            return `
                                <div class="stat-line">
                                    <span class="stat-label">${ability.toUpperCase()}:</span>
                                    <span class="stat-value">${this.formatModifier(value)}${isProficient ? ' ★' : ''}</span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            ${Object.keys(skills).length > 0 || skillProfs.length > 0 ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ SKILLS ]</div>
                    </div>
                    <div class="sheet-content">
                        ${Object.keys(skills).length > 0 ? 
                            Object.entries(skills).map(([skill, value]) => `
                                <div class="stat-line">
                                    <span class="stat-label">${this.formatSkillName(skill)}:</span>
                                    <span class="stat-value">${this.formatModifier(value)} ★</span>
                                </div>
                            `).join('')
                        : skillProfs.map(skill => `
                            <div class="stat-line">
                                <span class="stat-label">${this.formatSkillName(skill)}:</span>
                                <span class="stat-value">★ Proficient</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}

            ${char.raceData?.traits?.length > 0 ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ RACIAL TRAITS ]</div>
                    </div>
                    <div class="sheet-content">
                        ${char.raceData.traits.map(trait => `<div class="text-dim">• ${trait}</div>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${allEquipment.length > 0 ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ EQUIPMENT ]</div>
                    </div>
                    <div class="sheet-content">
                        ${allEquipment.map(item => `<div class="text-dim">• ${item}</div>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${char.toolProficiencies?.length > 0 ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ TOOL PROFICIENCIES ]</div>
                    </div>
                    <div class="sheet-content">
                        ${char.toolProficiencies.map(tool => `<div class="text-dim">• ${this.formatSkillName(tool)}</div>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${char.languages?.length > 0 || char.raceData?.languages?.length > 0 ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ LANGUAGES ]</div>
                    </div>
                    <div class="sheet-content">
                        ${[...(char.languages || []), ...(char.raceData?.languages || [])].map(lang => `<div class="text-dim">• ${lang}</div>`).join('')}
                    </div>
                </div>
            ` : ''}

            ${char.backgroundData?.description ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ BACKGROUND: ${backgroundName.toUpperCase()} ]</div>
                    </div>
                    <div class="sheet-content text-dim">
                        ${char.backgroundData.description}
                    </div>
                </div>
            ` : ''}

            ${char.backgroundFeature || char.backgroundData?.feature ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ BACKGROUND FEATURE ]</div>
                    </div>
                    <div class="sheet-content">
                        <div class="stat-line"><span class="stat-label">${(char.backgroundFeature?.name || char.backgroundData?.feature?.name || 'Feature')}:</span></div>
                        <div class="text-dim">${(char.backgroundFeature?.description || char.backgroundData?.feature?.description || '')}</div>
                    </div>
                </div>
            ` : ''}

            ${char.backstory ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ BACKSTORY ]</div>
                    </div>
                    <div class="sheet-content text-dim">
                        ${char.backstory}
                    </div>
                </div>
            ` : ''}

            ${char.exportDate ? `
                <div class="sheet-section">
                    <div class="sheet-header">
                        <div class="sheet-header-title">[ EXPORT INFO ]</div>
                    </div>
                    <div class="sheet-content">
                        <div class="stat-line">
                            <span class="stat-label">Exported:</span>
                            <span class="stat-value">${new Date(char.exportDate).toLocaleDateString()}</span>
                        </div>
                        ${char.exportedBy ? `
                        <div class="stat-line">
                            <span class="stat-label">Source:</span>
                            <span class="stat-value">${char.exportedBy}</span>
                        </div>
                        ` : ''}
                        <div class="stat-line">
                            <span class="stat-label">Version:</span>
                            <span class="stat-value">${char.exportVersion || '1.0'}</span>
                        </div>
                    </div>
                </div>
            ` : ''}
        `;
    },

    formatModifier(value) {
        return value >= 0 ? `+${value}` : `${value}`;
    },

    formatSkillName(skill) {
        return skill.split('-').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
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
}

function closeImportModal() {
    document.getElementById('importModal').classList.remove('show');
    document.getElementById('importFile').value = '';
    document.getElementById('fileName').textContent = '';
    
    // Re-enable the import button
    const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
    if (importButton) {
        importButton.disabled = false;
        importButton.textContent = 'IMPORT';
    }
    
    isImporting = false;  // Reset flag when closing
}

function importCharacter() {
    console.log('🔵 importCharacter() called, isImporting =', isImporting);
    
    // Prevent concurrent imports
    if (isImporting) {
        console.log('⚠️ Import already in progress, blocking duplicate call');
        return;
    }
    
    // Disable the import button immediately
    const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
    if (importButton) {
        importButton.disabled = true;
        importButton.textContent = 'IMPORTING...';
    }
    
    const fileInput = document.getElementById('importFile');

    if (fileInput.files.length > 0) {
        isImporting = true;  // Set flag
        const file = fileInput.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            const result = CharacterStorage.import(e.target.result);
            if (result) {
                AppState.loadCharacters();
                UI.render();
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
        reader.readAsText(file);
    } else {
        alert('Please select a file to import.');
        // Re-enable button
        const importButton = document.querySelector('.modal-footer .terminal-btn-primary');
        if (importButton) {
            importButton.disabled = false;
            importButton.textContent = 'IMPORT';
        }
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
        // Dismiss on any key press
        const keyHandler = () => {
            if (splashActive) {
                dismissSplash();
            }
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
        if (e.target.files.length > 0) {
            fileNameDisplay.textContent = e.target.files[0].name;
        } else {
            fileNameDisplay.textContent = '';
        }
    });

    // Close import modal on outside click
    document.getElementById('importModal').addEventListener('click', (e) => {
        if (e.target.id === 'importModal') {
            closeImportModal();
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

    // Add some sample data if empty (for demo purposes)
    if (AppState.characters.length === 0) {
        addSampleCharacters();
    }
});

// ========================================
// SAMPLE DATA (for demo)
// ========================================

function addSampleCharacters() {
    const samples = [
        {
            name: "Thorin Ironforge",
            race: "dwarf",
            class: "fighter",
            level: 5,
            background: "soldier",
            alignment: "Lawful Good",
            hitPoints: 52,
            armorClass: 18,
            initiative: 1,
            speed: 25,
            proficiencyBonus: 3,
            abilities: {
                str: 16,
                dex: 12,
                con: 16,
                int: 10,
                wis: 13,
                cha: 8
            },
            abilityModifiers: {
                str: 3,
                dex: 1,
                con: 3,
                int: 0,
                wis: 1,
                cha: -1
            },
            savingThrows: ['str', 'con'],
            savingThrowModifiers: {
                str: 6,
                dex: 1,
                con: 6,
                int: 0,
                wis: 1,
                cha: -1
            },
            skillProficiencies: ['athletics', 'intimidation', 'perception'],
            skillModifiers: {
                'athletics': 6,
                'intimidation': 2,
                'perception': 4
            },
            equipment: ["Warhammer", "Shield", "Plate Armor", "Adventurer's Pack"],
            raceData: {
                name: "Dwarf",
                size: "Medium",
                speed: 25,
                traits: ["Darkvision", "Dwarven Resilience", "Stonecunning"],
                languages: ["Common", "Dwarvish"]
            },
            classData: {
                name: "Fighter",
                hitDie: 10,
                primaryAbility: "Strength",
                savingThrows: ['str', 'con'],
                equipment: ["Chain Mail", "Martial Weapon", "Shield"]
            },
            backgroundData: {
                name: "Soldier",
                feature: {
                    name: "Military Rank",
                    description: "You have a military rank from your career as a soldier."
                }
            },
            backstory: "A veteran soldier from the mountain halls, seeking glory in battle.",
            portrait: {
                ascii: `
    _____
   |     |
   | O O |
   |  ^  |
   | \\_/ |
   |_____|
     | |
    /| |\\
   / | | \\
     | |
    /   \\
   /     \\
  /_______\\`,
                original: null
            }
        },
        {
            name: "Elara Moonwhisper",
            race: "elf",
            class: "wizard",
            level: 3,
            background: "sage",
            alignment: "Neutral Good",
            hitPoints: 18,
            armorClass: 12,
            initiative: 2,
            speed: 30,
            proficiencyBonus: 2,
            abilities: {
                str: 8,
                dex: 14,
                con: 13,
                int: 17,
                wis: 12,
                cha: 10
            },
            abilityModifiers: {
                str: -1,
                dex: 2,
                con: 1,
                int: 3,
                wis: 1,
                cha: 0
            },
            savingThrows: ['int', 'wis'],
            savingThrowModifiers: {
                str: -1,
                dex: 2,
                con: 1,
                int: 5,
                wis: 3,
                cha: 0
            },
            skillProficiencies: ['arcana', 'history', 'investigation'],
            skillModifiers: {
                'arcana': 5,
                'history': 5,
                'investigation': 5
            },
            equipment: ["Spellbook", "Component Pouch", "Quarterstaff", "Scholar's Pack"],
            raceData: {
                name: "Elf",
                size: "Medium",
                speed: 30,
                traits: ["Darkvision", "Fey Ancestry", "Trance"],
                languages: ["Common", "Elvish"]
            },
            classData: {
                name: "Wizard",
                hitDie: 6,
                primaryAbility: "Intelligence",
                savingThrows: ['int', 'wis'],
                equipment: ["Spellbook", "Arcane Focus"],
                spellcaster: true
            },
            backgroundData: {
                name: "Sage",
                feature: {
                    name: "Researcher",
                    description: "When you attempt to learn or recall a piece of lore, if you do not know that information, you often know where and from whom you can obtain it."
                }
            },
            backstory: "A young scholar fascinated by ancient magic and forgotten lore.",
            portrait: {
                ascii: `
     /\\
    /  \\
   | () |
    \\  /
     \\/
    _||_
   /    \\
  |  /\\  |
  | |  | |
   \\|  |/
    |  |
   /|  |\\
  / |  | \\`,
                original: null
            }
        }
    ];

    samples.forEach(char => CharacterStorage.add(char));
    AppState.loadCharacters();
    UI.render();
}

