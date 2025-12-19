// ========================================
// KEYBOARD NAVIGATION
// ========================================
// HTML escaping is provided by Utils.escapeHtml from character-builder-utils.js
const KeyboardNav = {
    currentFocusIndex: 0,
    isActive: true,
    mode: 'cards', // 'cards' or 'form'

    /**
     * Dynamically calculate the number of columns in the grid
     * by measuring actual card positions.
     */
    getGridColumns() {
        const cards = this.getCharacterCards();
        if (cards.length < 2) return 1;
        
        // Compare the top position of the first two cards
        // If they're the same, they're in the same row
        const firstTop = cards[0].getBoundingClientRect().top;
        let columnsInFirstRow = 1;
        
        for (let i = 1; i < cards.length; i++) {
            const cardTop = cards[i].getBoundingClientRect().top;
            // Allow small tolerance for rounding errors
            if (Math.abs(cardTop - firstTop) < 5) {
                columnsInFirstRow++;
            } else {
                break;
            }
        }
        
        return columnsInFirstRow;
    },

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

        // Move up by the actual number of grid columns
        const columns = this.getGridColumns();
        this.currentFocusIndex = Math.max(0, this.currentFocusIndex - columns);
        this.updateFocus();
    },

    moveDown() {
        if (!this.isActive) return;
        const cards = this.getCharacterCards();
        if (cards.length === 0) return;

        // Move down by the actual number of grid columns
        const columns = this.getGridColumns();
        this.currentFocusIndex = Math.min(cards.length - 1, this.currentFocusIndex + columns);
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
        // Reset keyboard focus index without forcing an immediate sheet
        // update. This avoids surprising jumps in the right-hand character
        // sheet when the grid is re-rendered (e.g. after sorting or search).
        this.currentFocusIndex = 0;
        this.updateFocus(true);
    },

    clearAll() {
        // Clear keyboard focus from all cards (used when mouse takes over)
        const cards = this.getCharacterCards();
        cards.forEach(card => card.classList.remove('is-keyboard-focused'));
    }
};

// ========================================
// MODAL MANAGER (Universal modal behaviors)
// ========================================
const ModalManager = {
    // Track original form values for dirty checking
    _formSnapshots: new Map(),
    
    // Modals that have forms which can be dirty
    FORM_MODALS: ['editDetailsModal', 'spellEditModal', 'portraitPromptModal'],
    
    /**
     * Initialize modal behaviors (call once on page load)
     */
    init() {
        // Backdrop click to close
        document.addEventListener('click', (e) => {
            if (!e.target || typeof e.target.closest !== 'function') return;
            const modal = e.target.closest('.modal.show');
            if (!modal) return;
            
            // Only close if clicking the backdrop (the .modal itself, not .modal-content)
            if (e.target === modal) {
                this.requestClose(modal.id);
            }
        });
    },
    
    /**
     * Snapshot form values when a modal opens (for dirty checking)
     */
    snapshotForm(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        const inputs = modal.querySelectorAll('input, textarea, select');
        const snapshot = {};
        inputs.forEach(input => {
            if (input.id) {
                snapshot[input.id] = input.value;
            }
        });
        this._formSnapshots.set(modalId, snapshot);
    },
    
    /**
     * Check if a modal's form has unsaved changes
     */
    isDirty(modalId) {
        // Check if manually marked dirty (e.g., spell changes)
        if (this._manuallyDirty.has(modalId)) {
            return true;
        }
        
        const modal = document.getElementById(modalId);
        if (!modal) return false;
        
        const snapshot = this._formSnapshots.get(modalId);
        if (!snapshot) return false;
        
        const inputs = modal.querySelectorAll('input, textarea, select');
        for (const input of inputs) {
            if (input.id && snapshot[input.id] !== undefined) {
                if (input.value !== snapshot[input.id]) {
                    return true;
                }
            }
        }
        return false;
    },
    
    /**
     * Clear form snapshot
     */
    clearSnapshot(modalId) {
        this._formSnapshots.delete(modalId);
        this._manuallyDirty.delete(modalId);
    },
    
    // Track modals that have been manually marked dirty (e.g., spell changes)
    _manuallyDirty: new Set(),
    
    /**
     * Manually mark a modal as dirty (for changes that don't update form inputs)
     */
    markDirty(modalId) {
        this._manuallyDirty.add(modalId);
    },
    
    /**
     * Request to close a modal - shows confirmation if dirty
     */
    requestClose(modalId) {
        // Check if this is a form modal that might have unsaved changes
        if (this.FORM_MODALS.includes(modalId) && this.isDirty(modalId)) {
            this.showDiscardConfirmation(modalId);
            return;
        }
        
        // Not dirty or not a form modal - close immediately
        this.closeModal(modalId);
    },
    
    /**
     * Show discard confirmation dialog
     */
    showDiscardConfirmation(modalId) {
        const modal = document.getElementById(modalId);
        if (!modal) return;
        
        // Create confirmation overlay inside the modal
        let overlay = modal.querySelector('.modal-discard-confirm');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'modal-discard-confirm';
            overlay.innerHTML = `
                <div class="modal-discard-content">
                    <p class="terminal-text">You have unsaved changes.</p>
                    <p class="terminal-text-small terminal-text-dim">Discard changes and close?</p>
                    <div class="modal-discard-actions">
                        <button class="terminal-btn modal-discard-cancel">Keep editing</button>
                        <button class="terminal-btn modal-discard-confirm-btn">Discard</button>
                    </div>
                </div>
            `;
            modal.querySelector('.modal-content').appendChild(overlay);
        }
        
        overlay.classList.add('show');
        
        // Focus the cancel button
        const cancelBtn = overlay.querySelector('.modal-discard-cancel');
        if (cancelBtn) cancelBtn.focus();
        
        // Handle button clicks
        const handleCancel = () => {
            overlay.classList.remove('show');
            cleanup();
        };
        
        const handleDiscard = () => {
            overlay.classList.remove('show');
            cleanup();
            this.closeModal(modalId, true); // force close
        };
        
        const cleanup = () => {
            cancelBtn?.removeEventListener('click', handleCancel);
            overlay.querySelector('.modal-discard-confirm-btn')?.removeEventListener('click', handleDiscard);
        };
        
        cancelBtn?.addEventListener('click', handleCancel);
        overlay.querySelector('.modal-discard-confirm-btn')?.addEventListener('click', handleDiscard);
    },
    
    /**
     * Actually close the modal (bypasses dirty check)
     */
    closeModal(modalId, force = false) {
        this.clearSnapshot(modalId);
        
        // Call the appropriate close function
        switch (modalId) {
            case 'importModal':
                closeImportModal();
                break;
            case 'duplicateModal':
                closeDuplicateModal();
                break;
            case 'editDetailsModal':
                closeEditDetailsModal();
                break;
            case 'spellEditModal':
                closeSpellEditModal();
                break;
            case 'authModal':
                cancelAuthFlow();
                break;
            case 'migrationModal':
                closeMigrationModal();
                break;
            case 'passwordResetModal':
                closePasswordResetModal();
                break;
            case 'portraitPromptModal':
                closePortraitPromptModal();
                break;
            case 'managerSettingsModal':
                closeManagerSettings();
                break;
            default:
                // Generic close for unknown modals
                const modal = document.getElementById(modalId);
                if (modal) {
                    animateModalClose(modal, { removeOnClose: false });
                }
        }
    }
};

// ========================================
// HYBRID STORAGE SERVICE (Cloud + Local)
// ========================================
// Shared implementation now lives in character-storage.js and exposes
// `window.CharacterStorage`. This file aliases it for local use.
const DEBUG_MANAGER = !!(window.DanddyConfig && window.DanddyConfig.DEBUG);
const CharacterStorage = window.CharacterStorage;

// Utility: normalize card subtitle text (race + class) to sentence case
function toSentenceCase(text) {
    if (!text) return '';
    const lower = String(text).toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
}

// ========================================
// APP STATE
// ========================================
const AppState = {
    characters: [],
    filteredCharacters: [],
    searchTerm: '',
    sortMode: 'dateModified', // 'alphabetical' | 'dateModified'
    // The character id that should be considered "selected" across the UI.
    // This is the single source of truth used to keep the left-hand card
    // highlight, keyboard focus, and right-hand sheet in sync.
    selectedCharacterId: null,
    loading: false,

    async init() {
        await this.loadCharacters();
    },

    async loadCharacters() {
        try {
            this.loading = true;
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(true);
            }
            this.characters = await CharacterStorage.getAll();
            if (DEBUG_MANAGER) {
                console.log('📚 LOAD: Loaded', this.characters.length, 'characters from storage');
                console.log('📚 LOAD: Full character list with IDs:');
                this.characters.forEach((c, i) => {
                    console.log(`  ${i+1}. ${c.name} (ID: ${c.id})`);
                });
            }
            
            // Check for characters with missing/empty names
            const charsWithMissingNames = this.characters.filter(c => !c.name || !c.name.trim());
            if (charsWithMissingNames.length > 0) {
                console.warn('⚠️ CHARACTERS WITH MISSING NAMES:', charsWithMissingNames.length);
                console.warn('  IDs:', charsWithMissingNames.map(c => c.id));
                console.warn('  These may be incomplete characters from failed creation attempts.');
            }
            
            // Check for actual duplicate names (excluding empty names)
            const validNames = this.characters.filter(c => c.name && c.name.trim()).map(c => c.name);
            const duplicates = validNames.filter((name, index) => validNames.indexOf(name) !== index);
            if (duplicates.length > 0) {
                console.warn('⚠️ DUPLICATE NAMES DETECTED:', [...new Set(duplicates)]);
                [...new Set(duplicates)].forEach(dupName => {
                    const matches = this.characters.filter(c => c.name === dupName);
                    console.warn(`  "${dupName}" appears ${matches.length} times with IDs:`, matches.map(m => m.id));
                });
            }
            this.applyFilters();
            this.loading = false;
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(false);
            }
            UI.render(); // Re-render after characters load
        } catch (error) {
            console.error('Failed to load characters:', error);
            this.loading = false;
            showNotification('❌ Failed to load characters');
            if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
                UI.setLoadingState(false);
            }
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

        // Helper: compute effective "date modified" timestamp for sorting.
        const getSortTime = (char) => {
            if (!char) return 0;
            const metadataExportDate =
                char.metadata && (char.metadata.exportDate || char.metadata.exportedAt);
            const raw =
                char.updatedAt ||
                char.createdAt ||
                metadataExportDate ||
                0;
            const t = new Date(raw).getTime();
            return Number.isFinite(t) ? t : 0;
        };

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
            // Sort by most recently modified using canonical timestamps
            filtered.sort((a, b) => {
                const aTime = getSortTime(a);
                const bTime = getSortTime(b);
                if (aTime === bTime) {
                    return (a.name || '').localeCompare(b.name || '');
                }
                return bTime - aTime; // newest first
            });
        }

        this.filteredCharacters = filtered;
    }
};

// Tracks the most recent in-flight viewCharacter call so that slower, stale
// requests (for previously selected characters) can't overwrite the sheet for
// the most recently clicked or focused card.
let latestViewCharacterRequestId = 0;

// ========================================
// MOBILE VIEW HANDLING
// ========================================
const MOBILE_BREAKPOINT = 768;

const MobileView = {
    /** Check if we're currently at mobile viewport width */
    isMobile() {
        return window.innerWidth <= MOBILE_BREAKPOINT;
    },

    /** Track the previous viewport state to detect transitions */
    _wasMobile: null,
    
    /** Swipe tracking state */
    _touchStartX: 0,
    _touchStartY: 0,
    _touchCurrentX: 0,
    _touchCurrentY: 0,
    _isSwiping: false,
    _swipeDirection: null, // 'horizontal', 'vertical', or null (undetermined)
    _pointerId: null,
    _minSwipeDistance: 50,      // Min distance to trigger navigation
    _directionLockThreshold: 10, // Threshold to determine swipe direction intent

    /** Initialize resize listener for viewport transitions */
    init() {
        this._wasMobile = this.isMobile();
        window.addEventListener('resize', () => this.handleResize());
        this.initSwipeHandlers();
        this.initScrollHandler();
    },
    
    /** Track scroll state for header collapse */
    _lastScrollTop: 0,
    _scrollThreshold: 20,
    
    /** Initialize scroll handler for mobile header collapse */
    initScrollHandler() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        const header = document.querySelector('.terminal-header');
        if (!header) return;
        
        // Clear any stale scrolled state on init
        if (!this.isMobile()) {
            header.classList.remove('is-scrolled');
        }
        
        // Handle resize: clear scrolled state when switching to desktop
        window.addEventListener('resize', () => {
            if (!this.isMobile()) {
                header.classList.remove('is-scrolled');
            }
        });
        
        leftPanel.addEventListener('scroll', () => {
            if (!this.isMobile()) return;
            
            const scrollTop = leftPanel.scrollTop;
            
            // Add/remove scrolled class based on scroll position
            // CSS handles the max-height transition
            if (scrollTop > this._scrollThreshold) {
                header.classList.add('is-scrolled');
            } else {
                header.classList.remove('is-scrolled');
            }
            
            this._lastScrollTop = scrollTop;
        }, { passive: true });
    },
    
    /** Initialize swipe gesture handlers for mobile navigation */
    initSwipeHandlers() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        // Use pointer events for better compatibility with Chrome DevTools simulator
        // pointerdown - start tracking
        leftPanel.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch' || e.pointerType === 'pen' || this.isMobile()) {
                this._touchStartX = e.clientX;
                this._touchStartY = e.clientY;
                this._touchCurrentX = e.clientX;
                this._touchCurrentY = e.clientY;
                this._isSwiping = true;
                this._swipeDirection = null; // Reset direction lock
                this._pointerId = e.pointerId;
            }
        }, { passive: true });
        
        // pointermove - track movement and determine direction intent
        leftPanel.addEventListener('pointermove', (e) => {
            if (!this._isSwiping) return;
            if (!this.isOpen()) return; // Only handle when viewing a sheet
            
            this._touchCurrentX = e.clientX;
            this._touchCurrentY = e.clientY;
            
            const deltaX = this._touchCurrentX - this._touchStartX;
            const deltaY = this._touchCurrentY - this._touchStartY;
            const absX = Math.abs(deltaX);
            const absY = Math.abs(deltaY);
            
            // Determine direction if not yet locked and movement exceeds threshold
            if (this._swipeDirection === null && (absX > this._directionLockThreshold || absY > this._directionLockThreshold)) {
                // Use a ratio to determine intent: horizontal if X movement is at least 1.5x Y movement
                if (absX > absY * 1.5) {
                    this._swipeDirection = 'horizontal';
                    // Add class to indicate horizontal swipe in progress (prevents scroll)
                    leftPanel.classList.add('is-swiping-horizontal');
                } else if (absY > absX * 1.5) {
                    this._swipeDirection = 'vertical';
                }
                // If neither is dominant yet, wait for more movement
            }
            
            // If locked to horizontal, prevent default to stop vertical scrolling
            if (this._swipeDirection === 'horizontal') {
                e.preventDefault();
            }
        }, { passive: false }); // passive: false so we can preventDefault
        
        // pointerup - complete the gesture
        leftPanel.addEventListener('pointerup', (e) => {
            if (this._isSwiping) {
                this._touchCurrentX = e.clientX;
                this._touchCurrentY = e.clientY;
                this._isSwiping = false;
                leftPanel.classList.remove('is-swiping-horizontal');
                this._pointerId = null;
                this.handleSwipe();
            }
        }, { passive: true });
        
        // pointercancel - abort the gesture
        leftPanel.addEventListener('pointercancel', () => {
            this._isSwiping = false;
            this._swipeDirection = null;
            leftPanel.classList.remove('is-swiping-horizontal');
        }, { passive: true });
        
        // Also handle pointerleave to clean up if finger leaves the element
        leftPanel.addEventListener('pointerleave', (e) => {
            // Only cancel if we haven't locked direction yet
            if (this._isSwiping && this._swipeDirection === null) {
                this._isSwiping = false;
                leftPanel.classList.remove('is-swiping-horizontal');
            }
        }, { passive: true });
    },
    
    /** Handle swipe gesture detection */
    handleSwipe() {
        // Only handle swipes when viewing a character sheet on mobile
        if (!this.isOpen()) return;
        
        // Only process if we determined this was a horizontal swipe
        if (this._swipeDirection !== 'horizontal') {
            this._swipeDirection = null;
            return;
        }
        
        const deltaX = this._touchCurrentX - this._touchStartX;
        
        // Reset direction for next gesture
        this._swipeDirection = null;
        
        // Check if swipe distance meets minimum threshold
        if (Math.abs(deltaX) < this._minSwipeDistance) return;
        
        if (deltaX > 0) {
            // Swipe right → go to previous character
            this.navigateToPreviousCharacter();
        } else {
            // Swipe left → go to next character
            this.navigateToNextCharacter();
        }
    },
    
    /** Navigate to the next character in the grid (carousel) */
    navigateToNextCharacter() {
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) return;
        
        const currentId = AppState.selectedCharacterId;
        const currentIndex = characters.findIndex(c => c.id === currentId);
        
        // Carousel: wrap to first if at end
        const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % characters.length;
        const nextCharacter = characters[nextIndex];
        
        if (nextCharacter) {
            this.showSwipeLoader();
            viewCharacter(nextCharacter.id, { skipKeyboardSync: false, updateUrl: true });
        }
    },
    
    /** Navigate to the previous character in the grid (carousel) */
    navigateToPreviousCharacter() {
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) return;
        
        const currentId = AppState.selectedCharacterId;
        const currentIndex = characters.findIndex(c => c.id === currentId);
        
        // Carousel: wrap to last if at beginning
        const prevIndex = currentIndex <= 0 ? characters.length - 1 : currentIndex - 1;
        const prevCharacter = characters[prevIndex];
        
        if (prevCharacter) {
            this.showSwipeLoader();
            viewCharacter(prevCharacter.id, { skipKeyboardSync: false, updateUrl: true });
        }
    },
    
    /** Flag to track if we're in a swipe loading transition */
    _isSwipeLoading: false,
    
    /** Show the swipe loading overlay */
    showSwipeLoader() {
        this._isSwipeLoading = true;
    },
    
    /** Hide the swipe loading overlay */
    hideSwipeLoader() {
        this._isSwipeLoading = false;
        const loader = document.querySelector('.mobile-swipe-loader');
        if (loader) {
            loader.remove();
        }
    },

    /** Handle viewport resize transitions */
    handleResize() {
        const isMobileNow = this.isMobile();
        
        // No change in viewport category
        if (isMobileNow === this._wasMobile) return;
        
        const wasDesktop = this._wasMobile === false;
        const isNowMobile = isMobileNow === true;
        const wasModalOpen = this.isOpen();
        
        this._wasMobile = isMobileNow;
        
        if (wasDesktop && isNowMobile) {
            // Desktop → Mobile: preserve selected character and open mobile sheet
            const selectedId = AppState?.selectedCharacterId;
            if (selectedId) {
                // Use double requestAnimationFrame to ensure DOM/CSS is fully settled after resize
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        // Verify selection is still valid
                        if (AppState.selectedCharacterId === selectedId) {
                            // Re-trigger viewCharacter which handles mobile opening properly
                            viewCharacter(selectedId, { skipKeyboardSync: true, updateUrl: false });
                        }
                    });
                });
            }
            // If no character was selected on desktop, do nothing - user can tap to view
        } else if (!isMobileNow) {
            // Mobile → Desktop: close modal view but preserve selected character
            const selectedId = AppState?.selectedCharacterId;
            
            if (wasModalOpen) {
                // Close the modal view without clearing selection (don't use this.close())
                const leftPanel = document.getElementById('character-list-panel');
                if (leftPanel) {
                    leftPanel.classList.remove('is-viewing-sheet');
                }
            }
            // Clear scroll state on header when going to desktop
            const header = document.querySelector('.terminal-header');
            if (header) header.classList.remove('is-scrolled');
            
            // If nothing is selected, auto-select the first character
            // Otherwise keep the current selection from mobile
            if (!selectedId && AppState.filteredCharacters.length > 0) {
                const firstChar = AppState.filteredCharacters[0];
                viewCharacter(firstChar.id, { skipKeyboardSync: false, updateUrl: true });
            }
        }
    },

    /** Check if mobile sheet view is open */
    isOpen() {
        const leftPanel = document.getElementById('character-list-panel');
        return leftPanel && leftPanel.classList.contains('is-viewing-sheet');
    },

    /** Open the mobile sheet view for a character (swaps grid for sheet) */
    open(characterId) {
        const leftPanel = document.getElementById('character-list-panel');
        const container = document.getElementById('mobileSheetContainer');
        
        if (!leftPanel || !container) return;
        
        // Check if we're in a swipe transition (loader was shown)
        const isSwipeTransition = this._isSwipeLoading;
        
        // Clone the character sheet content into the container
        const sourceSheet = document.getElementById('characterSheet');
        if (sourceSheet) {
            container.innerHTML = sourceSheet.innerHTML;
        }
        
        // If this was a swipe transition, re-add the loader overlay
        if (isSwipeTransition) {
            this.addSwipeLoaderToContainer(container);
        }
        
        // Swap to sheet view
        leftPanel.classList.add('is-viewing-sheet');
        
        // Update character count display
        this.updateCharacterCount(characterId);
        
        // Scroll to top
        leftPanel.scrollTop = 0;
        
        // Wait for portrait image to load before hiding the loader
        if (isSwipeTransition) {
            this.waitForPortraitLoad(container);
        }
    },
    
    /** Update the character count display in the mobile back bar */
    updateCharacterCount(characterId) {
        const countEl = document.getElementById('mobileCharacterCount');
        if (!countEl) return;
        
        const characters = AppState.filteredCharacters;
        if (!characters || characters.length === 0) {
            countEl.textContent = '';
            return;
        }
        
        const currentIndex = characters.findIndex(c => c.id === characterId);
        const currentNum = currentIndex >= 0 ? currentIndex + 1 : 1;
        const total = characters.length;
        
        countEl.textContent = currentNum + ' of ' + total;
    },
    
    /** Add the swipe loader overlay to the portrait container */
    addSwipeLoaderToContainer(container) {
        // Find the portrait container within the sheet
        const portraitContainer = container.querySelector('.portrait-container');
        if (!portraitContainer) return;
        
        const loader = document.createElement('div');
        loader.className = 'mobile-swipe-loader is-visible';
        loader.innerHTML = `
            <div class="panel-loading-cube-container">
                <div class="panel-loading-cube">
                    <i></i><i></i><i></i><i></i><i></i><i></i>
                </div>
            </div>
        `;
        portraitContainer.appendChild(loader);
    },
    
    /** Wait for portrait image to load, then hide the swipe loader */
    waitForPortraitLoad(container) {
        // Minimum time to show loader for visual feedback (prevents flicker)
        const MIN_LOADER_DURATION = 150;
        const loaderStartTime = Date.now();
        
        const hideWithMinDuration = () => {
            const elapsed = Date.now() - loaderStartTime;
            const remaining = MIN_LOADER_DURATION - elapsed;
            if (remaining > 0) {
                setTimeout(() => this.hideSwipeLoader(), remaining);
            } else {
                this.hideSwipeLoader();
            }
        };
        
        // Find all portrait images in the container (original and/or ascii)
        const images = container.querySelectorAll('img.original-portrait, .ascii-portrait img');
        
        if (images.length === 0) {
            // No images found - hide after minimum duration
            hideWithMinDuration();
            return;
        }
        
        // Track how many images need to load
        let pendingCount = 0;
        let loadedOrErrored = 0;
        
        const checkComplete = () => {
            loadedOrErrored++;
            if (loadedOrErrored >= pendingCount) {
                hideWithMinDuration();
            }
        };
        
        images.forEach(img => {
            if (!img.complete) {
                pendingCount++;
                img.addEventListener('load', checkComplete, { once: true });
                img.addEventListener('error', checkComplete, { once: true });
            }
        });
        
        if (pendingCount === 0) {
            // All images already loaded (cached) - hide after minimum duration
            hideWithMinDuration();
        } else {
            // Fallback timeout in case something goes wrong (5 seconds)
            setTimeout(() => {
                this.hideSwipeLoader();
            }, 5000);
        }
    },

    /** Close the mobile sheet view (returns to grid) */
    close() {
        const leftPanel = document.getElementById('character-list-panel');
        if (!leftPanel) return;
        
        leftPanel.classList.remove('is-viewing-sheet');
        
        // Clear selection state on mobile when going back
        if (typeof AppState !== 'undefined' && AppState) {
            AppState.selectedCharacterId = null;
        }
        
        // Remove is-selected from all cards
        document.querySelectorAll('.character-card').forEach(card => {
            card.classList.remove('is-selected');
        });
        
        // Clear URL param
        clearCharacterFromUrl();
    }
};

// ========================================
// PORTRAIT LIGHTBOX (Mobile)
// Full-screen image viewer for character portraits
// ========================================
const PortraitLightbox = {
    _lightbox: null,
    _isTouch: false,
    
    /** Create the lightbox element if it doesn't exist */
    _ensureLightbox() {
        if (this._lightbox) return this._lightbox;
        
        const lightbox = document.createElement('div');
        lightbox.className = 'portrait-lightbox';
        lightbox.innerHTML = `
            <div class="portrait-lightbox-backdrop"></div>
            <img class="portrait-lightbox-image" src="" alt="Portrait">
            <div class="portrait-lightbox-name"></div>
            <div class="portrait-lightbox-hint">Tap to close</div>
        `;
        document.body.appendChild(lightbox);
        this._lightbox = lightbox;
        
        // Close on backdrop tap
        const backdrop = lightbox.querySelector('.portrait-lightbox-backdrop');
        backdrop.addEventListener('click', () => this.close());
        
        // Also close on lightbox tap (anywhere)
        lightbox.addEventListener('click', (e) => {
            // Only close if tap is on the lightbox itself or backdrop, not the image
            if (e.target === lightbox || e.target === backdrop) {
                this.close();
            }
        });
        
        // Close on escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isOpen()) {
                this.close();
            }
        });
        
        return lightbox;
    },
    
    /** Check if lightbox is currently open */
    isOpen() {
        return this._lightbox && this._lightbox.classList.contains('is-open');
    },
    
    /** Open the lightbox with the given image URL and optional character name */
    open(imageUrl, characterName = '') {
        if (!imageUrl) return;
        
        const lightbox = this._ensureLightbox();
        const img = lightbox.querySelector('.portrait-lightbox-image');
        const nameEl = lightbox.querySelector('.portrait-lightbox-name');
        
        // Set the image source
        img.src = imageUrl;
        
        // Set the character name
        if (nameEl) {
            nameEl.textContent = characterName;
            nameEl.style.display = characterName ? '' : 'none';
        }
        
        // Prevent body scroll while lightbox is open
        document.body.style.overflow = 'hidden';
        
        // Open the lightbox
        lightbox.classList.add('is-open');
    },
    
    /** Close the lightbox */
    close() {
        if (!this._lightbox) return;
        
        this._lightbox.classList.remove('is-open');
        
        // Restore body scroll
        document.body.style.overflow = '';
    },
    
    /** Initialize portrait tap handlers for mobile */
    init() {
        // Detect touch device
        this._isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
        
        // Use event delegation for portrait clicks
        document.addEventListener('click', (e) => {
            // Guard against non-element targets (text nodes, etc.)
            if (!e.target || typeof e.target.closest !== 'function') return;
            
            // Only handle on mobile/touch
            if (!MobileView.isMobile() && !this._isTouch) return;
            
            // Don't open lightbox if tapping on overlay tags (shared/demo/spell tags)
            if (e.target.closest('.sheet-shared-tag, .sheet-demo-tag, .sheet-spell-tag, .custom-tooltip')) return;
            
            // Check if clicked element is a portrait image
            const portrait = e.target.closest('.portrait-container--original-mode .original-portrait.is-loaded');
            if (!portrait) return;
            
            // Don't open lightbox if it's already open
            if (this.isOpen()) return;
            
            // Get the image URL
            const imageUrl = portrait.src;
            if (imageUrl) {
                e.preventDefault();
                e.stopPropagation();
                
                // Find character name from the sheet
                const sheet = portrait.closest('.character-sheet');
                const nameEl = sheet?.querySelector('.sheet-title');
                const characterName = nameEl?.textContent?.trim() || '';
                
                this.open(imageUrl, characterName);
            }
        }, true); // Use capture to get click before other handlers
    }
};

/** Global function to close mobile sheet (called from HTML onclick) */
function closeMobileSheet() {
    MobileView.close();
}

