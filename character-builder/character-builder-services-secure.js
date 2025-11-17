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
        fighter: 'wearing heavy armor and holding a sword',
        wizard: 'in flowing robes holding a staff',
        rogue: 'in dark leather armor with daggers',
        cleric: 'in holy vestments with a sacred symbol',
        ranger: 'with a bow and forest attire',
        paladin: 'in shining armor with a holy shield',
        barbarian: 'with wild hair wielding a massive axe',
        bard: 'with a lute and colorful clothing',
        druid: 'with nature-themed robes and wooden staff',
        monk: 'in simple robes in a martial stance',
        sorcerer: 'with crackling magical energy',
        warlock: 'with dark robes and eldritch symbols',
      };
      parts.push(classDescriptions[character.class] || character.class);
    }

    // Alignment
    if (character.alignment) {
      if (character.alignment.includes('good')) {
        parts.push('with noble bearing');
      } else if (character.alignment.includes('evil')) {
        parts.push('with a menacing aura');
      }
    }

    parts.push('full body portrait, fantasy art style, detailed');

    return parts.join(', ');
  },

  // Build full DALL-E prompt with rendering instructions
  buildPortraitPrompt(character) {
    const renderingInstructions = [
      'Fantasy D&D character portrait',
      'Create a high-contrast, grayscale illustration on a pure black background',
      'Use bold, graphic shapes with thick outlines and minimal fine detail',
      'The image should have bright highlights and deep shadows to maximize tonal separation',
      'Center the subject in the frame and avoid background texture',
      'Style should be simple, iconic, and optimized for ASCII art conversion',
    ];

    const characterDescription = this.buildCharacterDescription(character);

    return [...renderingInstructions, characterDescription].join(', ');
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

