// SECURE version of AI services - calls backend proxy instead of OpenAI directly
// This prevents exposing API keys in the frontend

const CONFIG = window.CONFIG;

// Secure AI Service - Calls backend proxy
const SecureAIService = (window.SecureAIService = {
  // Backend API base URL - configure this in your config
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

  // Generate chat completion (for narrator comments, names, backstory)
  async generateCompletion(prompt, systemPrompt = null, options = {}) {
    try {
      const response = await fetch(`${this.backendUrl}/api/ai/chat/completion`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          system_prompt: systemPrompt,
          max_tokens: options.maxTokens || 300,
          temperature: options.temperature || 0.8,
        }),
      });

      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please try again later.');
      }

      if (response.status === 400) {
        const error = await response.json();
        if (error.detail && error.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', error.detail);
          // Show user-friendly notification
          if (window.UIService) {
            window.UIService.showNotification(
              'OpenAI flagged this request. Using fallback response instead.',
              'warning',
              5000
            );
          }
          return null;
        }
        throw new Error(error.detail || 'Failed to generate completion');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate completion');
      }

      const data = await response.json();
      return data.success ? data.content : null;
    } catch (error) {
      console.error('AI completion error:', error);
      return null;
    }
  },

  // Generate narrator comment
  async generateNarratorComment(context) {
    try {
      const response = await fetch(`${this.backendUrl}/api/ai/narrator/comment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          choice: context.choice,
          question: context.question,
          character_so_far: context.characterSoFar,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate narrator comment');
      }

      const data = await response.json();
      return data.comment;
    } catch (error) {
      console.error('Narrator comment error:', error);
      
      // Fallback responses if backend is unavailable
      const fallbacks = [
        'Interesting choice. ( ._. )',
        "Well, that tracks.",
        "Bold move. We'll see how that works out.",
        'Sure. Why not.',
      ];
      return fallbacks[Math.floor(Math.random() * fallbacks.length)];
    }
  },

  // Generate character names
  async generateNames(race, classType, count = 3) {
    try {
      const response = await fetch(`${this.backendUrl}/api/ai/characters/names`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          race,
          class_type: classType,
          count,
        }),
      });

      if (response.status === 400) {
        const error = await response.json();
        if (error.detail && error.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', error.detail);
          if (window.UIService) {
            window.UIService.showNotification(
              'OpenAI flagged the name generation request. Please try different options.',
              'warning',
              5000
            );
          }
          return null;
        }
        throw new Error(error.detail || 'Failed to generate names');
      }

      if (!response.ok) {
        throw new Error('Failed to generate names');
      }

      const data = await response.json();
      return data.success ? data.names : null;
    } catch (error) {
      console.error('Name generation error:', error);
      return null;
    }
  },

  // Generate backstory
  async generateBackstory(character) {
    try {
      const response = await fetch(`${this.backendUrl}/api/ai/characters/backstory`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: character.name,
          race: character.race,
          class_type: character.class,
          personality: character.personalityTrait,
          background: character.background,
        }),
      });

      if (response.status === 400) {
        const error = await response.json();
        if (error.detail && error.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', error.detail);
          if (window.UIService) {
            window.UIService.showNotification(
              'OpenAI flagged the backstory request. Please try different character details.',
              'warning',
              5000
            );
          }
          return null;
        }
        throw new Error(error.detail || 'Failed to generate backstory');
      }

      if (!response.ok) {
        throw new Error('Failed to generate backstory');
      }

      const data = await response.json();
      return data.success ? data.backstory : null;
    } catch (error) {
      console.error('Backstory generation error:', error);
      return null;
    }
  },

  // Generate portrait image with DALL-E
  async generatePortraitImage(character) {
    try {
      // Build prompt from character (same as before)
      const prompt = this.buildPortraitPrompt(character);

      const response = await fetch(`${this.backendUrl}/api/ai/images/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          size: '1024x1024',
          quality: 'standard',
        }),
      });

      if (response.status === 429) {
        throw new Error('Rate limit exceeded. Image generation uses quota heavily. Please try again later.');
      }

      if (response.status === 400) {
        const error = await response.json();
        if (error.detail && error.detail.includes('safety system')) {
          console.warn('⚠️ OpenAI safety system rejection:', error.detail);
          if (window.UIService) {
            window.UIService.showNotification(
              'OpenAI flagged the portrait request. Please try modifying your character description.',
              'error',
              6000
            );
          }
          throw new Error('Portrait generation was flagged by content safety system');
        }
        throw new Error(error.detail || 'Failed to generate image');
      }

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to generate image');
      }

      const data = await response.json();
      return data.success ? data.url : null;
    } catch (error) {
      console.error('Image generation error:', error);
      throw error;
    }
  },

  // Build character description (helper method)
  buildCharacterDescription(character) {
    const parts = [];

    // Race
    if (character.race) {
      const raceDescriptions = {
        human: 'human with average features',
        elf: 'elf with pointed ears and graceful features',
        dwarf: 'dwarf with a thick beard and stocky build',
        halfling: 'halfling, small and cheerful',
        dragonborn: 'dragonborn with scaled skin and dragon-like features',
        gnome: 'gnome, small with clever eyes',
        'half-elf': 'half-elf with slightly pointed ears',
        'half-orc': 'half-orc with tusks and powerful build',
        tiefling: 'tiefling with horns and a tail',
      };
      parts.push(raceDescriptions[character.race] || character.race);
    }

    // Class
    if (character.class) {
      const classDescriptions = {
        fighter: 'wearing heavy armor and holding a sword in a powerful mid-swing battle pose',
        wizard: 'in flowing robes, one hand raised casting a spell while gripping a staff',
        rogue: 'in dark leather armor, low and poised with twin daggers ready to strike',
        cleric: 'in holy vestments, holy symbol raised as if channeling radiant power',
        ranger: 'with a drawn bow, body twisted slightly as if loosing an arrow',
        paladin: 'in shining armor, shield braced and weapon raised in a protective stance',
        barbarian: 'with wild hair, muscles tensed, roaring as they swing a massive weapon',
        bard: 'with a lute or instrument mid-performance, stance open and charismatic',
        druid: 'in nature-themed robes, staff planted as they call on primal forces',
        monk: 'in simple robes, mid-strike in a focused martial arts stance',
        sorcerer: 'with crackling magical energy swirling around outstretched hands',
        warlock: 'in dark robes, one hand extended as if invoking eldritch power',
      };
      parts.push(classDescriptions[character.class] || character.class);
    }

    // Magic specialization (only for spellcasting classes)
    if (character.class) {
      const magicSpecializations = {
        wizard: 'specializing in elemental magic like fire and ice',
        sorcerer: 'channeling raw elemental arcane power',
        warlock: 'wielding shadowy eldritch magic',
        cleric: 'focused on radiant and healing magic',
        druid: 'calling on primal nature and elemental magic',
        bard: 'weaving subtle enchantments and support magic through music',
        paladin: 'enhancing strikes with holy, radiant magic',
      };

      const magicText = magicSpecializations[character.class];
      if (magicText) {
        parts.push(magicText);
      }
    }

    // Alignment
    if (character.alignment) {
      if (character.alignment.includes('good')) {
        parts.push('with noble bearing');
      } else if (character.alignment.includes('evil')) {
        parts.push('with a menacing aura');
      }
    }
  
    return parts.join(', ');
  },

  // Build full DALL-E prompt with rendering instructions
  buildPortraitPrompt(character) {
    // Resolve current portrait prompt theme (if any)
    let promptThemeId = null;
    try {
      if (
        typeof window !== 'undefined' &&
        window.StorageService &&
        typeof window.StorageService.getPortraitPromptTheme === 'function'
      ) {
        promptThemeId = window.StorageService.getPortraitPromptTheme();
      } else if (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME) {
        promptThemeId = CONFIG.DEFAULT_PORTRAIT_PROMPT_THEME;
      }
    } catch (e) {
      // Non-fatal: fall back to default theme behavior below.
    }

    // Build compact STYLE / Background descriptions from theme (when available)
    let styleDescription = '';
    let backgroundDescription = '';
    if (
      typeof window !== 'undefined' &&
      window.PortraitPrompt &&
      typeof window.PortraitPrompt.buildStyleAndBackgroundDescriptions ===
        'function'
    ) {
      try {
        const sections =
          window.PortraitPrompt.buildStyleAndBackgroundDescriptions({
            themeId: promptThemeId,
          }) || {};
        styleDescription = sections.styleDescription || '';
        backgroundDescription = sections.backgroundDescription || '';
      } catch (e) {
        // Non-fatal – fall through to simple defaults below.
      }
    }

    if (!styleDescription) {
      styleDescription =
        'High-contrast black-and-white ink illustration with bold silhouettes and clean highlights. Include light directional hatching for form.';
    }
    if (!backgroundDescription) {
      backgroundDescription =
        'Simple, entirely black, free of symbols or text, keeping focus on the character silhouette.';
    }

    // Build simple header line: {CHARACTER_NAME}: {RACE}, {CLASS}, {BACKGROUND}
    const name = (character && character.name) || 'Unnamed character';

    const raceLabel = character && character.race
      ? String(character.race)
      : null;
    const classLabel = character && character.class
      ? String(character.class)
      : null;

    let backgroundLabel = null;
    if (character && character.background) {
      backgroundLabel = String(character.background);
    }

    const headerParts = [];
    if (raceLabel) headerParts.push(raceLabel);
    if (classLabel) headerParts.push(classLabel);
    if (backgroundLabel) headerParts.push(backgroundLabel);

    const headerSuffix = headerParts.join(', ');
    const headerLine = headerSuffix
      ? `${name}: ${headerSuffix}`
      : `${name}`;

    // Use simple generic pose/camera text in the secure helper.
    const poseLine =
      'Pose: dynamic and expressive, clearly showing the character\'s upper body and face.';
    const cameraLine =
      'Camera: three-quarter or slightly low-angle view, keeping the character clearly readable.';

    let prompt = `${headerLine}\n\n${poseLine}\n\n${cameraLine}`;
    if (styleDescription) {
      prompt += `\n\nSTYLE: ${styleDescription}`;
    }
    if (backgroundDescription) {
      prompt += `\n\nScene: ${backgroundDescription}`;
    }

    return prompt;
  },
});

// Example usage:
/*

// Check if AI is available
const status = await SecureAIService.checkStatus();
if (status.available) {
  console.log('AI service is ready!');
}

// Generate narrator comment
const comment = await SecureAIService.generateNarratorComment({
  choice: 'Dwarf',
  question: "What's your race?",
  characterSoFar: {}
});
console.log(comment); // "Ah, the classic dwarf. I hope you like ale. ( ._. )"

// Generate character names
const names = await SecureAIService.generateNames('elf', 'wizard', 3);
console.log(names); // ["Elara Moonwhisper", "Thranduil Starweaver", ...]

// Generate backstory
const backstory = await SecureAIService.generateBackstory({
  name: 'Thorin',
  race: 'dwarf',
  class: 'fighter',
  personalityTrait: 'brave',
  background: 'soldier'
});
console.log(backstory);

// Generate portrait
const imageUrl = await SecureAIService.generatePortraitImage({
  race: 'elf',
  class: 'wizard',
  alignment: 'chaotic good'
});
console.log(imageUrl); // "https://oaidalleapi..."

*/