// ========================================
// UI RENDERING
// ========================================
const UI = {
    setLoadingState(isLoading) {
        const leftLoading = document.getElementById('leftPanelLoading');
        const rightLoading = document.getElementById('rightPanelLoading');
        const grid = document.getElementById('characterGrid');
        const emptyState = document.getElementById('emptyState');
        const sheetPlaceholder = document.querySelector('.sheet-placeholder');
        const characterSheet = document.getElementById('characterSheet');

        if (isLoading) {
            if (leftLoading) leftLoading.classList.remove('is-hidden');
            if (rightLoading) rightLoading.classList.remove('is-hidden');
            if (grid) grid.classList.add('is-hidden');
            if (emptyState) emptyState.classList.add('is-hidden');
            if (sheetPlaceholder) sheetPlaceholder.classList.add('is-hidden');
            if (characterSheet) characterSheet.classList.add('is-hidden');
        } else {
            if (leftLoading) leftLoading.classList.add('is-hidden');
            if (rightLoading) rightLoading.classList.add('is-hidden');
            if (grid) grid.classList.remove('is-hidden');
            // empty state and sheet visibility will be controlled by UI.render()
        }
    },

    // Flag to track if we've handled the initial URL character selection
    _initialUrlCharacterHandled: false,

    render() {
        const previousSelectedId =
            typeof AppState !== 'undefined' && AppState
                ? AppState.selectedCharacterId
                : null;

        this.renderCharacterGrid();
        this.updateCount();

        const characters =
            typeof AppState !== 'undefined' &&
            AppState &&
            Array.isArray(AppState.filteredCharacters)
                ? AppState.filteredCharacters
                : [];
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetEl = document.getElementById('characterSheet');

        if (!characters.length) {
            if (placeholder) placeholder.classList.remove('is-hidden');
            if (sheetEl) sheetEl.classList.add('is-hidden');
            if (typeof AppState !== 'undefined' && AppState) {
                AppState.selectedCharacterId = null;
            }
            clearCharacterFromUrl();
            return;
        }

        // Check URL for character selection (only on first render with characters)
        let urlCharacterId = null;
        if (!this._initialUrlCharacterHandled) {
            urlCharacterId = getCharacterIdFromUrl();
            this._initialUrlCharacterHandled = true;
        }

        const isMobile = typeof MobileView !== 'undefined' && MobileView.isMobile();

        // Ensure we have a valid selected id within the current filtered list.
        // Priority: URL param > previous selection > first character (desktop only)
        let targetId = urlCharacterId || previousSelectedId || null;
        const hasValidSelection =
            targetId &&
            characters.some((c) => String(c.id) === String(targetId));

        if (!hasValidSelection) {
            // On mobile, don't auto-select the first character (user must tap)
            // On desktop, always have something selected
            targetId = isMobile ? null : (characters[0] && characters[0].id);
        }

        if (typeof AppState !== 'undefined' && AppState) {
            AppState.selectedCharacterId = targetId || null;
        }

        // Sync the card highlight and keyboard focus with the selected id.
        const grid = document.getElementById('characterGrid');
        if (grid) {
            const cards = Array.from(grid.querySelectorAll('.character-card'));
            cards.forEach((card) => card.classList.remove('is-selected'));

            if (targetId) {
                const selectedCard = grid.querySelector(`[data-id="${targetId}"]`);
                if (selectedCard) {
                    selectedCard.classList.add('is-selected');

                    if (
                        typeof KeyboardNav !== 'undefined' &&
                        KeyboardNav &&
                        typeof KeyboardNav.getCharacterCards === 'function'
                    ) {
                        const allCards = KeyboardNav.getCharacterCards();
                        const cardIndex = allCards.indexOf(selectedCard);
                        if (cardIndex !== -1) {
                            KeyboardNav.currentFocusIndex = cardIndex;
                            // Keep keyboard focus visuals in sync without
                            // re-triggering a sheet update.
                            KeyboardNav.updateFocus(true);
                        }
                    }
                }
            }
        }

        // Handle sheet rendering based on viewport
        if (targetId && (targetId !== previousSelectedId || urlCharacterId)) {
            if (isMobile) {
                // On mobile with URL character, render sheet then open modal
                // Use openMobileModal: false here since we handle modal opening manually
                viewCharacter(targetId, { skipKeyboardSync: true, updateUrl: false, openMobileModal: false });
                if (urlCharacterId) {
                    // Use double requestAnimationFrame to ensure DOM has painted
                    // before cloning. This is more reliable than a fixed timeout.
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            // Verify this is still the selected character
                            if (AppState.selectedCharacterId === targetId) {
                                MobileView.open(targetId);
                            }
                        });
                    });
                }
            } else {
                // Desktop: render sheet in right panel as usual
                viewCharacter(targetId, { skipKeyboardSync: true, updateUrl: !urlCharacterId, openMobileModal: false });
            }
        } else if (!targetId && !isMobile) {
            // Desktop with no selection and no characters - show placeholder
            if (placeholder) placeholder.classList.remove('is-hidden');
            if (sheetEl) sheetEl.classList.add('is-hidden');
        }
    },

    renderCharacterGrid() {
        if (DEBUG_MANAGER) {
            console.log('🎨 RENDER: Starting grid render with', AppState.filteredCharacters.length, 'characters');
            console.log('🎨 RENDER: Character names:', AppState.filteredCharacters.map(c => c.name).join(', '));
        }
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
        
        // Check portrait view mode preference
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
        
        // Populate ASCII thumbnails after rendering (only when not showing original images)
        characters.forEach(char => {
            const thumbnailEl = document.getElementById(`card-thumb-${char.id}`);
            if (!thumbnailEl) return;
            
            // Skip if this is an image thumbnail (already rendered in HTML)
            if (thumbnailEl.classList.contains('card-thumbnail--image')) return;
            
            // Use the same portrait selection logic as the character sheet so
            // cards and detail views stay in sync.
            const asciiPortrait = window.CharacterSheet
                ? window.CharacterSheet.getAsciiPortrait(char)
                : (char.customPortraitAscii || char.portrait?.ascii || char.asciiPortrait || null);
            if (asciiPortrait) {
                // Use <pre> wrapper for proper CSS flex centering
                thumbnailEl.innerHTML = '';
                const pre = document.createElement('pre');
                pre.textContent = this.cropAsciiForThumbnail(asciiPortrait);
                thumbnailEl.appendChild(pre);
            }
        });
        
        // Reset keyboard navigation to first card
        KeyboardNav.isActive = true;
        KeyboardNav.reset();
    },
    
    cropAsciiForThumbnail(asciiArt, heightLines = 80, widthChars = 160) {
        // Split into lines
        const lines = asciiArt.split('\n');
        
        // VERTICAL: Crop from bottom only (keep top pinned for faces/heads)
        const totalLines = lines.length;
        const startLine = 0;
        const endLine = Math.min(totalLines, heightLines);
        
        // HORIZONTAL: Crop equally from both sides to stay centered
        const topLines = lines.slice(startLine, endLine).map(line => {
            if (line.length <= widthChars) return line;
            const excess = line.length - widthChars;
            const cropLeft = Math.floor(excess / 2);
            return line.slice(cropLeft, cropLeft + widthChars);
        });
        
        return topLines.join('\n');
    },

    renderCharacterCard(character) {
        // Handle race/class names (enhanced export has nested data)
        const raceNameRaw = character.raceData?.name || character.race || '?';
        const classNameRaw = character.classData?.name || character.class || '?';
        const raceClassSentence = toSentenceCase(`${raceNameRaw}\u0020${classNameRaw}`.trim());
        const raceClass = Utils.escapeHtml(raceClassSentence || '?');
        const name = Utils.escapeHtml(character.name || 'Unnamed Character');
        
        // Get ASCII portrait for thumbnail using shared logic so the card
        // matches the character sheet view.
        const asciiPortrait = window.CharacterSheet
            ? window.CharacterSheet.getAsciiPortrait(character)
            : (character.customPortraitAscii || character.portrait?.ascii || character.asciiPortrait || null);
        const hasAsciiPortrait = asciiPortrait && asciiPortrait.length > 0;
        
        // Get original portrait URL
        const originalPortraitUrl = window.CharacterSheet
            ? window.CharacterSheet.getOriginalPortraitUrl(character)
            : (character.originalPortraitUrl || character.portrait?.url || null);

        // Debug logging for portrait mismatch investigation
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️ [PORTRAIT DEBUG] renderCharacterCard`, {
                characterId: character.id,
                characterName: character.name,
                context: 'card',
                hasAscii: hasAsciiPortrait,
                asciiLength: asciiPortrait?.length || 0,
                url: originalPortraitUrl,
                portraitMetadataActiveId: character.portraitMetadata?.activeVersionId || null,
                portraitMetadataVersionsCount: character.portraitMetadata?.versions?.length || 0
            });
        }
        
        // Check portrait view mode preference
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
        
        // Determine which thumbnail to show
        const showOriginalImage = portraitViewMode === 'original' && !!originalPortraitUrl;
        const hasPortrait = hasAsciiPortrait || !!originalPortraitUrl;
        
        let thumbnailHtml = '';
        if (hasPortrait) {
            if (showOriginalImage) {
                // Show original image (onload adds is-loaded class for fade-in effect)
                thumbnailHtml = `<div class="card-thumbnail card-thumbnail--image" id="card-thumb-${character.id}">
                    <img src="${Utils.escapeHtml(originalPortraitUrl)}" alt="${name}" loading="lazy" onload="this.classList.add('is-loaded')" />
                </div>`;
            } else if (hasAsciiPortrait) {
                // Show ASCII art (content will be populated after render)
                thumbnailHtml = `<div class="card-thumbnail" id="card-thumb-${character.id}"></div>`;
            }
        }

        // Check if this is a demo character
        const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
        const demoTagHtml = isDemo ? '<span class="card-demo-tag">SAMPLE</span>' : '';
        
        // Check if this is a shared character:
        // - is_shared = true means current user is a collaborator (not owner)
        // - collaborator_count > 0 means owner has shared with others
        const isSharedWithMe = character.is_shared || character.isShared;
        const collaboratorCount = character.collaborator_count || character.collaboratorCount || 0;
        const hasCollaborators = collaboratorCount > 0;
        const showSharedTag = isSharedWithMe || hasCollaborators;
        
        let sharedTagHtml = '';
        if (isSharedWithMe) {
            sharedTagHtml = '<span class="card-shared-tag" title="Shared with you">SHARED</span>';
        } else if (hasCollaborators) {
            const tooltip = collaboratorCount === 1 ? 'Shared with 1 person' : `Shared with ${collaboratorCount} people`;
            sharedTagHtml = `<span class="card-shared-tag" title="${tooltip}">SHARED</span>`;
        }

        return `
            <div class="character-card${showSharedTag ? ' is-shared' : ''}" data-id="${character.id}" onclick="viewCharacter('${character.id}')">
                ${demoTagHtml}
                ${sharedTagHtml}
                ${thumbnailHtml}
                <div class="card-details">
                    <div class="card-name">${name}</div>
                    <div class="card-info">
                        ${raceClass}${character.level ? ` • Lvl ${character.level}` : ''}
                    </div>
                </div>
            </div>
        `;
    },

    updateCount() {
        const searchInput = document.getElementById('searchInput');
        const clearSearchBtn = document.getElementById('clearSearchBtn');
        const total = AppState.characters.length;

        // Disable search when there are no characters at all
        if (searchInput) {
            searchInput.disabled = total === 0;
            // Include character count in placeholder (truncate on mobile)
            if (total === 0 || MobileView.isMobile()) {
                searchInput.placeholder = 'Search';
            } else {
                searchInput.placeholder = 'Search ' + total + ' character' + (total !== 1 ? 's' : '');
            }
        }
        if (clearSearchBtn) {
            clearSearchBtn.disabled = total === 0;
        }
    },

    showCharacterSheet(character) {
        const placeholder = document.querySelector('.sheet-placeholder');
        const sheetContainer = document.getElementById('characterSheet');

        placeholder.classList.add('is-hidden');
        sheetContainer.classList.remove('is-hidden');
        
        // Check if this is a demo character - disable editing if so
        const isDemo = window.DemoCharacters && window.DemoCharacters.isDemo(character);
        // Check if user is in demo mode (not authenticated) - sharing requires login
        const isDemoMode = window.DemoCharacters && window.DemoCharacters.isDemoMode();
        // Check if this is a shared character (not owned by current user)
        const isSharedWithMe = character.is_shared || character.isShared;
        // Check if owner has shared this character with others
        const collaboratorCount = character.collaborator_count || character.collaboratorCount || 0;
        const hasCollaborators = collaboratorCount > 0;
        // Check permission level for shared characters
        const canEdit = !isDemo && (!isSharedWithMe || character.permission === 'edit');
        
        // Use the shared CharacterSheet component
        // Demo characters cannot be edited, renamed, deleted, or have portraits generated
        // Shared characters with edit permission can edit but not delete/rename
        sheetContainer.innerHTML = CharacterSheet.render(character, {
            context: 'manager',
            showPortrait: true,
            onRename: !isDemo && !isSharedWithMe,  // Only owner can rename
            onEdit: canEdit,
            onDelete: !isDemo && !isSharedWithMe,  // Only owner can delete
            onGeneratePortrait: canEdit,
            onPrint: true,
            onShare: !isDemo && !isDemoMode && !isSharedWithMe,  // Only owner can share
            onLeave: isSharedWithMe,  // Show "Leave" option for shared characters
            isShared: isSharedWithMe,
            hasCollaborators: hasCollaborators,
            collaboratorCount: collaboratorCount,
            ownerEmail: character.owner_email || character.ownerEmail,
            lastUpdatedByEmail: character.last_updated_by_email || character.lastUpdatedByEmail,
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
    // Check if creation quota is exhausted (checked in _creationQuotaRemaining)
    if (typeof _creationQuotaRemaining === 'number' && _creationQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for character creation. Come back tomorrow for more adventures!"
        );
        return;
    }
    
    // Launch the Character Builder in the same tab.
    // The builder has an EXIT button to return to the manager view.
    window.location.href = 'character-builder/index.html';
}

// Track creation quota state for NEW CHARACTER button
let _creationQuotaRemaining = null;

// Track image quota state for Customize portrait button (exposed globally for shared-character-sheet.js)
window._imageQuotaRemaining = null;
window._imageQuotaLimit = null;
window._imageQuotaResetAt = null;

window._creationQuotaRemaining = null;
window._creationQuotaLimit = null;
window._creationQuotaResetAt = null;

function _formatCreationQuotaTooltip() {
    const cr = window._creationQuotaRemaining;
    const cl = window._creationQuotaLimit;
    if (typeof cr !== 'number') return '';

    // Unlimited/admin bypass: keep tooltip empty to reduce noise.
    if (cr === -1) return '';

    const remainingText =
        typeof cl === 'number' ? cr + '/' + cl + ' remaining today' : cr + ' remaining today';

    return remainingText;
}

function _updateQuotaTooltipText() {
    const tooltip = document.getElementById('newCharacterTooltip');
    if (!tooltip) return;

    tooltip.textContent = _formatCreationQuotaTooltip();
}


/**
 * Fetch and update the creation quota state.
 * Updates the NEW CHARACTER button's disabled state and title.
 */
async function updateCreationQuotaState() {
    const btn = document.getElementById('newCharacterBtn');
    const overflowBtn = document.getElementById('overflowNewCharBtn');
    const tooltip = document.getElementById('newCharacterTooltip');
    
    // Helper to update both buttons and the custom tooltip
    const updateButtons = (disabled, tooltipText, addClass) => {
        [btn, overflowBtn].forEach(b => {
            if (!b) return;
            b.disabled = disabled;
            // Clear native title - we use custom tooltip now
            b.title = '';
            if (addClass) {
                b.classList.add('is-quota-exhausted');
            } else {
                b.classList.remove('is-quota-exhausted');
            }
        });
        // Update the custom tooltip text (creation-only).
        if (tooltip) {
            tooltip.textContent = tooltipText;
        }
    };

    if (!btn && !overflowBtn) return;

    try {
        // Use AIService if available, otherwise make direct fetch
        let quota = null;
        if (window.AIService && typeof AIService.getCreationQuotaStatus === 'function') {
            quota = await AIService.getCreationQuotaStatus();
        } else {
            // Fallback: direct fetch (manager page may not have AIService loaded)
            // IMPORTANT: Include auth token so admins bypass quota
            const headers = { 'Content-Type': 'application/json' };
            const token = window.AuthService?.getToken?.();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendUrl = window.DanddyConfig?.BACKEND_ORIGIN || window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(
                `${backendUrl}/api/ai/characters/quota`,
                { method: 'GET', headers }
            );
            if (response.ok) {
                quota = await response.json();
            }
        }

        if (!quota) {
            // Quota check failed - allow user to proceed (fail open)
            _creationQuotaRemaining = null;
            window._creationQuotaRemaining = null;
            updateButtons(false, '', false);
            return;
        }

        _creationQuotaRemaining = quota.remaining;
        // Keep the window-scoped value in sync (tooltip reads from window.*)
        window._creationQuotaRemaining = quota.remaining;
        window._creationQuotaLimit = typeof quota.limit === 'number' ? quota.limit : null;
        window._creationQuotaResetAt = quota.resetAt || quota.reset_at || null;

        // If remaining is -1, quota is not enforced (admin/dev mode)
        if (quota.remaining === -1) {
            updateButtons(false, '', false);
            _updateQuotaTooltipText();
            return;
        }

        if (quota.remaining === 0) {
            updateButtons(true, 'Daily limit reached', true);
        } else if (quota.remaining === -1) {
            updateButtons(false, '', false);
        } else {
            updateButtons(false, `${quota.remaining}${' '}creation${quota.remaining === 1 ? '' : 's'}${' '}remaining`, false);
        }

        _updateQuotaTooltipText();
    } catch (e) {
        console.warn('Failed to check creation quota:', e);
        // Fail open - allow user to proceed
        _creationQuotaRemaining = null;
        window._creationQuotaRemaining = null;
        updateButtons(false, '', false);
        _updateQuotaTooltipText();
    }
}

/**
 * Fetch and update the image quota state.
 * Used to disable "Customize portrait" button when exhausted.
 */
async function updateImageQuotaState() {
    try {
        let quota = null;
        if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
            quota = await AIService.getImageQuotaStatus();
        } else {
            // Include auth token so admins bypass quota
            const headers = { 'Content-Type': 'application/json' };
            const token = window.AuthService?.getToken?.();
            if (token) {
                headers['Authorization'] = `Bearer ${token}`;
            }
            const backendUrl = window.DanddyConfig?.BACKEND_ORIGIN || window.CONFIG?.BACKEND_URL || '';
            const response = await fetch(
                `${backendUrl}/api/ai/images/quota`,
                { method: 'GET', headers }
            );
            if (response.ok) {
                quota = await response.json();
            }
        }

        const oldRemaining = window._imageQuotaRemaining;

        if (!quota) {
            window._imageQuotaRemaining = null;
            window._imageQuotaLimit = null;
            window._imageQuotaResetAt = null;
            return;
        }

        window._imageQuotaRemaining = quota.remaining;
        window._imageQuotaLimit = typeof quota.limit === 'number' ? quota.limit : null;
        window._imageQuotaResetAt = quota.resetAt || quota.reset_at || null;
        
        // Re-render current character sheet to update Customize portrait button state
        // This ensures the button is correctly disabled on initial load when quota is exhausted
        // Only re-render if quota was previously unknown (null) or changed
        if (oldRemaining !== quota.remaining && AppState.selectedCharacterId) {
            viewCharacter(AppState.selectedCharacterId, { skipKeyboardSync: true });
        }
    } catch (e) {
        console.warn('Failed to check image quota:', e);
        window._imageQuotaRemaining = null;
    }
}

async function viewCharacter(id, options = {}) {
    const { 
        fromKeyboard = false, 
        skipKeyboardSync = false, 
        updateUrl = true,
        openMobileModal = true  // Whether to open modal on mobile (true for user clicks)
    } = options;

    // Record this request so that slower async lookups for previously
    // selected characters can't override the sheet for the most recently
    // clicked or focused card.
    const requestId = ++latestViewCharacterRequestId;

    // Debug logging for portrait mismatch investigation
    if (window.DEBUG_PORTRAITS) {
        console.log(`🖼️ [PORTRAIT DEBUG] viewCharacter called`, {
            id,
            requestId,
            options,
            timestamp: new Date().toISOString()
        });
    }

    if (typeof AppState !== 'undefined' && AppState) {
        AppState.selectedCharacterId = id;
    }

    // Prefer the already-loaded characters from AppState to avoid extra storage/API calls
    // Use String() comparison to handle type mismatches (cloud IDs may be numeric,
    // but onclick handlers pass string IDs)
    let character = null;
    let characterSource = null;
    if (typeof AppState !== 'undefined' && AppState && Array.isArray(AppState.filteredCharacters)) {
        const idStr = String(id);
        character = AppState.filteredCharacters.find(c => c && String(c.id) === idStr);
        if (character) {
            characterSource = 'filteredCharacters';
        } else {
            character = AppState.characters.find(c => c && String(c.id) === idStr);
            if (character) characterSource = 'characters';
        }
    }

    if (!character) {
        // Fallback to storage lookup (cloud/local)
        try {
            character = await CharacterStorage.getById(id);
            characterSource = 'storage';
        } catch (error) {
            // Check if this is a session expiry error
            if (error.message && error.message.toLowerCase().includes('session has expired')) {
                showSessionExpiredModal();
                return;
            }
            // Log other errors but don't block - character will just be null
            console.warn('Failed to load character from storage:', error);
        }
    }

    // If a newer viewCharacter call started while we were waiting on
    // storage/cloud, abandon this update to avoid stale mismatches.
    if (requestId !== latestViewCharacterRequestId) {
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️ [PORTRAIT DEBUG] viewCharacter ABANDONED (stale request)`, {
                id,
                requestId,
                latestRequestId: latestViewCharacterRequestId
            });
        }
        return;
    }

    if (character) {
        // Auto-recalculate level-dependent stats if they appear outdated
        character = await autoRecalculateLevelStats(character);
        
        // Debug: Log the character data being used to render the sheet
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️ [PORTRAIT DEBUG] viewCharacter rendering`, {
                id: character.id,
                name: character.name,
                source: characterSource,
                requestId,
                portraitMetadataActiveId: character.portraitMetadata?.activeVersionId || null,
                portraitMetadataVersionsCount: character.portraitMetadata?.versions?.length || 0,
                originalPortraitUrl: character.originalPortraitUrl || null,
                portraitUrl: character.portrait?.url || null,
                hasCustomPortraitAscii: !!character.customPortraitAscii,
                hasAsciiPortrait: !!character.asciiPortrait,
                timestamp: new Date().toISOString()
            });
        }
        UI.showCharacterSheet(character);
        
        // Update URL with selected character (for sharing/bookmarking)
        if (updateUrl && id) {
            updateUrlWithCharacter(id);
        }
        
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

        // On mobile, open the character sheet view after rendering
        const isMobile = typeof MobileView !== 'undefined' && MobileView.isMobile();
        if (isMobile && openMobileModal) {
            // Use double requestAnimationFrame to ensure the DOM has painted
            // before cloning. This is more reliable than a fixed timeout as it
            // waits for the browser's actual rendering cycle to complete.
            // First rAF schedules for next frame, second ensures paint occurred.
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    // Verify this is still the selected character before opening
                    // (prevents race condition if user tapped another card quickly)
                    if (AppState.selectedCharacterId === id) {
                        MobileView.open(id);
                    }
                });
            });
        }
    }
}

// Update URL with character ID without triggering page reload
function updateUrlWithCharacter(characterId) {
    const url = new URL(window.location.href);
    if (characterId) {
        url.searchParams.set('character', characterId);
    } else {
        url.searchParams.delete('character');
    }
    // Remove 'from' param if present (one-time use)
    url.searchParams.delete('from');
    history.replaceState({ characterId }, '', url.toString());
}

// Get character ID from URL
function getCharacterIdFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('character');
}

// Clear character selection from URL
function clearCharacterFromUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete('character');
    history.replaceState({}, '', url.toString());
}

let currentEditCharacterId = null;
let originalEditLevel = null;
// Store the original modal content HTML so we can restore it after level change dialog
let originalEditModalContent = null;

function selectAlignment(value, label) {
    // Update hidden select value
    const select = document.getElementById('editAlignment');
    if (select) {
        select.value = value;
    }
    
    // Update visible trigger label
    const labelEl = document.getElementById('editAlignment-label');
    if (labelEl) {
        labelEl.textContent = label;
    }
    
    // Update selected state in menu options
    const trigger = document.getElementById('editAlignment-trigger');
    if (trigger) {
        const shell = trigger.closest('.selector-shell');
        if (shell) {
            const options = shell.querySelectorAll('.selector-option');
            options.forEach(opt => {
                const isSelected = opt.getAttribute('data-value') === value;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }
    }
}

function selectSex(value, label) {
    // Update hidden select value
    const select = document.getElementById('editSex');
    if (select) {
        select.value = value;
    }
    
    // Update visible trigger label
    const labelEl = document.getElementById('editSex-label');
    if (labelEl) {
        labelEl.textContent = label;
    }
    
    // Update selected state in menu options
    const trigger = document.getElementById('editSex-trigger');
    if (trigger) {
        const shell = trigger.closest('.selector-shell');
        if (shell) {
            const options = shell.querySelectorAll('.selector-option');
            options.forEach(opt => {
                const isSelected = opt.getAttribute('data-value') === value;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });
        }
    }
}

async function editCharacter(id, options = {}) {
    const { scrollTo } = options;
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    currentEditCharacterId = id;

    // Ensure the modal content is restored to the original form HTML.
    // This is necessary because showLevelChangeDialog replaces the content
    // with a loading spinner when auto-calculating stats, and that content
    // may persist if the modal wasn't fully closed before opening again.
    const modal = document.getElementById('editDetailsModal');
    if (modal) {
        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            // Store original content on first open if not already stored
            if (!originalEditModalContent) {
                originalEditModalContent = modalContent.innerHTML;
            } else {
                // Restore original content in case it was replaced by level change dialog
                modalContent.innerHTML = originalEditModalContent;
            }
        }
        // Also ensure any stale closing state is cleared
        modal.classList.remove('closing');
    }

    // Use parsed data to pre-fill, so we respect any derived values
    const parsed = CharacterSheet._parseCharacterData(character);

    // Helper to safely set textarea values
    const setValue = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value || '';
    };

    // CHARACTER NAME
    setValue('editName', character.name || '');

    // LEVEL - store original for change detection (ensure it's a number)
    const level = parsed.level != null ? Number(parsed.level) : Number(character.level || 1);
    originalEditLevel = level;
    setValue('editLevel', level);

    // EXPERIENCE POINTS
    const xp = parsed.experiencePoints != null ? Number(parsed.experiencePoints) : Number(character.experiencePoints || 0);
    setValue('editExperiencePoints', xp);

    // ALIGNMENT (default to 'n' - True Neutral if not set)
    const alignmentValue = character.alignment || 'n';
    setValue('editAlignment', alignmentValue);

    // SEX
    const sexValue = character.sex || '';
    setValue('editSex', sexValue);

    // ABILITY SCORES
    const abilities = parsed.abilities || {};
    setValue('editStr', abilities.str != null ? abilities.str : '');
    setValue('editDex', abilities.dex != null ? abilities.dex : '');
    setValue('editCon', abilities.con != null ? abilities.con : '');
    setValue('editInt', abilities.int != null ? abilities.int : '');
    setValue('editWis', abilities.wis != null ? abilities.wis : '');
    setValue('editCha', abilities.cha != null ? abilities.cha : '');

    // COMBAT STATS (match sheet's Combat Stats section)
    setValue('editHpMax', parsed.hpMax != null ? parsed.hpMax : '');
    setValue('editHpCurrent', parsed.hpCurrent != null ? parsed.hpCurrent : '');
    const tempHp =
        character.hitPoints && typeof character.hitPoints === 'object'
            ? character.hitPoints.temp || 0
            : 0;
    setValue('editHpTemp', tempHp);
    setValue('editArmorClass', parsed.armorClass != null ? parsed.armorClass : '');
    setValue('editInitiative', parsed.initiative != null ? parsed.initiative : '');
    setValue('editSpeed', parsed.speed != null ? parsed.speed : '');
    setValue('editProfBonus', parsed.proficiencyBonus != null ? parsed.proficiencyBonus : '');

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

    // Handle field permissions for shared characters
    // Only the owner can edit the character name (owner_only_fields on backend)
    const isSharedWithMe = character.is_shared || character.isShared;
    const nameInput = document.getElementById('editName');
    if (nameInput) {
        if (isSharedWithMe) {
            nameInput.disabled = true;
            nameInput.title = 'Only the owner can rename this character';
            nameInput.classList.add('is-owner-only');
        } else {
            nameInput.disabled = false;
            nameInput.title = '';
            nameInput.classList.remove('is-owner-only');
        }
    }

    // Show modal (reuse modal variable from earlier in function)
    if (modal) {
        modal.classList.add('show');
        
        // Snapshot form values for dirty checking (after a tick to let values settle)
        setTimeout(() => ModalManager.snapshotForm('editDetailsModal'), 50);
        
        // Update alignment selector after modal is visible (needs to be deferred)
        const savedAlignmentValue = alignmentValue; // Capture in closure
        const savedSexValue = sexValue; // Capture in closure
        setTimeout(() => {
            const alignmentNames = {
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
            const alignmentName = alignmentNames[savedAlignmentValue] || 'Select Alignment';
            const alignmentLabel = document.getElementById('editAlignment-label');
            if (alignmentLabel) {
                alignmentLabel.textContent = alignmentName;
            }
            
            // Mark selected option in menu
            const alignmentTrigger = document.getElementById('editAlignment-trigger');
            if (alignmentTrigger) {
                const shell = alignmentTrigger.closest('.selector-shell');
                if (shell) {
                    const options = shell.querySelectorAll('.selector-option');
                    options.forEach(opt => {
                        const isSelected = opt.getAttribute('data-value') === savedAlignmentValue;
                        opt.classList.toggle('is-selected', isSelected);
                        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    });
                }
            }

            // Update sex selector
            const sexNames = {
                'male': 'Male',
                'female': 'Female'
            };
            const sexName = sexNames[savedSexValue] || 'Select Sex';
            const sexLabel = document.getElementById('editSex-label');
            if (sexLabel) {
                sexLabel.textContent = sexName;
            }
            
            // Mark selected option in sex menu
            const sexTrigger = document.getElementById('editSex-trigger');
            if (sexTrigger) {
                const shell = sexTrigger.closest('.selector-shell');
                if (shell) {
                    const options = shell.querySelectorAll('.selector-option');
                    options.forEach(opt => {
                        const isSelected = opt.getAttribute('data-value') === savedSexValue;
                        opt.classList.toggle('is-selected', isSelected);
                        opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                    });
                }
            }
            
            // Scroll to specific section if requested
            if (scrollTo) {
                const targetSection = document.getElementById(scrollTo);
                if (targetSection) {
                    setTimeout(() => {
                        targetSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    }, 100);
                }
            }
        }, 0);
    }
}

function closeEditDetailsModal() {
    const modal = document.getElementById('editDetailsModal');
    if (!modal) {
        currentEditCharacterId = null;
        originalEditLevel = null;
        return;
    }

    // Hide loading overlay when modal closes
    const loadingOverlay = document.getElementById('editDetailsLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('is-visible');
    }

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: () => {
            currentEditCharacterId = null;
            originalEditLevel = null;
        },
    });
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

    // Show loading overlay
    const loadingOverlay = document.getElementById('editDetailsLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('is-visible');
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
    
    const nameEl = document.getElementById('editName');
    const nameText = nameEl ? nameEl.value.trim() : '';

    const getNumber = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const raw = el.value.trim();
        if (!raw) return null;
        const value = parseInt(raw, 10);
        return Number.isFinite(value) ? value : null;
    };

    let levelValue = getNumber('editLevel');
    const experiencePointsValue = getNumber('editExperiencePoints');
    
    // Validate level range (D&D 5e: 1-20)
    if (levelValue !== null && (levelValue < 1 || levelValue > 20)) {
        // Hide loading overlay while showing validation error
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
        showAlertDialog(`Level must be between 1 and 20.\n\nYou entered: ${levelValue}`);
        return;
    }
    
    // Check if XP increase should trigger automatic level-up
    const currentLevel = levelValue ?? originalEditLevel ?? 1;
    let xpTriggeredLevelUp = false;
    if (experiencePointsValue !== null) {
        const levelFromXP = calculateLevelFromXP(experiencePointsValue);
        if (levelFromXP > currentLevel) {
            // XP warrants a higher level - auto-update the level
            levelValue = levelFromXP;
            xpTriggeredLevelUp = true;
            // Update the form field to show the new level
            const levelEl = document.getElementById('editLevel');
            if (levelEl) {
                levelEl.value = levelFromXP;
            }
        }
    }
    
    // Check if level has changed - prompt user for stat recalculation choice
    const safeLevel = levelValue;
    let levelChangeChoice = 'manual'; // default to manual if no change
    let autoCalculatedStats = null;
    let levelChangedFrom = null;
    let levelChangedTo = null;
    
    if (safeLevel !== null && originalEditLevel !== null && safeLevel !== originalEditLevel) {
        levelChangedFrom = originalEditLevel;
        levelChangedTo = safeLevel;
        // Hide loading overlay while showing the dialog
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
        
        levelChangeChoice = await showLevelChangeDialog(originalEditLevel, safeLevel, xpTriggeredLevelUp);
        
        if (levelChangeChoice === 'cancel' || levelChangeChoice === 'manual') {
            // User cancelled or chose manual - return to edit form without saving
            return;
        }
        
        // Show loading overlay again after dialog closes
        if (loadingOverlay) {
            loadingOverlay.classList.add('is-visible');
        }
        
        if (levelChangeChoice === 'auto') {
            // Calculate stats based on the new level and current abilities
            const formAbilities = {
                str: getNumber('editStr') ?? character.abilities?.str ?? 10,
                dex: getNumber('editDex') ?? character.abilities?.dex ?? 10,
                con: getNumber('editCon') ?? character.abilities?.con ?? 10,
                int: getNumber('editInt') ?? character.abilities?.int ?? 10,
                wis: getNumber('editWis') ?? character.abilities?.wis ?? 10,
                cha: getNumber('editCha') ?? character.abilities?.cha ?? 10,
            };
            const tempCharacter = { ...character, abilities: formAbilities };
            autoCalculatedStats = calculateStatsForLevel(tempCharacter, safeLevel);
        }
    }

    // Ability scores
    const abilityUpdates = {};
    const str = getNumber('editStr');
    const dex = getNumber('editDex');
    const con = getNumber('editCon');
    const intScore = getNumber('editInt');
    const wis = getNumber('editWis');
    const cha = getNumber('editCha');

    if (str !== null) abilityUpdates.str = str;
    if (dex !== null) abilityUpdates.dex = dex;
    if (con !== null) abilityUpdates.con = con;
    if (intScore !== null) abilityUpdates.int = intScore;
    if (wis !== null) abilityUpdates.wis = wis;
    if (cha !== null) abilityUpdates.cha = cha;

    // Combat stats - use auto-calculated values if user chose auto, otherwise use form values
    let hpMax = getNumber('editHpMax');
    let hpCurrent = getNumber('editHpCurrent');
    const hpTemp = getNumber('editHpTemp');
    const armorClass = getNumber('editArmorClass');
    const initiative = getNumber('editInitiative');
    const speed = getNumber('editSpeed');
    let profBonus = getNumber('editProfBonus');
    
    // Apply auto-calculated stats if user chose auto
    let autoSpellSlots = null;
    let autoHitDiceMax = null;
    let autoClassResources = null;
    if (autoCalculatedStats) {
        hpMax = autoCalculatedStats.hpMax;
        // Set current HP to max HP when auto-calculating (leveling up usually means full health)
        hpCurrent = autoCalculatedStats.hpMax;
        profBonus = autoCalculatedStats.proficiencyBonus;
        autoSpellSlots = autoCalculatedStats.spellSlots;
        autoHitDiceMax = autoCalculatedStats.hitDiceMax;
        autoClassResources = autoCalculatedStats.classResources;
    }

    // Alignment
    const alignmentValue = document.getElementById('editAlignment')?.value || '';

    // Sex
    const sexValue = document.getElementById('editSex')?.value || '';

    const updates = {
        // Store raw IDs/names; CharacterSheet will format as needed
        skillProficiencies: skillLines.map(s => s.toLowerCase().replace(/\s+/g, '-')),
        equipment: equipmentLines,
        toolProficiencies: toolLines.map(t => t.toLowerCase().replace(/\s+/g, '-')),
        languages: languageLines,
        backstory: backstoryText,
    };
    
    // Only update name if non-empty (prevent accidental wiping)
    // Also skip for shared characters - only owner can rename (backend enforces this too)
    const isSharedWithMe = character.is_shared || character.isShared;
    if (nameText && !isSharedWithMe) {
        updates.name = nameText;
    } else if (!nameText) {
        console.warn('⚠️ EDIT: Name field was empty - preserving existing name');
    }

    if (levelValue !== null) {
        updates.level = levelValue;
    }

    if (experiencePointsValue !== null) {
        updates.experiencePoints = experiencePointsValue;
    }

    if (alignmentValue) {
        updates.alignment = alignmentValue;
    }

    if (sexValue) {
        updates.sex = sexValue;
    }

    if (Object.keys(abilityUpdates).length > 0) {
        updates.abilities = {
            ...(character.abilities || character.abilityScores || {}),
            ...abilityUpdates,
        };
    }

    const hasHpUpdate = hpMax !== null || hpCurrent !== null || hpTemp !== null;
    if (hasHpUpdate) {
        const prevHp = character.hitPoints;
        const baseHp =
            prevHp && typeof prevHp === 'object'
                ? { ...prevHp }
                : { max: prevHp || 0, current: prevHp || 0, temp: 0 };
        if (hpMax !== null) baseHp.max = hpMax;
        if (hpCurrent !== null) baseHp.current = hpCurrent;
        if (hpTemp !== null) baseHp.temp = hpTemp;
        updates.hitPoints = baseHp;
    }

    if (armorClass !== null) {
        updates.armorClass = armorClass;
    }
    if (initiative !== null) {
        updates.initiative = initiative;
    }
    if (speed !== null) {
        updates.speed = speed;
    }
    if (profBonus !== null) {
        updates.proficiencyBonus = profBonus;
    }
    
    // Apply auto-calculated spell slots for spellcasting classes
    if (autoSpellSlots) {
        updates.spellSlots = autoSpellSlots;
        // Reset spell slots used when level changes
        updates.spellSlotsUsed = {};
    }

    // Apply auto-calculated hit dice (reset to full on level up)
    if (autoHitDiceMax) {
        updates.hitDiceMax = autoHitDiceMax;
        // Reset to full hit dice on level up (null means full = level)
        updates.hitDiceCurrent = null;
    }

    // Apply auto-calculated class resources (reset to full on level up)
    if (autoClassResources && Object.keys(autoClassResources).length > 0) {
        updates.classResources = autoClassResources;
    }

    try {
        await CharacterStorage.update(currentEditCharacterId, updates);
        markUserChanges(); // Show guest notice if applicable
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(currentEditCharacterId);
        showNotification('Character details updated');
        closeEditDetailsModal();
        
        // After a successful level-up with auto-calculation, check if the user needs to select new spells
        if (autoCalculatedStats && autoCalculatedStats.spellProgression && levelChangedFrom !== null && levelChangedTo !== null) {
            const updatedCharacter = await CharacterStorage.getById(currentEditCharacterId);
            if (updatedCharacter) {
                // Small delay to let the modal close animation complete
                setTimeout(() => {
                    checkAndPromptForNewSpells(updatedCharacter, levelChangedFrom, levelChangedTo);
                }, 400);
            }
        }
    } catch (error) {
        console.error('Failed to save character details:', error);
        showNotification('Failed to save changes', 'error');
    } finally {
        // Hide loading overlay
        const loadingOverlay = document.getElementById('editDetailsLoading');
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
    }
}

// Resolve the best host element for manager UI modals so that they are
// visually scoped to the terminal frame instead of the full viewport.
function getManagerModalHost() {
    return (
        document.querySelector('.terminal-frame') ||
        document.querySelector('.terminal-container') ||
        document.body
    );
}

async function renameCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    // Only owner can rename - check if this is a shared character
    const isShared = character.is_shared || character.isShared;
    if (isShared) {
        showNotification('Only the owner can rename this character', 'error');
        return;
    }

    const existing = document.getElementById('renameModal');
    if (existing) existing.remove();

    const safeCurrentName = Utils.escapeHtml(character.name || '');
    const modalHtml = `
      <div id="renameModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">RENAME CHARACTER</h2>
            <button class="modal-close" onclick="closeRenameModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text-small modal-section-label">New name:</p>
            <input type="text" id="renameInput" class="terminal-input" value="${safeCurrentName}">
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" id="renameCancel">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" id="renameOk">APPLY</button>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('renameModal');
    const input = document.getElementById('renameInput');
    const cancelBtn = document.getElementById('renameCancel');
    const okBtn = document.getElementById('renameOk');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    cancelBtn.addEventListener('click', close);
    okBtn.addEventListener('click', async () => {
        const newName = input.value.trim();
        if (!newName) {
            return;
        }
        close();
        await CharacterStorage.update(id, { name: newName });
        markUserChanges(); // Show guest notice if applicable
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

// ========================================
// CHARACTER SHARING
// ========================================

/**
 * Open the share character modal.
 * Shows existing collaborators and allows adding/removing access.
 * @param {string|number} characterId - The character ID to share
 */
async function openShareModal(characterId) {
    // Must be logged in to share
    if (!AuthService.isAuthenticated()) {
        showNotification('Please log in to share characters', 'error');
        return;
    }

    const character = await CharacterStorage.getById(characterId);
    if (!character) {
        showNotification('Character not found', 'error');
        return;
    }

    const existing = document.getElementById('shareModal');
    if (existing) existing.remove();

    const safeName = Utils.escapeHtml(character.name || 'Unnamed');
    const modalHtml = `
      <div id="shareModal" class="modal modal-yellow show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">SHARE CHARACTER</h2>
            <button class="modal-close" onclick="closeShareModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">Sharing <strong>${safeName}</strong></p>
            
            <div id="shareCollaboratorsSection" class="share-section" style="margin-top: 1.25rem; display: none;">
              <label class="terminal-text-small modal-section-label">PEOPLE WITH ACCESS</label>
              <div id="shareCollaboratorsList" class="share-collaborators-list"></div>
            </div>
            
            <div class="share-section" style="margin-top: 1.25rem;">
              <label class="terminal-text-small modal-section-label" for="shareEmailInput">ADD PERSON</label>
              <div class="share-add-row">
                <input type="email" id="shareEmailInput" class="terminal-input" placeholder="email@example.com">
                <button class="terminal-btn" id="shareAddBtn">ADD</button>
              </div>
              <p id="shareEmailError" class="terminal-text-small" style="color: var(--error-color, #f44); margin-top: 0.25rem; display: none;"></p>
            </div>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn terminal-btn-primary" id="shareDoneBtn">DONE</button>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('shareModal');
    const input = document.getElementById('shareEmailInput');
    const errorEl = document.getElementById('shareEmailError');
    const addBtn = document.getElementById('shareAddBtn');
    const doneBtn = document.getElementById('shareDoneBtn');
    const collaboratorsSection = document.getElementById('shareCollaboratorsSection');
    const collaboratorsList = document.getElementById('shareCollaboratorsList');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    const showError = (msg) => {
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    };

    const clearError = () => {
        errorEl.style.display = 'none';
    };

    // Simple email validation
    const isValidEmail = (email) => {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    };

    // Render collaborators and pending shares list
    const renderAccessList = (collaborators, pendingShares) => {
        const hasCollaborators = collaborators && collaborators.length > 0;
        const hasPending = pendingShares && pendingShares.length > 0;
        
        if (!hasCollaborators && !hasPending) {
            // Hide the entire section if nothing to show
            collaboratorsSection.style.display = 'none';
            collaboratorsList.innerHTML = '';
            return;
        }

        // Show section
        collaboratorsSection.style.display = 'block';
        
        // Build HTML for collaborators (accepted)
        const collabHtml = (collaborators || []).map(collab => `
            <div class="share-collaborator-item" data-id="${collab.id}" data-type="collaborator">
                <span class="share-collaborator-email">${Utils.escapeHtml(collab.user_email)}</span>
                <button class="share-collaborator-remove" title="Remove access" data-id="${collab.id}" data-type="collaborator">&times;</button>
            </div>
        `).join('');
        
        // Build HTML for pending shares
        const pendingHtml = (pendingShares || []).map(share => `
            <div class="share-collaborator-item share-collaborator-pending" data-id="${share.id}" data-type="pending">
                <span class="share-collaborator-email">${Utils.escapeHtml(share.to_email)}</span>
                <span class="share-collaborator-status">PENDING</span>
                <button class="share-collaborator-remove" title="Cancel invitation" data-id="${share.id}" data-type="pending">&times;</button>
            </div>
        `).join('');
        
        collaboratorsList.innerHTML = collabHtml + pendingHtml;

        // Attach remove handlers for collaborators
        collaboratorsList.querySelectorAll('.share-collaborator-remove[data-type="collaborator"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const collabId = e.target.dataset.id;
                const itemEl = collaboratorsList.querySelector(`.share-collaborator-item[data-id="${collabId}"][data-type="collaborator"]`);
                if (itemEl) {
                    itemEl.classList.add('removing');
                }
                try {
                    await CharacterCloudStorage.removeCollaborator(characterId, collabId);
                    await loadAccessList();
                    showNotification('Access removed');
                } catch (error) {
                    if (itemEl) {
                        itemEl.classList.remove('removing');
                    }
                    showNotification(error.message || 'Failed to remove access', 'error');
                }
            });
        });
        
        // Attach remove handlers for pending shares
        collaboratorsList.querySelectorAll('.share-collaborator-remove[data-type="pending"]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const shareId = e.target.dataset.id;
                const itemEl = collaboratorsList.querySelector(`.share-collaborator-item[data-id="${shareId}"][data-type="pending"]`);
                if (itemEl) {
                    itemEl.classList.add('removing');
                }
                try {
                    await CharacterCloudStorage.cancelPendingShare(characterId, shareId);
                    await loadAccessList();
                    showNotification('Invitation canceled');
                } catch (error) {
                    if (itemEl) {
                        itemEl.classList.remove('removing');
                    }
                    showNotification(error.message || 'Failed to cancel invitation', 'error');
                }
            });
        });
    };

    // Load collaborators and pending shares
    const loadAccessList = async () => {
        try {
            const [collaborators, pendingShares] = await Promise.all([
                CharacterCloudStorage.getCollaborators(characterId),
                CharacterCloudStorage.getPendingSharesForCharacter(characterId)
            ]);
            renderAccessList(collaborators, pendingShares);
        } catch (error) {
            console.error('Failed to load access list:', error);
            collaboratorsSection.style.display = 'none';
        }
    };

    // Load access list on modal open
    loadAccessList();

    doneBtn.addEventListener('click', close);
    
    input.addEventListener('input', clearError);
    
    // Handle Enter key in input
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBtn.click();
        }
    });

    addBtn.addEventListener('click', async () => {
        const email = input.value.trim().toLowerCase();
        
        if (!email) {
            showError('Please enter an email address');
            return;
        }
        
        if (!isValidEmail(email)) {
            showError('Please enter a valid email address');
            return;
        }

        // Disable button while processing
        addBtn.disabled = true;
        addBtn.textContent = 'ADDING...';

        try {
            await CharacterCloudStorage.shareCharacter(characterId, email);
            input.value = '';
            showNotification(`Invitation sent to ${email}`);
            // Refresh the access list (shows pending invitation)
            await loadAccessList();
        } catch (error) {
            showError(error.message || 'Failed to share character');
        } finally {
            addBtn.disabled = false;
            addBtn.textContent = 'ADD';
        }
    });

    // Focus the email input
    if (typeof focusFirstFieldInModal === 'function') {
        focusFirstFieldInModal(modal);
    } else if (input) {
        input.focus();
    }
}

function closeShareModal() {
    const modal = document.getElementById('shareModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

/**
 * Check for pending shares and show the modal if there are any.
 * Called after successful login.
 */
async function checkPendingShares() {
    if (!AuthService.isAuthenticated()) return;

    try {
        const pendingShares = await CharacterCloudStorage.getPendingShares();
        if (pendingShares && pendingShares.length > 0) {
            showPendingSharesModal(pendingShares);
        }
    } catch (error) {
        console.error('Failed to check pending shares:', error);
        // Don't show error to user - this is a background check
    }
}

/**
 * Show the pending shares modal with all pending character shares.
 * @param {Array} shares - Array of pending share objects
 */
function showPendingSharesModal(shares) {
    if (!shares || shares.length === 0) return;

    const existing = document.getElementById('pendingSharesModal');
    if (existing) existing.remove();

    const shareCount = shares.length;
    const title = shareCount === 1 ? 'CHARACTER SHARED WITH YOU' : `${shareCount} CHARACTERS SHARED WITH YOU`;

    // Build share cards HTML
    const shareCardsHtml = shares.map((share, index) => {
        const char = share.character;
        
        // Title case helper (e.g., "halfling" -> "Halfling", "neutral evil" -> "Neutral Evil")
        const toTitleCase = (str) => {
            if (!str) return '—';
            return str.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        };
        
        const safeName = Utils.escapeHtml(char.name || 'Unnamed');
        const safeRace = Utils.escapeHtml(toTitleCase(char.race || 'Unknown'));
        const safeClass = Utils.escapeHtml(toTitleCase(char.character_class || 'Unknown'));
        const level = char.level || 1;
        const safeBackground = Utils.escapeHtml(toTitleCase(char.background || '—'));
        const fromEmail = Utils.escapeHtml(share.from_email || 'Unknown');
        
        // Format sex (title case)
        const safeSex = Utils.escapeHtml(toTitleCase(char.sex));
        
        // Format the date
        const createdDate = new Date(share.created_at);
        const dateStr = createdDate.toLocaleDateString();

        // Portrait: prefer image, fallback to ASCII, then placeholder
        let portraitHtml = '<div class="share-card-portrait-placeholder">No Portrait</div>';
        if (char.original_portrait_url) {
            // Image portrait
            portraitHtml = `<img class="share-card-portrait-image" src="${Utils.escapeHtml(char.original_portrait_url)}" alt="${safeName} portrait" />`;
        } else if (char.ascii_portrait) {
            // ASCII portrait fallback
            portraitHtml = `<pre class="share-card-portrait">${Utils.escapeHtml(char.ascii_portrait)}</pre>`;
        }

        return `
          <div class="pending-share-card" data-share-id="${share.id}" data-index="${index}">
            <div class="share-card-layout">
              <div class="share-card-portrait-col">
                ${portraitHtml}
              </div>
              <div class="share-card-info-col">
                <h3 class="share-card-name">${safeName}</h3>
                <div class="share-card-stats">
                  <div class="share-card-stat">
                    <span class="share-card-label">Race</span>
                    <span class="share-card-value">${safeRace}</span>
                  </div>
                  <div class="share-card-stat">
                    <span class="share-card-label">Class</span>
                    <span class="share-card-value">${safeClass}</span>
                  </div>
                  <div class="share-card-stat">
                    <span class="share-card-label">Level</span>
                    <span class="share-card-value">${level}</span>
                  </div>
                </div>
                <p class="share-card-from">
                  From: ${fromEmail} · ${dateStr}
                </p>
                <div class="share-card-actions">
                  <button class="terminal-btn pending-share-ignore" data-share-id="${share.id}">IGNORE</button>
                  <button class="terminal-btn pending-share-accept" data-share-id="${share.id}">ADD CHARACTER</button>
                </div>
              </div>
            </div>
          </div>
        `;
    }).join('');

    const modalHtml = `
      <div id="pendingSharesModal" class="modal show">
        <div class="modal-content pending-shares-modal">
          <div class="modal-header">
            <h2 class="modal-title">${title}</h2>
            <button class="modal-close" onclick="closePendingSharesModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text-small terminal-text-dim" style="margin-bottom: 1rem;">
              ${shareCount === 1 ? 'Someone shared a character with you!' : 'Other users have shared characters with you!'} 
              Add them to your collection or ignore to dismiss.
            </p>
            <div class="pending-shares-list">
              ${shareCardsHtml}
            </div>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('pendingSharesModal');

    // Add event listeners for accept/ignore buttons
    modal.querySelectorAll('.pending-share-accept').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const shareId = e.target.dataset.shareId;
            await handleAcceptShare(shareId);
        });
    });

    modal.querySelectorAll('.pending-share-ignore').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const shareId = e.target.dataset.shareId;
            await handleDismissShare(shareId);
        });
    });
}

