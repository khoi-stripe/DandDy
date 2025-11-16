// Storage, AI, and portrait services for the DandDy terminal character builder.
// Exposes services as globals on window for use by inline handlers and other modules.

const CONFIG = window.CONFIG;
const DND_DATA = window.DND_DATA;
// Utils is defined globally in character-builder-utils.js as window.Utils.

// Image-to-ASCII converter (Enhanced with Floyd-Steinberg dithering)
const ImageToAsciiService = (window.ImageToAsciiService = {
  // Extended ASCII character set from darkest to lightest (70 characters)
  // More characters = smoother gradients and better detail
  ASCII_CHARS:
    '$@B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/\\|()1{}[]?-_+~<>i!lI;:,"^`\'.  ',

  // Convert image URL to ASCII art with Floyd-Steinberg dithering
  async convertToAscii(imageUrl, width = 160, height = 80) {
    try {
      // Load image
      const img = await this.loadImage(imageUrl);

      // Create canvas and draw image
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      // Draw image scaled to canvas size
      ctx.drawImage(img, 0, 0, width, height);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, width, height);
      const pixels = imageData.data;

      // Create grayscale array for Floyd-Steinberg dithering
      const grayscale = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        const idx = i * 4;
        // Use proper luminance calculation (better than simple average)
        grayscale[i] =
          0.299 * pixels[idx] +
          0.587 * pixels[idx + 1] +
          0.114 * pixels[idx + 2];
      }

      // Apply Floyd-Steinberg dithering
      const dithered = this.floydSteinbergDither(grayscale, width, height);

      // Convert to ASCII
      let ascii = '';
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const brightness = dithered[y * width + x];

          // Map brightness to ASCII character
          const charIndex = Math.floor(
            (brightness / 255) * (this.ASCII_CHARS.length - 1),
          );
          const clampedIndex = Math.max(
            0,
            Math.min(this.ASCII_CHARS.length - 1, charIndex),
          );
          ascii +=
            this.ASCII_CHARS[this.ASCII_CHARS.length - 1 - clampedIndex];
        }
        ascii += '\n';
      }

      return ascii;
    } catch (error) {
      console.error('Image to ASCII conversion error:', error);
      return null;
    }
  },

  // Floyd-Steinberg dithering algorithm
  // Distributes quantization error to neighboring pixels for better detail
  floydSteinbergDither(grayscale, width, height) {
    const output = new Float32Array(grayscale);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const oldPixel = output[idx];

        // Quantize to ASCII character levels
        const newPixel =
          Math.round(
            (oldPixel / 255) * (this.ASCII_CHARS.length - 1),
          ) *
          (255 / (this.ASCII_CHARS.length - 1));
        output[idx] = newPixel;

        // Calculate quantization error
        const error = oldPixel - newPixel;

        // Distribute error to neighboring pixels
        // Floyd-Steinberg matrix:
        //         X   7/16
        // 3/16  5/16  1/16

        if (x + 1 < width) {
          output[idx + 1] += (error * 7) / 16;
        }
        if (y + 1 < height) {
          if (x > 0) {
            output[idx + width - 1] += (error * 3) / 16;
          }
          output[idx + width] += (error * 5) / 16;
          if (x + 1 < width) {
            output[idx + width + 1] += error / 16;
          }
        }
      }
    }

    return output;
  },

  // Load image from URL (handles CORS via proxy)
  async loadImage(url) {
    try {
      // Use CORS proxy for Azure blob storage URLs (DALL-E images)
      // Azure doesn't allow CORS from most origins, so we need a proxy
      const corsProxy = 'https://corsproxy.io/?';
      const proxiedUrl = corsProxy + encodeURIComponent(url);

      // Fetch the image as a blob to bypass CORS restrictions
      const response = await fetch(proxiedUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.status}`);
      }

      const blob = await response.blob();

      // Create object URL from blob
      const objectUrl = URL.createObjectURL(blob);

      // Load image from object URL
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          // Clean up object URL
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = (error) => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error('Failed to load image from blob'));
        };
        img.src = objectUrl;
      });
    } catch (error) {
      console.error('Error loading image:', error);
      throw new Error(`Image loading failed: ${error.message}`);
    }
  },
});

// Storage service for localStorage
const StorageService = (window.StorageService = {
  getAPIKey() {
    return localStorage.getItem(CONFIG.API_KEY_STORAGE);
  },

  setAPIKey(key) {
    localStorage.setItem(CONFIG.API_KEY_STORAGE, key);
  },

  getAIPortraitsEnabled() {
    const value = localStorage.getItem(CONFIG.AI_PORTRAITS_STORAGE);
    return value === 'true'; // Default to false
  },

  setAIPortraitsEnabled(enabled) {
    localStorage.setItem(
      CONFIG.AI_PORTRAITS_STORAGE,
      enabled ? 'true' : 'false',
    );
  },

  getDemoModeEnabled() {
    const value = localStorage.getItem(CONFIG.DEMO_MODE_STORAGE);
    return value === 'true'; // Default to false
  },

  setDemoModeEnabled(enabled) {
    localStorage.setItem(
      CONFIG.DEMO_MODE_STORAGE,
      enabled ? 'true' : 'false',
    );
  },

  getCharacters() {
    const data = localStorage.getItem(CONFIG.STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  },

  saveCharacter(character) {
    const characters = this.getCharacters();
    const index = characters.findIndex((c) => c.id === character.id);

    if (index >= 0) {
      characters[index] = character;
    } else {
      characters.push(character);
    }

    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
  },

  deleteCharacter(id) {
    const characters = this.getCharacters().filter((c) => c.id !== id);
    localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(characters));
  },
});

// ASCII Art service
// Now relies primarily on pre-generated custom portraits.
const AsciiArtService = (window.AsciiArtService = {
  // Simple in-memory cache for portraits keyed by race|class.
  _portraitCache: {},
  // Legacy hardcoded ASCII templates have been removed now that
  // we rely on custom, pre-generated portraits under generated_portraits/.
  // These helpers remain so existing callers continue to work.
  getRaceArt(race) {
    return '';
  },

  addClassDecoration(baseArt, classType) {
    return baseArt;
  },

  getFullPortrait(character) {
    if (!character || !character.race) return '';
    const raceLabel = String(character.race).toUpperCase();
    const classLabel = character.class ? ` ${String(character.class).toUpperCase()}` : '';
    return `[ ${raceLabel}${classLabel} PORTRAIT ]`;
  },

  // Load pre-generated ASCII portrait from files
  async loadPreGeneratedPortrait(race, classType) {
    const raceLower = race.toLowerCase().replace(/ /g, '-');
    const classLower = classType ? classType.toLowerCase() : '';

    // Try race-class combo first
    if (classLower) {
      const path = `generated_portraits/ascii/${raceLower}-${classLower}.txt`;
      console.log(`📂 Trying to load: ${path}`);
      try {
        const response = await fetch(path);
        console.log(`📡 Response status: ${response.status}`);
        if (response.ok) {
          const text = await response.text();
          console.log(`✅ Loaded ${raceLower}-${classLower}, length: ${text.length}`);
          return text;
        }
      } catch (e) {
        console.log(`❌ Error loading ${raceLower}-${classLower}:`, e);
      }
    }

    // Fallback to race-only
    const path = `generated_portraits/ascii/${raceLower}.txt`;
    console.log(`📂 Trying fallback: ${path}`);
    try {
      const response = await fetch(path);
      console.log(`📡 Response status: ${response.status}`);
      if (response.ok) {
        const text = await response.text();
        console.log(`✅ Loaded ${raceLower}, length: ${text.length}`);
        return text;
      }
    } catch (e) {
      console.log(`❌ Error loading ${raceLower}:`, e);
    }

    console.log(`❌ No portrait found for ${raceLower}`);
    return null;
  },

  // Load portrait (pre-generated or fallback to template)
  async generateAIPortrait(character) {
    try {
      const key = `${character.race || ''}|${character.class || ''}`;
      if (this._portraitCache[key]) {
        return this._portraitCache[key];
      }

      // Try loading pre-generated portrait from files
      console.log('Loading pre-generated portrait...');
      const preGenerated = await this.loadPreGeneratedPortrait(
        character.race,
        character.class,
      );
      if (preGenerated) {
        console.log(
          `✅ Found pre-generated portrait for ${character.race}-${character.class}`,
        );
        this._portraitCache[key] = preGenerated;
        return this._portraitCache[key];
      }

      // Fallback to template art
      console.log('No pre-generated portrait, using template');
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;
      return fallback;
    } catch (error) {
      console.error('Portrait loading error:', error);
      const key = `${character.race || ''}|${character.class || ''}`;
      const fallback = this.getFullPortrait(character);
      this._portraitCache[key] = fallback;
      return fallback;
    }
  },

  // Generate CUSTOM AI portrait with DALL-E (user-initiated)
  async generateCustomAIPortrait(character) {
    try {
      console.log('🎨 Generating custom AI portrait with DALL-E...');

      // Step 1: Generate image with DALL-E
      const imageUrl = await AIService.generatePortraitImage(character);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return asciiArt;
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },

  // Generate CUSTOM AI portrait with custom prompt
  async generateCustomAIPortraitWithPrompt(customPrompt) {
    try {
      console.log('🎨 Generating custom AI portrait with custom prompt...');
      console.log('Prompt:', customPrompt);

      // Step 1: Generate image with DALL-E using custom prompt
      const imageUrl = await AIService.generateImageFromPrompt(customPrompt);

      if (!imageUrl) {
        throw new Error('DALL-E generation failed');
      }

      console.log('✅ DALL-E image generated:', imageUrl);

      // Step 2: Convert to ASCII with high resolution
      console.log('Converting to ASCII with Floyd-Steinberg dithering...');
      const asciiArt = await ImageToAsciiService.convertToAscii(
        imageUrl,
        160,
        80,
      );

      if (!asciiArt) {
        throw new Error('ASCII conversion failed');
      }

      console.log('✅ Custom ASCII art generated successfully');
      return asciiArt;
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },
});

// External AI service integrations (OpenAI chat + images)
const AIService = (window.AIService = {
  async generateCompletion(prompt, systemPrompt = null) {
    const apiKey = StorageService.getAPIKey();

    if (!apiKey || !CONFIG.ENABLE_AI) {
      console.log('AI service unavailable, using fallback');
      return null;
    }

    const messages = [];
    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }
    messages.push({ role: 'user', content: prompt });

    try {
      const response = await fetch(CONFIG.OPENAI_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: CONFIG.OPENAI_MODEL,
          messages: messages,
          max_tokens: 300,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('AI service error:', error);
      return null;
    }
  },

  async generateNarratorComment(context) {
    const systemPrompt =
      'You are a deadpan, slightly cheeky D&D narrator. Your personality is dry and witty, ' +
      "occasionally using emoticons like ( ._.) when amused. Keep responses under 50 words. " +
      'Be brief, sarcastic, and occasionally break the fourth wall.';

    const prompt = `The player chose: ${context.choice} for ${context.question}. ` +
      `Their character so far: ${JSON.stringify(
        context.characterSoFar,
      )}. Make a brief, deadpan comment about their choice.`;

    const response = await this.generateCompletion(prompt, systemPrompt);

    // Fallback responses if AI fails
    const fallbacks = [
      'Interesting choice. ( ._. )',
      "Well, that's one way to do it.",
      '[sigh] Fine.',
      "Bold move. We'll see how that works out.",
      'Sure. Why not.',
    ];

    return response || Utils.randomChoice(fallbacks);
  },

  async generateNames(race, classType, count = 3) {
    const prompt = `Generate ${count} fantasy character names suitable for a ${race} ${classType} in D&D. ` +
      'Just list the names, one per line, nothing else.';

    const response = await this.generateCompletion(prompt);

    if (response) {
      return response
        .split('\n')
        .map((n) => n.trim())
        .filter((n) => n);
    }

    // Fallback: simple name generation
    return this.generateFallbackNames(race, count);
  },

  generateFallbackNames(race, count) {
    const namePatterns = {
      dwarf: ['Thorin', 'Gimli', 'Balin', 'Dwalin', 'Grim', 'Thrain'],
      elf: ['Legolas', 'Galadriel', 'Elrond', 'Arwen', 'Thranduil', 'Celeborn'],
      human: ['Aragorn', 'Boromir', 'Eowyn', 'Faramir', 'Theodred', 'Eomer'],
      halfling: ['Bilbo', 'Frodo', 'Sam', 'Merry', 'Pippin', 'Rosie'],
      dragonborn: ['Drax', 'Razax', 'Thordak', 'Vax', 'Torinn', 'Balasar'],
      gnome: ['Glim', 'Boddynock', 'Dimble', 'Fonkin', 'Seebo', 'Zook'],
      'half-elf': [
        'Tanis',
        'Raistlin',
        'Laurana',
        'Gilthanas',
        'Tanthalas',
        'Silvara',
      ],
      'half-orc': ['Grognak', 'Throk', 'Ugak', 'Krod', 'Sharn', 'Dench'],
      tiefling: ['Zevlor', 'Raven', 'Damakos', 'Akta', 'Therai', 'Nemeia'],
    };

    const names = namePatterns[race] || namePatterns.human;
    const result = [];

    for (let i = 0; i < count; i++) {
      result.push(Utils.randomChoice(names) + Utils.random(1, 99));
    }

    return result;
  },

  async generateBackstory(character) {
    const prompt = `Create a brief (100 words max) backstory for: ${character.name}, `
      + `a ${character.race} ${character.class}. Personality: ${
        character.personalityTrait || 'mysterious'
      }. `
      + `Background: ${character.background}. Make it dramatic but deadpan in tone.`;

    const response = await this.generateCompletion(prompt);

    if (response) return response;

    // Fallback
    return `${character.name} is a ${character.race} ${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";
  },

  async generateOptionVariations(questionText, options) {
    const optionDescriptions = options
      .map((opt) => `Value: "${opt.value}", Default text: "${opt.text}"`)
      .join('\n');

    const prompt = `For the question: "${questionText}"

Generate fresh, creative variations for these D&D character creation options. Keep each variation to 4-8 words, punchy and clear. Match the tone of each original but make them feel unique:

${optionDescriptions}

Format your response as JSON array of strings, one for each option in order. Example: ["text1", "text2", "text3", "text4"]`;

    const systemPrompt =
      'You are a creative D&D character creation assistant. Generate engaging option text that feels fresh but maintains the same meaning. ' +
      'Be concise and direct. Return ONLY valid JSON.';

    const response = await this.generateCompletion(prompt, systemPrompt);

    if (response) {
      try {
        // Try to extract JSON from response
        const jsonMatch = response.match(/\[.*\]/s);
        if (jsonMatch) {
          const variations = JSON.parse(jsonMatch[0]);
          if (Array.isArray(variations) && variations.length === options.length) {
            return variations;
          }
        }
      } catch (error) {
        console.log('Failed to parse AI option variations:', error);
      }
    }

    // Fallback: return original texts
    return options.map((opt) => opt.text);
  },

  // Generate character portrait image using DALL-E
  async generatePortraitImage(character) {
    const apiKey = StorageService.getAPIKey();

    if (!apiKey || !CONFIG.ENABLE_AI) {
      console.log('AI service unavailable for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt) {
    const apiKey = StorageService.getAPIKey();

    if (!apiKey || !CONFIG.ENABLE_AI) {
      console.log('AI service unavailable for image generation');
      return null;
    }

    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'dall-e-3',
          prompt: prompt,
          n: 1,
          size: '1024x1024',
          quality: 'standard',
        }),
      });

      if (!response.ok) {
        throw new Error(`DALL-E API error: ${response.status}`);
      }

      const data = await response.json();
      return data.data[0].url; // Returns the image URL
    } catch (error) {
      console.error('DALL-E image generation error:', error);
      return null;
    }
  },

  // Build DALL-E prompt for character portrait
  buildPortraitPrompt(character) {
    const parts = [];

    // Style directives
    parts.push('Fantasy D&D character portrait in classic fantasy art style');
    parts.push('high contrast, dramatic lighting');

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
});


