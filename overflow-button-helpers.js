// ========================================
// OVERFLOW BUTTON HELPER UTILITIES
// ========================================
// Centralized helper functions for creating consistent overflow buttons
// across DandDy applications.
//
// Usage:
//   const html = OverflowButton.render({
//     actions: [
//       { icon: '✎', label: 'Edit', onclick: 'editCharacter()' },
//       { icon: '×', label: 'Delete', onclick: 'deleteCharacter()' }
//     ],
//     ariaLabel: 'Character actions',
//     additionalClasses: ['custom-overflow-btn']
//   });

const OverflowButton = (window.OverflowButton = {
  /**
   * Configuration for overflow button appearance and behavior.
   * Override these values before calling render() to customize globally.
   */
  config: {
    // Default button classes (applied to trigger button)
    buttonClasses: ['terminal-btn-small', 'selector-trigger', 'overflow-trigger'],
    
    // Icon container class
    iconClass: 'sheet-actions-icon',
    
    // Dot classes
    dotClass: 'sheet-actions-dot',
    
    // Menu container classes
    menuClasses: ['selector-menu'],
    
    // Menu option classes
    optionClasses: ['selector-option'],
    
    // Default aria label
    defaultAriaLabel: 'More actions',
    
    // Toggle function name (global scope)
    toggleFunction: 'CharacterSheet.toggleSelectorMenu',
  },

  /**
   * Render a complete overflow button with menu
   * @param {Object} options
   * @param {Array<{icon: string, label: string, onclick: string, id?: string}>} options.actions - Menu actions
   * @param {string} [options.ariaLabel] - Accessibility label for the button
   * @param {Array<string>} [options.additionalButtonClasses] - Extra classes for the trigger button
   * @param {Array<string>} [options.additionalMenuClasses] - Extra classes for the menu
   * @param {string} [options.shellId] - Optional ID for the selector-shell wrapper
   * @returns {string} HTML string
   */
  render(options = {}) {
    const {
      actions = [],
      ariaLabel = this.config.defaultAriaLabel,
      additionalButtonClasses = [],
      additionalMenuClasses = [],
      shellId = null,
    } = options;

    if (!actions || actions.length === 0) {
      console.warn('OverflowButton.render: No actions provided');
      return '';
    }

    const buttonClasses = [
      ...this.config.buttonClasses,
      ...additionalButtonClasses,
    ].join(' ');

    const menuClasses = [
      ...this.config.menuClasses,
      ...additionalMenuClasses,
    ].join(' ');

    const shellIdAttr = shellId ? ` id="${shellId}"` : '';

    return `
      <div class="selector-shell"${shellIdAttr}>
        ${this.renderTrigger({ ariaLabel, buttonClasses })}
        ${this.renderMenu({ actions, menuClasses })}
      </div>
    `;
  },

  /**
   * Render just the trigger button (three dots icon)
   * @param {Object} options
   * @param {string} [options.ariaLabel] - Accessibility label
   * @param {string} [options.buttonClasses] - CSS classes for button
   * @returns {string} HTML string
   */
  renderTrigger(options = {}) {
    const {
      ariaLabel = this.config.defaultAriaLabel,
      buttonClasses = this.config.buttonClasses.join(' '),
    } = options;

    return `
        <button
          class="${buttonClasses}"
          type="button"
          aria-haspopup="menu"
          aria-expanded="false"
          aria-label="${ariaLabel}"
          onclick="${this.config.toggleFunction}(this)"
        >
          <span class="${this.config.iconClass}" aria-hidden="true">
            <span class="${this.config.dotClass} dot-1"></span>
            <span class="${this.config.dotClass} dot-2"></span>
            <span class="${this.config.dotClass} dot-3"></span>
          </span>
        </button>
    `;
  },

  /**
   * Render just the menu dropdown
   * @param {Object} options
   * @param {Array<{icon: string, label: string, onclick: string, id?: string}>} options.actions
   * @param {string} [options.menuClasses] - CSS classes for menu
   * @returns {string} HTML string
   */
  renderMenu(options = {}) {
    const {
      actions = [],
      menuClasses = this.config.menuClasses.join(' '),
    } = options;

    const optionsHtml = actions
      .map((action) => this.renderMenuOption(action))
      .join('');

    return `
        <div class="${menuClasses}" role="menu" aria-hidden="true">
          ${optionsHtml}
        </div>
    `;
  },

  /**
   * Render a single menu option
   * @param {Object} action
   * @param {string} action.icon - Icon character or emoji
   * @param {string} action.label - Display label
   * @param {string} action.onclick - JavaScript onclick handler
   * @param {string} [action.id] - Optional element ID
   * @param {string} [action.title] - Optional tooltip
   * @param {Array<string>} [action.additionalClasses] - Extra CSS classes
   * @returns {string} HTML string
   */
  renderMenuOption(action) {
    const {
      icon = '',
      label = '',
      onclick = '',
      id = null,
      title = null,
      additionalClasses = [],
    } = action;

    const optionClasses = [
      ...this.config.optionClasses,
      ...additionalClasses,
    ].join(' ');

    const idAttr = id ? ` id="${id}"` : '';
    const titleAttr = title ? ` title="${title}"` : '';

    return `
              <button
                class="${optionClasses}"
                type="button"
                role="menuitem"
                onclick="${onclick}"${idAttr}${titleAttr}
              >
                <span class="selector-option-icon">${icon}</span>
                <span class="selector-option-label">${label}</span>
              </button>
    `;
  },

  /**
   * Generate standalone overflow button HTML for inline use
   * (When you need just the button HTML without wrapping in a <div>)
   * @param {Object} options - Same as render() but returns only the shell div
   * @returns {string} HTML string
   */
  renderStandalone(options = {}) {
    return this.render(options);
  },

  /**
   * Escape HTML to prevent XSS when using dynamic content
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },

  /**
   * Create an overflow button programmatically (returns DOM element)
   * Useful for dynamic UI construction in JavaScript
   * @param {Object} options - Same as render()
   * @returns {HTMLElement} The selector-shell element
   */
  createElement(options = {}) {
    const html = this.render(options);
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.firstElementChild;
  },
});

/**
 * EXAMPLE USAGE:
 * 
 * // Basic usage with actions
 * const html = OverflowButton.render({
 *   actions: [
 *     { icon: '✎', label: 'Edit', onclick: 'editItem()' },
 *     { icon: '📋', label: 'Duplicate', onclick: 'duplicateItem()' },
 *     { icon: '⎙', label: 'Print', onclick: 'printItem()' },
 *     { icon: '×', label: 'Delete', onclick: 'deleteItem()' }
 *   ],
 *   ariaLabel: 'Item actions'
 * });
 * 
 * // With custom classes for theming
 * const modalHtml = OverflowButton.render({
 *   actions: [...],
 *   additionalButtonClasses: ['modal-overflow-btn'],
 *   additionalMenuClasses: ['modal-menu']
 * });
 * 
 * // Create as DOM element
 * const buttonElement = OverflowButton.createElement({
 *   actions: [...]
 * });
 * document.body.appendChild(buttonElement);
 * 
 * // Customize globally
 * OverflowButton.config.defaultAriaLabel = 'Options';
 * OverflowButton.config.buttonClasses.push('my-custom-class');
 */