/**
 * Handle accepting a pending share.
 * @param {string|number} shareId - The share ID to accept
 */
async function handleAcceptShare(shareId) {
    const card = document.querySelector(`.pending-share-card[data-share-id="${shareId}"]`);
    const acceptBtn = card?.querySelector('.pending-share-accept');
    
    if (acceptBtn) {
        acceptBtn.disabled = true;
        acceptBtn.textContent = 'ADDING...';
    }

    try {
        const result = await CharacterCloudStorage.acceptShare(shareId);
        
        // Remove the card from the modal
        if (card) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            setTimeout(() => card.remove(), 300);
        }

        // Check if there are any cards left
        setTimeout(() => {
            const remainingCards = document.querySelectorAll('.pending-share-card');
            if (remainingCards.length === 0) {
                closePendingSharesModal();
            }
        }, 350);

        // Refresh the character list
        await AppState.loadCharacters();
        UI.render();
        
        showNotification('Character added to your collection!');
        
        // View the newly added character
        if (result && result.character_id) {
            viewCharacter(result.character_id);
        }
    } catch (error) {
        if (acceptBtn) {
            acceptBtn.disabled = false;
            acceptBtn.textContent = 'ADD CHARACTER';
        }
        showNotification(error.message || 'Failed to add character', 'error');
    }
}

/**
 * Handle dismissing a pending share.
 * @param {string|number} shareId - The share ID to dismiss
 */
async function handleDismissShare(shareId) {
    const card = document.querySelector(`.pending-share-card[data-share-id="${shareId}"]`);
    const ignoreBtn = card?.querySelector('.pending-share-ignore');
    
    if (ignoreBtn) {
        ignoreBtn.disabled = true;
        ignoreBtn.textContent = 'IGNORING...';
    }

    try {
        await CharacterCloudStorage.dismissShare(shareId);
        
        // Remove the card from the modal
        if (card) {
            card.style.opacity = '0.5';
            card.style.pointerEvents = 'none';
            setTimeout(() => card.remove(), 300);
        }

        // Check if there are any cards left
        setTimeout(() => {
            const remainingCards = document.querySelectorAll('.pending-share-card');
            if (remainingCards.length === 0) {
                closePendingSharesModal();
            }
        }, 350);

        showNotification('Share dismissed');
    } catch (error) {
        if (ignoreBtn) {
            ignoreBtn.disabled = false;
            ignoreBtn.textContent = 'IGNORE';
        }
        showNotification(error.message || 'Failed to dismiss share', 'error');
    }
}

function closePendingSharesModal() {
    const modal = document.getElementById('pendingSharesModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

let currentPortraitCharacterId = null;
let currentPortraitStyle = null;

/**
 * Convert a theme id/label to title case.
 * e.g., "cinematic-inks" -> "Cinematic Inks"
 *       "my-custom-style" -> "My Custom Style"
 */
function formatStyleLabel(idOrLabel) {
    if (!idOrLabel) return '';
    
    // Remove "Custom: " prefix if present
    let cleaned = String(idOrLabel).replace(/^Custom:\s*/i, '');
    
    // Remove " (default)" suffix
    cleaned = cleaned.replace(/\s*\(default\)\s*$/i, '');
    
    // Replace dashes/underscores with spaces
    cleaned = cleaned.replace(/[-_]/g, ' ');
    
    // Title case: capitalize first letter of each word
    if (cleaned.length > 0) {
        cleaned = cleaned.split(' ').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
        ).join(' ');
    }
    
    return cleaned;
}

/**
 * Populate the style listbox menu in the portrait prompt modal.
 * Uses the same selector pattern as the settings modal.
 * Returns the currently selected/default style ID.
 * 
 * This is now async to properly wait for API sync before fetching themes.
 */
async function populatePortraitStyleDropdown(activeStyle) {
    const menu = document.getElementById('portraitStyleMenu');
    const label = document.getElementById('portraitStyleLabel');
    if (!menu) return null;

    // Clear existing options
    menu.innerHTML = '';

    // Wait for API sync to complete before fetching themes
    // This ensures global styles are loaded for authenticated users
    if (window.PortraitPrompt && typeof PortraitPrompt.syncFromAPI === 'function') {
        try {
            await PortraitPrompt.syncFromAPI();
        } catch (e) {
            console.warn('populatePortraitStyleDropdown: API sync failed', e);
        }
    }

    // Get available themes from PortraitPrompt
    let themes = [];
    let defaultThemeId = 'cinematic-inks';
    
    try {
        if (window.PortraitPrompt) {
            if (typeof PortraitPrompt.getThemes === 'function') {
                themes = PortraitPrompt.getThemes() || [];
            }
            if (typeof PortraitPrompt.getDefaultThemeId === 'function') {
                defaultThemeId = PortraitPrompt.getDefaultThemeId() || defaultThemeId;
            }
        }
    } catch (e) {
        console.warn('populatePortraitStyleDropdown: Error getting themes', e);
    }

    // Always ensure at least the default theme is available
    if (!themes.length) {
        themes = [
            { id: 'cinematic-inks', label: 'Cinematic Inks (default)' }
        ];
    }

    // NOTE: Custom styles from admin storage are already included via PortraitPrompt.getThemes()
    // which properly handles API sync for authenticated users (including global vs user-owned filtering).
    // We no longer read localStorage directly here to avoid showing non-global styles
    // that may have been cached by another user on the same browser.

    // Sort themes alphabetically by id
    themes = themes.slice().sort((a, b) => {
        const nameA = (a.id || '').toLowerCase();
        const nameB = (b.id || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });

    // Determine selected value
    const selectedStyle = activeStyle || defaultThemeId;
    let selectedLabel = formatStyleLabel(defaultThemeId);

    // Populate menu with options (same pattern as settings modal)
    themes.forEach((theme) => {
        const formattedLabel = formatStyleLabel(theme.id);
        const isSelected = theme.id === selectedStyle;
        
        if (isSelected) {
            selectedLabel = formattedLabel;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'selector-option' + (isSelected ? ' is-selected' : '');
        button.setAttribute('role', 'option');
        button.setAttribute('data-value', theme.id);
        button.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        button.innerHTML = `<span class="selector-option-label">${formattedLabel}</span>`;
        menu.appendChild(button);
    });

    // Update trigger label
    if (label) {
        label.textContent = selectedLabel;
    }

    currentPortraitStyle = selectedStyle;
    
    // Wire up option clicks (same pattern as SettingsModal.initSelectors)
    initPortraitStyleSelector();
    
    return selectedStyle;
}

/**
 * Initialize the portrait style selector click handlers.
 * Uses the same pattern as SettingsModal.initSelectors.
 */
function initPortraitStyleSelector() {
    const menu = document.getElementById('portraitStyleMenu');
    const label = document.getElementById('portraitStyleLabel');
    const trigger = document.getElementById('portraitStyleTrigger');
    
    if (!menu) return;
    
    const options = menu.querySelectorAll('.selector-option');
    
    options.forEach((option) => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const optionLabel = option.querySelector('.selector-option-label');
            
            if (value && optionLabel) {
                // Update trigger label
                if (label) {
                    label.textContent = optionLabel.textContent.trim();
                }
                
                // Update current style
                currentPortraitStyle = value;
                
                // Update visual selection state
                options.forEach((opt) => {
                    const isSelected = opt.getAttribute('data-value') === value;
                    opt.classList.toggle('is-selected', isSelected);
                    opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
                });
                
                // Close the menu using the standard toggle
                if (trigger && window.CharacterSheet && typeof CharacterSheet.toggleSelectorMenu === 'function') {
                    CharacterSheet.toggleSelectorMenu(trigger);
                }
            }
        });
    });
}

async function generatePortraitForCharacter(id) {
    let character;
    try {
        character = await CharacterStorage.getById(id);
    } catch (error) {
        // Check if this is a session expiry error
        if (error.message && error.message.toLowerCase().includes('session has expired')) {
            // Session has expired - show the modal and don't proceed
            showSessionExpiredModal();
            return;
        }
        // Some other error - show alert
        console.error('Failed to load character for portrait generation:', error);
        showAlertDialog('Failed to load character. Please try again.');
        return;
    }
    
    if (!character) {
        // Character not found - might have been deleted or never synced
        showAlertDialog('Character not found. It may have been deleted or not yet synced.');
        return;
    }

    // Block custom art generation for sample (demo) characters
    if (window.DemoCharacters && DemoCharacters.isDemo(character)) {
        showAlertDialog(
            'Custom art generation is not available for sample characters. ' +
            'Create your own character to generate custom portraits!'
        );
        return;
    }

    // Check if image quota is exhausted (backend enforces daily limits)
    // Demo users get 5/day, logged-in users get 20/day
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        const isDemoMode = window.DemoCharacters && 
            typeof DemoCharacters.isDemoMode === 'function' && 
            DemoCharacters.isDemoMode();
        
        if (isDemoMode) {
            showAlertDialog(
                "You've reached the daily portrait limit in guest mode. Create an account for higher limits!",
                {
                    actionLabel: 'Create a free account',
                    onAction: () => {
                        showAuthModal();
                        showRegisterForm();
                    }
                }
            );
        } else {
            showAlertDialog(
                "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
            );
        }
        return;
    }

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
    
    // Build default prompt:
    // Use the stored characterDescription from the active portrait version if available.
    // This preserves the exact prompt the user used (or was auto-generated) for the
    // current portrait, allowing them to regenerate with a different style.
    // Fall back to buildCharacterDescription() for older portraits without this field.
    let defaultPrompt = '';
    let activeStyle = null;
    
    try {
        // Get the characterDescription and style from the active portrait version (if any)
        try {
            const metadata = character.portraitMetadata || {};
            const versions = Array.isArray(metadata.versions) ? metadata.versions : [];
            if (versions.length) {
                const activeId = metadata.activeVersionId;
                let active =
                    (activeId && versions.find((v) => v && v.id === activeId)) ||
                    versions[versions.length - 1];
                // Get the characterDescription from the active version if available
                if (active && active.characterDescription) {
                    defaultPrompt = active.characterDescription;
                }
                // Get the style from the active version if available
                if (active && active.style) {
                    activeStyle = active.style;
                }
            }
        } catch (e) {
            // Non-fatal – continue to fallback below.
        }

        // Fallback: if no stored characterDescription, generate one from character data
        // This handles older portraits that don't have characterDescription stored.
        if (!defaultPrompt) {
            if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
                defaultPrompt = AIService.buildCharacterDescription(character);
            } else {
                defaultPrompt = `${character.race}\u0020${character.class}`;
            }
        }
    } catch (e) {
        defaultPrompt = `${character.race}\u0020${character.class}`;
    }
    
    // Populate style dropdown before setting the prompt
    // Use active style from portrait version, or fall back to user's saved preference
    if (!activeStyle) {
        try {
            if (window.StorageService && typeof StorageService.getPortraitPromptTheme === 'function') {
                activeStyle = StorageService.getPortraitPromptTheme();
            }
        } catch (e) {
            // Non-fatal
        }
    }
    // Await the async dropdown population to ensure API sync completes first
    // This ensures global/shared styles are loaded for all authenticated users
    await populatePortraitStyleDropdown(activeStyle);
    
    document.getElementById('portraitPrompt').value = defaultPrompt;
    const promptModal = document.getElementById('portraitPromptModal');
    if (promptModal) {
        promptModal.classList.add('show');
        if (typeof focusFirstFieldInModal === 'function') {
            focusFirstFieldInModal(promptModal);
        }
        // Snapshot form values for dirty checking
        setTimeout(() => ModalManager.snapshotForm('portraitPromptModal'), 50);
    }

    // Populate the quota line (and keep it updated while the modal is open).
    try {
        // Helper to disable/enable modal controls based on quota state
        const updateModalControlsState = (isExhausted) => {
            const promptTextarea = document.getElementById('portraitPrompt');
            const styleTrigger = document.getElementById('portraitStyleTrigger');
            const footerBtns = promptModal?.querySelectorAll('.modal-footer button');
            
            if (promptTextarea) {
                promptTextarea.disabled = isExhausted;
                if (isExhausted) {
                    promptTextarea.placeholder = 'Daily limit reached - come back tomorrow!';
                } else {
                    promptTextarea.placeholder = 'Enter custom description...';
                }
            }
            if (styleTrigger) {
                styleTrigger.disabled = isExhausted;
            }
            if (footerBtns) {
                footerBtns.forEach(btn => {
                    btn.disabled = isExhausted;
                });
            }
        };

        const updateQuotaLine = (detail) => {
            const el = document.getElementById('managerImageQuotaLine');
            if (!el) return;
            const remaining = detail && typeof detail.remaining === 'number' ? detail.remaining : null;
            const limit = detail && typeof detail.limit === 'number' ? detail.limit : null;

            // Update disabled state based on quota
            const isExhausted = remaining === 0;
            updateModalControlsState(isExhausted);

            if (remaining === -1) {
                el.textContent = 'Image quota: unlimited (admin/dev)';
                return;
            }

            if (remaining === 0 && limit != null) {
                el.textContent = 'Custom portraits left today: 0/' + limit;
                return;
            }

            if (remaining != null && limit != null) {
                el.textContent = 'Custom portraits left today: ' + remaining + '/' + limit;
                return;
            }

            el.textContent = 'Image quota: unavailable';
        };

        // Remove any previous handler to avoid duplicates
        if (window._managerQuotaHandler) {
            window.removeEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);
        }
        window._managerQuotaHandler = (e) => updateQuotaLine(e && e.detail);
        window.addEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);

        // Initial fetch
        if (window.AIService && typeof AIService.getImageQuotaStatus === 'function') {
            const quota = await AIService.getImageQuotaStatus();
            if (quota) {
                updateQuotaLine({ limit: quota.limit, remaining: quota.remaining });
            }
        }
    } catch (e) {
        // Non-fatal
    }
}

function closePortraitPromptModal() {
    // Close the style menu if open (using standard selector toggle)
    const trigger = document.getElementById('portraitStyleTrigger');
    if (trigger && trigger.classList.contains('is-open') && window.CharacterSheet) {
        CharacterSheet.toggleSelectorMenu(trigger);
    }
    
    const modal = document.getElementById('portraitPromptModal');
    if (!modal) {
        const promptInput = document.getElementById('portraitPrompt');
        if (promptInput) promptInput.value = '';
        currentPortraitCharacterId = null;
        currentPortraitStyle = null;
        return;
    }

    const cleanup = () => {
        const promptInput = document.getElementById('portraitPrompt');
        if (promptInput) promptInput.value = '';
        currentPortraitCharacterId = null;
        currentPortraitStyle = null;

        // Remove quota listener (if set)
        try {
            if (window._managerQuotaHandler) {
                window.removeEventListener('danddy:imageQuotaUpdate', window._managerQuotaHandler);
                window._managerQuotaHandler = null;
            }
        } catch (e) {}
    };

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: cleanup,
    });
}

async function confirmGeneratePortrait() {
    // Defensive check: block if quota is exhausted (in case modal was opened before quota loaded)
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
        );
        closePortraitPromptModal();
        return;
    }

    // Capture the current character ID and style in local variables so they're not lost
    // when we close the modal (which resets currentPortraitCharacterId and currentPortraitStyle to null).
    const portraitCharacterId = currentPortraitCharacterId;
    const selectedStyle = currentPortraitStyle;
    
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
    const originalPortraitDomId = `original-portrait-${portraitCharacterId}`;
    const originalPortraitEl = document.getElementById(originalPortraitDomId);

    // If the user prefers original images, temporarily switch the visible
    // portrait frame from original → ASCII so they see the cube loader and
    // status text while art is generating. Once the new portrait is ready,
    // we'll switch back to original mode so their preference is respected.
    let shouldRestoreOriginalView = false;
    if (portraitEl && originalPortraitEl) {
        const container = portraitEl.closest('.portrait-container');
        const toggleBtn = document.getElementById(`toggle-portrait-btn-${portraitCharacterId}`);

        // Read the persisted portrait view preference, falling back to config.
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

        const isAsciiHidden = portraitEl.classList.contains('is-hidden');
        const isOriginalVisible = !originalPortraitEl.classList.contains('is-hidden');
        const isContainerOriginal =
            !!container && container.classList.contains('portrait-container--original-mode');

        // Only flip the view if:
        // - the global preference is "original"
        // - the DOM is currently showing the original image
        if (portraitViewMode === 'original' && isAsciiHidden && isOriginalVisible && isContainerOriginal) {
            shouldRestoreOriginalView = true;

            // Switch to ASCII view so the loader is visible.
            portraitEl.classList.remove('is-hidden');
            originalPortraitEl.classList.add('is-hidden');
            if (container) {
                container.classList.remove('portrait-container--original-mode');
            }

            // Update the toggle label to match the temporary ASCII view.
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

    let portraitLoadingInterval;
    let portraitElapsed = 0;
    let portraitLoadingActive = true;
    
   const updatePortraitLoading = () => {
       if (!portraitEl || !portraitLoadingActive) return;

       // Single-line status with animated ellipsis and a subtext that reflects the current image model.
       const baseMessage = 'Generating character art';

       // Default subtext assumes DALL·E 3 timing; GPT Image 1 can take longer.
       let subtext = '(This usually takes 20–30 seconds)';
       try {
           let imageModel = 'dall-e-3';
           if (window.StorageService && typeof StorageService.getImageModel === 'function') {
               imageModel = StorageService.getImageModel();
           } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
               imageModel = CONFIG.DEFAULT_IMAGE_MODEL;
           }

           if (imageModel === 'gpt-image-1') {
               subtext = '(This can take up to a minute)';
           } else if (imageModel === 'gpt-image-1.5') {
               subtext = '(GPT Image 1.5 – usually 15–30 seconds)';
           }
       } catch (e) {
           // Fall back to default subtext on any error.
       }

       const dotCount = (portraitElapsed % 3) + 1;

       // Use shared cube loader so builder + manager share the same UI and
       // image-model timing hint logic.
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
           // Fallback: inline markup if the shared helper is unavailable.
           let textEl = portraitEl.querySelector('.portrait-placeholder-text');
           if (!textEl) {
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
               textEl.setAttribute('data-dots', String(dotCount));
               const messageEl = textEl.querySelector('.portrait-placeholder-message');
               if (messageEl) {
                   messageEl.textContent = baseMessage;
               }
           }
       }

       portraitElapsed++;
    };
    
    if (portraitEl) {
        // Add placeholder class for proper cube display with flexbox and 3D context
        portraitEl.classList.add('ascii-portrait--placeholder');
        portraitEl.classList.remove('ascii-portrait--loading');
        portraitEl.style.fontSize = '';
        updatePortraitLoading();
        portraitLoadingInterval = setInterval(updatePortraitLoading, 1000);
    }

    console.log('%c🎨 PORTRAIT: Starting AI portrait generation...', 'color: #0ff; font-weight: 500');
    console.log('  Note: DALL-E takes 20-30s when backend is warm, 60s+ on cold start...');

    try {
        // Add rendering instructions to the user's character description
        // Use shared pose + camera data from PortraitPoseData module
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
            // Use the style selected in the modal dropdown (captured before closing).
            const promptThemeId = selectedStyle || null;

            renderingInstructions =
                window.PortraitPrompt.buildCustomPortraitInstructions({
                    posePrompt,
                    cameraPrompt,
                    themeId: promptThemeId,
                });
        } else {
            // Fallback if PortraitPrompt is unavailable.
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
        
        // Generate custom portrait with full prompt
        const result = await window.AsciiArtService.generateCustomAIPortraitWithPrompt(fullPrompt);

        // Check if generation actually succeeded
        if (!result || !result.asciiArt || !result.imageUrl) {
            throw new Error('Portrait generation returned incomplete result');
        }

        // Stop the loading animation (guard against any final timer ticks)
        portraitLoadingActive = false;
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }

        console.log('%c🎨 PORTRAIT (Success) ✨', 'color: #0f0; font-weight: 500');

        // Update character in storage and append a new portrait version
        const currentCount = character.customPortraitCount || 0;

        console.log('%c🎨 PORTRAIT HISTORY CHECK', 'color: #0ff; font-weight: 500');
        console.log('  window.PortraitHistory exists:', !!window.PortraitHistory);
        console.log('  addVersion is function:', typeof window.PortraitHistory?.addVersion === 'function');

        // Use the style selected in the modal dropdown for tagging
        const managerStyle = selectedStyle || null;

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
                            style: null,
                        },
                    );

                    baseCharacterForHistory = {
                        ...character,
                        portraitMetadata: seededMetadata,
                    };
                }
            }

            // Capture the model and quality that were used for generation
            let generationModel = 'dall-e-3';
            let generationQuality = null;
            try {
                if (window.StorageService && typeof StorageService.getImageModel === 'function') {
                    generationModel = StorageService.getImageModel();
                } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_IMAGE_MODEL) {
                    generationModel = CONFIG.DEFAULT_IMAGE_MODEL;
                }
                if (window.StorageService && typeof StorageService.getImageQuality === 'function') {
                    generationQuality = StorageService.getImageQuality(generationModel);
                }
            } catch (e) {
                // Non-fatal: use defaults
            }

            updatedMetadata = window.PortraitHistory.addVersion(
                baseCharacterForHistory,
                result.asciiArt,
                result.imageUrl,
                {
                    source: 'custom-ai',
                    prompt: fullPrompt,
                    characterDescription: customPrompt,
                    style: managerStyle,
                    model: generationModel,
                    quality: generationQuality,
                },
            );
            console.log('%c🎨 PORTRAIT HISTORY UPDATED', 'color: #0f0; font-weight: 500');
            console.log('  Versions count:', updatedMetadata.versions?.length || 0);
            console.log('  Active version:', updatedMetadata.activeVersionId);
        } else {
            console.log('%c⚠️ PORTRAIT HISTORY NOT AVAILABLE!', 'color: #f00; font-weight: 500');
            console.log('  Using fallback - no versions will be saved');
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

        // Persist to storage (cloud or local depending on auth state)
        await CharacterStorage.update(portraitCharacterId, updates);
        markUserChanges(); // Show guest notice if applicable

        // Apply the new portrait directly into the currently visible manager UI
        // so we avoid a full grid/sheet re-render and instead "draw in" the art.
        try {
            const portraitArt = result.asciiArt;
            const portraitDomId = `character-portrait-${portraitCharacterId}`;
            const originalPortraitDomId = `original-portrait-${portraitCharacterId}`;
            const asciiEl = document.getElementById(portraitDomId);
            const imgEl = document.getElementById(originalPortraitDomId);

            // If we temporarily switched from original → ASCII to show the
            // loader, restore the original image view now that the new art
            // is ready. Skip the ASCII animation when in original mode.
            if (shouldRestoreOriginalView && asciiEl && imgEl) {
                const container = asciiEl.closest('.portrait-container');
                const toggleBtn = document.getElementById(`toggle-portrait-btn-${portraitCharacterId}`);

                // Store the ASCII art in the element without animation so it's
                // available if user toggles to ASCII view later.
                if (portraitArt) {
                    if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
                        CharacterSheet.setPortraitContent(asciiEl, portraitArt);
                    } else {
                        asciiEl.innerHTML = '';
                        const pre = document.createElement('pre');
                        pre.textContent = portraitArt;
                        asciiEl.appendChild(pre);
                    }
                    // Remove loading/placeholder classes since content is now set
                    asciiEl.classList.remove('ascii-portrait--placeholder', 'ascii-portrait--loading');
                }

                // Restore original image view with reveal animation
                asciiEl.classList.add('is-hidden');
                imgEl.classList.remove('is-hidden', 'is-loaded', 'portrait-reveal');
                if (container) {
                    container.classList.add('portrait-container--original-mode');
                }

                // Set image src and trigger reveal animation when it loads
                imgEl.onload = function() {
                    this.classList.add('is-loaded', 'portrait-reveal');
                    // Clean up the reveal class after animation completes
                    this.addEventListener('animationend', () => {
                        this.classList.remove('portrait-reveal');
                    }, { once: true });
                };
                imgEl.src = result.imageUrl;

                if (toggleBtn) {
                    const iconSpan = toggleBtn.querySelector('.selector-option-icon');
                    const labelSpan = toggleBtn.querySelector('.selector-option-label');
                    if (iconSpan && labelSpan) {
                        iconSpan.textContent = '≡';
                        labelSpan.textContent = 'View ASCII Art';
                    } else {
                        toggleBtn.textContent = '≡ View ASCII Art';
                    }
                }
            } else {
                // Update original image src so it's ready if user toggles view
                if (imgEl && result.imageUrl) {
                    imgEl.src = result.imageUrl;
                }
                // In ASCII mode: animate the ASCII portrait into place, mirroring
                // the builder's typewriter-style reveal so it feels consistent.
                if (asciiEl && portraitArt) {
                    await typeManagerPortrait(asciiEl, portraitArt);
                }
            }

            // Also update the character card thumbnail (if it exists) so the
            // grid immediately reflects the newly generated portrait.
            // Respect the user's portrait view mode preference (original vs ASCII).
            const thumbEl = document.getElementById(`card-thumb-${portraitCharacterId}`);
            if (thumbEl) {
                try {
                    // Check the user's portrait view mode preference
                    let thumbViewMode = 'original';
                    try {
                        if (window.StorageService && StorageService.getPortraitViewMode) {
                            thumbViewMode = StorageService.getPortraitViewMode();
                        } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_VIEW_MODE) {
                            thumbViewMode = CONFIG.DEFAULT_PORTRAIT_VIEW_MODE;
                        }
                    } catch (e) {
                        // Non-fatal: keep default
                    }

                    const showOriginalImage = thumbViewMode === 'original' && !!result.imageUrl;

                    if (showOriginalImage) {
                        // Update to show the original image
                        let thumbImgEl = thumbEl.querySelector('img');
                        if (thumbImgEl) {
                            // Just update the src
                            thumbImgEl.src = result.imageUrl;
                        } else {
                            // Need to switch from ASCII to image mode
                            thumbEl.innerHTML = '';
                            thumbEl.classList.add('card-thumbnail--image');
                            thumbImgEl = document.createElement('img');
                            thumbImgEl.src = result.imageUrl;
                            thumbImgEl.alt = 'Character portrait';
                            thumbImgEl.loading = 'lazy';
                            thumbImgEl.onload = function() { this.classList.add('is-loaded'); };
                            thumbEl.appendChild(thumbImgEl);
                        }
                    } else if (portraitArt) {
                        // Update to show ASCII art
                        let croppedArt;
                        if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                            croppedArt = UI.cropAsciiForThumbnail(portraitArt);
                        } else {
                            const lines = portraitArt.split('\n');
                            const topLines = lines
                                .slice(0, 80)
                                .map(line => line.slice(0, 160));
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
                    console.error('Portrait thumbnail update failed', thumbError);
                }
            }
        } catch (applyError) {
            console.error('Error applying new custom portrait to manager UI', applyError);
        }

        // Keep AppState in sync for any future renders/navigations so that if
        // the grid or sheet re-renders later, it uses this new portrait.
        // Use String() comparison to handle type mismatches (cloud IDs may be
        // numeric, but portraitCharacterId from onclick is always a string).
        try {
            const nextCharacter = { ...character, ...updates };
            const idStr = String(portraitCharacterId);

            // Debug: Log the character state being applied
            if (window.DEBUG_PORTRAITS) {
                console.log(`🖼️ [PORTRAIT DEBUG] After generation - updating AppState`, {
                    characterId: idStr,
                    characterName: nextCharacter.name,
                    newPortraitUrl: updates.originalPortraitUrl,
                    newActiveVersionId: updates.portraitMetadata?.activeVersionId,
                    hasCustomPortraitAscii: !!updates.customPortraitAscii,
                    timestamp: new Date().toISOString()
                });
            }

            // Update AppState arrays directly (avoid window.AppState check which
            // could reference a different object due to module scoping)
            if (Array.isArray(AppState.characters)) {
                const idx = AppState.characters.findIndex(
                    c => c && String(c.id) === idStr,
                );
                if (idx !== -1) {
                    AppState.characters[idx] = nextCharacter;
                }
            }
            if (Array.isArray(AppState.filteredCharacters)) {
                const fIdx = AppState.filteredCharacters.findIndex(
                    c => c && String(c.id) === idStr,
                );
                if (fIdx !== -1) {
                    AppState.filteredCharacters[fIdx] = nextCharacter;
                }
            }

            // Debug: Verify the AppState update
            if (window.DEBUG_PORTRAITS) {
                const verifyChar = AppState.characters.find(c => c && String(c.id) === idStr);
                console.log(`🖼️ [PORTRAIT DEBUG] AppState AFTER in-place update`, {
                    characterId: idStr,
                    portraitUrl: verifyChar?.originalPortraitUrl,
                    activeVersionId: verifyChar?.portraitMetadata?.activeVersionId,
                    hasCustomPortraitAscii: !!verifyChar?.customPortraitAscii,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (stateError) {
            console.error('Error syncing AppState after portrait generation', stateError);
        }

        // Re-sort and re-render the grid WITHOUT reloading from storage.
        // Previously we called `await AppState.loadCharacters()` here, but that
        // could return stale data from storage/cloud if the write hadn't fully
        // propagated, causing portrait mismatches when switching characters.
        // Since we already updated AppState.characters in-place above, we just
        // need to re-apply filters (which handles sorting) and re-render.
        if (window.DEBUG_PORTRAITS) {
            console.log(`🖼️ [PORTRAIT DEBUG] Re-sorting grid (no storage reload)`, {
                characterId: portraitCharacterId,
                timestamp: new Date().toISOString()
            });
        }

        // Update the character's updatedAt timestamp so it sorts correctly in "date modified" mode
        const idStr = String(portraitCharacterId);
        const charInState = AppState.characters.find(c => c && String(c.id) === idStr);
        if (charInState) {
            charInState.updatedAt = new Date().toISOString();
            // Also update in filteredCharacters if present
            const filteredChar = AppState.filteredCharacters.find(c => c && String(c.id) === idStr);
            if (filteredChar) {
                filteredChar.updatedAt = charInState.updatedAt;
            }
        }

        // Re-apply filters (handles sorting) and re-render
        AppState.applyFilters();
        UI.render();

        // Debug: Verify the character data is still correct after re-render
        if (window.DEBUG_PORTRAITS) {
            const charAfterRender = AppState.characters.find(c => c && String(c.id) === idStr);
            console.log(`🖼️ [PORTRAIT DEBUG] AppState AFTER re-render (no reload)`, {
                characterId: idStr,
                portraitUrl: charAfterRender?.originalPortraitUrl,
                activeVersionId: charAfterRender?.portraitMetadata?.activeVersionId,
                hasCustomPortraitAscii: !!charAfterRender?.customPortraitAscii,
                versionsCount: charAfterRender?.portraitMetadata?.versions?.length || 0,
                timestamp: new Date().toISOString()
            });
        }

        // Notify the user that the portrait was generated successfully.
        // Previously this message included a "3 remaining" counter, which
        // implied a hard limit on custom portraits per character. That limit
        // has been removed, so we no longer show a remaining count here.
        showNotification('Custom portrait generated!');

        // Clear the global pointer once we're done
        currentPortraitCharacterId = null;
    } catch (error) {
        console.error('Error generating custom AI portrait:', error);
        
        // Stop the loading animation
        if (portraitLoadingInterval) {
            clearInterval(portraitLoadingInterval);
        }
        // Restore portrait font size and remove placeholder class on error as well
        if (portraitEl) {
            portraitEl.style.fontSize = '';
            portraitEl.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
        }
        
        // Restore previous portrait first
        if (portraitEl) {
            const asciiPortrait = window.CharacterSheet.getAsciiPortrait(character);
            if (asciiPortrait && window.CharacterSheet) {
                CharacterSheet.setPortraitContent(portraitEl, asciiPortrait);
            } else if (window.CharacterSheet) {
                CharacterSheet.setPortraitContent(portraitEl, '[ NO PORTRAIT ]');
            }
        }
        
        // Graceful error handling - inform but don't block
        if (error.isSafetyRejection) {
            console.log('%c🎨 PORTRAIT (Safety System Rejection)', 'color: #fa0; font-weight: 500');
            console.log('  OpenAI flagged this request:', error.originalMessage || error.message);
            showNotification('⚠️ OpenAI flagged this portrait request. Try modifying your character description or prompt.');
        } else if (error.isRateLimit) {
            console.log('%c🎨 PORTRAIT (Rate Limited)', 'color: #fa0; font-weight: 500');
            showNotification('⚠️ Rate limit exceeded. Please wait a few minutes before trying again.');
        } else if (error.name === 'AbortError' || (error.message && error.message.includes('timed out'))) {
            console.log('%c🎨 PORTRAIT (Timeout - Backend Waking Up)', 'color: #fa0; font-weight: 500');
            console.log('  ⏰ Request timed out. Backend may be waking up from cold start.');
            console.log('  ✅ Try again in a moment - server should be warm now!');
            showNotification('⏰ Request timed out. Backend may be waking up. Try again in a moment!');
            
            // Trigger background warmup like other AI features
            if (window.AIService && window.AIService.warmupBackend) {
                window.AIService.warmupBackend();
            }
        } else if (error.message && error.message.includes('fetch')) {
            console.log('%c🎨 PORTRAIT (Connection Error)', 'color: #f00; font-weight: 500');
            console.log('  Cannot connect to backend server');
            showNotification('🔌 Cannot connect to backend server. Check that it\'s running.');
        } else {
            console.log('%c🎨 PORTRAIT (Failed)', 'color: #f00; font-weight: 500');
            console.log('  Error:', error.message);
            showNotification('❌ Portrait generation failed. Check console for details and try again.');
        }
    }
}

async function surpriseMePortrait() {
    // Defensive check: block if quota is exhausted
    if (typeof window._imageQuotaRemaining === 'number' && window._imageQuotaRemaining === 0) {
        showAlertDialog(
            "You've reached your daily limit for portrait generation. Come back tomorrow for more adventures!"
        );
        closePortraitPromptModal();
        return;
    }

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

    // Build a fresh randomized character description for the user to edit.
    // NOTE: Use buildCharacterDescription (not buildPortraitPrompt) so that
    // rendering instructions (Pose/Camera/STYLE/Scene) are only added once
    // by confirmGeneratePortrait, avoiding duplication in the final prompt.
    let templatePrompt = '';
    try {
        if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
            templatePrompt = AIService.buildCharacterDescription(character);
        } else {
            templatePrompt = `${character.race}\u0020${character.class}`;
        }
    } catch (e) {
        templatePrompt = `${character.race}\u0020${character.class}`;
    }

    const promptInput = document.getElementById('portraitPrompt');
    if (promptInput) {
        promptInput.value = templatePrompt;
    }

    // Reuse the existing generation pipeline.
    await confirmGeneratePortrait();
}

// Animate ASCII portrait character-by-character, line-by-line in the manager
// sheet, mirroring the builder's quick-create behavior but scoped to the
// manager DOM. This keeps the "new art fades in" feel without reloading.
async function typeManagerPortrait(element, portraitText) {
    if (!element || !portraitText) return;

    // Normalize the portrait container back to the base ASCII frame in case
    // any loader/placeholder styles are still hanging around.
    element.classList.remove('ascii-portrait--loading', 'ascii-portrait--placeholder');
    element.style.fontSize = '';
    element.style.whiteSpace = '';
    element.style.textAlign = '';
    element.style.overflowX = '';
    element.style.overflowY = '';

    const lines = portraitText.split('\n');
    // Use a <pre> child element for proper CSS flex centering
    element.innerHTML = '';
    const pre = document.createElement('pre');
    element.appendChild(pre);

    let currentText = '';
    const charsPerFrame = 40; // Batch multiple characters per frame for speed
    let charCount = 0;

    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex];

        for (let charIndex = 0; charIndex < line.length; charIndex++) {
            currentText += line[charIndex];
            charCount++;

            if (charCount >= charsPerFrame) {
                pre.textContent = currentText;
                charCount = 0;
                await new Promise(resolve => requestAnimationFrame(resolve));
            }
        }

        if (lineIndex < lines.length - 1) {
            currentText += '\n';
        }
    }

    // Final flush to ensure all text is visible
    pre.textContent = currentText;
}

