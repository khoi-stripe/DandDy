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

      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        console.warn(
          'PortraitUI.openManagerHistory: CharacterStorage.getById is not available',
        );
        return;
      }

      const character = await CharacterStorage.getById(characterId);
      if (!character) {
        console.warn(
          'PortraitUI.openManagerHistory: character not found for id',
          characterId,
        );
        return;
      }

      const metadata = character.portraitMetadata || {};
      const rawVersions = Array.isArray(metadata.versions)
        ? metadata.versions
        : [];
      const hasVersions = rawVersions.length > 0;

      // Debug hook to verify manager history is opening with the expected data.
      try {
        console.log('%c🎨 MANAGER PORTRAIT HISTORY OPEN', 'color:#0ff;font-weight:bold;');
        console.log('  Character ID:', characterId);
        console.log('  Versions count:', rawVersions.length);
        console.log('  Active version ID:', metadata.activeVersionId || '(none)');
      } catch (e) {
        // Non-fatal logging failure
      }

      // Ensure the current active portrait appears first in the list so that
      // keyboard focus and visual ordering both start on the "current art".
      let versions = rawVersions;
      if (hasVersions && metadata.activeVersionId) {
        const active = rawVersions.find(
          (v) => v.id === metadata.activeVersionId,
        );
        if (active) {
          const others = rawVersions.filter((v) => v.id !== active.id);
          versions = [active, ...others];
        }
      }

      // If the character already has a custom portrait but no version history yet,
      // show a helpful empty state rather than the generic "no saved portraits" copy.
      const hasCustomPortraitWithoutHistory =
        !hasVersions &&
        (character.customPortraitAscii ||
          character.originalPortraitUrl ||
          (character.portrait && character.portrait.url));

      state.context = {
        type: 'manager',
        characterId,
        metadata,
        // Store the display-ordered versions so focus/index updates match
        // the DOM order.
        versions,
        hasCustomPortraitWithoutHistory,
      };

      // Build the modal shell with a lightweight loading state so the user
      // immediately sees that work is happening, even if we have a lot of
      // portrait versions to render.
      const modalHtml = this._wrapInModalSkeleton();
      document.body.insertAdjacentHTML('beforeend', modalHtml);

      // Defer heavy DOM string building and ASCII cropping until after the
      // modal is visible, so the perception is "instant open + loading" rather
      // than a blank pause.
      const listHtml = this._buildHistoryCardsHtml(
        'manager',
        characterId,
        metadata,
        versions,
        hasCustomPortraitWithoutHistory,
      );

      const modalBody = document.querySelector(
        '#portraitHistoryModal .modal-body',
      );
      if (modalBody) {
        modalBody.innerHTML = `
          <p class="terminal-text-small terminal-text-dim">
            View previous custom AI portraits for this character. Choose one to make it active, or delete versions you no longer need.
          </p>
          <div class="portrait-history-card-row${
            versions.length === 1 ? ' is-single' : ''
          }">
            ${listHtml}
          </div>
        `;
      }

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

    async copyPrompt(characterId, versionId) {
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
        if (typeof window.showNotification === 'function') {
          window.showNotification('Portrait prompt copied to clipboard.');
        }
      } catch (error) {
        console.error('PortraitUI.copyPrompt: failed to copy prompt', error);
        if (typeof window.showNotification === 'function') {
          window.showNotification(
            'Could not copy prompt. Please copy it manually from the card.',
          );
        }
      }
    },

    deleteVersion(characterId, versionId) {
      const CharacterStorage = window.CharacterStorage;
      if (!CharacterStorage || typeof CharacterStorage.getById !== 'function') {
        return;
      }

      const confirmDialog = window.showConfirmDialog;
      if (typeof confirmDialog !== 'function') {
        console.warn(
          'PortraitUI.deleteVersion: showConfirmDialog is not available',
        );
        return;
      }

      const onConfirm = async () => {
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

        this.closeHistory();
        if (remaining.length) {
          this.openManagerHistory(characterId);
        }
      };

      confirmDialog(
        'Delete this saved portrait version? This cannot be undone.',
        onConfirm,
      );
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
          return `<div class="terminal-text-small terminal-text-dim" style="padding: 20px; text-align: center;">
              <p><strong>No portrait history yet.</strong></p>
              <p style="margin-top: 10px;">This character's portrait was created before the history feature was added.</p>
              <p style="margin-top: 10px;">Generate a new custom AI portrait to:</p>
              <ul style="text-align: left; margin: 10px auto; display: inline-block;">
                <li>• Save your current portrait as Version 1</li>
                <li>• Add the new portrait as Version 2</li>
                <li>• Enable portrait version switching</li>
              </ul>
            </div>`;
        }

        return `<p class="terminal-text-small terminal-text-dim" style="padding: 20px; text-align: center;">
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
                onclick="event.stopPropagation(); PortraitUI.copyPrompt('${characterId}', '${v.id}')"
                title="Copy this portrait's prompt to your clipboard"
              >
                <span class="selector-option-icon">✎</span>
                <span class="selector-option-label">Copy prompt</span>
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

    _wrapInModalSkeleton() {
      return `
        <div id="portraitHistoryModal" class="modal show" onclick="PortraitUI.closeHistory()">
          <div class="modal-content portrait-history-modal" onclick="event.stopPropagation();">
            <div class="modal-header">
              <h2 class="modal-title">Portrait History</h2>
              <button class="modal-close" onclick="PortraitUI.closeHistory()">&times;</button>
            </div>
            <div class="modal-body">
              <div class="terminal-text-small terminal-text-dim" style="padding: 20px; text-align: center;">
                <div class="spinner spinner-small" aria-hidden="true"></div>
                <p style="margin-top: 10px;">Loading portrait history\u2026</p>
              </div>
            </div>
            <div class="modal-footer modal-footer-end">
              <button class="terminal-btn" onclick="PortraitUI.closeHistory()">CANCEL</button>
              <button class="terminal-btn terminal-btn-primary" onclick="PortraitUI.confirmSelection()">USE SELECTED</button>
            </div>
          </div>
        </div>
      `;
    },

    _populateAsciiPreviews(versions) {
      versions.forEach((v) => {
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
        // the selected version's image.
        if (imgEl && version.url) {
          imgEl.src = version.url;
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


