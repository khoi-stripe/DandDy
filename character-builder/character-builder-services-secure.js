// ========================================
// SECURE AI SERVICE (DEPRECATED)
// ========================================
// This file is kept for backwards compatibility only.
// All methods delegate to AIService which already calls the backend proxy securely.
//
// RECOMMENDATION: Use AIService directly instead of SecureAIService.
// ========================================

const CONFIG = window.CONFIG;

const SecureAIService = (window.SecureAIService = {
  // Backend API base URL
  backendUrl: CONFIG.BACKEND_URL || 'http://localhost:8000',

  // Check if AI service is available
  async checkStatus() {
    try {
      const response = await fetch(`${this.backendUrl}/api/ai/status`);
      if (!response.ok) {
        return { available: false, error: 'Backend unavailable' };
      }
      return await response.json();
    } catch (error) {
      console.error('Failed to check AI status:', error);
      return { available: false, error: error.message };
    }
  },

  // All other methods delegate to AIService for DRY

  async generateCompletion(prompt, systemPrompt = null, options = {}) {
    if (window.AIService && typeof AIService.generateCompletion === 'function') {
      return AIService.generateCompletion(prompt, systemPrompt);
      }
    console.warn('SecureAIService: AIService not available');
      return null;
  },

  async generateNarratorComment(context) {
    if (window.AIService && typeof AIService.generateNarratorComment === 'function') {
      return AIService.generateNarratorComment(context);
    }
    // Minimal fallback
      const fallbacks = [
        'Interesting choice. ( ._. )',
        "Well, that tracks.",
        "Bold move. We'll see how that works out.",
        'Sure. Why not.',
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  },

  async generateNames(race, classType, count = 3) {
    if (window.AIService && typeof AIService.generateNames === 'function') {
      return AIService.generateNames(race, classType, count);
      }
    console.warn('SecureAIService: AIService not available');
      return null;
  },

  async generateBackstory(character) {
    if (window.AIService && typeof AIService.generateBackstory === 'function') {
      return AIService.generateBackstory(character);
          }
    console.warn('SecureAIService: AIService not available');
      return null;
  },

  async generatePortraitImage(character) {
    if (window.AIService && typeof AIService.generatePortraitImage === 'function') {
      return AIService.generatePortraitImage(character);
          }
    console.warn('SecureAIService: AIService not available');
    return null;
  },

  buildCharacterDescription(character) {
    if (window.AIService && typeof AIService.buildCharacterDescription === 'function') {
      return AIService.buildCharacterDescription(character);
    }
    const parts = [];
    if (character.race) parts.push(character.race);
    if (character.class) parts.push(character.class);
    return parts.join(', ') || 'adventurer';
  },

  buildPortraitPrompt(character) {
    if (window.AIService && typeof AIService.buildPortraitPrompt === 'function') {
      return AIService.buildPortraitPrompt(character);
    }
    const name = (character && character.name) || 'Unnamed character';
    const race = character && character.race ? String(character.race) : '';
    const cls = character && character.class ? String(character.class) : '';
    return `${name}: ${race} ${cls}`.trim();
  },
});