// Panel loading cubes are now defined directly in index.html using
// portrait-style cube markup (larger, simpler Y-axis rotation).

// ===== PORTRAIT HISTORY (MANAGER) =====
// The full portrait history UI is now handled by the shared PortraitUI
// module (portraits-ui.js). Keep this wrapper for backwards compatibility
// with any code that still calls openPortraitHistory(characterId) directly.
async function openPortraitHistory(characterId) {
    if (window.PortraitUI && typeof window.PortraitUI.openManagerHistory === 'function') {
        return window.PortraitUI.openManagerHistory(characterId);
    }
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

    // On mobile, close the sheet view first before showing the confirmation dialog.
    // This returns the user to the grid so they see the context of what they're deleting.
    if (typeof MobileView !== 'undefined' && MobileView.isMobile() && MobileView.isOpen()) {
        MobileView.close();
    }

    showConfirmDialog(`Delete ${character.name}?\n\nThis cannot be undone.`, async () => {
        await CharacterStorage.delete(id);
        await AppState.loadCharacters();
        UI.render();
        showNotification('Character deleted');
    });
}

/**
 * Leave a shared character (remove yourself as a collaborator).
 * This removes the character from your collection but doesn't delete it for the owner.
 * @param {string|number} id - The character ID
 */
async function leaveSharedCharacter(id) {
    const character = await CharacterStorage.getById(id);
    if (!character) return;

    // On mobile, close the sheet view first
    if (typeof MobileView !== 'undefined' && MobileView.isMobile() && MobileView.isOpen()) {
        MobileView.close();
    }

    const ownerEmail = character.owner_email || character.ownerEmail || 'the owner';
    showConfirmDialog(
        `Leave shared character "${character.name}"?\n\nThis character was shared with you by ${ownerEmail}. You will no longer have access to it, but the owner will keep it.`,
        async () => {
            try {
                await CharacterCloudStorage.leaveSharedCharacter(id);
                await AppState.loadCharacters();
                UI.render();
                showNotification('Left shared character');
            } catch (error) {
                console.error('Failed to leave shared character:', error);
                showNotification(error.message || 'Failed to leave character', 'error');
            }
        }
    );
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
    const modal = document.getElementById('importModal');
    if (!modal) {
        isImporting = false;
        return;
    }

    const cleanup = () => {
        const fileInput = document.getElementById('importFile');
        const fileName = document.getElementById('fileName');
        if (fileInput) fileInput.value = '';
        if (fileName) fileName.textContent = '';

        // Re-enable the import button and reset text
        const importButton = getImportModalPrimaryButton();
        if (importButton) {
            importButton.disabled = true;  // Disable for next time modal opens
            importButton.textContent = 'IMPORT';
        }

        isImporting = false;  // Reset flag when closing
        console.log('🚪 closeImportModal() done, isImporting now:', isImporting);
    };

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: cleanup,
    });
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
    const modal = document.getElementById('duplicateModal');
    if (!modal) {
        pendingDuplicateResolution = null;
        isImporting = false;
        return;
    }

    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: () => {
            pendingDuplicateResolution = null;
            isImporting = false;  // Reset flag
        },
    });
}

function saveDuplicateResolution() {
    const selectedRadio = document.querySelector('input[name="duplicateAction"]:checked');
    if (!selectedRadio) {
        console.error('No duplicate action selected!');
        return;
    }
    resolveDuplicate(selectedRadio.value);
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
    markUserChanges(); // Show guest notice if applicable
    
    if (result) {
        console.log('✅ KEEP BOTH SUCCESS: Character imported as', newName);
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
    markUserChanges(); // Show guest notice if applicable
    
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
    const container = asciiPortrait
        ? asciiPortrait.closest('.portrait-container')
        : null;

    if (!asciiPortrait || !originalPortrait || !toggleBtn) {
        console.warn('Portrait elements not found for character:', characterId);
        return;
    }

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
}

function showNotification(rawMessage, duration = 4000) {
    // Normalize to string so callers can safely pass anything.
    const message = (rawMessage == null) ? '' : String(rawMessage);

    // Console notification with visual styling (preserve any glyphs for logs)
    console.log('%c✓ ' + message, 'color: #0f0; font-weight: 500');

    // Strip leading glyphs (checkmarks, warning icons, etc.) from the toast text
    // while keeping them available in logs. This keeps toasts purely textual
    // with the exception of the "×" close button. Also trim leading/trailing
    // whitespace so any stray spaces from callers are cleaned up.
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

    // Toast notification shared across the app (anchored to the terminal frame)
    let toast = document.getElementById('toastNotification');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toastNotification';
        toast.className = 'toast-notification';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');

        // Inner structure: message + dismiss "X" pinned to the right in its own wrapper
        toast.innerHTML = `
            <span class="toast-message"></span>
            <div class="toast-dismiss-wrapper">
                <button type="button" class="toast-dismiss" aria-label="Dismiss notification">
                    <span class="toast-dismiss-icon">&times;</span>
                </button>
            </div>
        `;

        const container = document.querySelector('.terminal-frame') || document.body;
        container.appendChild(toast);

        const dismissBtn = toast.querySelector('.toast-dismiss');
        if (dismissBtn) {
            dismissBtn.addEventListener('click', () => {
                toast.classList.remove('show');
                // Clear any pending show/hide timers
                if (window._toastShowTimeout) {
                    clearTimeout(window._toastShowTimeout);
                    window._toastShowTimeout = null;
                }
                if (window._toastTimeout) {
                    clearTimeout(window._toastTimeout);
                    window._toastTimeout = null;
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
    if (window._toastShowTimeout) {
        clearTimeout(window._toastShowTimeout);
        window._toastShowTimeout = null;
    }
    if (window._toastTimeout) {
        clearTimeout(window._toastTimeout);
        window._toastTimeout = null;
    }

    // Ensure we start from the hidden state so the transition always plays,
    // even immediately after a page reload.
    toast.classList.remove('show');
    // Force a reflow so the browser acknowledges the hidden state
    // before we add the "show" class.
    void toast.offsetWidth; // eslint-disable-line no-unused-expressions

    window._toastShowTimeout = setTimeout(() => {
        toast.classList.add('show');
        window._toastShowTimeout = null;

        // Auto-dismiss after specified duration (default 4s for success messages)
        window._toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
            window._toastTimeout = null;
        }, duration);
    }, 80);
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
        // Defer slightly to ensure any CSS animations / layout are ready.
        // We intentionally do NOT auto-select the text; we only move focus.
        setTimeout(() => {
            try {
                target.focus();
            } catch (e) {
                // Non-fatal
            }
        }, 0);
    }
}

// Manager now uses the shared SettingsModal defined in character-builder-components.js

// Generic helper: animate modal close so it shrinks toward center instead of
// disappearing instantly. Expects terminal-theme.css modal keyframes.
/**
 * @param {HTMLElement} modal
 * @param {{ removeOnClose?: boolean, onClosed?: () => void }} options
 */
function animateModalClose(modal, options = {}) {
    if (!modal) return;

    const { removeOnClose = false, onClosed } = options;

    // Avoid double-closing the same modal.
    if (modal.classList.contains('closing')) {
        return;
    }

    // Keep .show so layout stays active while the close animation runs.
    modal.classList.add('closing');

    const content = modal.querySelector('.modal-content') || modal;

    let finished = false;
    const finish = () => {
        // Prevent double-execution from both animationend and fallback timeout
        if (finished) return;
        finished = true;

        if (removeOnClose) {
            if (modal && modal.parentNode) {
                modal.parentNode.removeChild(modal);
            }
        } else {
            modal.classList.remove('show');
            modal.classList.remove('closing');
        }

        if (typeof onClosed === 'function') {
            onClosed();
        }
    };

    if (content && typeof content.addEventListener === 'function') {
        content.addEventListener('animationend', finish, { once: true });
        // Fallback timeout in case animationend doesn't fire
        // (e.g., animation was already running or browser quirk)
        setTimeout(finish, 400);
    } else {
        finish();
    }
}

// Helper hooks so inline onclick handlers can use the shared animator.
function closeGenericConfirmModal() {
    const modal = document.getElementById('genericConfirmModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

function closeGenericAlertModal() {
    const modal = document.getElementById('genericAlertModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

function closeRenameModal() {
    const modal = document.getElementById('renameModal');
    if (!modal) return;
    animateModalClose(modal, { removeOnClose: true });
}

/**
 * Close all editor/character-related modals.
 * Called during logout and login to ensure a clean state.
 */
function closeAllEditorModals() {
    // List of modal IDs that should be closed on auth state changes
    const modalIds = [
        'editDetailsModal',
        'spellEditModal',
        'portraitPromptModal',
        'importModal',
        'duplicateModal',
        'renameModal',
        'shareModal',
        'pendingSharesModal',
        'genericConfirmModal',
        'genericAlertModal',
        'sessionExpiredModal',
    ];
    
    modalIds.forEach(id => {
        const modal = document.getElementById(id);
        if (modal && modal.classList.contains('show')) {
            // Force immediate close without animation to avoid race conditions
            modal.classList.remove('show', 'closing');
        }
    });
    
    // Also restore the editDetailsModal content to its original state
    // in case it was showing the level change dialog
    const editModal = document.getElementById('editDetailsModal');
    if (editModal && originalEditModalContent) {
        const modalContent = editModal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.innerHTML = originalEditModalContent;
        }
    }
    
    // Clear any editing state
    currentEditCharacterId = null;
    originalEditLevel = null;
}

// Generic confirmation modal using terminal modal styles
function showConfirmDialog(message, onConfirm) {
    const existing = document.getElementById('genericConfirmModal');
    if (existing) existing.remove();

    const escapedMessage = Utils.escapeHtml(message).replace(/\n/g, '<br>');
    const modalHtml = `
      <div id="genericConfirmModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">CONFIRM</h2>
            <button class="modal-close" onclick="closeGenericConfirmModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">${escapedMessage}</p>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn" id="genericConfirmCancel">CANCEL</button>
            <button class="terminal-btn terminal-btn-primary" id="genericConfirmOk">OK</button>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericConfirmModal');
    const cancelBtn = document.getElementById('genericConfirmCancel');
    const okBtn = document.getElementById('genericConfirmOk');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
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

// Helper to animate modal content transition with height change
function animateModalContentSwap(modalContent, newHtml, onComplete) {
    const startHeight = modalContent.offsetHeight;
    
    // Phase 1: Fade out current content
    modalContent.style.overflow = 'hidden';
    modalContent.style.height = startHeight + 'px';
    modalContent.style.transition = 'opacity 0.15s ease-out';
    modalContent.style.opacity = '0';
    
    setTimeout(() => {
        // Swap content
        modalContent.innerHTML = newHtml;
        
        // Measure new height (temporarily set to auto)
        modalContent.style.height = 'auto';
        const endHeight = modalContent.offsetHeight;
        
        // Reset to start height for animation
        modalContent.style.height = startHeight + 'px';
        modalContent.style.opacity = '0';
        
        // Force reflow
        void modalContent.offsetHeight;
        
        // Phase 2: Animate height and fade in
        modalContent.style.transition = 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.2s ease-out 0.1s';
        modalContent.style.height = endHeight + 'px';
        modalContent.style.opacity = '1';
        
        setTimeout(() => {
            // Clean up - let height be auto again
            modalContent.style.height = '';
            modalContent.style.overflow = '';
            modalContent.style.transition = '';
            if (onComplete) onComplete();
        }, 350);
    }, 150);
}

// Show dialog when user changes level in character editor
// Transforms the existing edit modal content instead of overlaying a new modal
// Returns a promise that resolves to: 'auto' | 'manual' | 'cancel'
function showLevelChangeDialog(oldLevel, newLevel, xpTriggered = false) {
    return new Promise((resolve) => {
        const editModal = document.getElementById('editDetailsModal');
        if (!editModal) {
            resolve('manual');
            return;
        }

        const modalContent = editModal.querySelector('.modal-content');
        if (!modalContent) {
            resolve('manual');
            return;
        }

        // Store original content
        const originalContent = modalContent.innerHTML;

        const levelDiff = newLevel - oldLevel;
        const direction = levelDiff > 0 ? 'up' : 'down';
        const levelText = Math.abs(levelDiff) === 1 ? 'level' : 'levels';

        // Customize message based on whether this was triggered by XP increase
        let titleText, mainText;
        if (xpTriggered && levelDiff > 0) {
            titleText = 'LEVEL UP!';
            mainText = `Your XP has reached the threshold for <strong>Level\u00A0${newLevel}</strong>! (${Math.abs(levelDiff)} ${levelText} ${direction})`;
        } else {
            titleText = 'LEVEL CHANGE';
            mainText = `You're changing from <strong>Level\u00A0${oldLevel}</strong> to <strong>Level\u00A0${newLevel}</strong> (${Math.abs(levelDiff)} ${levelText} ${direction}).`;
        }

        // Create new content for level change dialog
        const levelChangeHtml = `
          <div class="modal-header">
            <h2 class="modal-title">${titleText}</h2>
            <button class="modal-close" id="levelChangeClose">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text level-change-text">${mainText}</p>
            <p class="terminal-text-small" style="margin-top: 0.75rem; opacity: 0.8;">
              Would you like to automatically recalculate stats (HP, Proficiency Bonus, Spell Slots) for the new level, or update them manually?
            </p>
          </div>
          <div class="modal-footer" style="flex-wrap: wrap; gap: 0.5rem;">
            <button class="terminal-btn" id="levelChangeManual">KEEP MANUAL</button>
            <button class="terminal-btn terminal-btn-primary" id="levelChangeAuto">AUTO-CALCULATE</button>
          </div>
        `;

        // Animate transition to level change dialog
        animateModalContentSwap(modalContent, levelChangeHtml, () => {
            const closeBtn = document.getElementById('levelChangeClose');
            const manualBtn = document.getElementById('levelChangeManual');
            const autoBtn = document.getElementById('levelChangeAuto');

            const restoreAndResolve = (result) => {
                if (result === 'cancel') {
                    // Animate back to original content
                    animateModalContentSwap(modalContent, originalContent, () => {
                        // Restore the level value the user had entered (not the original)
                        const levelInput = document.getElementById('editLevel');
                        if (levelInput) {
                            levelInput.value = newLevel;
                        }
                        resolve(result);
                    });
                } else if (result === 'auto') {
                    // Show cube loader while "calculating", then proceed with save
                    const loadingHtml = `
                      <div class="modal-header">
                        <h2 class="modal-title">LEVEL CHANGE</h2>
                      </div>
                      <div class="modal-body" style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 150px;">
                        <div class="panel-loading-cube-container">
                          <div class="panel-loading-cube">
                            <i></i><i></i><i></i><i></i><i></i><i></i>
                          </div>
                        </div>
                        <p class="terminal-text-small" style="margin-top: 1rem; opacity: 0.8;">Calculating stats for Level ${newLevel}...</p>
                      </div>
                    `;
                    
                    animateModalContentSwap(modalContent, loadingHtml, () => {
                        // Show loader briefly, then resolve to proceed with save
                        setTimeout(() => {
                            resolve(result);
                        }, 500);
                    });
                } else {
                    // Restore original form content for manual, keeping the new level value
                    animateModalContentSwap(modalContent, originalContent, () => {
                        // Restore the level value the user had entered (the new level)
                        const levelInput = document.getElementById('editLevel');
                        if (levelInput) {
                            levelInput.value = newLevel;
                        }
                        resolve(result);
                    });
                }
            };

            closeBtn?.addEventListener('click', () => restoreAndResolve('cancel'));
            manualBtn?.addEventListener('click', () => restoreAndResolve('manual'));
            autoBtn?.addEventListener('click', () => restoreAndResolve('auto'));

            // Focus the auto-calculate button after animation
            autoBtn?.focus();
        });
    });
}

// D&D 5e XP thresholds for each level (same as CharacterSheet.XP_THRESHOLDS)
const XP_THRESHOLDS = [
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
];

/**
 * Calculate the level a character should be at based on their XP.
 * @param {number} xp - Current experience points
 * @returns {number} - Level (1-20)
 */
function calculateLevelFromXP(xp) {
    const currentXP = xp || 0;
    // Find the highest level where XP >= threshold
    for (let level = 20; level >= 1; level--) {
        if (currentXP >= XP_THRESHOLDS[level - 1]) {
            return level;
        }
    }
    return 1;
}

// Calculate derived stats for a given level
// Returns { proficiencyBonus, hpMax, hitDie, hitDiceMax, spellSlots, spellProgression }
// spellProgression: { cantrips, spellsKnown, maxSpellLevel } for casters, null for non-casters
// spellsKnown is null for "prepared" casters (Cleric, Druid, Paladin) who prepare from full spell list
function calculateStatsForLevel(character, newLevel) {
    // Hit die mapping for standard 5e classes
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

    // Full caster spell slot progression (Wizard, Sorcerer, Bard, Cleric, Druid)
    // Format: level -> { slotLevel: count }
    const FULL_CASTER_SLOTS = {
        1:  { 1: 2 },
        2:  { 1: 3 },
        3:  { 1: 4, 2: 2 },
        4:  { 1: 4, 2: 3 },
        5:  { 1: 4, 2: 3, 3: 2 },
        6:  { 1: 4, 2: 3, 3: 3 },
        7:  { 1: 4, 2: 3, 3: 3, 4: 1 },
        8:  { 1: 4, 2: 3, 3: 3, 4: 2 },
        9:  { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
        10: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
        11: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
        12: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1 },
        13: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
        14: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1 },
        15: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
        16: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1 },
        17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2, 6: 1, 7: 1, 8: 1, 9: 1 },
        18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 1, 7: 1, 8: 1, 9: 1 },
        19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 1, 8: 1, 9: 1 },
        20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 3, 6: 2, 7: 2, 8: 1, 9: 1 },
    };

    // Warlock Pact Magic slots (all slots are at highest available level, short rest recovery)
    const WARLOCK_PACT_SLOTS = {
        1:  { slots: 1, level: 1 },
        2:  { slots: 2, level: 1 },
        3:  { slots: 2, level: 2 },
        4:  { slots: 2, level: 2 },
        5:  { slots: 2, level: 3 },
        6:  { slots: 2, level: 3 },
        7:  { slots: 2, level: 4 },
        8:  { slots: 2, level: 4 },
        9:  { slots: 2, level: 5 },
        10: { slots: 2, level: 5 },
        11: { slots: 3, level: 5 },
        12: { slots: 3, level: 5 },
        13: { slots: 3, level: 5 },
        14: { slots: 3, level: 5 },
        15: { slots: 3, level: 5 },
        16: { slots: 3, level: 5 },
        17: { slots: 4, level: 5 },
        18: { slots: 4, level: 5 },
        19: { slots: 4, level: 5 },
        20: { slots: 4, level: 5 },
    };

    // Half caster spell slot progression (Paladin, Ranger) - starts at level 2
    const HALF_CASTER_SLOTS = {
        1:  {},
        2:  { 1: 2 },
        3:  { 1: 3 },
        4:  { 1: 3 },
        5:  { 1: 4, 2: 2 },
        6:  { 1: 4, 2: 2 },
        7:  { 1: 4, 2: 3 },
        8:  { 1: 4, 2: 3 },
        9:  { 1: 4, 2: 3, 3: 2 },
        10: { 1: 4, 2: 3, 3: 2 },
        11: { 1: 4, 2: 3, 3: 3 },
        12: { 1: 4, 2: 3, 3: 3 },
        13: { 1: 4, 2: 3, 3: 3, 4: 1 },
        14: { 1: 4, 2: 3, 3: 3, 4: 1 },
        15: { 1: 4, 2: 3, 3: 3, 4: 2 },
        16: { 1: 4, 2: 3, 3: 3, 4: 2 },
        17: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
        18: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 1 },
        19: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
        20: { 1: 4, 2: 3, 3: 3, 4: 3, 5: 2 },
    };

    // Full casters
    const FULL_CASTERS = ['wizard', 'sorcerer', 'bard', 'cleric', 'druid'];
    // Half casters
    const HALF_CASTERS = ['paladin', 'ranger'];

    // Spells Known progression by class and level
    // Format: { cantrips, spellsKnown, maxSpellLevel }
    // Note: "prepared" casters (Cleric, Druid, Paladin) use spellsKnown: null (they prepare instead)
    
    // Sorcerer - "known" caster (PHB p.100)
    const SORCERER_PROGRESSION = {
        1:  { cantrips: 4, spellsKnown: 2,  maxSpellLevel: 1 },
        2:  { cantrips: 4, spellsKnown: 3,  maxSpellLevel: 1 },
        3:  { cantrips: 4, spellsKnown: 4,  maxSpellLevel: 2 },
        4:  { cantrips: 5, spellsKnown: 5,  maxSpellLevel: 2 },
        5:  { cantrips: 5, spellsKnown: 6,  maxSpellLevel: 3 },
        6:  { cantrips: 5, spellsKnown: 7,  maxSpellLevel: 3 },
        7:  { cantrips: 5, spellsKnown: 8,  maxSpellLevel: 4 },
        8:  { cantrips: 5, spellsKnown: 9,  maxSpellLevel: 4 },
        9:  { cantrips: 5, spellsKnown: 10, maxSpellLevel: 5 },
        10: { cantrips: 6, spellsKnown: 11, maxSpellLevel: 5 },
        11: { cantrips: 6, spellsKnown: 12, maxSpellLevel: 6 },
        12: { cantrips: 6, spellsKnown: 12, maxSpellLevel: 6 },
        13: { cantrips: 6, spellsKnown: 13, maxSpellLevel: 7 },
        14: { cantrips: 6, spellsKnown: 13, maxSpellLevel: 7 },
        15: { cantrips: 6, spellsKnown: 14, maxSpellLevel: 8 },
        16: { cantrips: 6, spellsKnown: 14, maxSpellLevel: 8 },
        17: { cantrips: 6, spellsKnown: 15, maxSpellLevel: 9 },
        18: { cantrips: 6, spellsKnown: 15, maxSpellLevel: 9 },
        19: { cantrips: 6, spellsKnown: 15, maxSpellLevel: 9 },
        20: { cantrips: 6, spellsKnown: 15, maxSpellLevel: 9 },
    };

    // Warlock - "known" caster with Pact Magic (PHB p.106)
    // Note: maxSpellLevel caps at 5 (Pact Magic), higher levels get Mystic Arcanum
    const WARLOCK_PROGRESSION = {
        1:  { cantrips: 2, spellsKnown: 2,  maxSpellLevel: 1 },
        2:  { cantrips: 2, spellsKnown: 3,  maxSpellLevel: 1 },
        3:  { cantrips: 2, spellsKnown: 4,  maxSpellLevel: 2 },
        4:  { cantrips: 3, spellsKnown: 5,  maxSpellLevel: 2 },
        5:  { cantrips: 3, spellsKnown: 6,  maxSpellLevel: 3 },
        6:  { cantrips: 3, spellsKnown: 7,  maxSpellLevel: 3 },
        7:  { cantrips: 3, spellsKnown: 8,  maxSpellLevel: 4 },
        8:  { cantrips: 3, spellsKnown: 9,  maxSpellLevel: 4 },
        9:  { cantrips: 3, spellsKnown: 10, maxSpellLevel: 5 },
        10: { cantrips: 4, spellsKnown: 10, maxSpellLevel: 5 },
        11: { cantrips: 4, spellsKnown: 11, maxSpellLevel: 5 },
        12: { cantrips: 4, spellsKnown: 11, maxSpellLevel: 5 },
        13: { cantrips: 4, spellsKnown: 12, maxSpellLevel: 5 },
        14: { cantrips: 4, spellsKnown: 12, maxSpellLevel: 5 },
        15: { cantrips: 4, spellsKnown: 13, maxSpellLevel: 5 },
        16: { cantrips: 4, spellsKnown: 13, maxSpellLevel: 5 },
        17: { cantrips: 4, spellsKnown: 14, maxSpellLevel: 5 },
        18: { cantrips: 4, spellsKnown: 14, maxSpellLevel: 5 },
        19: { cantrips: 4, spellsKnown: 15, maxSpellLevel: 5 },
        20: { cantrips: 4, spellsKnown: 15, maxSpellLevel: 5 },
    };

    // Bard - "known" caster (PHB p.53)
    const BARD_PROGRESSION = {
        1:  { cantrips: 2, spellsKnown: 4,  maxSpellLevel: 1 },
        2:  { cantrips: 2, spellsKnown: 5,  maxSpellLevel: 1 },
        3:  { cantrips: 2, spellsKnown: 6,  maxSpellLevel: 2 },
        4:  { cantrips: 3, spellsKnown: 7,  maxSpellLevel: 2 },
        5:  { cantrips: 3, spellsKnown: 8,  maxSpellLevel: 3 },
        6:  { cantrips: 3, spellsKnown: 9,  maxSpellLevel: 3 },
        7:  { cantrips: 3, spellsKnown: 10, maxSpellLevel: 4 },
        8:  { cantrips: 3, spellsKnown: 11, maxSpellLevel: 4 },
        9:  { cantrips: 3, spellsKnown: 12, maxSpellLevel: 5 },
        10: { cantrips: 4, spellsKnown: 14, maxSpellLevel: 5 },
        11: { cantrips: 4, spellsKnown: 15, maxSpellLevel: 6 },
        12: { cantrips: 4, spellsKnown: 15, maxSpellLevel: 6 },
        13: { cantrips: 4, spellsKnown: 16, maxSpellLevel: 7 },
        14: { cantrips: 4, spellsKnown: 18, maxSpellLevel: 7 },
        15: { cantrips: 4, spellsKnown: 19, maxSpellLevel: 8 },
        16: { cantrips: 4, spellsKnown: 19, maxSpellLevel: 8 },
        17: { cantrips: 4, spellsKnown: 20, maxSpellLevel: 9 },
        18: { cantrips: 4, spellsKnown: 22, maxSpellLevel: 9 },
        19: { cantrips: 4, spellsKnown: 22, maxSpellLevel: 9 },
        20: { cantrips: 4, spellsKnown: 22, maxSpellLevel: 9 },
    };

    // Wizard - "spellbook" caster (PHB p.113)
    // spellsKnown = spellbook capacity (starts 6, +2 per level)
    // Note: Wizards can also copy found spells into spellbook
    const WIZARD_PROGRESSION = {
        1:  { cantrips: 3, spellsKnown: 6,  maxSpellLevel: 1 },
        2:  { cantrips: 3, spellsKnown: 8,  maxSpellLevel: 1 },
        3:  { cantrips: 3, spellsKnown: 10, maxSpellLevel: 2 },
        4:  { cantrips: 4, spellsKnown: 12, maxSpellLevel: 2 },
        5:  { cantrips: 4, spellsKnown: 14, maxSpellLevel: 3 },
        6:  { cantrips: 4, spellsKnown: 16, maxSpellLevel: 3 },
        7:  { cantrips: 4, spellsKnown: 18, maxSpellLevel: 4 },
        8:  { cantrips: 4, spellsKnown: 20, maxSpellLevel: 4 },
        9:  { cantrips: 4, spellsKnown: 22, maxSpellLevel: 5 },
        10: { cantrips: 5, spellsKnown: 24, maxSpellLevel: 5 },
        11: { cantrips: 5, spellsKnown: 26, maxSpellLevel: 6 },
        12: { cantrips: 5, spellsKnown: 28, maxSpellLevel: 6 },
        13: { cantrips: 5, spellsKnown: 30, maxSpellLevel: 7 },
        14: { cantrips: 5, spellsKnown: 32, maxSpellLevel: 7 },
        15: { cantrips: 5, spellsKnown: 34, maxSpellLevel: 8 },
        16: { cantrips: 5, spellsKnown: 36, maxSpellLevel: 8 },
        17: { cantrips: 5, spellsKnown: 38, maxSpellLevel: 9 },
        18: { cantrips: 5, spellsKnown: 40, maxSpellLevel: 9 },
        19: { cantrips: 5, spellsKnown: 42, maxSpellLevel: 9 },
        20: { cantrips: 5, spellsKnown: 44, maxSpellLevel: 9 },
    };

    // Cleric - "prepared" caster (PHB p.57)
    // spellsKnown: null (prepares WIS mod + level from full class list)
    const CLERIC_PROGRESSION = {
        1:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 1 },
        2:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 1 },
        3:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 2 },
        4:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 2 },
        5:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 3 },
        6:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 3 },
        7:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 4 },
        8:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 4 },
        9:  { cantrips: 4, spellsKnown: null, maxSpellLevel: 5 },
        10: { cantrips: 5, spellsKnown: null, maxSpellLevel: 5 },
        11: { cantrips: 5, spellsKnown: null, maxSpellLevel: 6 },
        12: { cantrips: 5, spellsKnown: null, maxSpellLevel: 6 },
        13: { cantrips: 5, spellsKnown: null, maxSpellLevel: 7 },
        14: { cantrips: 5, spellsKnown: null, maxSpellLevel: 7 },
        15: { cantrips: 5, spellsKnown: null, maxSpellLevel: 8 },
        16: { cantrips: 5, spellsKnown: null, maxSpellLevel: 8 },
        17: { cantrips: 5, spellsKnown: null, maxSpellLevel: 9 },
        18: { cantrips: 5, spellsKnown: null, maxSpellLevel: 9 },
        19: { cantrips: 5, spellsKnown: null, maxSpellLevel: 9 },
        20: { cantrips: 5, spellsKnown: null, maxSpellLevel: 9 },
    };

    // Druid - "prepared" caster (PHB p.66)
    // spellsKnown: null (prepares WIS mod + level from full class list)
    const DRUID_PROGRESSION = {
        1:  { cantrips: 2, spellsKnown: null, maxSpellLevel: 1 },
        2:  { cantrips: 2, spellsKnown: null, maxSpellLevel: 1 },
        3:  { cantrips: 2, spellsKnown: null, maxSpellLevel: 2 },
        4:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 2 },
        5:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 3 },
        6:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 3 },
        7:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 4 },
        8:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 4 },
        9:  { cantrips: 3, spellsKnown: null, maxSpellLevel: 5 },
        10: { cantrips: 4, spellsKnown: null, maxSpellLevel: 5 },
        11: { cantrips: 4, spellsKnown: null, maxSpellLevel: 6 },
        12: { cantrips: 4, spellsKnown: null, maxSpellLevel: 6 },
        13: { cantrips: 4, spellsKnown: null, maxSpellLevel: 7 },
        14: { cantrips: 4, spellsKnown: null, maxSpellLevel: 7 },
        15: { cantrips: 4, spellsKnown: null, maxSpellLevel: 8 },
        16: { cantrips: 4, spellsKnown: null, maxSpellLevel: 8 },
        17: { cantrips: 4, spellsKnown: null, maxSpellLevel: 9 },
        18: { cantrips: 4, spellsKnown: null, maxSpellLevel: 9 },
        19: { cantrips: 4, spellsKnown: null, maxSpellLevel: 9 },
        20: { cantrips: 4, spellsKnown: null, maxSpellLevel: 9 },
    };

    // Ranger - half caster, "known" spells, no cantrips (PHB p.91)
    // Spellcasting starts at level 2
    const RANGER_PROGRESSION = {
        1:  { cantrips: 0, spellsKnown: 0,  maxSpellLevel: 0 },
        2:  { cantrips: 0, spellsKnown: 2,  maxSpellLevel: 1 },
        3:  { cantrips: 0, spellsKnown: 3,  maxSpellLevel: 1 },
        4:  { cantrips: 0, spellsKnown: 3,  maxSpellLevel: 1 },
        5:  { cantrips: 0, spellsKnown: 4,  maxSpellLevel: 2 },
        6:  { cantrips: 0, spellsKnown: 4,  maxSpellLevel: 2 },
        7:  { cantrips: 0, spellsKnown: 5,  maxSpellLevel: 2 },
        8:  { cantrips: 0, spellsKnown: 5,  maxSpellLevel: 2 },
        9:  { cantrips: 0, spellsKnown: 6,  maxSpellLevel: 3 },
        10: { cantrips: 0, spellsKnown: 6,  maxSpellLevel: 3 },
        11: { cantrips: 0, spellsKnown: 7,  maxSpellLevel: 3 },
        12: { cantrips: 0, spellsKnown: 7,  maxSpellLevel: 3 },
        13: { cantrips: 0, spellsKnown: 8,  maxSpellLevel: 4 },
        14: { cantrips: 0, spellsKnown: 8,  maxSpellLevel: 4 },
        15: { cantrips: 0, spellsKnown: 9,  maxSpellLevel: 4 },
        16: { cantrips: 0, spellsKnown: 9,  maxSpellLevel: 4 },
        17: { cantrips: 0, spellsKnown: 10, maxSpellLevel: 5 },
        18: { cantrips: 0, spellsKnown: 10, maxSpellLevel: 5 },
        19: { cantrips: 0, spellsKnown: 11, maxSpellLevel: 5 },
        20: { cantrips: 0, spellsKnown: 11, maxSpellLevel: 5 },
    };

    // Paladin - half caster, "prepared" spells, no cantrips (PHB p.83)
    // Spellcasting starts at level 2, prepares CHA mod + half level
    const PALADIN_PROGRESSION = {
        1:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 0 },
        2:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 1 },
        3:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 1 },
        4:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 1 },
        5:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 2 },
        6:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 2 },
        7:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 2 },
        8:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 2 },
        9:  { cantrips: 0, spellsKnown: null, maxSpellLevel: 3 },
        10: { cantrips: 0, spellsKnown: null, maxSpellLevel: 3 },
        11: { cantrips: 0, spellsKnown: null, maxSpellLevel: 3 },
        12: { cantrips: 0, spellsKnown: null, maxSpellLevel: 3 },
        13: { cantrips: 0, spellsKnown: null, maxSpellLevel: 4 },
        14: { cantrips: 0, spellsKnown: null, maxSpellLevel: 4 },
        15: { cantrips: 0, spellsKnown: null, maxSpellLevel: 4 },
        16: { cantrips: 0, spellsKnown: null, maxSpellLevel: 4 },
        17: { cantrips: 0, spellsKnown: null, maxSpellLevel: 5 },
        18: { cantrips: 0, spellsKnown: null, maxSpellLevel: 5 },
        19: { cantrips: 0, spellsKnown: null, maxSpellLevel: 5 },
        20: { cantrips: 0, spellsKnown: null, maxSpellLevel: 5 },
    };

    // Map class to progression table
    const SPELL_PROGRESSION_BY_CLASS = {
        sorcerer: SORCERER_PROGRESSION,
        warlock: WARLOCK_PROGRESSION,
        bard: BARD_PROGRESSION,
        wizard: WIZARD_PROGRESSION,
        cleric: CLERIC_PROGRESSION,
        druid: DRUID_PROGRESSION,
        ranger: RANGER_PROGRESSION,
        paladin: PALADIN_PROGRESSION,
    };

    // Get hit die
    let hitDie = character.hitDie || character.classData?.hitDie || null;
    if (!hitDie) {
        const rawClass = character.class || '';
        const normalized = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
        if (normalized && HIT_DIE_BY_CLASS[normalized]) {
            hitDie = HIT_DIE_BY_CLASS[normalized];
        }
    }
    if (!hitDie && window.DND_DATA && Array.isArray(window.DND_DATA.classes)) {
        const classIdOrName = character.class;
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
        hitDie = 8; // Default to d8 if unknown
    }

    // Get CON modifier
    const abilities = character.abilities || character.abilityScores || {};
    const conScore = abilities.con || 10;
    const conMod = Math.floor((conScore - 10) / 2);

    // Calculate proficiency bonus: ceil(level/4) + 1
    const proficiencyBonus = Math.ceil(newLevel / 4) + 1;

    // Calculate HP:
    // Level 1: hitDie + CON mod (max at level 1)
    // Each additional level: average die (hitDie/2 + 1) + CON mod
    const baseHP = hitDie + conMod;
    const averageDie = Math.floor(hitDie / 2) + 1;
    const perLevel = Math.max(1, averageDie + conMod);
    const hpMax = newLevel === 1 ? Math.max(1, baseHP) : Math.max(1, baseHP + perLevel * (newLevel - 1));

    // Calculate spell slots based on class type
    const rawClass = character.class || '';
    const normalizedClass = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
    const clampedLevel = Math.max(1, Math.min(20, newLevel));
    
    let spellSlots = null;
    
    if (normalizedClass === 'warlock') {
        // Warlock Pact Magic: all slots at the same level
        const pactInfo = WARLOCK_PACT_SLOTS[clampedLevel];
        if (pactInfo && pactInfo.slots > 0) {
            spellSlots = {};
            spellSlots[pactInfo.level] = pactInfo.slots;
        }
    } else if (FULL_CASTERS.includes(normalizedClass)) {
        spellSlots = { ...FULL_CASTER_SLOTS[clampedLevel] };
    } else if (HALF_CASTERS.includes(normalizedClass)) {
        const halfSlots = HALF_CASTER_SLOTS[clampedLevel];
        if (halfSlots && Object.keys(halfSlots).length > 0) {
            spellSlots = { ...halfSlots };
        }
    }

    // Get spell progression for this class and level
    let spellProgression = null;
    const progressionTable = SPELL_PROGRESSION_BY_CLASS[normalizedClass];
    if (progressionTable && progressionTable[clampedLevel]) {
        spellProgression = { ...progressionTable[clampedLevel] };
    }

    // Hit dice count equals character level (for short rest healing)
    const hitDiceMax = newLevel;

    // Calculate class resources based on class and level
    const classResources = calculateClassResources(normalizedClass, newLevel, abilities);

    return {
        proficiencyBonus,
        hpMax,
        hitDie,
        hitDiceMax,
        spellSlots,
        spellProgression, // { cantrips, spellsKnown, maxSpellLevel } or null for non-casters
        classResources,
    };
}

