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
      const startLine = 0; // Keep top pinned (faces/heads)
      const endLine = Math.min(totalLines, heightLines);

      // HORIZONTAL: Crop equally from both sides to stay centered
      const topLines = lines.slice(startLine, endLine).map((line) => {
        if (line.length <= widthChars) return line;
        const excess = line.length - widthChars;
        const cropLeft = Math.floor(excess / 2);
        return line.slice(cropLeft, cropLeft + widthChars);
      });

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
      // Get the card thumbnail container for original mode styling
      const thumbContainer = asciiEl ? asciiEl.closest('.card-thumbnail') : null;

      if (!imgEl || !asciiEl) return;

      const showingAscii = imgEl.classList.contains('is-hidden');

      if (showingAscii) {
        // Switch to original image
        asciiEl.classList.add('is-hidden');
        imgEl.classList.remove('is-hidden');
        if (thumbContainer) {
          thumbContainer.classList.add('card-thumbnail--original-mode');
        }
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
        if (thumbContainer) {
          thumbContainer.classList.remove('card-thumbnail--original-mode');
        }
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

      // Prefer AppState cache to ensure we show the most up-to-date data
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
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
          // Prefer AppState cache to ensure we have the most up-to-date data
          let character = null;
          try {
            if (window.AppState && Array.isArray(AppState.characters)) {
              character = AppState.characters.find(
                (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
              ) || null;
            }
          } catch (e) {
            // Non-fatal – fall back to storage lookup below.
          }
          if (!character) {
            character = await CharacterStorage.getById(characterId);
          }
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

      // Check global portrait view mode (ASCII vs Original) to determine default display
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
      const showOriginalByDefault = portraitViewMode === 'original';

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

          // Apply visibility based on global portrait view mode:
          // If 'original' mode and we have an image, show image by default (hide ASCII)
          // Otherwise show ASCII by default (hide image)
          const shouldShowOriginal = showOriginalByDefault && hasImage;
          const asciiHiddenClass = shouldShowOriginal ? ' is-hidden' : '';
          const imageHiddenClass = shouldShowOriginal ? '' : ' is-hidden';

          const thumbHtml = `
            <div class="card-thumbnail${shouldShowOriginal ? ' card-thumbnail--original-mode' : ''}">
              <div class="ascii-portrait portrait-history-preview${asciiHiddenClass}" data-version-id="${v.id}"></div>
              ${
                hasImage
                  ? `<img src="${v.url}" alt="${title}" class="portrait-history-image${imageHiddenClass}" data-version-id="${v.id}" onload="this.classList.add('is-loaded')">`
                  : ''
              }
            </div>`;

          // Overflow menu for per-version actions (View, Prompt, Delete)
          const actionItems = [];

          // Toggle button label depends on current default view
          if (hasImage) {
            const toggleLabel = shouldShowOriginal ? 'View ASCII' : 'View original';
            actionItems.push(`
              <button
                class="selector-option"
                type="button"
                role="menuitem"
                onclick="event.stopPropagation(); PortraitUI.toggleView('${v.id}')"
                data-toggle-version-id="${v.id}"
              >
                <span class="selector-option-icon">◉</span>
                <span class="selector-option-label">${toggleLabel}</span>
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
              <div class="portrait-history-actions selector-shell selector-shell--actions">
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
          // Use <pre> wrapper for proper CSS flex centering
          el.innerHTML = '';
          const pre = document.createElement('pre');
          pre.textContent = this.cropAsciiForThumbnail(v.ascii);
          el.appendChild(pre);
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

      // Prefer the in-memory AppState cache to avoid stale data from storage.
      // The AppState may contain recent edits that haven't been persisted yet,
      // and using storage directly could cause those edits to be lost.
      let character = null;
      try {
        if (window.AppState && Array.isArray(AppState.characters)) {
          character = AppState.characters.find(
            (c) => c && (c.id === characterId || String(c.id) === String(characterId)),
          ) || null;
        }
      } catch (e) {
        // Non-fatal – fall back to storage lookup below.
      }

      // Fallback to storage if not found in AppState cache
      if (!character) {
        character = await CharacterStorage.getById(characterId);
      }
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
          if (window.CharacterSheet && typeof CharacterSheet.setPortraitContent === 'function') {
            CharacterSheet.setPortraitContent(asciiEl, version.ascii);
          } else {
            // Fallback: use <pre> wrapper for proper CSS flex centering
            asciiEl.innerHTML = '';
            const pre = document.createElement('pre');
            pre.textContent = version.ascii;
            asciiEl.appendChild(pre);
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
        // Respect the user's portrait view mode preference (original vs ASCII).
        const thumbEl = document.getElementById(`card-thumb-${characterId}`);
        if (thumbEl) {
          try {
            // Check the user's portrait view mode preference
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

            const showOriginalImage = portraitViewMode === 'original' && !!version.url;

            if (showOriginalImage) {
              // Update to show the original image
              // Check if thumbnail already has an img element
              let imgEl = thumbEl.querySelector('img');
              if (imgEl) {
                // Just update the src
                imgEl.src = version.url;
              } else {
                // Need to switch from ASCII to image mode
                thumbEl.innerHTML = '';
                thumbEl.classList.add('card-thumbnail--image');
                imgEl = document.createElement('img');
                imgEl.src = version.url;
                imgEl.alt = 'Character portrait';
                imgEl.loading = 'lazy';
                imgEl.onload = function() { this.classList.add('is-loaded'); };
                thumbEl.appendChild(imgEl);
              }
            } else if (version.ascii) {
              // Update to show ASCII art
              let croppedArt;
              if (window.UI && typeof UI.cropAsciiForThumbnail === 'function') {
                croppedArt = UI.cropAsciiForThumbnail(version.ascii);
              } else {
                // Fallback: simple top-crop similar to CharacterSheet behavior
                const lines = version.ascii.split('\n');
                const topLines = lines.slice(0, 80).map((line) => line.slice(0, 160));
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
      // Use String() comparison to handle type mismatches (cloud IDs may be
      // numeric, but characterId from onclick is always a string).
      try {
        const nextCharacter = { ...character, ...updates };
        const idStr = String(characterId);

        if (window.AppState) {
          if (Array.isArray(AppState.characters)) {
            const idx = AppState.characters.findIndex(
              (c) => c && String(c.id) === idStr,
            );
            if (idx !== -1) {
              AppState.characters[idx] = nextCharacter;
            }
          }
          if (Array.isArray(AppState.filteredCharacters)) {
            const fIdx = AppState.filteredCharacters.findIndex(
              (c) => c && String(c.id) === idStr,
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


