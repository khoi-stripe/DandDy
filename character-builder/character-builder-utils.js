// Core reusable helper functions for the DandDy terminal character builder.
// Exposes Utils as a global (window.Utils) so existing inline code can use it.

const Utils = window.Utils = {
  // Typewriter effect for text
  async typewriter(element, text, speed = (window.CONFIG && window.CONFIG.TYPEWRITER_SPEED) || 30) {
    element.textContent = '';
    element.classList.add('is-typing');

    let skipTyping = false;

    // Allow skipping by pressing any key
    const skipHandler = (e) => {
      // Only skip if not typing in an input field
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        skipTyping = true;
      }
    };

    window.addEventListener('keydown', skipHandler, { once: true });

    // Type out character by character, or skip if interrupted
    for (let i = 0; i < text.length; i++) {
      if (skipTyping) {
        // Show all remaining text immediately
        element.textContent = text;
        break;
      }
      element.textContent += text[i];
      await this.sleep(speed);
    }

    // Clean up
    window.removeEventListener('keydown', skipHandler);
    element.classList.remove('is-typing');
  },

  // Sleep utility
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  },

  // Random number between min and max (inclusive)
  random(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  },

  // Pick random item from array
  randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
  },

  // Roll dice (e.g., "3d6" or just 6 for d6)
  rollDice(notation) {
    if (typeof notation === 'number') {
      return this.random(1, notation);
    }

    const [count, sides] = notation.toLowerCase().split('d').map(Number);
    let total = 0;
    for (let i = 0; i < count; i++) {
      total += this.random(1, sides);
    }
    return total;
  },

  // Calculate ability modifier
  abilityModifier(score) {
    return Math.floor((score - 10) / 2);
  },

  // Format modifier with + or -
  formatModifier(modifier) {
    return modifier >= 0 ? `+${modifier}` : `${modifier}`;
  },

  // Capitalize first letter
  capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  },

  // Smooth scroll to bottom of narrator panel
  scrollToBottom(forceDelay = false) {
    const doScroll = () => {
      const panel = document.getElementById('narrator-panel');
      if (panel) {
        panel.scrollTo({
          top: panel.scrollHeight,
          behavior: 'smooth',
        });
      }
    };

    if (forceDelay) {
      // Wait for DOM to update
      setTimeout(doScroll, 50);
    } else {
      doScroll();
    }
  },
};