/**
 * Calculate class-specific resources (Ki, Rage, Sorcery Points, etc.)
 * @param {string} className - Normalized class name (lowercase)
 * @param {number} level - Character level
 * @param {object} abilities - Ability scores { str, dex, con, int, wis, cha }
 * @returns {object} - Class resources { resourceName: { current: X, max: X }, ... }
 */
function calculateClassResources(className, level, abilities) {
    const resources = {};
    const chaMod = Math.floor(((abilities?.cha || 10) - 10) / 2);
    const wisMod = Math.floor(((abilities?.wis || 10) - 10) / 2);

    switch (className) {
        case 'monk':
            // Ki Points = Monk level (starts at level 2)
            if (level >= 2) {
                resources.ki = { current: level, max: level, refresh: 'short' };
            }
            break;

        case 'barbarian':
            // Rage uses increase at certain levels
            let rageMax = 2;
            if (level >= 20) rageMax = Infinity; // Unlimited at 20
            else if (level >= 17) rageMax = 6;
            else if (level >= 12) rageMax = 5;
            else if (level >= 6) rageMax = 4;
            else if (level >= 3) rageMax = 3;
            
            resources.rage = { 
                current: rageMax === Infinity ? 999 : rageMax, 
                max: rageMax === Infinity ? 999 : rageMax, 
                refresh: 'long',
                unlimited: level >= 20
            };
            
            // Rage damage bonus
            let rageDamage = 2;
            if (level >= 16) rageDamage = 4;
            else if (level >= 9) rageDamage = 3;
            resources.rageDamage = { value: rageDamage };
            break;

        case 'sorcerer':
            // Sorcery Points = Sorcerer level (starts at level 2)
            if (level >= 2) {
                resources.sorceryPoints = { current: level, max: level, refresh: 'long' };
            }
            break;

        case 'bard':
            // Bardic Inspiration = CHA modifier (min 1)
            const bardInspMax = Math.max(1, chaMod);
            resources.bardicInspiration = { current: bardInspMax, max: bardInspMax, refresh: 'long' };
            
            // Die size increases with level
            let inspDie = 'd6';
            if (level >= 15) inspDie = 'd12';
            else if (level >= 10) inspDie = 'd10';
            else if (level >= 5) inspDie = 'd8';
            resources.bardicInspirationDie = { value: inspDie };
            break;

        case 'cleric':
            // Channel Divinity uses
            let channelMax = 1;
            if (level >= 18) channelMax = 3;
            else if (level >= 6) channelMax = 2;
            
            if (level >= 2) {
                resources.channelDivinity = { current: channelMax, max: channelMax, refresh: 'short' };
            }
            break;

        case 'paladin':
            // Lay on Hands = 5 × Paladin level
            const layOnHandsMax = level * 5;
            resources.layOnHands = { current: layOnHandsMax, max: layOnHandsMax, refresh: 'long' };
            
            // Channel Divinity (at level 3+)
            if (level >= 3) {
                resources.channelDivinity = { current: 1, max: 1, refresh: 'short' };
            }
            break;

        case 'druid':
            // Wild Shape uses (at level 2+)
            if (level >= 2) {
                resources.wildShape = { current: 2, max: 2, refresh: 'short' };
            }
            break;

        case 'fighter':
            // Second Wind (at level 1+)
            resources.secondWind = { current: 1, max: 1, refresh: 'short' };
            
            // Action Surge (at level 2+)
            if (level >= 2) {
                const actionSurgeMax = level >= 17 ? 2 : 1;
                resources.actionSurge = { current: actionSurgeMax, max: actionSurgeMax, refresh: 'short' };
            }
            
            // Indomitable (at level 9+)
            if (level >= 9) {
                let indomMax = 1;
                if (level >= 17) indomMax = 3;
                else if (level >= 13) indomMax = 2;
                resources.indomitable = { current: indomMax, max: indomMax, refresh: 'long' };
            }
            break;

        case 'rogue':
            // Sneak Attack dice (1d6 at level 1, +1d6 every odd level)
            const sneakDice = Math.ceil(level / 2);
            resources.sneakAttack = { value: `${sneakDice}d6` };
            break;

        case 'warlock':
            // Note: Pact Magic slots are handled separately in spell slots
            // Mystic Arcanum (6th+ level spells, 1/day each)
            if (level >= 11) {
                resources.mysticArcanum = { current: 1, max: 1, refresh: 'long', note: '6th level' };
            }
            break;

        case 'wizard':
            // Arcane Recovery (at level 1+)
            const recoverySlots = Math.ceil(level / 2);
            resources.arcaneRecovery = { current: recoverySlots, max: recoverySlots, refresh: 'long', note: 'spell slot levels' };
            break;

        case 'ranger':
            // No major trackable resources beyond spells at basic level
            break;
    }

    return resources;
}

/**
 * Auto-recalculate level-dependent stats if they appear outdated.
 * This ensures existing characters get updated spell slots, class resources, etc.
 * @param {object} character - The character to check/update
 * @returns {object} - The character (possibly updated)
 */
async function autoRecalculateLevelStats(character) {
    if (!character || !character.class || !character.level) {
        return character;
    }

    const level = character.level || 1;
    const rawClass = character.class || '';
    const normalizedClass = rawClass.toString().trim().toLowerCase().replace(/\s+/g, '-');
    
    // Classes that should have spell slots
    const CASTER_CLASSES = ['wizard', 'sorcerer', 'bard', 'cleric', 'druid', 'warlock', 'paladin', 'ranger'];
    const isCaster = CASTER_CLASSES.includes(normalizedClass);
    
    // Check if spell slots need recalculation
    const currentSlots = character.spellSlots || {};
    const currentSlotCount = Object.keys(currentSlots).length;
    
    // Calculate expected spell slots for this level
    const calculatedStats = calculateStatsForLevel(character, level);
    const expectedSlots = calculatedStats.spellSlots || {};
    const expectedSlotCount = Object.keys(expectedSlots).length;
    
    // Check if class resources need calculation
    const currentResources = character.classResources || {};
    const expectedResources = calculatedStats.classResources || {};
    const needsResourceUpdate = Object.keys(expectedResources).length > 0 && 
                                Object.keys(currentResources).length === 0;
    
    // Check if spell slots are outdated (caster with fewer slot levels than expected)
    const needsSlotUpdate = isCaster && expectedSlotCount > 0 && currentSlotCount < expectedSlotCount;
    
    // Check if proficiency bonus needs update
    const currentProfBonus = character.proficiencyBonus || 2;
    const expectedProfBonus = calculatedStats.proficiencyBonus;
    const needsProfBonusUpdate = currentProfBonus !== expectedProfBonus;
    
    if (needsSlotUpdate || needsResourceUpdate || needsProfBonusUpdate) {
        console.log(`📊 Auto-recalculating stats for ${character.name} (level ${level} ${normalizedClass})`);
        
        const updates = {};
        
        if (needsSlotUpdate) {
            console.log(`  - Updating spell slots: ${currentSlotCount} levels → ${expectedSlotCount} levels`);
            updates.spellSlots = expectedSlots;
        }
        
        if (needsResourceUpdate) {
            console.log(`  - Adding class resources:`, Object.keys(expectedResources));
            updates.classResources = expectedResources;
        }
        
        if (needsProfBonusUpdate) {
            console.log(`  - Updating proficiency bonus: +${currentProfBonus} → +${expectedProfBonus}`);
            updates.proficiencyBonus = expectedProfBonus;
        }
        
        // Save updates to storage
        try {
            await CharacterStorage.update(character.id, updates);
            
            // Update the character object in memory
            Object.assign(character, updates);
            
            // Update in AppState if present
            if (typeof AppState !== 'undefined' && AppState && Array.isArray(AppState.characters)) {
                const idx = AppState.characters.findIndex(c => c && String(c.id) === String(character.id));
                if (idx !== -1) {
                    Object.assign(AppState.characters[idx], updates);
                }
            }
            
            console.log(`  ✓ Stats updated successfully`);
        } catch (error) {
            console.warn('Failed to auto-update character stats:', error);
        }
    }
    
    return character;
}

// Generic alert modal using terminal modal styles
// Optional `options.actionLabel` and `options.onAction` to show an action button
function showAlertDialog(message, options) {
    const existing = document.getElementById('genericAlertModal');
    if (existing) existing.remove();

    const escapedMessage = Utils.escapeHtml(message).replace(/\n/g, '<br>');
    const actionLabel = options && options.actionLabel;
    const actionButtonHtml = actionLabel
        ? `<button class="terminal-btn terminal-btn-secondary" id="genericAlertAction">${Utils.escapeHtml(actionLabel)}</button>`
        : '';
    
    const modalHtml = `
      <div id="genericAlertModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">NOTICE</h2>
            <button class="modal-close" onclick="closeGenericAlertModal()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="terminal-text">${escapedMessage}</p>
          </div>
          <div class="modal-footer modal-footer-end">
            ${actionButtonHtml}
            <button class="terminal-btn terminal-btn-primary" id="genericAlertOk">OK</button>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('genericAlertModal');
    const okBtn = document.getElementById('genericAlertOk');
    const actionBtn = document.getElementById('genericAlertAction');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    okBtn.addEventListener('click', close);
    
    if (actionBtn && options && typeof options.onAction === 'function') {
        actionBtn.addEventListener('click', () => {
            close();
            options.onAction();
        });
    }

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// ========================================
// SESSION EXPIRED MODAL
// ========================================

// Show a modal when the session has expired proactively
function showSessionExpiredModal() {
    // Close any open editor modals first (e.g., level change dialog)
    // This prevents stale modal state from persisting
    closeAllEditorModals();
    
    const existing = document.getElementById('sessionExpiredModal');
    if (existing) existing.remove();

    const modalHtml = `
      <div id="sessionExpiredModal" class="modal show">
        <div class="modal-content">
          <div class="modal-header">
            <h2 class="modal-title">[!] Your session has expired</h2>
          </div>
          <div class="modal-body">
            <p class="terminal-text">Your local changes are safe, but you'll need to log in again to sync with the cloud.</p>
          </div>
          <div class="modal-footer modal-footer-end">
            <button class="terminal-btn terminal-btn-secondary" id="sessionExpiredDismiss">CONTINUE OFFLINE</button>
            <button class="terminal-btn terminal-btn-primary" id="sessionExpiredLogin">LOG IN</button>
          </div>
        </div>
      </div>
    `;

    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById('sessionExpiredModal');
    const dismissBtn = document.getElementById('sessionExpiredDismiss');
    const loginBtn = document.getElementById('sessionExpiredLogin');

    const close = () => {
        if (!modal) return;
        animateModalClose(modal, { removeOnClose: true });
    };

    dismissBtn.addEventListener('click', () => {
        close();
        showNotification('Working offline - log in to sync changes');
    });

    loginBtn.addEventListener('click', () => {
        close();
        // Small delay to let the modal close animation finish
        setTimeout(() => {
            showAuthModal();
        }, 200);
    });

    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

// Track guest notice state per session
let guestNoticeShownThisSession = false;
let userHasMadeChanges = false;

// Dismiss the guest notice banner (per-session only)
function dismissGuestNotice() {
    const guestNotice = document.getElementById('guestNotice');
    if (guestNotice) {
        guestNotice.classList.add('is-hidden');
        guestNoticeShownThisSession = true;
    }
}

// Show guest notice when user makes changes (if not logged in and not shown yet)
function maybeShowGuestNotice() {
    // Only show if not authenticated and hasn't been shown this session
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        return;
    }
    
    if (guestNoticeShownThisSession) {
        return;
    }
    
    const guestNotice = document.getElementById('guestNotice');
    if (guestNotice) {
        guestNotice.classList.remove('is-hidden');
        guestNoticeShownThisSession = true;
    }
}

// Mark that user has made changes (called when creating/editing characters)
function markUserChanges() {
    if (!userHasMadeChanges) {
        userHasMadeChanges = true;
        maybeShowGuestNotice();
    }
}

// ========================================
// SESSION IN PROGRESS NOTICE
// ========================================

const BUILDER_SESSION_KEY = 'danddy_builder_session';
let sessionNoticeDismissed = false;

// Check if there's a builder session in progress
function hasBuilderSession() {
    try {
        const raw = localStorage.getItem(BUILDER_SESSION_KEY);
        if (!raw) return false;
        const session = JSON.parse(raw);
        // Consider it a valid session if we have meaningful progress
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
}

// Get session preview for display
function getBuilderSessionPreview() {
    try {
        const raw = localStorage.getItem(BUILDER_SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

// Format time ago string
function formatTimeAgo(dateString) {
    if (!dateString) return '';
    const savedDate = new Date(dateString);
    const now = new Date();
    const diffMs = now - savedDate;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return savedDate.toLocaleDateString();
}

// Show the session notice if there's a session in progress
function maybeShowSessionNotice() {
    if (sessionNoticeDismissed) return;
    if (!hasBuilderSession()) return;
    
    const sessionNotice = document.getElementById('sessionNotice');
    const sessionNoticeTime = document.getElementById('sessionNoticeTime');
    
    if (sessionNotice) {
        const session = getBuilderSessionPreview();
        if (session && session._savedAt) {
            sessionNoticeTime.textContent = `· ${formatTimeAgo(session._savedAt)}`;
        }
        sessionNotice.classList.remove('is-hidden');
    }
}

// Dismiss the session notice (per-session only)
function dismissSessionNotice() {
    const sessionNotice = document.getElementById('sessionNotice');
    if (sessionNotice) {
        sessionNotice.classList.add('is-hidden');
        sessionNoticeDismissed = true;
    }
}

// Discard the builder session entirely (clears localStorage)
function discardBuilderSession() {
    try {
        localStorage.removeItem('danddy_builder_session');
        const sessionNotice = document.getElementById('sessionNotice');
        if (sessionNotice) {
            sessionNotice.classList.add('is-hidden');
        }
    } catch (e) {
        console.error('Failed to discard builder session:', e);
    }
}

// ========================================
// SPLASH SCREEN (manager uses welcome modal instead of a full-page splash)
// ========================================

// In the manager we don't actually block interaction behind a separate splash
// screen, so keep this false to ensure global keyboard shortcuts always work.
let splashActive = false;

// Track whether the auth modal was opened from the welcome splash CTA
// (LOG IN / CREATE ACCOUNT). When true, pressing Escape or CANCEL in the
// auth modal should return the user to the splash screen instead of
// leaving them on the main dashboard.
let authOpenedFromWelcome = false;

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

// When the user explicitly cancels out of the auth flow (Escape, "X",
// or CANCEL button), close the auth modal and, if it was launched from
// the welcome splash, return to that splash screen instead of leaving
// them on the main dashboard.
function cancelAuthFlow() {
    closeAuthModal();

    if (authOpenedFromWelcome) {
        const welcomeModal = document.getElementById('welcomeModal');
        if (welcomeModal) {
            welcomeModal.classList.add('show');
            // Don't auto-focus any button - let the user choose
        }
        authOpenedFromWelcome = false;
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
    document.getElementById('loginEmail').value = '';
    const loginPassword = document.getElementById('loginPassword');
    if (loginPassword) {
        loginPassword.value = '';
        loginPassword.type = 'password';
    }
    document.getElementById('registerEmail').value = '';
    const registerPassword = document.getElementById('registerPassword');
    if (registerPassword) {
        registerPassword.value = '';
        registerPassword.type = 'password';
    }
    const registerPasswordConfirm = document.getElementById('registerPasswordConfirm');
    if (registerPasswordConfirm) {
        registerPasswordConfirm.value = '';
        registerPasswordConfirm.type = 'password';
    }
}

function showLoginForm() {
    document.getElementById('loginForm').classList.remove('is-hidden');
    document.getElementById('registerForm').classList.add('is-hidden');
    document.getElementById('authModalTitle').textContent = 'LOG IN';
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
    document.getElementById('authModalTitle').textContent = 'REGISTER';
    document.getElementById('loginBtn').classList.add('is-hidden');
    document.getElementById('registerBtn').classList.remove('is-hidden');
    document.getElementById('authError').classList.add('is-hidden');

    const modal = document.getElementById('authModal');
    if (modal) {
        focusFirstFieldInModal(modal);
    }
}

function setAuthLoading(isLoading, message) {
    const loginBtn = document.getElementById('loginBtn');
    const registerBtn = document.getElementById('registerBtn');
    const cancelBtn = document.getElementById('authCancelBtn');
    const loadingLabel = message || 'CONTACTING SERVER...';

    [loginBtn, registerBtn, cancelBtn].forEach((btn) => {
        if (btn) {
            btn.disabled = isLoading;
        }
    });

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
    
    if (loginBtn) {
        if (isLoading) {
            if (!loginBtn.dataset.originalLabel) {
                loginBtn.dataset.originalLabel = loginBtn.innerHTML;
            }
            // Cube spacing is handled by .spinner-cube-scene margin-right,
            // so avoid a literal leading space before the label.
            loginBtn.innerHTML = `${cubeMarkup}${loadingLabel}`;
        } else {
            if (loginBtn.dataset.originalLabel) {
                loginBtn.innerHTML = loginBtn.dataset.originalLabel;
                delete loginBtn.dataset.originalLabel;
            } else {
                loginBtn.textContent = 'LOG IN';
            }
        }
    }
    if (registerBtn) {
        if (isLoading) {
            if (!registerBtn.dataset.originalLabel) {
                registerBtn.dataset.originalLabel = registerBtn.innerHTML;
            }
            // Use the same cube markup as the login button; rely on CSS margin
            // for spacing instead of a leading space in the string.
            registerBtn.innerHTML = `${cubeMarkup}${loadingLabel}`;
        } else {
            if (registerBtn.dataset.originalLabel) {
                registerBtn.innerHTML = registerBtn.dataset.originalLabel;
                delete registerBtn.dataset.originalLabel;
            } else {
                registerBtn.textContent = 'REGISTER';
            }
        }
    }
}

async function handleLogin() {
    const errorEl = document.getElementById('authError');

    // If the login form isn't currently visible (e.g. the user has switched
    // to the register tab), quietly abort. This prevents stray events from
    // showing a "Please enter both email and password" message on the
    // REGISTER screen.
    const loginFormEl = document.getElementById('loginForm');
    if (loginFormEl && loginFormEl.classList.contains('is-hidden')) {
        return;
    }

    // Some password managers (and browser autofill) can populate fields
    // slightly after the click event that triggers login. To avoid
    // spurious "Please enter both email and password" errors when the
    // UI *looks* filled in, give the DOM a short moment to settle
    // before reading values.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('loginEmail');
    const passwordInput = document.getElementById('loginPassword');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';

    if (!email || !password) {
        errorEl.textContent = 'Please enter both email and password';
        errorEl.classList.remove('is-hidden');
        return;
    }

    errorEl.classList.add('is-hidden');
    setAuthLoading(true, 'LOGGING IN...');

    try {
        const result = await window.AuthService.login(email, password);
        if (result && result.success) {
            // Mark splash as dismissed on successful login
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            
            // Show quick feedback, then refresh the page to ensure all data is fresh
            // (quota counts, admin status, etc.)
            showNotification(`✓ Logged in as ${email}`);
            
            // Give the notification a moment to display before refreshing
            setTimeout(() => {
                window.location.reload();
            }, 300);
            return;
        } else {
            errorEl.textContent = (result && result.error) || 'Login failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Login failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    } finally {
        setAuthLoading(false);
    }
}

async function handleRegister() {
    const errorEl = document.getElementById('authError');

    // Some password managers (and browser autofill) populate fields slightly
    // after the click event that triggers registration. To avoid spurious
    // "Please fill in all fields" errors when the UI *looks* filled in, give
    // the DOM a short moment to settle before reading values.
    await new Promise((resolve) => setTimeout(resolve, 50));

    const emailInput = document.getElementById('registerEmail');
    const passwordInput = document.getElementById('registerPassword');
    const passwordConfirmInput = document.getElementById('registerPasswordConfirm');

    const email = emailInput ? emailInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value : '';
    const passwordConfirm = passwordConfirmInput ? passwordConfirmInput.value : '';

    if (!email || !password || !passwordConfirm) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.remove('is-hidden');
        return;
    }

    if (password !== passwordConfirm) {
        errorEl.textContent = 'Passwords do not match';
        errorEl.classList.remove('is-hidden');
        return;
    }

    // Validate password length (bcrypt limit is 72 bytes)
    if (new Blob([password]).size > 72) {
        errorEl.textContent = 'Password is too long (max 72 bytes)';
        errorEl.classList.remove('is-hidden');
        return;
    }

    errorEl.classList.add('is-hidden');
    setAuthLoading(true, 'CREATING ACCOUNT...');

    try {
        const result = await window.AuthService.register(email, password);
        if (result.success) {
            // Mark splash as dismissed on successful registration
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            closeAuthModal();
            updateAuthUI();
            showNotification(`✓ Registered as ${email}`);

            // Start session monitoring now that user is logged in
            if (window.AuthService && typeof window.AuthService.startSessionMonitor === 'function') {
                window.AuthService.startSessionMonitor();
            }
            
            // Check if should migrate user-created characters first
            if (window.MigrationService.hasLocalCharacters()) {
                showMigrationModal();
            } 
            // Then check for demo character migration (only ask once)
            else if (shouldShowDemoMigration()) {
                showDemoMigrationModal();
            } else {
                // Reload characters from cloud
                await AppState.loadCharacters();
                UI.render();
            }
            
            // Check for pending character shares (after a short delay to not overwhelm)
            setTimeout(() => checkPendingShares(), 500);
        } else {
            errorEl.textContent = result.error || 'Registration failed';
            errorEl.classList.remove('is-hidden');
        }
    } catch (error) {
        errorEl.textContent = 'Registration failed. Please try again.';
        errorEl.classList.remove('is-hidden');
    } finally {
        setAuthLoading(false);
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
    const modalTitle = document.getElementById('passwordResetModalTitle');
    const requestSection = document.getElementById('passwordResetRequestSection');
    const successSection = document.getElementById('passwordResetSuccessSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const cancelBtn = document.getElementById('passwordResetCancelBtn');
    const closeBtn = document.getElementById('passwordResetCloseBtn');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const messageEl = document.getElementById('passwordResetMessage');
    const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
    const emailInput = document.getElementById('passwordResetEmail');
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');

    if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
    if (requestSection) requestSection.classList.remove('is-hidden');
    if (successSection) successSection.classList.add('is-hidden');
    if (confirmSection) confirmSection.classList.add('is-hidden');
    if (cancelBtn) cancelBtn.classList.remove('is-hidden');
    if (closeBtn) closeBtn.classList.add('is-hidden');
    if (requestBtn) requestBtn.classList.remove('is-hidden');
    if (confirmBtn) confirmBtn.classList.add('is-hidden');
    if (messageEl) {
        messageEl.textContent = '';
        messageEl.classList.remove('terminal-text-error');
        messageEl.classList.add('terminal-text-dim');
    }
    if (confirmMessageEl) {
        confirmMessageEl.textContent = '';
        confirmMessageEl.classList.remove('terminal-text-error');
        confirmMessageEl.classList.add('terminal-text-dim');
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
    
    // Reset to initial state when closing
    setTimeout(() => {
        const modalTitle = document.getElementById('passwordResetModalTitle');
        const requestSection = document.getElementById('passwordResetRequestSection');
        const successSection = document.getElementById('passwordResetSuccessSection');
        const confirmSection = document.getElementById('passwordResetConfirmSection');
        const cancelBtn = document.getElementById('passwordResetCancelBtn');
        const closeBtn = document.getElementById('passwordResetCloseBtn');
        const requestBtn = document.getElementById('passwordResetRequestBtn');
        const confirmBtn = document.getElementById('passwordResetConfirmBtn');
        const messageEl = document.getElementById('passwordResetMessage');
        const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
        const emailInput = document.getElementById('passwordResetEmail');
        const tokenInput = document.getElementById('passwordResetToken');
        const newPasswordInput = document.getElementById('passwordResetNewPassword');

        if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
        if (requestSection) requestSection.classList.remove('is-hidden');
        if (successSection) successSection.classList.add('is-hidden');
        if (confirmSection) confirmSection.classList.add('is-hidden');
        if (cancelBtn) cancelBtn.classList.remove('is-hidden');
        if (closeBtn) closeBtn.classList.add('is-hidden');
        if (requestBtn) requestBtn.classList.remove('is-hidden');
        if (confirmBtn) confirmBtn.classList.add('is-hidden');
        if (messageEl) {
            messageEl.textContent = '';
            messageEl.classList.remove('terminal-text-error');
            messageEl.classList.add('terminal-text-dim');
        }
        if (confirmMessageEl) {
            confirmMessageEl.textContent = '';
            confirmMessageEl.classList.remove('terminal-text-error');
            confirmMessageEl.classList.add('terminal-text-dim');
        }
        if (emailInput) emailInput.value = '';
        if (tokenInput) tokenInput.value = '';
        if (newPasswordInput) newPasswordInput.value = '';
    }, 300); // Wait for modal close animation
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

    // Transform modal to success confirmation
    const modalTitle = document.getElementById('passwordResetModalTitle');
    const requestSection = document.getElementById('passwordResetRequestSection');
    const successSection = document.getElementById('passwordResetSuccessSection');
    const confirmSection = document.getElementById('passwordResetConfirmSection');
    const cancelBtn = document.getElementById('passwordResetCancelBtn');
    const closeBtn = document.getElementById('passwordResetCloseBtn');
    const requestBtn = document.getElementById('passwordResetRequestBtn');
    const confirmBtn = document.getElementById('passwordResetConfirmBtn');
    const tokenInput = document.getElementById('passwordResetToken');

    // In development, the backend may return a debug token for testing
    if (result.debugToken && tokenInput) {
        tokenInput.value = result.debugToken;
        
        // In dev mode, show the confirm section so developers can test without email
        if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
        if (requestSection) requestSection.classList.add('is-hidden');
        if (successSection) successSection.classList.add('is-hidden');
        if (confirmSection) confirmSection.classList.remove('is-hidden');
        if (cancelBtn) cancelBtn.classList.remove('is-hidden');
        if (closeBtn) closeBtn.classList.add('is-hidden');
        if (requestBtn) requestBtn.classList.add('is-hidden');
        if (confirmBtn) confirmBtn.classList.remove('is-hidden');
        
        const confirmMessageEl = document.getElementById('passwordResetConfirmMessage');
        if (confirmMessageEl) {
            confirmMessageEl.textContent = '[DEV MODE] Token auto-filled for testing. Enter your new password below.';
            confirmMessageEl.classList.add('terminal-text-dim');
        }
    } else {
        // Production mode - show success confirmation
        if (modalTitle) modalTitle.textContent = 'SUCCESS';
        if (requestSection) requestSection.classList.add('is-hidden');
        if (successSection) successSection.classList.remove('is-hidden');
        if (confirmSection) confirmSection.classList.add('is-hidden');
        if (cancelBtn) cancelBtn.classList.add('is-hidden');
        if (closeBtn) closeBtn.classList.remove('is-hidden');
        if (requestBtn) requestBtn.classList.add('is-hidden');
        if (confirmBtn) confirmBtn.classList.add('is-hidden');
    }
}

async function handlePasswordResetConfirm() {
    const tokenInput = document.getElementById('passwordResetToken');
    const newPasswordInput = document.getElementById('passwordResetNewPassword');
    const messageEl = document.getElementById('passwordResetConfirmMessage');
    if (!tokenInput || !newPasswordInput || !messageEl) return;

    const token = tokenInput.value.trim();
    const newPassword = newPasswordInput.value;

    if (!token) {
        messageEl.textContent = 'Invalid reset link. Please request a new password reset.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    if (!newPassword) {
        messageEl.textContent = 'Please enter a new password.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
        return;
    }

    messageEl.textContent = 'Resetting password...';
    messageEl.classList.remove('terminal-text-error');
    messageEl.classList.add('terminal-text-dim');

    // Call the password reset API directly (don't use the returned token)
    try {
        const response = await fetch(`${window.DanddyConfig.API_BASE_URL}/auth/password/reset`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token, new_password: newPassword }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Password reset failed');
        }

        // Password reset successful - close this modal and open login modal
        showNotification('✓ Password updated successfully! Please log in with your new password.');
        closePasswordResetModal();
        
        // Open the login modal after a brief delay
        setTimeout(() => {
            showLoginForm();
        }, 300);
        
    } catch (error) {
        messageEl.textContent = error.message || 'Password reset failed. Please try again.';
        messageEl.classList.remove('terminal-text-dim');
        messageEl.classList.add('terminal-text-error');
    }
}

async function handleLogout() {
    // Close all editor modals to prevent stale state (e.g., level change dialog)
    closeAllEditorModals();
    
    // Close mobile sheet modal if open (prevents showing stale cloud character)
    if (typeof MobileView !== 'undefined' && MobileView.isMobile() && MobileView.isOpen()) {
        MobileView.close();
    }
    
    // Clear selected character before loading new list (cloud ID won't exist in demo)
    AppState.selectedCharacterId = null;
    
    window.AuthService.logout();
    updateAuthUI();
    showNotification('✓ Logged out');
    
    // Reload with local/demo characters
    await AppState.loadCharacters();
    
    // On mobile, select first demo character so sheet panel has valid content
    // (prevents showing stale cloud character data in hidden sheet panel)
    const isMobile = typeof MobileView !== 'undefined' && MobileView.isMobile();
    if (isMobile && AppState.filteredCharacters.length > 0) {
        const firstChar = AppState.filteredCharacters[0];
        AppState.selectedCharacterId = firstChar.id;
        // Render sheet but don't open modal (user stays on grid)
        viewCharacter(firstChar.id, { openMobileModal: false, updateUrl: false });
    }
    
    UI.render();
    
    // Clear the dismissed flag so welcome modal appears on explicit logout
    sessionStorage.removeItem('welcomeSplashDismissed');
    
    // Show welcome modal (splash screen) after logout
    const welcomeModal = document.getElementById('welcomeModal');
    if (welcomeModal) {
        welcomeModal.classList.add('show');
    }
}

function updateAuthUI() {
    const authBtn = document.getElementById('authBtn');
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    const userStatusIcon = document.getElementById('userStatusIcon');
    const userStatusText = document.getElementById('userStatusText');
    const guestNotice = document.getElementById('guestNotice');
    
    // Overflow menu elements
    const overflowAuthIcon = document.getElementById('overflowAuthIcon');
    const overflowAuthLabel = document.getElementById('overflowAuthLabel');
    
    // If the header shell isn't present (e.g., in some embedded contexts),
    // safely bail out.
    if (!authBtn || !userInfoDisplay || !userStatusIcon || !userStatusText) {
        return;
    }
    
    if (window.AuthService && window.AuthService.isAuthenticated()) {
        const user = window.AuthService.getCurrentUser();
        userStatusIcon.textContent = '☁';
        userStatusText.textContent = user ? user.email : 'Logged In';
        authBtn.textContent = 'LOG OUT';
        authBtn.onclick = handleLogout;
        
        // Update overflow menu
        if (overflowAuthIcon) overflowAuthIcon.textContent = '←';
        if (overflowAuthLabel) overflowAuthLabel.textContent = 'Log Out';

        // Hide guest notice when logged in
        if (guestNotice) {
            guestNotice.classList.add('is-hidden');
        }
    } else {
        userStatusIcon.textContent = '▣';
        userStatusText.textContent = 'Guest Mode';
        authBtn.textContent = 'LOG IN';
        authBtn.onclick = () => {
            authOpenedFromWelcome = false;
            showAuthModal();
        };
        
        // Update overflow menu
        if (overflowAuthIcon) overflowAuthIcon.textContent = '→';
        if (overflowAuthLabel) overflowAuthLabel.textContent = 'Log In';

        // Don't show guest notice by default - only when user makes changes
        // (handled by maybeShowGuestNotice() function)
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
    
    // After user-created migration, also ask about demo characters (once)
    if (shouldShowDemoMigration()) {
        showDemoMigrationModal();
    } else {
        // Reload characters after closing (whether migrated or not)
        AppState.loadCharacters().then(() => UI.render());
    }
}

async function startMigration() {
    const statusEl = document.getElementById('migrationStatus');
    statusEl.classList.remove('is-hidden');
    // Directly start migration without auto-downloading a JSON backup.
    statusEl.textContent = 'Migrating to cloud...';
    
    try {
        // Migrate (excluding demo characters - they have their own modal)
        const results = await window.MigrationService.migrateToCloud({ includeDemoCharacters: false });
        
        if (results.success > 0) {
            // NOTE: The bundler/minifier used by this repo can strip literal spaces inside
            // template literals (backticks). Use classic string concatenation here so the
            // migration modal never shows "3character(s)successfully!".
            statusEl.textContent =
                '✓ Migrated ' + results.success + ' character(s) successfully!';
            
            if (results.failed > 0) {
                statusEl.textContent +=
                    '\n⚠️ ' +
                    results.failed +
                    ' character(s) failed to migrate.';
            }
            
            // Clear local storage after successful migration
            if (results.failed === 0) {
                setTimeout(() => {
                    window.MigrationService.clearLocalStorage();
                    showNotification(
                        '✓ Migrated ' + results.success + ' characters to cloud',
                    );
                    closeMigrationModal();
                }, 2000);
            } else {
                setTimeout(() => {
                    showNotification(
                        '⚠️ Migration completed with ' +
                            results.failed +
                            ' error(s)',
                    );
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
// DEMO CHARACTER MIGRATION UI HANDLERS
// ========================================

function showDemoMigrationModal() {
    if (!window.DemoCharacters) return;
    
    // Mark that we've asked about demo migration
    window.DemoCharacters.markMigrationAsked();
    
    const demoChars = window.DemoCharacters.getAll();
    const count = demoChars.length;
    
    document.getElementById('demoMigrationCount').textContent = count;
    
    // Populate the demo character list
    const listEl = document.getElementById('demoCharacterList');
    if (listEl) {
        listEl.innerHTML = demoChars.map(char => {
            const raceName = char.raceData?.name || char.race || '?';
            const className = char.classData?.name || char.class || '?';
            // NOTE: Use `${' '}` for spaces inside template literals because our bundler/minifier
            // can strip literal spaces inside backticks.
            return `<li><span class="demo-char-name">${Utils.escapeHtml(
                char.name,
            )}</span>${' '}<span class="demo-char-info">– Level${' '}${
                char.level
            }${' '}${raceName}${' '}${className}</span></li>`;
        }).join('');
    }
    
    const modal = document.getElementById('demoMigrationModal');
    if (modal) {
        modal.classList.add('show');
        focusFirstFieldInModal(modal);
    }
}

function closeDemoMigrationModal(skipReload = false) {
    const modal = document.getElementById('demoMigrationModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    if (!skipReload) {
        // Reload characters from cloud
        AppState.loadCharacters().then(() => UI.render());
    }
}

async function migrateDemoCharacters() {
    try {
        // Get demo characters
        const demoChars = window.DemoCharacters ? window.DemoCharacters.getAll() : [];
        
        if (demoChars.length === 0) {
            closeDemoMigrationModal();
            return;
        }
        
        let successCount = 0;
        
        for (const demo of demoChars) {
            try {
                // Copy demo character to cloud (remove demo flags)
                const charToAdd = { ...demo };
                delete charToAdd.isDemo;
                delete charToAdd.id;  // Let cloud assign new ID
                
                await window.CharacterCloudStorage.add(charToAdd);
                successCount++;
            } catch (error) {
                console.error('Failed to migrate demo character:', demo.name, error);
            }
        }
        
        if (successCount > 0) {
            showNotification(`✓ Added ${successCount} sample character(s) to your account`);
        }
        
        closeDemoMigrationModal();
    } catch (error) {
        console.error('Demo migration error:', error);
        showNotification('Failed to add sample characters', 'error');
        closeDemoMigrationModal();
    }
}

// Check if we should show demo migration prompt after registration/login
function shouldShowDemoMigration() {
    if (!window.DemoCharacters) return false;
    if (window.DemoCharacters.hasMigrationBeenAsked()) return false;
    
    // Only show if there are demo characters
    return window.MigrationService.hasDemoCharacters();
}

// ========================================
// INITIALIZATION
// ========================================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize modal behaviors (backdrop click, dirty checking)
    ModalManager.init();
    
    // Initialize mobile view handling (resize transitions)
    MobileView.init();
    
    // Initialize portrait lightbox for mobile (tap-to-zoom)
    PortraitLightbox.init();
    
    // Show panel loading spinners as early as possible so the shell never feels empty
    // while we verify auth state and fetch characters.
    if (typeof UI !== 'undefined' && UI && typeof UI.setLoadingState === 'function') {
        UI.setLoadingState(true);
    }

    // Apply app version to header and welcome modal from global version config.
    try {
        const version = window.DANDDY_VERSION || '2.0.0';
        const headerTitleText = document.querySelector('.terminal-title-text');
        const welcomeVersion = document.querySelector('.welcome-version');
        if (headerTitleText) {
            headerTitleText.textContent = `D&Dy v${version}`;
        }
        if (welcomeVersion) {
            welcomeVersion.textContent = `D&Dy v${version}`;
        }
    } catch (e) {
        console.warn('Version banner update failed:', e);
    }

    // Determine auth state up front (and validate token) so the UI and
    // storage mode (cloud vs local) start in a consistent state.
    //
    // However, we don't want a slow or unreachable backend to block the entire
    // UI. Wrap the async token verification in a soft timeout so the manager
    // can still become interactive even if /auth/me is slow.
    let isAuthenticated = false;
    if (window.AuthService) {
        const verify = async () => {
            if (typeof window.AuthService.verifyToken === 'function') {
                try {
                    const result = await window.AuthService.verifyToken();
                    return !!result;
                } catch (e) {
                    console.warn('Auth token verification failed:', e);
                    return false;
                }
            } else if (typeof window.AuthService.isAuthenticated === 'function') {
                try {
                    return !!window.AuthService.isAuthenticated();
                } catch (e) {
                    console.warn('Auth isAuthenticated check failed:', e);
                    return false;
                }
            }
            return false;
        };

        const withTimeout = (promise, ms, label) => {
            let timeoutId;
            const timeoutPromise = new Promise((resolve) => {
                timeoutId = setTimeout(() => {
                    console.warn(`[Boot] ${label} timed out after ${ms}ms; continuing in guest mode.`);
                    resolve(false);
                }, ms);
            });

            return Promise.race([promise, timeoutPromise]).finally(() => {
                clearTimeout(timeoutId);
            });
        };

        isAuthenticated = await withTimeout(verify(), 5000, 'AuthService.verifyToken');
    }

    // Sync header / guest notice with actual auth state
    updateAuthUI();

    // Start session monitoring if authenticated, and listen for expiry events
    if (isAuthenticated && window.AuthService && typeof window.AuthService.startSessionMonitor === 'function') {
        window.AuthService.startSessionMonitor();
    }

    // Listen for session expired events to show the modal
    window.addEventListener('danddy:sessionExpired', () => {
        showSessionExpiredModal();
    });

    // Check if user is returning from builder or has already dismissed the splash
    const urlParams = new URLSearchParams(window.location.search);
    const fromBuilder = urlParams.get('from') === 'builder';
    const splashDismissed = sessionStorage.getItem('welcomeSplashDismissed') === 'true';

    // Show session notice if there's a builder session in progress
    // (but not if returning from builder - they just left intentionally)
    if (!fromBuilder) {
        maybeShowSessionNotice();
    }

    // Show guest notice banner if returning from builder after saving while not logged in
    if (fromBuilder && !isAuthenticated) {
        const showGuestNotice = sessionStorage.getItem('showGuestNoticeOnReturn') === 'true';
        if (showGuestNotice) {
            sessionStorage.removeItem('showGuestNoticeOnReturn'); // Clear the flag
            // Show the banner after a short delay to ensure DOM is ready
            setTimeout(() => {
                maybeShowGuestNotice();
            }, 100);
        }
    }

    // Show welcome modal (splash art + three choices) only when not logged in.
    const welcomeModal = document.getElementById('welcomeModal');
    // Wire welcome modal buttons: LOG IN, CREATE ACCOUNT, GUEST MODE
    const welcomeLoginBtn = document.getElementById('welcomeLoginBtn');
    if (welcomeLoginBtn) {
        welcomeLoginBtn.addEventListener('click', () => {
            authOpenedFromWelcome = true;
            // Don't set dismissed flag yet - only set it on successful login
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
        });
    }

    const welcomeRegisterBtn = document.getElementById('welcomeRegisterBtn');
    if (welcomeRegisterBtn) {
        welcomeRegisterBtn.addEventListener('click', () => {
            authOpenedFromWelcome = true;
            // Don't set dismissed flag yet - only set it on successful registration
            if (welcomeModal) welcomeModal.classList.remove('show');
            showAuthModal();
            showRegisterForm();
        });
    }

    const welcomeDemoBtn = document.getElementById('welcomeDemoBtn');
    if (welcomeDemoBtn) {
        welcomeDemoBtn.addEventListener('click', () => {
            // Mark splash as dismissed so it won't reappear when returning from builder
            sessionStorage.setItem('welcomeSplashDismissed', 'true');
            // Close the modal
            if (welcomeModal) welcomeModal.classList.remove('show');
            // Show guest notice to explain limits and encourage account creation
            setTimeout(() => {
                maybeShowGuestNotice();
            }, 100);
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

        // Show welcome modal only if:
        // 1. User is not authenticated, AND
        // 2. User hasn't already dismissed the splash this session (e.g., by clicking DEMO MODE), AND
        // 3. User is not returning from the builder
        if (!isAuthenticated && !splashDismissed && !fromBuilder) {
            welcomeModal.classList.add('show');
            // Don't auto-focus any button - let the user choose
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

    // Add Enter key support for login/register forms
    const loginUsernameInput = document.getElementById('loginUsername');
    const loginPasswordInput = document.getElementById('loginPassword');
    const registerEmailInput = document.getElementById('registerEmail');
    const registerPasswordInput = document.getElementById('registerPassword');

    // Add Enter key support for login form
    if (loginUsernameInput) {
        loginUsernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }

    if (loginPasswordInput) {
        loginPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleLogin();
            }
        });
    }

    // Add Enter key support for register form
    // Email and password fields already trigger registration on Enter.

    if (registerEmailInput) {
        registerEmailInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegister();
            }
        });
    }

    if (registerPasswordInput) {
        registerPasswordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                handleRegister();
            }
        });
    }

    // Wire up password visibility toggles in auth + reset modals
    const passwordToggleButtons = document.querySelectorAll('.password-toggle-btn');
    passwordToggleButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
            const targetId = btn.getAttribute('data-target');
            if (!targetId) return;
            const input = document.getElementById(targetId);
            if (!input) return;
            const isPassword = input.type === 'password';
            input.type = isPassword ? 'text' : 'password';
            btn.textContent = isPassword ? 'HIDE' : 'SHOW';
            btn.setAttribute('aria-pressed', String(isPassword));
            btn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        });
    });

    // Note: Debug listeners removed - they were interfering with button clicks

    // Pre-load demo characters from API, then load ASCII art BEFORE initializing app state.
    // This ensures demo characters have portraits ready when displayed.
    const initApp = async () => {
        if (window.DemoCharacters) {
            try {
                // First, try to fetch demo characters from the API
                if (typeof window.DemoCharacters.fetchFromApi === 'function') {
                    await window.DemoCharacters.fetchFromApi();
                }
                // Then load ASCII art for any characters that need it
                if (typeof window.DemoCharacters.loadAsciiForAllDemoCharacters === 'function') {
                    await window.DemoCharacters.loadAsciiForAllDemoCharacters();
                }
            } catch (e) {
                console.warn('Failed to load demo characters:', e);
            }
        }
        
        // Initialize app state after demo characters are loaded
        await AppState.init();
        
        // Check for pending character shares if authenticated
        // (delay slightly to not block the initial render)
        if (isAuthenticated) {
            setTimeout(() => checkPendingShares(), 500);
        }
    };
    
    initApp().catch((e) => {
        console.error('App initialization failed:', e);
    });

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
        // Use mousedown with preventDefault to stop iOS Safari from blurring
        // the input before we can process the clear action
        clearSearchBtn.addEventListener('mousedown', (e) => {
            e.preventDefault(); // Prevent input blur on iOS Safari
        });
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput.disabled) return;
            searchInput.value = '';
            AppState.searchTerm = '';
            AppState.applyFilters();
            UI.render();
            // On mobile, blur to close the expanded search; on desktop, keep focus
            if (MobileView.isMobile()) {
                searchInput.blur();
            } else {
                searchInput.focus();
            }
            updateClearSearchVisibility();
        });
        updateClearSearchVisibility();
    }

    // Fix iOS Safari double-tap issue on header overflow button.
    // Elements that appear via CSS transition (opacity 0→1) can fail to register
    // the first tap properly. Using touchend ensures immediate response.
    const headerOverflowBtn = document.getElementById('headerOverflowBtn');
    if (headerOverflowBtn) {
        headerOverflowBtn.addEventListener('touchend', (e) => {
            // Only handle single-finger taps
            if (e.changedTouches.length !== 1) return;
            e.preventDefault(); // Prevent subsequent click/mouse events
            CharacterSheet.toggleSelectorMenu(headerOverflowBtn);
        });
    }

    // Update search placeholder on viewport resize (debounced)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            UI.updateCount();
        }, 100);
    });

    // Sort dropdown behavior - now uses standard CharacterSheet.toggleSelectorMenu()
    if (sortToggleBtn && sortDropdown) {
        // Size the sort trigger based on the longest option label so the
        // button width is driven by content but stays fixed as labels change.
        const sizeSortTrigger = () => {
            const options = sortDropdown.querySelectorAll('.sort-option');
            if (!options.length) return;

            let maxLabelChars = 0;
            options.forEach((opt) => {
                const label = (opt.textContent || '').trim();
                if (label.length > maxLabelChars) {
                    maxLabelChars = label.length;
                }
            });

            // Account for "Sort: " prefix plus a little breathing room.
            const totalChars = 'Sort: '.length + maxLabelChars + 2;
            sortToggleBtn.style.minWidth = `${totalChars}ch`;
        };

        const updateSortUI = () => {
            // Update the button label to spell out the current sort mode
            const sortLabels = {
                alphabetical: 'Alphabetical',
                dateModified: 'Date modified',
            };
            const currentLabel = sortLabels[AppState.sortMode] || 'Date modified';
            sortToggleBtn.textContent = `Sort: ${currentLabel}`;

            // Keep the listbox selection state in sync with the trigger label.
            // This ensures the option marked as selected in the listbox always
            // matches the active sort mode shown in the button.
            const options = sortDropdown.querySelectorAll('.sort-option');
            options.forEach((opt) => {
                const value = opt.getAttribute('data-sort-value');
                const isSelected = value === AppState.sortMode;
                opt.classList.toggle('is-selected', isSelected);
                opt.setAttribute('aria-selected', isSelected ? 'true' : 'false');
            });

            // Ensure width stays sized for the longest label
            sizeSortTrigger();
        };

        const sortOptions = Array.from(sortDropdown.querySelectorAll('.sort-option'));

        sortOptions.forEach((opt) => {
            opt.addEventListener('click', (e) => {
                e.stopPropagation();
                const value = opt.getAttribute('data-sort-value');
                if (value === 'alphabetical' || value === 'dateModified') {
                    AppState.sortMode = value;
                    AppState.applyFilters();
                    UI.render();
                }
                // Note: CharacterSheet.toggleSelectorMenu handles closing the menu
                updateSortUI();
            });
        });

        // Initialize selection state and trigger sizing
        sizeSortTrigger();
        updateSortUI();
    }

    // Wire header buttons (guard against missing elements so init doesn't crash)
    const newCharacterBtn = document.getElementById('newCharacterBtn');
    const newCharacterTooltip = document.getElementById('newCharacterTooltip');
    if (newCharacterBtn) {
        newCharacterBtn.addEventListener('click', createNewCharacter);
        
        // Show/hide custom tooltip on hover
        if (newCharacterTooltip) {
            const showTooltip = () => {
                if (!newCharacterTooltip.textContent) return;
                newCharacterTooltip.classList.add('show');
            };
            const hideTooltip = () => {
                newCharacterTooltip.classList.remove('show');
            };

            newCharacterBtn.addEventListener('mouseenter', () => {
                showTooltip();
            });
            newCharacterBtn.addEventListener('mouseleave', () => {
                hideTooltip();
            });
            // Also hide on focus out for keyboard users
            newCharacterBtn.addEventListener('focus', () => {
                showTooltip();
            });
            newCharacterBtn.addEventListener('blur', () => {
                hideTooltip();
            });
        }
    }

    // Check creation quota on load and listen for updates
    updateCreationQuotaState();
    
    window.addEventListener('danddy:creationQuotaUpdate', (e) => {
        if (e.detail && typeof e.detail.remaining === 'number') {
            _creationQuotaRemaining = e.detail.remaining;
            window._creationQuotaRemaining = e.detail.remaining;
            window._creationQuotaLimit =
                typeof e.detail.limit === 'number' ? e.detail.limit : window._creationQuotaLimit;
            window._creationQuotaResetAt = e.detail.resetAt || window._creationQuotaResetAt;
            const btn = document.getElementById('newCharacterBtn');
            const overflowBtn = document.getElementById('overflowNewCharBtn');
            const tooltip = document.getElementById('newCharacterTooltip');
            
            let tooltipText = '';
            [btn, overflowBtn].forEach(b => {
                if (!b) return;

                if (e.detail.remaining === -1) {
                    b.disabled = false;
                    b.title = '';
                    b.classList.remove('is-quota-exhausted');
                    tooltipText = '';
                } else if (e.detail.remaining === 0) {
                    b.disabled = true;
                    b.title = '';
                    b.classList.add('is-quota-exhausted');
                    tooltipText = 'Daily limit reached';
                } else {
                    b.disabled = false;
                    b.title = '';
                    b.classList.remove('is-quota-exhausted');
                    tooltipText = `${e.detail.remaining}${' '}creation${e.detail.remaining === 1 ? '' : 's'}${' '}remaining`;
                }
            });
            if (tooltip) {
                _updateQuotaTooltipText();
                if (!tooltip.textContent) {
                    tooltip.textContent = tooltipText;
                }
            }
        }
    });

    // Check image quota on load and listen for updates (for Customize portrait button)
    updateImageQuotaState();
    window.addEventListener('danddy:imageQuotaUpdate', (e) => {
        if (e.detail && typeof e.detail.remaining === 'number') {
            const oldRemaining = window._imageQuotaRemaining;
            window._imageQuotaRemaining = e.detail.remaining;
            
            // Re-render character sheet if quota just became exhausted
            if (e.detail.remaining === 0 && oldRemaining !== 0 && AppState.selectedCharacterId) {
                viewCharacter(AppState.selectedCharacterId, { skipKeyboardSync: true });
            }
        }
    });

    const importBtn = document.getElementById('importBtn');
    if (importBtn) {
        importBtn.addEventListener('click', showImportModal);
    }
    
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

    // Mobile: tap on shared/spell tag to reveal tooltip, tap again or outside to close
    // Use event delegation for dynamically rendered content
    document.addEventListener('click', (e) => {
        // Guard against non-element targets (text nodes, etc.)
        if (!e.target || typeof e.target.closest !== 'function') return;
        
        // Check if touch device (coarse pointer)
        const isTouch = window.matchMedia('(hover: none), (pointer: coarse)').matches;
        if (!isTouch) return;
        
        // Find any tooltip-enabled tag that was tapped (shared tag or spell tag)
        const tappedTag = e.target.closest('.sheet-shared-tag.has-tooltip, .sheet-spell-tag.has-tooltip');
        const clickedTooltip = e.target.closest('.custom-tooltip');
        const activeTag = document.querySelector('.sheet-shared-tag.tooltip-active, .sheet-spell-tag.tooltip-active');
        
        if (tappedTag) {
            // Tapped on a tag with tooltip - toggle its tooltip
            e.stopPropagation();
            
            // If there's already an active tooltip on a different tag, close it
            if (activeTag && activeTag !== tappedTag) {
                activeTag.classList.remove('tooltip-active');
            }
            
            // Toggle the tapped tag's tooltip
            tappedTag.classList.toggle('tooltip-active');
            
            // Reposition tooltip if it will be clipped
            if (tappedTag.classList.contains('tooltip-active')) {
                repositionTooltipIfClipped(tappedTag);
            }
        } else if (clickedTooltip) {
            // Tapped directly on a tooltip - close its parent tag's tooltip
            e.stopPropagation();
            const parentTag = clickedTooltip.closest('.sheet-shared-tag.has-tooltip, .sheet-spell-tag.has-tooltip');
            if (parentTag) {
                parentTag.classList.remove('tooltip-active');
            }
        } else {
            // Tapped outside - close any open tooltip
            if (activeTag) {
                activeTag.classList.remove('tooltip-active');
            }
        }
    });

    // Find the closest scrollable/overflow container
    function getContainerBounds(element) {
        let current = element.parentElement;
        while (current && current !== document.body) {
            const style = getComputedStyle(current);
            const overflowX = style.overflowX;
            const overflowY = style.overflowY;
            // Check if this element clips its content
            if (overflowX === 'hidden' || overflowX === 'auto' || overflowX === 'scroll' ||
                overflowY === 'hidden' || overflowY === 'auto' || overflowY === 'scroll') {
                return current.getBoundingClientRect();
            }
            current = current.parentElement;
        }
        // Fallback to viewport
        return { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight };
    }

    // Tooltip edge detection: apply inline offset to prevent clipping
    function repositionTooltipIfClipped(parent) {
        const tooltip = parent.querySelector('.custom-tooltip');
        if (!tooltip) return;
        
        // Reset any previous inline adjustments
        tooltip.style.setProperty('--tooltip-offset-x', '0px');
        tooltip.classList.add('show');
        
        // Force reflow to ensure CSS variable change is applied before measuring
        void tooltip.offsetWidth;
        
        // Now measure with fresh layout
        const tooltipRect = tooltip.getBoundingClientRect();
        const containerBounds = getContainerBounds(parent);
        const margin = 12;
        
        let offsetX = 0;
        
        // Check left clipping
        if (tooltipRect.left < containerBounds.left + margin) {
            offsetX = (containerBounds.left + margin) - tooltipRect.left;
        }
        // Check right clipping
        else if (tooltipRect.right > containerBounds.right - margin) {
            offsetX = (containerBounds.right - margin) - tooltipRect.right;
        }
        
        // Apply horizontal offset using CSS custom property
        tooltip.style.setProperty('--tooltip-offset-x', `${offsetX}px`);
        
        tooltip.classList.remove('show');
    }

    // Desktop: reposition tooltip on hover
    document.addEventListener('mouseenter', (e) => {
        // Guard against non-element targets (text nodes, etc.)
        if (!e.target || typeof e.target.closest !== 'function') return;
        
        const parent = e.target.closest('.sheet-spell-tag.has-tooltip');
        if (parent) {
            repositionTooltipIfClipped(parent);
        }
    }, true);

    // Handle password reset token from URL fragment (e.g. when coming from email link)
    try {
        const hash = window.location.hash || '';
        
        // Check for password reset modal request
        if (hash === '#password-reset') {
            showPasswordResetModal();
            // Clear hash from URL
            history.replaceState(
                null,
                document.title,
                window.location.pathname + window.location.search,
            );
        }
        
        // Check for reset token in hash
        const tokenMatch = hash.match(/reset-token=([^&]+)/);
        if (tokenMatch && tokenMatch[1]) {
            const token = decodeURIComponent(tokenMatch[1]);
            showPasswordResetModal();
            
            // Auto-fill the token (hidden field) and switch to password input
            const tokenInput = document.getElementById('passwordResetToken');
            if (tokenInput) {
                tokenInput.value = token;
            }
            
            // Switch to the password reset confirmation section
            const modalTitle = document.getElementById('passwordResetModalTitle');
            const requestSection = document.getElementById('passwordResetRequestSection');
            const successSection = document.getElementById('passwordResetSuccessSection');
            const confirmSection = document.getElementById('passwordResetConfirmSection');
            const cancelBtn = document.getElementById('passwordResetCancelBtn');
            const closeBtn = document.getElementById('passwordResetCloseBtn');
            const requestBtn = document.getElementById('passwordResetRequestBtn');
            const confirmBtn = document.getElementById('passwordResetConfirmBtn');
            
            if (modalTitle) modalTitle.textContent = 'RESET PASSWORD';
            if (requestSection) requestSection.classList.add('is-hidden');
            if (successSection) successSection.classList.add('is-hidden');
            if (confirmSection) confirmSection.classList.remove('is-hidden');
            if (cancelBtn) cancelBtn.classList.remove('is-hidden');
            if (closeBtn) closeBtn.classList.add('is-hidden');
            if (requestBtn) requestBtn.classList.add('is-hidden');
            if (confirmBtn) confirmBtn.classList.remove('is-hidden');
            
            // Focus on the new password input
            setTimeout(() => {
                document.getElementById('passwordResetNewPassword')?.focus();
            }, 100);
            
            // Remove token from URL bar for a bit of shoulder-surfing protection
            history.replaceState(
                null,
                document.title,
                window.location.pathname + window.location.search,
            );
        }
    } catch (e) {
        console.warn('Failed to process reset-token from URL hash', e);
    }
    
    // Hover behavior for character cards:
    // - Adds/removes a visual `is-hovered` class
    // - Does NOT change focus or update the character sheet
    // - Clears keyboard focus when mouse takes over
    const characterGrid = document.getElementById('characterGrid');
    if (characterGrid) {
        characterGrid.addEventListener('mouseover', (e) => {
            // Guard against non-element targets (text nodes, etc.)
            if (!e.target || typeof e.target.closest !== 'function') return;
            
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

            // ESC closes whichever modal is active (with dirty check for form modals)
            if (e.key === 'Escape') {
                e.preventDefault();
                
                // Check if discard confirmation is showing - if so, close it
                const discardOverlay = openModal.querySelector('.modal-discard-confirm.show');
                if (discardOverlay) {
                    discardOverlay.classList.remove('show');
                    return;
                }
                
                // Use ModalManager for universal close behavior (handles dirty check)
                ModalManager.requestClose(modalId);
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

// ===== SPELL PICKER MODAL =====
// State for spell picker
let spellPickerState = {
    isOpen: false,
    mode: 'cantrips', // 'cantrips' or a number (1-9) for spell level
    characterClass: null,
    maxSpellLevel: 0,
    selectedSpells: new Set(),
    existingSpells: [], // Spells already on character
    onConfirm: null, // Callback when selection is confirmed
    maxSelections: null, // Max spells that can be selected (null = unlimited)
};

/**
 * Open the spell picker modal
 * @param {object} options - Configuration options
 * @param {string} options.characterClass - The class to filter spells by
 * @param {string|number} options.level - 'cantrips' or 1-9 for spell level
 * @param {number} options.maxSpellLevel - Maximum spell level character can cast
 * @param {Array} options.existingSpells - Spells already selected (to exclude or mark)
 * @param {Function} options.onConfirm - Callback with selected spells array
 * @param {number|null} options.maxSelections - Maximum spells that can be selected (null = unlimited)
 */
function openSpellPicker(options) {
    const { characterClass, level, maxSpellLevel = 9, existingSpells = [], onConfirm, maxSelections = null } = options;
    
    if (!window.SPELL_DATABASE) {
        console.error('Spell database not loaded');
        showNotification('Spell database not available', 'error');
        return;
    }
    
    // Normalize existing spells to lowercase for comparison
    const normalizedExisting = existingSpells.map(s => (typeof s === 'string' ? s : s.name || s.id).toLowerCase());
    
    // Pre-select existing spells so user can manage them
    const preSelected = new Set();
    const spellLevel = level === 'cantrips' ? 0 : parseInt(level, 10);
    const allSpells = window.SPELL_DATABASE.getSpellsByLevel(spellLevel) || [];
    for (const spell of allSpells) {
        if (normalizedExisting.includes(spell.name.toLowerCase()) || normalizedExisting.includes(spell.id)) {
            preSelected.add(spell.id);
        }
    }
    
    spellPickerState = {
        isOpen: true,
        mode: level,
        characterClass: characterClass?.toLowerCase(),
        maxSpellLevel,
        selectedSpells: preSelected,
        existingSpells: normalizedExisting, // Keep for reference but don't lock
        originalSelection: new Set(preSelected), // Track what was originally selected
        onConfirm,
        maxSelections,
    };
    
    // Render the spell list
    renderSpellPicker();
    
    // Update info text
    const infoEl = document.getElementById('spellPickerInfo');
    if (infoEl) {
        const levelText = level === 'cantrips' || level === 0 ? 'Cantrips' : `Level ${level} Spells`;
        const className = characterClass ? characterClass.charAt(0).toUpperCase() + characterClass.slice(1) : '';
        infoEl.textContent = `Selecting ${levelText}${className ? ` for ${className}` : ''}`;
    }
    
    // Show modal
    const modal = document.getElementById('spellPickerModal');
    if (modal) {
        modal.classList.add('show');
        // Focus search input
        setTimeout(() => {
            const searchInput = document.getElementById('spellSearchInput');
            if (searchInput) searchInput.focus();
        }, 100);
    }
    
    updateSpellPickerCount();
}

// Track current standalone spell school filter selection
let standaloneSpellSchoolFilter = '';

/**
 * Select a spell school from the standalone dropdown
 */
function selectStandaloneSpellSchool(value) {
    standaloneSpellSchoolFilter = value;
    
    const trigger = document.getElementById('spellSchoolFilterTrigger');
    const menu = document.getElementById('spellSchoolFilterMenu');
    
    if (trigger) {
        const label = trigger.querySelector('.selector-trigger-label');
        if (label) {
            label.textContent = value || 'All Schools';
        }
    }
    
    // Update selected state on options
    if (menu) {
        menu.querySelectorAll('.selector-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.dataset.value === value);
        });
    }
    
    // Menu is closed automatically by CharacterSheet global option handler
    
    // Re-render the spell list
    filterSpellPicker();
}

// Make selector functions globally available
window.selectStandaloneSpellSchool = selectStandaloneSpellSchool;

/**
 * Close the spell picker modal
 */
function closeSpellPicker() {
    const modal = document.getElementById('spellPickerModal');
    if (modal) {
        modal.classList.remove('show');
    }
    
    // Clear search and reset filter
    const searchInput = document.getElementById('spellSearchInput');
    if (searchInput) searchInput.value = '';
    
    // Reset the selector to "All Schools"
    standaloneSpellSchoolFilter = '';
    const trigger = document.getElementById('spellSchoolFilterTrigger');
    if (trigger) {
        const label = trigger.querySelector('.selector-trigger-label');
        if (label) label.textContent = 'All Schools';
    }
    const menu = document.getElementById('spellSchoolFilterMenu');
    if (menu) {
        menu.querySelectorAll('.selector-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.dataset.value === '');
        });
    }
    
    spellPickerState.isOpen = false;
    spellPickerState.selectedSpells.clear();
}

/**
 * Render the spell list based on current filters
 */
function renderSpellPicker() {
    const listEl = document.getElementById('spellPickerList');
    if (!listEl || !window.SPELL_DATABASE) return;
    
    const searchQuery = document.getElementById('spellSearchInput')?.value || '';
    const schoolFilter = standaloneSpellSchoolFilter;
    
    // Get level (0 for cantrips)
    const level = spellPickerState.mode === 'cantrips' ? 0 : parseInt(spellPickerState.mode, 10);
    
    // Get spells for this level
    let spells = window.SPELL_DATABASE.getSpellsByLevel(level) || [];
    
    // Filter by class if specified
    if (spellPickerState.characterClass) {
        spells = spells.filter(spell => 
            spell.classes.includes(spellPickerState.characterClass)
        );
    }
    
    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        spells = spells.filter(spell =>
            spell.name.toLowerCase().includes(query) ||
            spell.description.toLowerCase().includes(query) ||
            spell.school.toLowerCase().includes(query)
        );
    }
    
    // Filter by school
    if (schoolFilter) {
        spells = spells.filter(spell => spell.school === schoolFilter);
    }
    
    // Sort alphabetically
    spells.sort((a, b) => a.name.localeCompare(b.name));
    
    if (spells.length === 0) {
        listEl.innerHTML = '<div class="spell-picker-empty">No spells found matching your criteria.</div>';
        return;
    }
    
    // Render spell items
    listEl.innerHTML = spells.map(spell => {
        const isSelected = spellPickerState.selectedSpells.has(spell.id);
        const wasOriginallySelected = spellPickerState.originalSelection?.has(spell.id);
        
        const classes = ['spell-picker-item'];
        if (isSelected) classes.push('is-selected');
        if (wasOriginallySelected) classes.push('is-existing'); // Visual indicator only, not locked
        
        return `
            <div class="${classes.join(' ')}" data-spell-id="${Utils.escapeHtml(spell.id)}" onclick="toggleSpellSelection('${Utils.escapeHtml(spell.id)}')">
                <input type="checkbox" class="spell-picker-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="spell-picker-item-content">
                    <div class="spell-picker-item-header">
                        <span class="spell-picker-item-name">${Utils.escapeHtml(spell.name)}${wasOriginallySelected ? ' <span class="spell-existing-badge">current</span>' : ''}</span>
                        <span class="spell-picker-item-school">${Utils.escapeHtml(spell.school)}</span>
                    </div>
                    <div class="spell-picker-item-meta">
                        ${Utils.escapeHtml(spell.castingTime)} · ${Utils.escapeHtml(spell.range)} · ${Utils.escapeHtml(spell.components)}
                    </div>
                    <div class="spell-picker-item-desc">${Utils.escapeHtml(spell.description)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Toggle selection of a spell
 */
function toggleSpellSelection(spellId) {
    if (spellPickerState.selectedSpells.has(spellId)) {
        spellPickerState.selectedSpells.delete(spellId);
    } else {
        // Check if we've reached the selection limit
        if (spellPickerState.maxSelections !== null && 
            spellPickerState.selectedSpells.size >= spellPickerState.maxSelections) {
            showNotification(`You can only select ${spellPickerState.maxSelections} spell${spellPickerState.maxSelections === 1 ? '' : 's'}`, 'warning');
            return;
        }
        spellPickerState.selectedSpells.add(spellId);
    }
    
    // Update UI
    const item = document.querySelector(`.spell-picker-item[data-spell-id="${spellId}"]`);
    if (item) {
        item.classList.toggle('is-selected', spellPickerState.selectedSpells.has(spellId));
        const checkbox = item.querySelector('.spell-picker-checkbox');
        if (checkbox) checkbox.checked = spellPickerState.selectedSpells.has(spellId);
    }
    
    updateSpellPickerCount();
}

/**
 * Update the selected count display
 */
function updateSpellPickerCount() {
    const countEl = document.getElementById('spellPickerSelectedCount');
    if (countEl) {
        const count = spellPickerState.selectedSpells.size;
        if (spellPickerState.maxSelections !== null) {
            countEl.textContent = count + ' of ' + spellPickerState.maxSelections + ' selected';
            // Add visual indicator when at limit
            countEl.classList.toggle('at-limit', count >= spellPickerState.maxSelections);
        } else {
            countEl.textContent = count + ' selected';
            countEl.classList.remove('at-limit');
        }
    }
}

/**
 * Filter spell picker based on search/filters
 */
function filterSpellPicker() {
    renderSpellPicker();
}

/**
 * Confirm spell selection and call callback
 */
function confirmSpellSelection() {
    // Get full spell objects for selected spells
    const level = spellPickerState.mode === 'cantrips' ? 0 : parseInt(spellPickerState.mode, 10);
    const allSpells = window.SPELL_DATABASE.getSpellsByLevel(level) || [];
    const selectedSpells = allSpells.filter(spell => 
        spellPickerState.selectedSpells.has(spell.id)
    );
    
    // Call the callback with selected spells (may be empty if user removed all)
    if (typeof spellPickerState.onConfirm === 'function') {
        spellPickerState.onConfirm(selectedSpells);
    }
    
    closeSpellPicker();
}

// Make functions globally available
window.openSpellPicker = openSpellPicker;
window.closeSpellPicker = closeSpellPicker;
window.filterSpellPicker = filterSpellPicker;
window.toggleSpellSelection = toggleSpellSelection;
window.confirmSpellSelection = confirmSpellSelection;

// ===== SPELL EDITING IN EDIT MODAL =====
// Track spells being edited
let editSpellsState = {
    cantrips: [],
    spells: {}, // { 1: [...], 2: [...], etc. }
    characterClass: null,
    maxSpellLevel: 0,
    characterLevel: 1,
    cantripsAllowed: 0,   // Max cantrips allowed for this class/level
    spellsAllowed: null,  // Max spells allowed (null = unlimited for prepared casters)
};

// Spellcasting classes and their types
const SPELLCASTING_CLASSES = {
    'bard': { type: 'full', cantrips: true },
    'cleric': { type: 'full', cantrips: true },
    'druid': { type: 'full', cantrips: true },
    'sorcerer': { type: 'full', cantrips: true },
    'wizard': { type: 'full', cantrips: true },
    'warlock': { type: 'pact', cantrips: true },
    'paladin': { type: 'half', cantrips: false },
    'ranger': { type: 'half', cantrips: false },
    // Subclass casters would need more complex handling
};

/**
 * Validate a spell selection against the allowed limits
 * @param {string|number} level - 'cantrips' or spell level (1-9)
 * @param {Array} selectedSpells - Array of spell objects being selected
 * @returns {object} - { valid: boolean, message: string, overBy: number }
 */
function validateSpellSelection(level, selectedSpells) {
    const selectedCount = selectedSpells.length;
    
    if (level === 'cantrips') {
        const maxCantrips = editSpellsState.cantripsAllowed;
        if (maxCantrips > 0 && selectedCount > maxCantrips) {
            const overBy = selectedCount - maxCantrips;
            return {
                valid: false,
                message: `Too many cantrips! You have ${selectedCount} selected but your limit is ${maxCantrips}. Please remove ${overBy} cantrip${overBy > 1 ? 's' : ''}.`,
                overBy
            };
        }
    } else {
        // For leveled spells, check against total spells allowed (if limited)
        const maxSpells = editSpellsState.spellsAllowed;
        if (maxSpells !== null) {
            // Calculate total spells including this selection
            const currentLevelNum = typeof level === 'string' ? parseInt(level, 10) : level;
            let totalSpells = selectedCount;
            
            // Add spells from other levels
            for (const [lvl, spells] of Object.entries(editSpellsState.spells)) {
                if (parseInt(lvl, 10) !== currentLevelNum) {
                    totalSpells += spells.length;
                }
            }
            
            if (totalSpells > maxSpells) {
                const overBy = totalSpells - maxSpells;
                return {
                    valid: false,
                    message: `Too many spells! You have ${totalSpells} total but your limit is ${maxSpells}. Please remove ${overBy} spell${overBy > 1 ? 's' : ''}.`,
                    overBy
                };
            }
        }
    }
    
    return { valid: true, message: '', overBy: 0 };
}

/**
 * Validate all current spell selections against limits
 * @returns {object} - { valid: boolean, message: string, cantripsOver: number, spellsOver: number }
 */
function validateAllSpellLimits() {
    const currentCantrips = editSpellsState.cantrips.length;
    const maxCantrips = editSpellsState.cantripsAllowed;
    const currentSpells = Object.values(editSpellsState.spells).flat().length;
    const maxSpells = editSpellsState.spellsAllowed;
    
    const cantripsOver = maxCantrips > 0 ? Math.max(0, currentCantrips - maxCantrips) : 0;
    const spellsOver = maxSpells !== null ? Math.max(0, currentSpells - maxSpells) : 0;
    
    if (cantripsOver > 0 || spellsOver > 0) {
        const messages = [];
        if (cantripsOver > 0) {
            messages.push(`Remove ${cantripsOver} cantrip${cantripsOver > 1 ? 's' : ''} (${currentCantrips}/${maxCantrips})`);
        }
        if (spellsOver > 0) {
            messages.push(`Remove ${spellsOver} spell${spellsOver > 1 ? 's' : ''} (${currentSpells}/${maxSpells})`);
        }
        return {
            valid: false,
            message: `You are over your spell limit.\n\n${messages.join('\n')}`,
            cantripsOver,
            spellsOver
        };
    }
    
    return { valid: true, message: '', cantripsOver: 0, spellsOver: 0 };
}

/**
 * Animate opening a modal by inserting it without .show, then adding .show on next frame
 * @param {string} modalHtml - The modal HTML string (without .show class)
 * @param {string} modalId - The ID of the modal element
 */
function animateModalOpen(modalHtml, modalId) {
    getManagerModalHost().insertAdjacentHTML('beforeend', modalHtml);
    const modal = document.getElementById(modalId);
    if (modal) {
        // Force browser to acknowledge the element exists before adding .show
        // This ensures the CSS animation triggers properly
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                modal.classList.add('show');
            });
        });
    }
}

/**
 * Show a modal when user is over spell limit
 * @param {object} validation - The validation result with overBy info
 * @param {string|number} level - 'cantrips' or spell level
 */
function showSpellLimitModal(validation, level) {
    const isCantrips = level === 'cantrips';
    const overBy = validation.overBy || 1;
    const spellType = isCantrips ? 'cantrip' : 'spell';
    const spellTypePlural = isCantrips ? 'cantrips' : 'spells';
    
    const modalHtml = `
        <div id="spellLimitModal" class="modal">
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">Too Many ${isCantrips ? 'Cantrips' : 'Spells'}</h2>
                    <button class="modal-close" onclick="closeSpellLimitModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="terminal-text">
                        You've selected more ${spellTypePlural} than allowed for your class and level.
                    </p>
                    <p class="terminal-text" style="margin-top: 0.75rem;">
                        Please remove <strong>${overBy}</strong> ${overBy === 1 ? spellType : spellTypePlural} to continue.
                    </p>
                </div>
                <div class="modal-footer modal-footer-end" style="gap: 0.5rem;">
                    <button class="terminal-btn" onclick="closeSpellLimitModal()">Cancel</button>
                    <button class="terminal-btn" onclick="closeSpellLimitModal()">Edit Spells</button>
                </div>
            </div>
        </div>
    `;
    
    animateModalOpen(modalHtml, 'spellLimitModal');
}

/**
 * Close the spell limit modal
 */
function closeSpellLimitModal() {
    const modal = document.getElementById('spellLimitModal');
    if (modal) {
        animateModalClose(modal, { removeOnClose: true });
    }
}

/**
 * Show a modal when trying to save while over spell limit
 * @param {object} validation - The validation result with cantripsOver and spellsOver
 */
function showSpellLimitSaveModal(validation) {
    const { cantripsOver, spellsOver } = validation;
    
    // Build the message
    const parts = [];
    if (cantripsOver > 0) {
        parts.push(`${cantripsOver} cantrip${cantripsOver > 1 ? 's' : ''}`);
    }
    if (spellsOver > 0) {
        parts.push(`${spellsOver} spell${spellsOver > 1 ? 's' : ''}`);
    }
    const removeText = parts.join(' and ');
    
    const modalHtml = `
        <div id="spellLimitSaveModal" class="modal">
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-header">
                    <h2 class="modal-title">Over Spell Limit</h2>
                    <button class="modal-close" onclick="closeSpellLimitSaveModal()">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="terminal-text">
                        You have more spells than allowed for your class and level.
                    </p>
                    <p class="terminal-text" style="margin-top: 0.75rem;">
                        Please remove <strong>${removeText}</strong> to save your changes.
                    </p>
                </div>
                <div class="modal-footer modal-footer-end" style="gap: 0.5rem;">
                    <button class="terminal-btn" onclick="closeSpellLimitSaveModal()">Cancel</button>
                    <button class="terminal-btn" onclick="closeSpellLimitSaveModal()">OK</button>
                </div>
            </div>
        </div>
    `;
    
    animateModalOpen(modalHtml, 'spellLimitSaveModal');
}

/**
 * Close the spell limit save modal
 */
function closeSpellLimitSaveModal() {
    const modal = document.getElementById('spellLimitSaveModal');
    if (modal) {
        animateModalClose(modal, { removeOnClose: true });
    }
}

/**
 * Scroll to the spell section in the edit modal
 */
function scrollToSpellSection() {
    const spellSection = document.getElementById('spellEditSection');
    if (spellSection) {
        spellSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

window.closeSpellLimitModal = closeSpellLimitModal;
window.closeSpellLimitSaveModal = closeSpellLimitSaveModal;
window.scrollToSpellSection = scrollToSpellSection;

/**
 * Initialize the spell editing section based on character
 */
function initializeSpellEditSection(character, parsed) {
    const spellSection = document.getElementById('spellEditSection');
    if (!spellSection) return;
    
    const className = (character.class || '').toLowerCase();
    const spellcasting = SPELLCASTING_CLASSES[className];
    
    // Hide section for non-casters
    if (!spellcasting) {
        spellSection.classList.add('is-hidden');
        return;
    }
    
    // Show section for casters
    spellSection.classList.remove('is-hidden');
    
    // Calculate max spell level based on character level
    const level = parsed.level || character.level || 1;
    let maxSpellLevel = 0;
    
    if (spellcasting.type === 'full') {
        // Full casters: level 1-2 = 1st level spells, +1 spell level per 2 levels thereafter
        maxSpellLevel = Math.min(9, Math.ceil(level / 2));
        if (level >= 17) maxSpellLevel = 9;
        else if (level >= 15) maxSpellLevel = 8;
        else if (level >= 13) maxSpellLevel = 7;
        else if (level >= 11) maxSpellLevel = 6;
        else if (level >= 9) maxSpellLevel = 5;
        else if (level >= 7) maxSpellLevel = 4;
        else if (level >= 5) maxSpellLevel = 3;
        else if (level >= 3) maxSpellLevel = 2;
        else maxSpellLevel = 1;
    } else if (spellcasting.type === 'half') {
        // Half casters: get spells at level 2, maxes at 5th level spells
        if (level < 2) maxSpellLevel = 0;
        else if (level < 5) maxSpellLevel = 1;
        else if (level < 9) maxSpellLevel = 2;
        else if (level < 13) maxSpellLevel = 3;
        else if (level < 17) maxSpellLevel = 4;
        else maxSpellLevel = 5;
    } else if (spellcasting.type === 'pact') {
        // Warlocks: unique progression
        if (level < 3) maxSpellLevel = 1;
        else if (level < 5) maxSpellLevel = 2;
        else if (level < 7) maxSpellLevel = 3;
        else if (level < 9) maxSpellLevel = 4;
        else maxSpellLevel = 5;
    }
    
    // Get spell progression for this class/level to determine limits
    const stats = calculateStatsForLevel(character, level);
    const spellProgression = stats.spellProgression || { cantrips: 0, spellsKnown: null, maxSpellLevel: 0 };
    
    // Store state
    editSpellsState = {
        cantrips: [...(parsed.cantrips || [])],
        spells: {},
        characterClass: className,
        maxSpellLevel,
        characterLevel: level,
        cantripsAllowed: spellProgression.cantrips || 0,
        spellsAllowed: spellProgression.spellsKnown, // null for prepared casters (unlimited)
    };
    
    // Parse existing spells by level from spellsKnown
    const existingSpells = parsed.spellsKnown || [];
    for (const spellName of existingSpells) {
        // Try to find the spell in database to get its level
        if (window.SPELL_DATABASE) {
            const spellInfo = window.SPELL_DATABASE.getSpellByName(spellName);
            if (spellInfo && spellInfo.level > 0) {
                if (!editSpellsState.spells[spellInfo.level]) {
                    editSpellsState.spells[spellInfo.level] = [];
                }
                editSpellsState.spells[spellInfo.level].push(spellName);
            }
        }
    }
    
    // Show/hide cantrips row based on class capability
    const cantripsRow = document.getElementById('spellEditCantripsRow');
    if (cantripsRow) {
        cantripsRow.classList.toggle('is-hidden', !spellcasting.cantrips);
    }
    
    // Show/hide spell level rows based on max spell level
    for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
        const row = document.getElementById(`spellEditLevel${spellLevel}Row`);
        if (row) {
            row.classList.toggle('is-hidden', spellLevel > maxSpellLevel || maxSpellLevel === 0);
        }
    }
    
    // Render spell tags
    renderSpellTags();
}

/**
 * Update the spell limits summary display in the edit modal
 */
function updateSpellLimitsSummary() {
    const summaryEl = document.getElementById('spellLimitsSummary');
    if (!summaryEl) return;
    
    const parts = [];
    
    // Cantrips count
    const currentCantrips = editSpellsState.cantrips.length;
    const maxCantrips = editSpellsState.cantripsAllowed;
    const cantripsOver = maxCantrips > 0 ? Math.max(0, currentCantrips - maxCantrips) : 0;
    
    if (maxCantrips > 0) {
        const prefix = cantripsOver > 0 ? '⚠ ' : '';
        parts.push(`${prefix}Cantrips: ${currentCantrips}/${maxCantrips}`);
    }
    
    // Spells count (only for known casters)
    const currentSpells = Object.values(editSpellsState.spells).flat().length;
    const maxSpells = editSpellsState.spellsAllowed;
    const spellsOver = maxSpells !== null ? Math.max(0, currentSpells - maxSpells) : 0;
    
    if (maxSpells !== null) {
        const prefix = spellsOver > 0 ? '⚠ ' : '';
        parts.push(`${prefix}Spells: ${currentSpells}/${maxSpells}`);
    } else if (editSpellsState.characterClass) {
        // Prepared casters - show current count only
        parts.push('Spells: ' + currentSpells + ' (no limit)');
    }
    
    summaryEl.textContent = parts.join(' · ');
    
    // Add over-limit class if over limit
    const overLimit = cantripsOver > 0 || spellsOver > 0;
    const atLimit = !overLimit && ((maxCantrips > 0 && currentCantrips >= maxCantrips) || 
                   (maxSpells !== null && currentSpells >= maxSpells));
    summaryEl.classList.toggle('at-limit', atLimit);
    summaryEl.classList.toggle('over-limit', overLimit);
}

/**
 * Render spell tags in the edit modal
 */
function renderSpellTags() {
    // Render cantrips
    const cantripsContainer = document.getElementById('editCantrips');
    if (cantripsContainer) {
        renderSpellTagsInContainer(cantripsContainer, editSpellsState.cantrips, 'cantrips');
    }
    
    // Render spells by level
    for (let level = 1; level <= 9; level++) {
        const container = document.getElementById(`editSpells${level}`);
        if (container) {
            const spells = editSpellsState.spells[level] || [];
            renderSpellTagsInContainer(container, spells, level);
        }
    }
    
    // Update the limits summary
    updateSpellLimitsSummary();
}

/**
 * Render spell tags in a specific container
 */
function renderSpellTagsInContainer(container, spells, level) {
    // Generate add button label
    const addLabel = level === 'cantrips' ? '+ Add' : '+ Add';
    const levelArg = level === 'cantrips' ? "'cantrips'" : level;
    
    // Build spell tags HTML
    const spellTagsHtml = spells.map(spellName => `
        <span class="spell-tag">
            ${Utils.escapeHtml(spellName)}
            <span class="spell-tag-remove" onclick="removeSpellFromEdit('${Utils.escapeHtml(spellName.replace(/'/g, "\\'"))}', '${level}')">&times;</span>
        </span>
    `).join('');
    
    // Add button is always at the end
    const addButtonHtml = `<button type="button" class="spell-add-btn-inline" onclick="openSpellPickerForEdit(${levelArg})">${addLabel}</button>`;
    
    container.innerHTML = spellTagsHtml + addButtonHtml;
}

/**
 * Remove a spell from the edit list
 */
function removeSpellFromEdit(spellName, level) {
    if (level === 'cantrips') {
        editSpellsState.cantrips = editSpellsState.cantrips.filter(s => s !== spellName);
    } else {
        const levelNum = parseInt(level, 10);
        if (editSpellsState.spells[levelNum]) {
            editSpellsState.spells[levelNum] = editSpellsState.spells[levelNum].filter(s => s !== spellName);
        }
    }
    
    renderSpellTags();
    
    // Mark form as dirty
    ModalManager.markDirty('editDetailsModal');
}

// Store original edit modal content for back navigation
let editModalOriginalContent = null;
// Store form values before spell picker opens (since innerHTML doesn't capture input .value)
let editModalFormValues = null;

/**
 * Capture current form values from edit modal
 */
function captureEditFormValues() {
    const form = document.getElementById('editDetailsModal');
    if (!form) return null;
    
    const values = {};
    form.querySelectorAll('input, textarea, select').forEach(el => {
        if (el.id) {
            values[el.id] = el.value;
        }
    });
    return values;
}

/**
 * Restore form values to edit modal
 */
function restoreEditFormValues(values) {
    if (!values) return;
    
    Object.entries(values).forEach(([id, value]) => {
        const el = document.getElementById(id);
        if (el) {
            el.value = value;
        }
    });
}

/**
 * Open spell picker for edit modal - transforms the edit modal into spell picker view
 */
function openSpellPickerForEdit(level) {
    const editModal = document.getElementById('editDetailsModal');
    if (!editModal) return;
    
    const modalContent = editModal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Capture form values before storing HTML (input .value isn't in innerHTML)
    editModalFormValues = captureEditFormValues();
    
    // Store original content for back navigation
    editModalOriginalContent = modalContent.innerHTML;
    
    // Get existing spells for this level
    let existingSpells;
    if (level === 'cantrips') {
        existingSpells = editSpellsState.cantrips;
    } else {
        existingSpells = editSpellsState.spells[level] || [];
    }
    
    // Calculate how many more spells can be selected
    let maxSelections = null;
    if (level === 'cantrips') {
        // For cantrips: limit is cantripsAllowed - current cantrips
        if (editSpellsState.cantripsAllowed > 0) {
            const currentCantripCount = editSpellsState.cantrips.length;
            maxSelections = Math.max(0, editSpellsState.cantripsAllowed - currentCantripCount);
        }
    } else {
        // For regular spells: limit is spellsAllowed - total current spells across all levels
        // null means unlimited (prepared casters)
        if (editSpellsState.spellsAllowed !== null) {
            const totalCurrentSpells = Object.values(editSpellsState.spells).flat().length;
            maxSelections = Math.max(0, editSpellsState.spellsAllowed - totalCurrentSpells);
        }
    }
    
    // Normalize existing spells and pre-select them
    const normalizedExisting = existingSpells.map(s => (typeof s === 'string' ? s : s.name || s.id).toLowerCase());
    
    // Pre-select existing spells so user can manage them
    const preSelected = new Set();
    const spellLevel = level === 'cantrips' ? 0 : parseInt(level, 10);
    const allSpells = window.SPELL_DATABASE?.getSpellsByLevel(spellLevel) || [];
    for (const spell of allSpells) {
        if (normalizedExisting.includes(spell.name.toLowerCase()) || normalizedExisting.includes(spell.id)) {
            preSelected.add(spell.id);
        }
    }
    
    // Set up spell picker state
    spellPickerState = {
        isOpen: true,
        mode: level,
        characterClass: editSpellsState.characterClass?.toLowerCase(),
        maxSpellLevel: editSpellsState.maxSpellLevel,
        selectedSpells: preSelected,
        existingSpells: normalizedExisting,
        originalSelection: new Set(preSelected), // Track what was originally selected
        onConfirm: null, // Handled inline
        inlineMode: true,
        targetLevel: level,
        maxSelections: null, // Allow free management, no limit
    };
    
    // Generate spell picker HTML
    const className = editSpellsState.characterClass ? 
        editSpellsState.characterClass.charAt(0).toUpperCase() + editSpellsState.characterClass.slice(1) : '';
    
    // Build title text: "Level 1 Wizard spells" or "Wizard cantrips"
    let titleText;
    if (level === 'cantrips' || level === 0) {
        titleText = className ? className + ' cantrips' : 'Cantrips';
    } else {
        titleText = 'Level ' + level + (className ? ' ' + className : '') + ' spells';
    }
    
    // Build count text (remaining slots)
    const countText = maxSelections !== null ? maxSelections + ' remaining slot' + (maxSelections === 1 ? '' : 's') : '';
    
    // Reset school filter
    currentSpellSchoolFilter = '';
    
    // Show loading state first (yellow cube spinner)
    const loadingHtml = `
        <div class="modal-header modal-header-left">
            <h2 class="modal-title">${titleText}</h2>
            <button class="modal-close" onclick="ModalManager.requestClose('editDetailsModal')">&times;</button>
        </div>
        <div class="modal-body spell-picker-loading">
            <div class="panel-loading-cube-container">
                <div class="panel-loading-cube">
                    <i></i><i></i><i></i><i></i><i></i><i></i>
                </div>
            </div>
            <p class="panel-loading-text">Loading spells...</p>
        </div>
    `;
    
    // Animate to loading state
    animateModalContentSwap(modalContent, loadingHtml, () => {
        // Generate spell list content while loading is shown
        const spellListHtml = generateInlineSpellListHtml();
        
        // Build the final spell picker HTML with pre-rendered list
        const spellPickerHtml = `
            <div class="modal-header modal-header-left">
                <h2 class="modal-title">${titleText}</h2>
                <button class="modal-close" onclick="ModalManager.requestClose('editDetailsModal')">&times;</button>
            </div>
            <div class="modal-body">
                <div class="spell-picker-info${maxSelections === 0 ? ' at-limit' : ''}">
                    <span class="spell-picker-info-text">Select spells</span>
                    <span class="spell-picker-selected-count" id="inlineSpellCount">${countText}</span>
                </div>
                <div class="spell-picker-filters">
                    <input type="text" id="inlineSpellSearch" class="terminal-input" placeholder="Search spells..." oninput="filterInlineSpellPicker()">
                    <div class="selector-shell selector-shell--listbox" id="spellSchoolSelector">
                        <button type="button" 
                                class="terminal-btn-small selector-trigger" 
                                id="spellSchoolTrigger"
                                aria-haspopup="listbox"
                                aria-expanded="false"
                                onclick="CharacterSheet.toggleSelectorMenu(this)">
                            <span class="selector-trigger-label">All Schools</span>
                        </button>
                        <div class="selector-menu" id="spellSchoolMenu" role="listbox">
                            <button class="selector-option is-selected" role="option" data-value="" onclick="selectSpellSchool('')">All Schools</button>
                            <button class="selector-option" role="option" data-value="Abjuration" onclick="selectSpellSchool('Abjuration')">Abjuration</button>
                            <button class="selector-option" role="option" data-value="Conjuration" onclick="selectSpellSchool('Conjuration')">Conjuration</button>
                            <button class="selector-option" role="option" data-value="Divination" onclick="selectSpellSchool('Divination')">Divination</button>
                            <button class="selector-option" role="option" data-value="Enchantment" onclick="selectSpellSchool('Enchantment')">Enchantment</button>
                            <button class="selector-option" role="option" data-value="Evocation" onclick="selectSpellSchool('Evocation')">Evocation</button>
                            <button class="selector-option" role="option" data-value="Illusion" onclick="selectSpellSchool('Illusion')">Illusion</button>
                            <button class="selector-option" role="option" data-value="Necromancy" onclick="selectSpellSchool('Necromancy')">Necromancy</button>
                            <button class="selector-option" role="option" data-value="Transmutation" onclick="selectSpellSchool('Transmutation')">Transmutation</button>
                        </div>
                    </div>
                </div>
                <div class="spell-picker-list" id="inlineSpellList">
                    ${spellListHtml}
                </div>
            </div>
            <div class="modal-footer modal-footer-end">
                <button class="terminal-btn" onclick="closeInlineSpellPicker()">← BACK</button>
                <button class="terminal-btn terminal-btn-primary" onclick="confirmInlineSpellSelection()">CONFIRM</button>
            </div>
        `;
        
        // Small delay to ensure loading state is visible, then swap to populated content
        setTimeout(() => {
            animateModalContentSwap(modalContent, spellPickerHtml, () => {
                // Update spell count display
                updateInlineSpellCount();
                
                // Focus search input
                setTimeout(() => {
                    const searchInput = document.getElementById('inlineSpellSearch');
                    if (searchInput) searchInput.focus();
                }, 50);
            });
        }, 150);
    });
}

/**
 * Generate the spell list HTML without rendering to DOM
 * Used to pre-generate content before transition
 */
function generateInlineSpellListHtml() {
    if (!window.SPELL_DATABASE) return '<div class="spell-picker-empty">Spell database not available.</div>';
    
    const searchQuery = '';
    const schoolFilter = currentSpellSchoolFilter;
    
    // Get level (0 for cantrips)
    const level = spellPickerState.mode === 'cantrips' ? 0 : parseInt(spellPickerState.mode, 10);
    
    // Get spells for this level
    let spells = window.SPELL_DATABASE.getSpellsByLevel(level) || [];
    
    // Filter by class if specified
    if (spellPickerState.characterClass) {
        spells = spells.filter(spell => 
            spell.classes.includes(spellPickerState.characterClass)
        );
    }
    
    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        spells = spells.filter(spell => 
            spell.name.toLowerCase().includes(query) ||
            spell.school.toLowerCase().includes(query) ||
            spell.description.toLowerCase().includes(query)
        );
    }
    
    // Filter by school
    if (schoolFilter) {
        spells = spells.filter(spell => spell.school === schoolFilter);
    }
    
    // Sort alphabetically
    spells.sort((a, b) => a.name.localeCompare(b.name));
    
    if (spells.length === 0) {
        return '<div class="spell-picker-empty">No spells found matching your criteria.</div>';
    }
    
    // Generate HTML for each spell
    return spells.map(spell => {
        const isSelected = spellPickerState.selectedSpells.has(spell.id);
        const wasOriginallySelected = spellPickerState.originalSelection?.has(spell.id);
        
        const classes = ['spell-picker-item'];
        if (isSelected) classes.push('is-selected');
        if (wasOriginallySelected) classes.push('is-existing');
        
        return `
            <div class="${classes.join(' ')}" data-spell-id="${Utils.escapeHtml(spell.id)}" onclick="toggleInlineSpellSelection('${Utils.escapeHtml(spell.id)}')">
                <input type="checkbox" class="spell-picker-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="spell-picker-item-content">
                    <div class="spell-picker-item-header">
                        <span class="spell-picker-item-name">${Utils.escapeHtml(spell.name)}${wasOriginallySelected ? ' <span class="spell-existing-badge">current</span>' : ''}</span>
                        <span class="spell-picker-item-school">${Utils.escapeHtml(spell.school)}</span>
                    </div>
                    <div class="spell-picker-item-meta">
                        ${Utils.escapeHtml(spell.castingTime)} · ${Utils.escapeHtml(spell.range)} · ${Utils.escapeHtml(spell.components)}
                    </div>
                    <div class="spell-picker-item-desc">${Utils.escapeHtml(spell.description)}</div>
                </div>
            </div>
        `;
    }).join('');
}

// Track current spell school filter selection
let currentSpellSchoolFilter = '';

/**
 * Select a spell school from the dropdown
 */
function selectSpellSchool(value) {
    currentSpellSchoolFilter = value;
    
    const trigger = document.getElementById('spellSchoolTrigger');
    const menu = document.getElementById('spellSchoolMenu');
    
    if (trigger) {
        const label = trigger.querySelector('.selector-trigger-label');
        if (label) {
            label.textContent = value || 'All Schools';
        }
    }
    
    // Update selected state on options
    if (menu) {
        menu.querySelectorAll('.selector-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.dataset.value === value);
        });
    }
    
    // Menu is closed automatically by CharacterSheet global option handler
    
    // Re-render the spell list
    filterInlineSpellPicker();
}

// Make selector functions globally available
window.selectSpellSchool = selectSpellSchool;

/**
 * Render the inline spell picker list
 */
function renderInlineSpellPicker() {
    const listEl = document.getElementById('inlineSpellList');
    if (!listEl || !window.SPELL_DATABASE) return;
    
    const searchQuery = document.getElementById('inlineSpellSearch')?.value || '';
    const schoolFilter = currentSpellSchoolFilter;
    
    // Get level (0 for cantrips)
    const level = spellPickerState.mode === 'cantrips' ? 0 : parseInt(spellPickerState.mode, 10);
    
    // Get spells for this level
    let spells = window.SPELL_DATABASE.getSpellsByLevel(level) || [];
    
    // Filter by class if specified
    if (spellPickerState.characterClass) {
        spells = spells.filter(spell => 
            spell.classes.includes(spellPickerState.characterClass)
        );
    }
    
    // Filter by search query
    if (searchQuery) {
        const query = searchQuery.toLowerCase();
        spells = spells.filter(spell =>
            spell.name.toLowerCase().includes(query) ||
            spell.description.toLowerCase().includes(query) ||
            spell.school.toLowerCase().includes(query)
        );
    }
    
    // Filter by school
    if (schoolFilter) {
        spells = spells.filter(spell => spell.school === schoolFilter);
    }
    
    // Sort alphabetically
    spells.sort((a, b) => a.name.localeCompare(b.name));
    
    if (spells.length === 0) {
        listEl.innerHTML = '<div class="spell-picker-empty">No spells found matching your criteria.</div>';
        return;
    }
    
    // Render spell items
    listEl.innerHTML = spells.map(spell => {
        const isSelected = spellPickerState.selectedSpells.has(spell.id);
        const wasOriginallySelected = spellPickerState.originalSelection?.has(spell.id);
        
        const classes = ['spell-picker-item'];
        if (isSelected) classes.push('is-selected');
        if (wasOriginallySelected) classes.push('is-existing');
        
        return `
            <div class="${classes.join(' ')}" data-spell-id="${Utils.escapeHtml(spell.id)}" onclick="toggleInlineSpellSelection('${Utils.escapeHtml(spell.id)}')">
                <input type="checkbox" class="spell-picker-checkbox" ${isSelected ? 'checked' : ''}>
                <div class="spell-picker-item-content">
                    <div class="spell-picker-item-header">
                        <span class="spell-picker-item-name">${Utils.escapeHtml(spell.name)}${wasOriginallySelected ? ' <span class="spell-existing-badge">current</span>' : ''}</span>
                        <span class="spell-picker-item-school">${Utils.escapeHtml(spell.school)}</span>
                    </div>
                    <div class="spell-picker-item-meta">
                        ${Utils.escapeHtml(spell.castingTime)} · ${Utils.escapeHtml(spell.range)} · ${Utils.escapeHtml(spell.components)}
                    </div>
                    <div class="spell-picker-item-desc">${Utils.escapeHtml(spell.description)}</div>
                </div>
            </div>
        `;
    }).join('');
}

/**
 * Filter inline spell picker
 */
function filterInlineSpellPicker() {
    renderInlineSpellPicker();
}

/**
 * Toggle spell selection in inline picker
 */
function toggleInlineSpellSelection(spellId) {
    if (spellPickerState.selectedSpells.has(spellId)) {
        spellPickerState.selectedSpells.delete(spellId);
    } else {
        // Check if we've reached the selection limit
        if (spellPickerState.maxSelections !== null && 
            spellPickerState.selectedSpells.size >= spellPickerState.maxSelections) {
            showNotification(`You can only select ${spellPickerState.maxSelections} spell${spellPickerState.maxSelections === 1 ? '' : 's'}`, 'warning');
            return;
        }
        spellPickerState.selectedSpells.add(spellId);
    }
    
    // Update UI
    const item = document.querySelector(`.spell-picker-item[data-spell-id="${spellId}"]`);
    if (item) {
        item.classList.toggle('is-selected', spellPickerState.selectedSpells.has(spellId));
        const checkbox = item.querySelector('.spell-picker-checkbox');
        if (checkbox) checkbox.checked = spellPickerState.selectedSpells.has(spellId);
    }
    
    updateInlineSpellCount();
}

/**
 * Update inline spell picker count
 */
function updateInlineSpellCount() {
    const countEl = document.getElementById('inlineSpellCount');
    const infoEl = document.querySelector('.spell-picker-info');
    if (!countEl) return;
    
    const count = spellPickerState.selectedSpells.size;
    const level = spellPickerState.targetLevel;
    
    // Calculate limit based on level type
    let maxAllowed = null;
    let currentTotal = count;
    
    if (level === 'cantrips') {
        maxAllowed = editSpellsState.cantripsAllowed;
    } else {
        // For leveled spells, count includes other levels too
        maxAllowed = editSpellsState.spellsAllowed;
        if (maxAllowed !== null) {
            const currentLevelNum = typeof level === 'string' ? parseInt(level, 10) : level;
            currentTotal = count;
            // Add spells from other levels
            for (const [lvl, spells] of Object.entries(editSpellsState.spells)) {
                if (parseInt(lvl, 10) !== currentLevelNum) {
                    currentTotal += spells.length;
                }
            }
        }
    }
    
    if (maxAllowed !== null && maxAllowed > 0) {
        const remaining = maxAllowed - currentTotal;
        const isOver = remaining < 0;
        const isAtLimit = remaining === 0;
        
        // Simple display: x/y with warning glyph if over
        const prefix = isOver ? '⚠ ' : '';
        countEl.textContent = `${prefix}${currentTotal}/${maxAllowed}`;
        
        countEl.classList.toggle('at-limit', isAtLimit);
        countEl.classList.toggle('over-limit', isOver);
        if (infoEl) {
            infoEl.classList.toggle('at-limit', isAtLimit);
            infoEl.classList.toggle('over-limit', isOver);
        }
    } else {
        countEl.textContent = `${count} selected`;
        countEl.classList.remove('at-limit', 'over-limit');
        if (infoEl) {
            infoEl.classList.remove('at-limit', 'over-limit');
        }
    }
}

/**
 * Close inline spell picker and return to edit form
 */
function closeInlineSpellPicker() {
    const editModal = document.getElementById('editDetailsModal');
    if (!editModal || !editModalOriginalContent) return;
    
    const modalContent = editModal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Animate back to original content
    animateModalContentSwap(modalContent, editModalOriginalContent, () => {
        // Restore form values (input .value isn't preserved in innerHTML)
        restoreEditFormValues(editModalFormValues);
        
        // Re-render spell tags to reflect any previous changes
        renderSpellTags();
        
        // Update spell limits summary
        updateSpellLimitsSummary();
        
        // Clear state
        spellPickerState.isOpen = false;
        spellPickerState.selectedSpells.clear();
        editModalOriginalContent = null;
        editModalFormValues = null;
    });
}

/**
 * Confirm inline spell selection and return to edit form
 */
function confirmInlineSpellSelection() {
    const level = spellPickerState.targetLevel;
    
    // Get full spell objects for selected spells
    const spellLevel = level === 'cantrips' ? 0 : parseInt(level, 10);
    const allSpells = window.SPELL_DATABASE.getSpellsByLevel(spellLevel) || [];
    const selectedSpells = allSpells.filter(spell => 
        spellPickerState.selectedSpells.has(spell.id)
    );
    
    // Check if over limit - show modal if so
    const validation = validateSpellSelection(level, selectedSpells);
    if (!validation.valid) {
        showSpellLimitModal(validation, level);
        return;
    }
    
    // Replace spells for this level entirely (allows removal as well as addition)
    if (level === 'cantrips') {
        editSpellsState.cantrips = selectedSpells.map(s => s.name);
    } else {
        const levelNum = typeof level === 'string' ? parseInt(level, 10) : level;
        editSpellsState.spells[levelNum] = selectedSpells.map(s => s.name);
    }
    
    // Mark form as dirty
    ModalManager.markDirty('editDetailsModal');
    
    // Animate back to original content
    const editModal = document.getElementById('editDetailsModal');
    if (!editModal || !editModalOriginalContent) return;
    
    const modalContent = editModal.querySelector('.modal-content');
    if (!modalContent) return;
    
    animateModalContentSwap(modalContent, editModalOriginalContent, () => {
        // Restore form values (input .value isn't preserved in innerHTML)
        restoreEditFormValues(editModalFormValues);
        
        // Re-render spell tags to show newly added spells
        renderSpellTags();
        
        // Update spell limits summary
        updateSpellLimitsSummary();
        
        // Scroll to Spellcasting section
        const spellSection = document.getElementById('spellEditSection');
        if (spellSection) {
            spellSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
        
        showNotification(`Added ${selectedSpells.length} spell${selectedSpells.length > 1 ? 's' : ''}!`);
        
        // Clear state
        spellPickerState.isOpen = false;
        spellPickerState.selectedSpells.clear();
        editModalOriginalContent = null;
        editModalFormValues = null;
    });
}

/**
 * Get the current spell selections from edit state
 */
function getEditSpells() {
    return {
        cantrips: [...editSpellsState.cantrips],
        spellsKnown: Object.values(editSpellsState.spells).flat(),
        spellsByLevel: { ...editSpellsState.spells },
    };
}

/**
 * Check if a character needs to select new spells after leveling up,
 * or remove excess spells after leveling down
 * @param {object} character - The character object
 * @param {number} oldLevel - Previous level
 * @param {number} newLevel - New level
 */
async function checkAndPromptForNewSpells(character, oldLevel, newLevel) {
    const className = (character.class || '').toLowerCase();
    const spellcasting = SPELLCASTING_CLASSES[className];
    
    // Only prompt for spellcasting classes
    if (!spellcasting) return;
    
    // Calculate what spells the character should have at each level
    const stats = calculateStatsForLevel(character, newLevel);
    if (!stats.spellProgression) return;
    
    const { cantrips: cantripsKnown, spellsKnown, maxSpellLevel } = stats.spellProgression;
    
    // Get current spell counts
    const currentCantrips = character.cantrips || [];
    const currentSpells = character.spellsKnown || [];
    
    // Calculate deficits (need more spells)
    const cantripDeficit = Math.max(0, cantripsKnown - currentCantrips.length);
    const spellDeficit = Math.max(0, (spellsKnown || 0) - currentSpells.length);
    
    // Calculate surpluses (have too many spells) - only for "known" casters, not prepared
    const cantripSurplus = Math.max(0, currentCantrips.length - cantripsKnown);
    const spellSurplus = spellsKnown !== null ? Math.max(0, currentSpells.length - spellsKnown) : 0;
    
    // Check for spells that are too high level for current max
    const tooHighLevelSpells = [];
    if (window.SPELL_DATABASE && maxSpellLevel > 0) {
        for (const spellName of currentSpells) {
            const spellInfo = window.SPELL_DATABASE.getSpellByName(spellName);
            if (spellInfo && spellInfo.level > maxSpellLevel) {
                tooHighLevelSpells.push({ name: spellName, level: spellInfo.level });
            }
        }
    }
    
    // If character has excess spells or spells too high level, prompt for removal
    if (cantripSurplus > 0 || spellSurplus > 0 || tooHighLevelSpells.length > 0) {
        showSpellRemovalPrompt(character, {
            cantripSurplus,
            spellSurplus,
            cantripsKnown,
            spellsKnown,
            maxSpellLevel,
            currentCantrips,
            currentSpells,
            tooHighLevelSpells,
        });
    }
    // If character needs more cantrips or spells, prompt them
    else if (cantripDeficit > 0 || spellDeficit > 0) {
        showSpellLevelUpPrompt(character, {
            cantripDeficit,
            spellDeficit,
            cantripsKnown,
            spellsKnown,
            maxSpellLevel,
            currentCantrips,
            currentSpells,
        });
    }
}

/**
 * Show a prompt for selecting new spells after level up
 */
function showSpellLevelUpPrompt(character, spellInfo) {
    const { cantripDeficit, spellDeficit, cantripsKnown, spellsKnown, maxSpellLevel, currentCantrips, currentSpells } = spellInfo;
    const className = (character.class || '').toLowerCase();
    
    // Build prompt message
    // Note: Use ${' '} to preserve spaces after interpolations (rjsmin strips them)
    let message = `As a Level ${character.level}${' '}${character.class}, you can know:\n`;
    if (cantripsKnown > 0) {
        message += `• ${cantripsKnown}${' '}cantrips (you have ${currentCantrips.length})\n`;
    }
    if (spellsKnown > 0) {
        message += `• ${spellsKnown}${' '}spells (you have ${currentSpells.length})\n`;
    }
    
    if (cantripDeficit > 0 || spellDeficit > 0) {
        message += '\n';
        if (cantripDeficit > 0) {
            message += `You can select ${cantripDeficit}${' '}more cantrip${cantripDeficit > 1 ? 's' : ''}.\n`;
        }
        if (spellDeficit > 0) {
            message += `You can select ${spellDeficit}${' '}more spell${spellDeficit > 1 ? 's' : ''}.`;
        }
    }
    
    // Create a simple alert with action options
    const modalHost = getManagerModalHost();
    const existingModal = document.getElementById('spellLevelUpModal');
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="spellLevelUpModal" class="modal show">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">NEW SPELLS AVAILABLE</h2>
                    <button class="modal-close" onclick="closeSpellLevelUpPrompt()">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="terminal-text" style="white-space: pre-line;">${Utils.escapeHtml(message)}</p>
                </div>
                <div class="modal-footer" style="gap: 0.5rem;">
                    <button class="terminal-btn terminal-btn-secondary" onclick="closeSpellLevelUpPrompt()">Later</button>
                    <button class="terminal-btn terminal-btn-secondary" onclick="closeSpellLevelUpPrompt(); openSpellEditModal('${character.id}')">Select spells</button>
                </div>
            </div>
        </div>
    `;
    
    modalHost.insertAdjacentHTML('beforeend', modalHtml);
}

/**
 * Close the spell level up prompt
 */
function closeSpellLevelUpPrompt() {
    const modal = document.getElementById('spellLevelUpModal');
    if (modal) {
        animateModalClose(modal, { removeOnClose: true });
    }
}

// ========================================
// DEDICATED SPELL EDIT MODAL
// ========================================

// Track state for the dedicated spell edit modal
let spellEditModalState = {
    characterId: null,
    cantrips: [],
    spells: {},
    characterClass: null,
    maxSpellLevel: 0,
    characterLevel: 1,
    cantripsAllowed: 0,
    spellsAllowed: null,
};

// Store original content for spell picker back navigation
let spellEditModalOriginalContent = null;
let spellEditModalFormValues = null;

/**
 * Open the dedicated spell edit modal
 */
async function openSpellEditModal(characterId) {
    const character = await CharacterStorage.getById(characterId);
    if (!character) return;
    
    const className = (character.class || '').toLowerCase();
    const spellcasting = SPELLCASTING_CLASSES[className];
    
    // Only allow for spellcasting classes
    if (!spellcasting) {
        showNotification('This character is not a spellcaster', 'error');
        return;
    }
    
    // Parse character data
    const parsed = CharacterSheet._parseCharacterData(character);
    const level = parsed.level || character.level || 1;
    
    // Calculate max spell level based on character level
    let maxSpellLevel = 0;
    if (spellcasting.type === 'full') {
        if (level >= 17) maxSpellLevel = 9;
        else if (level >= 15) maxSpellLevel = 8;
        else if (level >= 13) maxSpellLevel = 7;
        else if (level >= 11) maxSpellLevel = 6;
        else if (level >= 9) maxSpellLevel = 5;
        else if (level >= 7) maxSpellLevel = 4;
        else if (level >= 5) maxSpellLevel = 3;
        else if (level >= 3) maxSpellLevel = 2;
        else maxSpellLevel = 1;
    } else if (spellcasting.type === 'half') {
        if (level < 2) maxSpellLevel = 0;
        else if (level < 5) maxSpellLevel = 1;
        else if (level < 9) maxSpellLevel = 2;
        else if (level < 13) maxSpellLevel = 3;
        else if (level < 17) maxSpellLevel = 4;
        else maxSpellLevel = 5;
    } else if (spellcasting.type === 'pact') {
        if (level < 3) maxSpellLevel = 1;
        else if (level < 5) maxSpellLevel = 2;
        else if (level < 7) maxSpellLevel = 3;
        else if (level < 9) maxSpellLevel = 4;
        else maxSpellLevel = 5;
    }
    
    // Get spell progression for this class/level
    const stats = calculateStatsForLevel(character, level);
    const spellProgression = stats.spellProgression || { cantrips: 0, spellsKnown: null, maxSpellLevel: 0 };
    
    // Initialize state
    spellEditModalState = {
        characterId,
        cantrips: [...(parsed.cantrips || [])],
        spells: {},
        characterClass: className,
        maxSpellLevel,
        characterLevel: level,
        cantripsAllowed: spellProgression.cantrips || 0,
        spellsAllowed: spellProgression.spellsKnown,
    };
    
    // Parse existing spells by level
    const existingSpells = parsed.spellsKnown || [];
    for (const spellName of existingSpells) {
        if (window.SPELL_DATABASE) {
            const spellInfo = window.SPELL_DATABASE.getSpellByName(spellName);
            if (spellInfo && spellInfo.level > 0) {
                if (!spellEditModalState.spells[spellInfo.level]) {
                    spellEditModalState.spells[spellInfo.level] = [];
                }
                spellEditModalState.spells[spellInfo.level].push(spellName);
            }
        }
    }
    
    // Show/hide cantrips row
    const cantripsRow = document.getElementById('spellEditModalCantripsRow');
    if (cantripsRow) {
        cantripsRow.classList.toggle('is-hidden', !spellcasting.cantrips);
    }
    
    // Show/hide spell level rows
    for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
        const row = document.getElementById(`spellEditModalLevel${spellLevel}Row`);
        if (row) {
            row.classList.toggle('is-hidden', spellLevel > maxSpellLevel || maxSpellLevel === 0);
        }
    }
    
    // Render spell tags
    renderSpellEditModalTags();
    
    // Show the modal
    const modal = document.getElementById('spellEditModal');
    if (modal) {
        modal.classList.add('show');
        setTimeout(() => ModalManager.snapshotForm('spellEditModal'), 50);
    }
}

/**
 * Close the spell edit modal
 */
function closeSpellEditModal() {
    const modal = document.getElementById('spellEditModal');
    if (!modal) {
        spellEditModalState.characterId = null;
        return;
    }
    
    // Hide loading overlay
    const loadingOverlay = document.getElementById('spellEditLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.remove('is-visible');
    }
    
    animateModalClose(modal, {
        removeOnClose: false,
        onClosed: () => {
            spellEditModalState.characterId = null;
        },
    });
}

/**
 * Save spells from the dedicated spell edit modal
 */
async function saveSpellEditModal() {
    if (!spellEditModalState.characterId) {
        closeSpellEditModal();
        return;
    }
    
    const character = await CharacterStorage.getById(spellEditModalState.characterId);
    if (!character) {
        closeSpellEditModal();
        return;
    }
    
    // Validate spell limits
    const validation = validateSpellEditModalLimits();
    if (!validation.valid) {
        showSpellLimitSaveModal(validation);
        return;
    }
    
    // Show loading overlay
    const loadingOverlay = document.getElementById('spellEditLoading');
    if (loadingOverlay) {
        loadingOverlay.classList.add('is-visible');
    }
    
    // Build updates
    const updates = {
        cantrips: [...spellEditModalState.cantrips],
        spellsKnown: Object.values(spellEditModalState.spells).flat(),
    };
    
    try {
        await CharacterStorage.update(spellEditModalState.characterId, updates);
        markUserChanges();
        await AppState.loadCharacters();
        UI.render();
        viewCharacter(spellEditModalState.characterId);
        showNotification('Spells updated');
        closeSpellEditModal();
    } catch (error) {
        console.error('Failed to save spells:', error);
        showNotification('Failed to save spells', 'error');
    } finally {
        if (loadingOverlay) {
            loadingOverlay.classList.remove('is-visible');
        }
    }
}

/**
 * Validate spell limits for the dedicated spell edit modal
 */
function validateSpellEditModalLimits() {
    const currentCantrips = spellEditModalState.cantrips.length;
    const maxCantrips = spellEditModalState.cantripsAllowed;
    const currentSpells = Object.values(spellEditModalState.spells).flat().length;
    const maxSpells = spellEditModalState.spellsAllowed;
    
    const issues = [];
    
    if (maxCantrips > 0 && currentCantrips > maxCantrips) {
        issues.push(`You have ${currentCantrips} cantrips but can only know ${maxCantrips}.`);
    }
    
    if (maxSpells !== null && currentSpells > maxSpells) {
        issues.push(`You have ${currentSpells} spells but can only know ${maxSpells}.`);
    }
    
    return {
        valid: issues.length === 0,
        issues,
        cantripsOver: maxCantrips > 0 ? Math.max(0, currentCantrips - maxCantrips) : 0,
        spellsOver: maxSpells !== null ? Math.max(0, currentSpells - maxSpells) : 0,
    };
}

/**
 * Update the spell limits summary in the dedicated spell edit modal
 */
function updateSpellEditModalLimitsSummary() {
    const summaryEl = document.getElementById('spellEditModalLimitsSummary');
    if (!summaryEl) return;
    
    const parts = [];
    
    const currentCantrips = spellEditModalState.cantrips.length;
    const maxCantrips = spellEditModalState.cantripsAllowed;
    const cantripsOver = maxCantrips > 0 ? Math.max(0, currentCantrips - maxCantrips) : 0;
    
    if (maxCantrips > 0) {
        const prefix = cantripsOver > 0 ? '⚠ ' : '';
        parts.push(`${prefix}Cantrips: ${currentCantrips}/${maxCantrips}`);
    }
    
    const currentSpells = Object.values(spellEditModalState.spells).flat().length;
    const maxSpells = spellEditModalState.spellsAllowed;
    const spellsOver = maxSpells !== null ? Math.max(0, currentSpells - maxSpells) : 0;
    
    if (maxSpells !== null) {
        const prefix = spellsOver > 0 ? '⚠ ' : '';
        parts.push(`${prefix}Spells: ${currentSpells}/${maxSpells}`);
    } else if (spellEditModalState.characterClass) {
        parts.push('Spells: ' + currentSpells + ' (no limit)');
    }
    
    summaryEl.textContent = parts.join(' · ');
    
    const overLimit = cantripsOver > 0 || spellsOver > 0;
    const atLimit = !overLimit && ((maxCantrips > 0 && currentCantrips >= maxCantrips) || 
                   (maxSpells !== null && currentSpells >= maxSpells));
    summaryEl.classList.toggle('at-limit', atLimit);
    summaryEl.classList.toggle('over-limit', overLimit);
}

/**
 * Render spell tags in the dedicated spell edit modal
 */
function renderSpellEditModalTags() {
    // Render cantrips
    const cantripsContainer = document.getElementById('spellEditModalCantrips');
    if (cantripsContainer) {
        renderSpellEditModalTagsInContainer(cantripsContainer, spellEditModalState.cantrips, 'cantrips');
    }
    
    // Render spells by level
    for (let level = 1; level <= 9; level++) {
        const container = document.getElementById(`spellEditModalSpells${level}`);
        if (container) {
            const spells = spellEditModalState.spells[level] || [];
            renderSpellEditModalTagsInContainer(container, spells, level);
        }
    }
    
    updateSpellEditModalLimitsSummary();
}

/**
 * Render spell tags in a container for the dedicated spell edit modal
 */
function renderSpellEditModalTagsInContainer(container, spells, level) {
    const levelArg = level === 'cantrips' ? "'cantrips'" : level;
    
    const spellTagsHtml = spells.map(spellName => {
        // Try to get spell description for tooltip
        let description = '';
        if (window.SPELL_DATABASE) {
            const spellInfo = window.SPELL_DATABASE.getSpellByName(spellName);
            if (spellInfo && spellInfo.description) {
                description = spellInfo.description;
            }
        }
        const escapedDesc = description ? Utils.escapeHtml(description) : '';
        const tooltipClass = escapedDesc ? ' has-tooltip' : '';
        const tooltipHtml = escapedDesc ? `<span class="custom-tooltip" data-position="top">${escapedDesc}</span>` : '';
        
        return `<span class="sheet-spell-tag spell-edit-tag${tooltipClass}">${Utils.escapeHtml(spellName)}${tooltipHtml}</span>`;
    }).join('');
    
    const editButtonHtml = `<button type="button" class="spell-add-btn-inline" onclick="openSpellPickerForSpellEditModal(${levelArg})">Edit</button>`;
    
    container.innerHTML = spellTagsHtml + editButtonHtml;
}

/**
 * Remove a spell from the dedicated spell edit modal
 */
function removeSpellFromSpellEditModal(spellName, level) {
    if (level === 'cantrips') {
        spellEditModalState.cantrips = spellEditModalState.cantrips.filter(s => s !== spellName);
    } else {
        const levelNum = parseInt(level, 10);
        if (spellEditModalState.spells[levelNum]) {
            spellEditModalState.spells[levelNum] = spellEditModalState.spells[levelNum].filter(s => s !== spellName);
        }
    }
    
    renderSpellEditModalTags();
    ModalManager.markDirty('spellEditModal');
}

/**
 * Open spell picker for the dedicated spell edit modal
 */
// Temporary state for spell picker selections (before save)
let spellPickerTempState = {
    level: null,
    originalSelections: [],
    currentSelections: [],
    maxAllowed: null,
    schoolFilter: '',
};

function openSpellPickerForSpellEditModal(level) {
    const modal = document.getElementById('spellEditModal');
    if (!modal) return;
    
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Store original content
    spellEditModalOriginalContent = modalContent.innerHTML;
    
    // Get current selections for this level
    const currentSelections = level === 'cantrips' 
        ? [...spellEditModalState.cantrips]
        : [...(spellEditModalState.spells[level] || [])];
    
    // Calculate max allowed
    let maxAllowed = null;
    if (level === 'cantrips') {
        maxAllowed = spellEditModalState.cantripsAllowed > 0 ? spellEditModalState.cantripsAllowed : null;
    } else {
        maxAllowed = spellEditModalState.spellsAllowed;
    }
    
    // Initialize temp state
    spellPickerTempState = {
        level,
        originalSelections: [...currentSelections],
        currentSelections: [...currentSelections],
        maxAllowed,
        schoolFilter: '',
    };
    
    // Determine title
    const levelLabel = level === 'cantrips' ? 'CANTRIPS' : 
        `${level === 1 ? '1ST' : level === 2 ? '2ND' : level === 3 ? '3RD' : level + 'TH'} LEVEL SPELLS`;
    const titleText = `SELECT ${levelLabel}`;
    
    // Show loading overlay on current content
    const currentInner = modalContent.querySelector('.modal-content-inner');
    if (currentInner) {
        // Add loading overlay to current content
        const loadingOverlay = document.createElement('div');
        loadingOverlay.className = 'spell-picker-transition-loader';
        loadingOverlay.innerHTML = `
            <div class="panel-loading-cube-container">
                <div class="panel-loading-cube">
                    <i></i><i></i><i></i><i></i><i></i><i></i>
                </div>
            </div>
        `;
        currentInner.appendChild(loadingOverlay);
        
        // Small delay to show loader, then load spells
        setTimeout(() => {
            loadingOverlay.classList.add('is-visible');
        }, 10);
    }
    
    // Load spells in background (allow UI to show loader)
    setTimeout(() => {
        const spells = getSpellsForPicker(spellEditModalState.characterClass, level);
        
        // Build the full content HTML
        const spellPickerHtml = `
            <div class="modal-content-inner slide-in-right">
                <div class="modal-header modal-header-left">
                    <h2 class="modal-title">${titleText}</h2>
                    <button class="modal-close" onclick="ModalManager.requestClose('spellEditModal')">&times;</button>
                </div>
                <div class="modal-body">
                    <div class="spell-picker-info" id="spellPickerInfoText">
                        ${getSpellPickerInfoText()}
                    </div>
                    <div class="spell-picker-filters">
                        <input type="text" id="spellEditModalSearchInput" class="terminal-input" placeholder="Search spells..." oninput="filterSpellEditModalPicker()">
                        <div class="selector-shell selector-shell--listbox" id="spellEditSchoolSelector">
                            <button type="button" 
                                    class="terminal-btn-small selector-trigger" 
                                    id="spellEditSchoolTrigger"
                                    aria-haspopup="listbox"
                                    aria-expanded="false"
                                    onclick="CharacterSheet.toggleSelectorMenu(this)">
                                <span class="selector-trigger-label">All Schools</span>
                            </button>
                            <div class="selector-menu" id="spellEditSchoolMenu" role="listbox">
                                <button class="selector-option is-selected" role="option" data-value="" onclick="selectSpellEditSchool('')">All Schools</button>
                                <button class="selector-option" role="option" data-value="Abjuration" onclick="selectSpellEditSchool('Abjuration')">Abjuration</button>
                                <button class="selector-option" role="option" data-value="Conjuration" onclick="selectSpellEditSchool('Conjuration')">Conjuration</button>
                                <button class="selector-option" role="option" data-value="Divination" onclick="selectSpellEditSchool('Divination')">Divination</button>
                                <button class="selector-option" role="option" data-value="Enchantment" onclick="selectSpellEditSchool('Enchantment')">Enchantment</button>
                                <button class="selector-option" role="option" data-value="Evocation" onclick="selectSpellEditSchool('Evocation')">Evocation</button>
                                <button class="selector-option" role="option" data-value="Illusion" onclick="selectSpellEditSchool('Illusion')">Illusion</button>
                                <button class="selector-option" role="option" data-value="Necromancy" onclick="selectSpellEditSchool('Necromancy')">Necromancy</button>
                                <button class="selector-option" role="option" data-value="Transmutation" onclick="selectSpellEditSchool('Transmutation')">Transmutation</button>
                            </div>
                        </div>
                    </div>
                    <div class="spell-picker-list" id="spellEditModalPickerList">
                        ${renderSpellPickerListWithState(spells, level)}
                    </div>
                </div>
                <div class="modal-footer modal-footer-end">
                    <button class="terminal-btn" onclick="cancelSpellEditModalPicker()">Cancel</button>
                    <button id="spellPickerSaveBtn" class="terminal-btn terminal-btn-primary" onclick="saveSpellEditModalPicker()">Done</button>
                </div>
            </div>
        `;
        
        // Now animate out and swap content
        if (currentInner) {
            currentInner.classList.add('slide-out-left');
        }
        
        // After collapse, show new content
        setTimeout(() => {
            modalContent.innerHTML = spellPickerHtml;
            
            // Focus search input after animation completes
            setTimeout(() => {
                const searchInput = document.getElementById('spellEditModalSearchInput');
                if (searchInput) searchInput.focus();
            }, 350);
        }, currentInner ? 150 : 0);
    }, 50);
}

/**
 * Get the info text for spell picker (with x/y counter)
 */
function getSpellPickerInfoText() {
    const { currentSelections, maxAllowed } = spellPickerTempState;
    const current = currentSelections.length;
    
    if (maxAllowed === null) {
        return `Select spells for your character. <span class="spell-picker-count">${current} selected</span>`;
    }
    
    const remaining = maxAllowed - current;
    const isOver = remaining < 0;
    const countClass = isOver ? 'spell-picker-count over-limit' : 'spell-picker-count';
    const warningIcon = isOver ? '⚠ ' : '';
    const countText = `${warningIcon}${current}/${maxAllowed}`;
    
    if (isOver) {
        const removeCount = Math.abs(remaining);
        return `<span class="spell-picker-warning">Remove ${removeCount} spell${removeCount !== 1 ? 's' : ''} to continue.</span> <span class="${countClass}">${countText}</span>`;
    } else if (remaining === 0) {
        return `Selection complete. <span class="${countClass}">${countText}</span>`;
    } else {
        return `You can select ${remaining} more spell${remaining !== 1 ? 's' : ''}. <span class="${countClass}">${countText}</span>`;
    }
}

/**
 * Update the spell picker info text
 */
function updateSpellPickerInfo() {
    const infoEl = document.getElementById('spellPickerInfoText');
    if (infoEl) {
        infoEl.innerHTML = getSpellPickerInfoText();
        
        // Update class based on limit status
        const { currentSelections, maxAllowed } = spellPickerTempState;
        const isOver = maxAllowed !== null && currentSelections.length > maxAllowed;
        const atLimit = maxAllowed !== null && currentSelections.length === maxAllowed;
        infoEl.classList.toggle('over-limit', isOver);
        infoEl.classList.toggle('at-limit', atLimit && !isOver);
    }
    
    // Update save button disabled state
    const saveBtn = document.getElementById('spellPickerSaveBtn');
    if (saveBtn) {
        const { currentSelections, maxAllowed } = spellPickerTempState;
        const isOver = maxAllowed !== null && currentSelections.length > maxAllowed;
        saveBtn.disabled = isOver;
    }
}

/**
 * Render spell picker list with current temp state
 */
function renderSpellPickerListWithState(spells, level) {
    if (!spells || spells.length === 0) {
        return '<div class="spell-picker-empty">No spells available at this level for this class.</div>';
    }
    
    const { originalSelections, currentSelections } = spellPickerTempState;
    const originalSet = new Set(originalSelections.map(s => s.toLowerCase()));
    const selectedSet = new Set(currentSelections.map(s => s.toLowerCase()));
    
    return spells.map(spell => {
        const spellNameLower = spell.name.toLowerCase();
        const isSelected = selectedSet.has(spellNameLower);
        const wasOriginallySelected = originalSet.has(spellNameLower);
        const escapedName = Utils.escapeHtml(spell.name);
        const escapedDesc = Utils.escapeHtml(spell.description || '');
        
        // Classes for styling
        const classes = ['spell-picker-item'];
        if (isSelected) classes.push('is-selected');
        if (wasOriginallySelected) classes.push('is-existing');
        
        return `
            <div class="${classes.join(' ')}" 
                 data-spell-name="${escapedName.toLowerCase()}"
                 data-spell-school="${spell.school || ''}"
                 onclick="toggleSpellInSpellEditModal('${escapedName.replace(/'/g, "\\'")}', '${level}', this)">
                <div class="spell-picker-item-header">
                    <span class="spell-picker-item-name">${escapedName}</span>
                    <span class="spell-picker-item-school">${spell.school || ''}</span>
                </div>
                <div class="spell-picker-item-desc">${escapedDesc}</div>
            </div>
        `;
    }).join('');
}

/**
 * Get spells for picker based on class and level
 */
function getSpellsForPicker(className, level) {
    if (!window.SPELL_DATABASE) return [];
    
    const spellLevel = level === 'cantrips' ? 0 : level;
    const classSpells = window.SPELL_DATABASE.getSpellsByClassAndLevel(className, spellLevel);
    
    return classSpells || [];
}

/**
 * Toggle spell selection in the dedicated spell edit modal (updates temp state)
 */
function toggleSpellInSpellEditModal(spellName, level, element) {
    const isSelected = element.classList.contains('is-selected');
    
    if (isSelected) {
        // Remove from temp state
        spellPickerTempState.currentSelections = spellPickerTempState.currentSelections.filter(s => s !== spellName);
        element.classList.remove('is-selected');
    } else {
        // Add to temp state (allow going over limit - user will see warning)
        spellPickerTempState.currentSelections.push(spellName);
        element.classList.add('is-selected');
    }
    
    // Update info text with new counts
    updateSpellPickerInfo();
}

/**
 * Save spell picker selections and return to spell edit modal
 */
function saveSpellEditModalPicker() {
    const { level, currentSelections, maxAllowed } = spellPickerTempState;
    
    // Check if over limit
    if (maxAllowed !== null && currentSelections.length > maxAllowed) {
        const removeCount = currentSelections.length - maxAllowed;
        showNotification(`Remove ${removeCount} spell${removeCount !== 1 ? 's' : ''} before saving`, 'error');
        return;
    }
    
    // Commit selections to main state
    if (level === 'cantrips') {
        spellEditModalState.cantrips = [...currentSelections];
    } else {
        const levelNum = parseInt(level, 10);
        spellEditModalState.spells[levelNum] = [...currentSelections];
    }
    
    // Mark the modal as dirty
    ModalManager.markDirty('spellEditModal');
    
    // Return to main spell edit screen
    returnToSpellEditScreen();
}

/**
 * Cancel spell picker and return to spell edit modal without saving
 */
function cancelSpellEditModalPicker() {
    // Just return without committing changes
    returnToSpellEditScreen();
}

/**
 * Return to the main spell edit screen (shared by save and cancel)
 */
function returnToSpellEditScreen() {
    const modal = document.getElementById('spellEditModal');
    if (!modal || !spellEditModalOriginalContent) return;
    
    const modalContent = modal.querySelector('.modal-content');
    if (!modalContent) return;
    
    // Animate out current content
    const currentInner = modalContent.querySelector('.modal-content-inner');
    if (currentInner) {
        currentInner.classList.add('slide-out-right');
    }
    
    // After animation, restore original content
    setTimeout(() => {
        const wrappedContent = `<div class="modal-content-inner slide-in-left">${spellEditModalOriginalContent}</div>`;
        modalContent.innerHTML = wrappedContent;
        spellEditModalOriginalContent = null;
        
        // Clear temp state
        spellPickerTempState = { level: null, originalSelections: [], currentSelections: [], maxAllowed: null };
        
        // Re-render tags with updated selections
        renderSpellEditModalTags();
        
        // Re-setup visibility for cantrips and spell level rows
        const className = spellEditModalState.characterClass;
        const spellcasting = SPELLCASTING_CLASSES[className];
        
        const cantripsRow = document.getElementById('spellEditModalCantripsRow');
        if (cantripsRow && spellcasting) {
            cantripsRow.classList.toggle('is-hidden', !spellcasting.cantrips);
        }
        
        for (let spellLevel = 1; spellLevel <= 9; spellLevel++) {
            const row = document.getElementById(`spellEditModalLevel${spellLevel}Row`);
            if (row) {
                row.classList.toggle('is-hidden', spellLevel > spellEditModalState.maxSpellLevel || spellEditModalState.maxSpellLevel === 0);
            }
        }
    }, currentInner ? 150 : 0);
}

/**
 * Select a spell school filter in the spell edit modal picker
 */
function selectSpellEditSchool(value) {
    spellPickerTempState.schoolFilter = value;
    
    const trigger = document.getElementById('spellEditSchoolTrigger');
    const menu = document.getElementById('spellEditSchoolMenu');
    
    if (trigger) {
        const label = trigger.querySelector('.selector-trigger-label');
        if (label) {
            label.textContent = value || 'All Schools';
        }
    }
    
    // Update selected state on options
    if (menu) {
        menu.querySelectorAll('.selector-option').forEach(opt => {
            opt.classList.toggle('is-selected', opt.dataset.value === value);
        });
    }
    
    // Menu is closed automatically by CharacterSheet global option handler
    
    // Re-filter the spell list
    filterSpellEditModalPicker();
}

/**
 * Filter spell picker in the dedicated spell edit modal
 */
function filterSpellEditModalPicker() {
    const searchInput = document.getElementById('spellEditModalSearchInput');
    const list = document.getElementById('spellEditModalPickerList');
    if (!searchInput || !list) return;
    
    const query = searchInput.value.toLowerCase().trim();
    const schoolFilter = spellPickerTempState.schoolFilter;
    const items = list.querySelectorAll('.spell-picker-item');
    
    items.forEach(item => {
        const spellName = item.getAttribute('data-spell-name') || '';
        const spellSchool = item.getAttribute('data-spell-school') || '';
        
        const matchesSearch = !query || spellName.includes(query);
        const matchesSchool = !schoolFilter || spellSchool === schoolFilter;
        
        item.style.display = (matchesSearch && matchesSchool) ? '' : 'none';
    });
}

// Expose spell edit modal functions globally
window.openSpellEditModal = openSpellEditModal;
window.closeSpellEditModal = closeSpellEditModal;
window.saveSpellEditModal = saveSpellEditModal;
window.removeSpellFromSpellEditModal = removeSpellFromSpellEditModal;
window.openSpellPickerForSpellEditModal = openSpellPickerForSpellEditModal;
window.toggleSpellInSpellEditModal = toggleSpellInSpellEditModal;
window.filterSpellEditModalPicker = filterSpellEditModalPicker;
window.selectSpellEditSchool = selectSpellEditSchool;
window.saveSpellEditModalPicker = saveSpellEditModalPicker;
window.cancelSpellEditModalPicker = cancelSpellEditModalPicker;

// Track state for spell removal modal
let spellRemovalState = {
    characterId: null,
    selectedCantrips: new Set(),
    selectedSpells: new Set(),
    requiredCantripRemovals: 0,
    requiredSpellRemovals: 0,
    forcedSpellRemovals: [], // Spells that MUST be removed (too high level)
};

/**
 * Show a prompt for removing excess spells after level down
 */
function showSpellRemovalPrompt(character, spellInfo) {
    const { cantripSurplus, spellSurplus, cantripsKnown, spellsKnown, maxSpellLevel, currentCantrips, currentSpells, tooHighLevelSpells } = spellInfo;
    
    // Initialize removal state
    spellRemovalState = {
        characterId: character.id,
        selectedCantrips: new Set(),
        selectedSpells: new Set(),
        requiredCantripRemovals: cantripSurplus,
        requiredSpellRemovals: spellSurplus,
        forcedSpellRemovals: tooHighLevelSpells.map(s => s.name),
    };
    
    // Pre-select forced removals
    tooHighLevelSpells.forEach(s => spellRemovalState.selectedSpells.add(s.name));
    
    // Build prompt message
    let message = `As a Level ${character.level}${' '}${character.class}, you can know:\n`;
    if (cantripsKnown > 0) {
        message += `• ${cantripsKnown}${' '}cantrips (you have ${currentCantrips.length})\n`;
    }
    if (spellsKnown !== null && spellsKnown > 0) {
        message += `• ${spellsKnown}${' '}spells (you have ${currentSpells.length})\n`;
    }
    
    message += '\n';
    if (cantripSurplus > 0) {
        message += `You must remove ${cantripSurplus}${' '}cantrip${cantripSurplus > 1 ? 's' : ''}.\n`;
    }
    if (spellSurplus > 0) {
        message += `You must remove ${spellSurplus}${' '}spell${spellSurplus > 1 ? 's' : ''}.\n`;
    }
    if (tooHighLevelSpells.length > 0) {
        message += `\n${tooHighLevelSpells.length}${' '}spell${tooHighLevelSpells.length > 1 ? 's are' : ' is'} above your max spell level (${maxSpellLevel}) and must be removed.`;
    }
    
    // Build cantrip checkboxes
    let cantripCheckboxes = '';
    if (cantripSurplus > 0 && currentCantrips.length > 0) {
        cantripCheckboxes = `
            <div class="spell-removal-section">
                <h4 class="spell-removal-header">Cantrips (remove ${cantripSurplus})</h4>
                <div class="spell-removal-list">
                    ${currentCantrips.map(cantrip => `
                        <label class="spell-removal-item">
                            <input type="checkbox" 
                                   onchange="toggleSpellRemoval('cantrip', '${Utils.escapeHtml(cantrip.replace(/'/g, "\\'"))}')"
                                   ${spellRemovalState.selectedCantrips.has(cantrip) ? 'checked' : ''}>
                            <span>${Utils.escapeHtml(cantrip)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    // Build spell checkboxes (grouped by level if possible)
    let spellCheckboxes = '';
    if ((spellSurplus > 0 || tooHighLevelSpells.length > 0) && currentSpells.length > 0) {
        // Group spells by level
        const spellsByLevel = {};
        for (const spellName of currentSpells) {
            let level = 1;
            if (window.SPELL_DATABASE) {
                const info = window.SPELL_DATABASE.getSpellByName(spellName);
                if (info) level = info.level;
            }
            if (!spellsByLevel[level]) spellsByLevel[level] = [];
            spellsByLevel[level].push(spellName);
        }
        
        const totalToRemove = spellSurplus + tooHighLevelSpells.length;
        spellCheckboxes = `
            <div class="spell-removal-section">
                <h4 class="spell-removal-header">Spells (remove ${totalToRemove})</h4>
                <div class="spell-removal-list">
                    ${Object.entries(spellsByLevel)
                        .sort(([a], [b]) => Number(a) - Number(b))
                        .map(([level, spells]) => spells.map(spell => {
                            const isForced = spellRemovalState.forcedSpellRemovals.includes(spell);
                            const isTooHigh = tooHighLevelSpells.some(s => s.name === spell);
                            return `
                                <label class="spell-removal-item${isForced ? ' forced' : ''}">
                                    <input type="checkbox" 
                                           onchange="toggleSpellRemoval('spell', '${Utils.escapeHtml(spell.replace(/'/g, "\\'"))}')"
                                           ${spellRemovalState.selectedSpells.has(spell) ? 'checked' : ''}
                                           ${isForced ? 'disabled checked' : ''}>
                                    <span>${Utils.escapeHtml(spell)}${' '}(${level === '0' ? 'cantrip' : `lvl ${level}`})${isTooHigh ? ' ⚠️ too high' : ''}</span>
                                </label>
                            `;
                        }).join('')).join('')}
                </div>
            </div>
        `;
    }
    
    const modalHost = getManagerModalHost();
    const existingModal = document.getElementById('spellRemovalModal');
    if (existingModal) existingModal.remove();
    
    const modalHtml = `
        <div id="spellRemovalModal" class="modal show">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 class="modal-title">REMOVE EXCESS SPELLS</h2>
                    <button class="modal-close" onclick="closeSpellRemovalPrompt()">&times;</button>
                </div>
                <div class="modal-body">
                    <p class="terminal-text" style="white-space: pre-line;">${Utils.escapeHtml(message)}</p>
                    ${cantripCheckboxes}
                    ${spellCheckboxes}
                    <p id="spellRemovalStatus" class="terminal-text-small terminal-text-dim" style="margin-top: 1rem;"></p>
                </div>
                <div class="modal-footer" style="gap: 0.5rem;">
                    <button class="terminal-btn terminal-btn-secondary" onclick="closeSpellRemovalPrompt()">Later</button>
                    <button id="confirmSpellRemovalBtn" class="terminal-btn" onclick="confirmSpellRemoval()">Remove selected</button>
                </div>
            </div>
        </div>
    `;
    
    modalHost.insertAdjacentHTML('beforeend', modalHtml);
    updateSpellRemovalStatus();
}

/**
 * Toggle a spell/cantrip selection for removal
 */
function toggleSpellRemoval(type, name) {
    if (type === 'cantrip') {
        if (spellRemovalState.selectedCantrips.has(name)) {
            spellRemovalState.selectedCantrips.delete(name);
        } else {
            spellRemovalState.selectedCantrips.add(name);
        }
    } else {
        // Don't allow deselecting forced removals
        if (spellRemovalState.forcedSpellRemovals.includes(name)) return;
        
        if (spellRemovalState.selectedSpells.has(name)) {
            spellRemovalState.selectedSpells.delete(name);
        } else {
            spellRemovalState.selectedSpells.add(name);
        }
    }
    updateSpellRemovalStatus();
}

/**
 * Update the status text and button state
 */
function updateSpellRemovalStatus() {
    const statusEl = document.getElementById('spellRemovalStatus');
    const btn = document.getElementById('confirmSpellRemovalBtn');
    if (!statusEl || !btn) return;
    
    const cantripSelected = spellRemovalState.selectedCantrips.size;
    const spellSelected = spellRemovalState.selectedSpells.size;
    const cantripNeeded = spellRemovalState.requiredCantripRemovals;
    const spellNeeded = spellRemovalState.requiredSpellRemovals + spellRemovalState.forcedSpellRemovals.length;
    
    const cantripOk = cantripSelected >= cantripNeeded;
    const spellOk = spellSelected >= spellNeeded;
    
    let status = '';
    if (!cantripOk) {
        status += `Select ${cantripNeeded - cantripSelected}${' '}more cantrip${cantripNeeded - cantripSelected > 1 ? 's' : ''} to remove. `;
    }
    if (!spellOk) {
        status += `Select ${spellNeeded - spellSelected}${' '}more spell${spellNeeded - spellSelected > 1 ? 's' : ''} to remove.`;
    }
    if (cantripOk && spellOk) {
        status = 'Ready to remove selected spells.';
    }
    
    statusEl.textContent = status;
    btn.disabled = !(cantripOk && spellOk);
}

/**
 * Confirm and apply spell removals
 */
async function confirmSpellRemoval() {
    const character = await CharacterStorage.getById(spellRemovalState.characterId);
    if (!character) return;
    
    // Remove selected cantrips
    const newCantrips = (character.cantrips || []).filter(c => !spellRemovalState.selectedCantrips.has(c));
    
    // Remove selected spells
    const newSpells = (character.spellsKnown || []).filter(s => !spellRemovalState.selectedSpells.has(s));
    
    // Save updates
    const updates = {
        cantrips: newCantrips,
        spellsKnown: newSpells,
    };
    
    await CharacterStorage.update(spellRemovalState.characterId, updates);
    
    // Close modal and refresh
    closeSpellRemovalPrompt();
    showNotification(`Removed ${spellRemovalState.selectedCantrips.size + spellRemovalState.selectedSpells.size}${' '}spell${spellRemovalState.selectedCantrips.size + spellRemovalState.selectedSpells.size > 1 ? 's' : ''}`, 'success');
    
    // Refresh character display
    await CharacterManager.refreshCharacterList();
    await CharacterManager.selectCharacter(spellRemovalState.characterId);
}

/**
 * Close the spell removal prompt
 */
function closeSpellRemovalPrompt() {
    const modal = document.getElementById('spellRemovalModal');
    if (modal) {
        animateModalClose(modal, { removeOnClose: true });
    }
}

/**
 * Open spell picker for level-up spell selection
 */
async function openSpellLevelUpPicker(characterId, level, currentCount) {
    const character = await CharacterStorage.getById(characterId);
    if (!character) return;
    
    const className = (character.class || '').toLowerCase();
    const charLevel = character.level || 1;
    
    // Get spell progression to calculate limits
    const stats = calculateStatsForLevel(character, charLevel);
    const spellProgression = stats.spellProgression || { cantrips: 0, spellsKnown: null, maxSpellLevel: 0 };
    
    // Get existing spells for this level
    let existingSpells;
    let maxSelections = null;
    
    if (level === 'cantrips') {
        existingSpells = character.cantrips || [];
        // Calculate remaining cantrip slots
        if (spellProgression.cantrips > 0) {
            maxSelections = Math.max(0, spellProgression.cantrips - existingSpells.length);
        }
    } else {
        // For regular spells, we need to check which ones are at this level
        existingSpells = character.spellsKnown || [];
        // Calculate remaining spell slots (null = unlimited for prepared casters)
        if (spellProgression.spellsKnown !== null) {
            maxSelections = Math.max(0, spellProgression.spellsKnown - existingSpells.length);
        }
    }
    
    openSpellPicker({
        characterClass: className,
        level: level,
        maxSpellLevel: 9, // Allow picking from all available levels
        existingSpells: existingSpells,
        maxSelections: maxSelections,
        onConfirm: async (selectedSpells) => {
            // Add selected spells to character
            const updates = {};
            
            if (level === 'cantrips') {
                const currentCantrips = character.cantrips || [];
                updates.cantrips = [...currentCantrips, ...selectedSpells.map(s => s.name)];
            } else {
                const currentSpells = character.spellsKnown || [];
                updates.spellsKnown = [...currentSpells, ...selectedSpells.map(s => s.name)];
            }
            
            try {
                await CharacterStorage.update(characterId, updates);
                await AppState.loadCharacters();
                UI.render();
                viewCharacter(characterId);
                showNotification(`Added ${selectedSpells.length} spell${selectedSpells.length > 1 ? 's' : ''}!`);
            } catch (error) {
                console.error('Failed to add spells:', error);
                showNotification('Failed to add spells', 'error');
            }
        }
    });
}

// Make functions globally available
window.initializeSpellEditSection = initializeSpellEditSection;
window.removeSpellFromEdit = removeSpellFromEdit;
window.openSpellPickerForEdit = openSpellPickerForEdit;
window.getEditSpells = getEditSpells;
window.checkAndPromptForNewSpells = checkAndPromptForNewSpells;
window.closeSpellLevelUpPrompt = closeSpellLevelUpPrompt;
window.openSpellLevelUpPicker = openSpellLevelUpPicker;
// Spell removal (level down) functions
window.closeSpellRemovalPrompt = closeSpellRemovalPrompt;
window.toggleSpellRemoval = toggleSpellRemoval;
window.confirmSpellRemoval = confirmSpellRemoval;
// Inline spell picker functions (used within edit modal flow)
window.filterInlineSpellPicker = filterInlineSpellPicker;
window.toggleInlineSpellSelection = toggleInlineSpellSelection;
window.closeInlineSpellPicker = closeInlineSpellPicker;
window.confirmInlineSpellSelection = confirmInlineSpellSelection;
