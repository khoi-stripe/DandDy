// Storage, AI, and portrait services for the DandDy terminal character builder.
// Exposes services as globals on window for use by inline handlers and other modules.

const CONFIG = window.CONFIG;
const DND_DATA = window.DND_DATA;
// Utils is defined globally in character-builder-utils.js as window.Utils.

// Image-to-ASCII converter (Enhanced with Floyd-Steinberg dithering)
const ImageToAsciiService = (window.ImageToAsciiService = {
  // Extended ASCII character set from lightest to darkest (reversed for correct mapping)
  // Black pixels (0) → light chars (spaces), White pixels (255) → dense chars ($@#)
  ASCII_CHARS:
    '  .`\'",;:Il!i><~+_-?][}{1)(|/\\trjxnuvczXYUJCLQ0OZmwqpdbkha*o#MW&8%B@$',

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
          ascii += this.ASCII_CHARS[clampedIndex];
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
  getNarratorId() {
    const value = localStorage.getItem('dnd_narrator_id');
    return value || 'deadpan'; // Default to deadpan narrator
  },

  setNarratorId(narratorId) {
    localStorage.setItem('dnd_narrator_id', narratorId);
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

  // Get the image URL for a pre-generated portrait
  getPreGeneratedImageUrl(race, classType) {
    const raceLower = race?.toLowerCase().replace(/\s+/g, '-') || '';
    const classLower = classType?.toLowerCase().replace(/\s+/g, '-') || '';
    
    // Try race-class combo first
    if (raceLower && classLower) {
      return `../web/generated_portraits/images/${raceLower}-${classLower}.png`;
    }
    
    // Fallback to race-only
    if (raceLower) {
      return `../web/generated_portraits/images/${raceLower}.png`;
    }
    
    return null;
  },

  // Load portrait (pre-generated or fallback to template)
  async generateAIPortrait(character) {
    try {
      // If there's custom AI-generated ASCII art, use that first
      if (character.customPortraitAscii) {
        console.log('✅ Using custom AI-generated portrait');
        return character.customPortraitAscii;
      }

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
        
        // Note: We don't set originalPortraitUrl for pre-generated portraits
        // to avoid showing "View Original" button when images aren't available
        // (e.g., on GitHub Pages where PNGs aren't committed)
        
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
      return { asciiArt, imageUrl };
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
      return { asciiArt, imageUrl };
    } catch (error) {
      console.error('Custom AI portrait generation error:', error);
      throw error;
    }
  },
});

// External AI service integrations (Secure backend proxy)
const AIService = (window.AIService = {
  // Track the last narrator comment so we can avoid obvious repetition.
  _lastNarratorComment: null,
  // Track whether we've already allowed an "Ah, the classic..."-style line
  // for the current character generation run.
  _usedClassicThisRun: false,
  
  // Backend availability tracking (for Render cold starts)
  _backendAvailable: null, // null = unknown, true = available, false = waking up
  _warmupInProgress: false,

  resetNarratorSession() {
    this._lastNarratorComment = null;
    this._usedClassicThisRun = false;
  },
  
  // Background warmup: Keep trying to wake up the backend
  async warmupBackend() {
    if (this._warmupInProgress || this._backendAvailable === true) {
      return;
    }
    
    this._warmupInProgress = true;
    console.log('%c🔄 WARMUP: Waking up backend server...', 'color: #fa0; font-weight: bold');
    
    while (this._backendAvailable !== true) {
      try {
        const response = await fetch(`${CONFIG.BACKEND_URL}/api/ai/status`, {
          method: 'GET',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.available) {
            this._backendAvailable = true;
            console.log('%c✅ WARMUP: Backend is now ready!', 'color: #0f0; font-weight: bold');
            this._warmupInProgress = false;
            return;
          }
        }
      } catch (error) {
        // Keep trying
      }
      
      // Wait 5 seconds before trying again
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    this._warmupInProgress = false;
  },

  // Helper to add timeout to fetch requests (for Render cold starts)
  async fetchWithTimeout(url, options, timeoutMs = CONFIG.AI_TIMEOUT) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      
      // Mark backend as available on successful response
      if (response.ok) {
        this._backendAvailable = true;
      }
      
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        // Backend is waking up - start background warmup
        this._backendAvailable = false;
        this.warmupBackend(); // Don't await - let it run in background
        throw new Error('Request timed out - backend may be waking up');
      }
      throw error;
    }
  },

  async generateCompletion(prompt, systemPrompt = null) {
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled in config');
      return null;
    }

    try {
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/chat/completion`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          system_prompt: systemPrompt,
          max_tokens: 300,
          temperature: 0.8,
        }),
      });

      if (!response.ok) {
        console.error(`Backend API error: ${response.status}`);
        return null;
      }

      const data = await response.json();
      return data.success ? data.content : null;
    } catch (error) {
      console.error('AI service error:', error);
      return null;
    }
  },

  async generateNarratorComment(context) {
    // Get current narrator and fallbacks
    const narratorId = StorageService.getNarratorId();
    const narrator = getNarrator(narratorId);
    const fallbacks = narrator.fallbacks;

    if (!CONFIG.ENABLE_AI) {
      console.log('%c🤖 NARRATOR (Fallback - AI Disabled)', 'color: #ff0; font-weight: bold');
      return Utils.randomChoice(fallbacks);
    }

    try {
      console.log('%c🤖 NARRATOR: Calling backend AI...', 'color: #0ff; font-weight: bold');
      console.log('  Request:', { choice: context.choice, question: context.question, narrator: narratorId });
      console.log('  Note: Will fallback after 10s if server is cold, but keep warming up in background...');
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/narrator/comment`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          choice: context.choice,
          question: context.question,
          character_so_far: context.characterSoFar,
          narrator_id: narratorId,
        }),
      }); // Uses CONFIG.AI_TIMEOUT (10s), then fallback + background warmup

      if (!response.ok) {
        console.log('%c🤖 NARRATOR (Fallback - API Error)', 'color: #f80; font-weight: bold');
        console.log('  Status:', response.status);
        return Utils.randomChoice(fallbacks);
      }

      const data = await response.json();
      let text = data.comment || Utils.randomChoice(fallbacks);
      
      console.log('%c🤖 NARRATOR (AI Generated) ✨', 'color: #0f0; font-weight: bold');
      console.log('  Response:', text);
    
      // Use the text from the response
      let responseText = text;

      // Light post-processing to avoid obvious repetition
    const normalize = (s) => (s || '').trim().toLowerCase();
    const startsWithClassic = (s) =>
      s.startsWith('ah, the classic') || s.startsWith('ah the classic');

    const last = this._lastNarratorComment;
    const lastNorm = normalize(last);
      let newNorm = normalize(responseText);

    if (last) {
      if (newNorm === lastNorm) {
          const alts = fallbacks.filter((f) => normalize(f) !== lastNorm);
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }

      if (startsWithClassic(newNorm) && startsWithClassic(lastNorm)) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
            newNorm = normalize(responseText);
        }
      }
    }

    if (startsWithClassic(newNorm)) {
      if (this._usedClassicThisRun) {
          const alts = fallbacks.filter((f) => !startsWithClassic(normalize(f)));
        if (alts.length) {
            responseText = Utils.randomChoice(alts);
        }
      } else {
        this._usedClassicThisRun = true;
      }
    }

      this._lastNarratorComment = responseText;
      return responseText;
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c🤖 NARRATOR (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log('  ⏰ 10s timeout reached. Using fallback now, but backend warmup continues...');
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c🤖 NARRATOR (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
        console.error('  Error:', error);
      }
      return Utils.randomChoice(fallbacks);
    }
  },

  async generateNames(race, classType, count = 3) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c📛 NAMES (Fallback - AI Disabled)', 'color: #ff0; font-weight: bold');
      return this.generateFallbackNames(race, count);
    }

    try {
      console.log('%c📛 NAMES: Calling backend AI...', 'color: #0ff; font-weight: bold');
      console.log('  Request:', { race, classType, count });
      console.log('  Note: Will fallback after 10s if server is cold, but keep warming up in background...');

      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/names`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          race: race,
          class_type: classType,
          count: count,
        }),
      }); // Uses CONFIG.AI_TIMEOUT (10s)

      if (!response.ok) {
        console.log('%c📛 NAMES (Fallback - API Error)', 'color: #f80; font-weight: bold');
        return this.generateFallbackNames(race, count);
      }

      const data = await response.json();
      if (data.success && data.names && data.names.length > 0) {
        console.log('%c📛 NAMES (AI Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  Response:', data.names);
        return data.names;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📛 NAMES (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log('  ⏰ 10s timeout reached. Using fallback now, but backend warmup continues...');
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📛 NAMES (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
        console.error('  Error:', error);
      }
    }

    // Fallback: simple name generation
    console.log('%c📛 NAMES (Fallback)', 'color: #f80; font-weight: bold');
    return this.generateFallbackNames(race, count);
  },

  generateFallbackNames(race, count) {
    const namePatterns = {
      dwarf: {
        first: ['Thorin', 'Gimli', 'Balin', 'Dwalin', 'Thrain', 'Dain', 'Bombur', 'Bofur', 'Kili', 'Fili', 'Oin', 'Gloin'],
        last: ['Ironforge', 'Stonehelm', 'Deepdelver', 'Mountainheart', 'Goldseeker', 'Ironfoot', 'Hammerhand', 'Oakenshield']
      },
      elf: {
        first: ['Legolas', 'Galadriel', 'Elrond', 'Arwen', 'Thranduil', 'Celeborn', 'Elessar', 'Elendil', 'Finrod', 'Luthien'],
        last: ['Greenleaf', 'Starweaver', 'Moonwhisper', 'Silverbow', 'Nightbreeze', 'Sunshadow', 'Stormwind', 'Brightwood']
      },
      human: {
        first: ['Aragorn', 'Boromir', 'Eowyn', 'Faramir', 'Theodred', 'Eomer', 'Eddard', 'Catelyn', 'Jon', 'Sansa'],
        last: ['Stormborn', 'Blackwood', 'Riverrun', 'Ironwall', 'Longstrider', 'Stormblade', 'Brightshield', 'Greywind']
      },
      halfling: {
        first: ['Bilbo', 'Frodo', 'Sam', 'Merry', 'Pippin', 'Rosie', 'Hamfast', 'Belladonna', 'Lobelia', 'Fredegar'],
        last: ['Baggins', 'Took', 'Brandybuck', 'Gamgee', 'Goodbody', 'Proudfoot', 'Burrows', 'Underhill', 'Greenhill']
      },
      dragonborn: {
        first: ['Drax', 'Razax', 'Thordak', 'Torinn', 'Balasar', 'Kriv', 'Nadarr', 'Heskan', 'Shedinn', 'Ghesh'],
        last: ['Flameheart', 'Ironclaw', 'Stormsinger', 'Ashborn', 'Dragonfall', 'Firebreath', 'Scaleborn', 'Wyrmblood']
      },
      gnome: {
        first: ['Glim', 'Boddynock', 'Dimble', 'Fonkin', 'Seebo', 'Zook', 'Eldon', 'Brocc', 'Burgell', 'Jebeddo'],
        last: ['Tinkertop', 'Sparklegem', 'Nimblefingers', 'Brightgear', 'Gadgetwhiz', 'Fizzlebang', 'Cogsworth', 'Glimmergold']
      },
      'half-elf': {
        first: ['Tanis', 'Raistlin', 'Laurana', 'Gilthanas', 'Tanthalas', 'Silvara', 'Eliana', 'Korrin', 'Faelyn', 'Soveliss'],
        last: ['Half-Elven', 'Moonbrook', 'Starfall', 'Whisperwind', 'Shadowvale', 'Dawnbringer', 'Twilightbane', 'Silvermoon']
      },
      'half-orc': {
        first: ['Grognak', 'Throk', 'Ugak', 'Krod', 'Sharn', 'Dench', 'Grul', 'Drog', 'Feng', 'Shump'],
        last: ['Ironhide', 'Bonecrusher', 'Skullsplitter', 'Bloodaxe', 'Stonefist', 'Grimjaw', 'Warbringer', 'Doomhammer']
      },
      tiefling: {
        first: ['Zevlor', 'Raven', 'Damakos', 'Akta', 'Therai', 'Nemeia', 'Kallista', 'Leucis', 'Orianna', 'Morthos'],
        last: ['Hellborn', 'Darkflame', 'Shadowhorn', 'Nightwhisper', 'Embersoul', 'Dreadfire', 'Ashenborn', 'Voidwalker']
      },
    };

    const pattern = namePatterns[race] || namePatterns.human;
    const result = [];
    const used = new Set();

    // Generate unique name combinations
    let attempts = 0;
    while (result.length < count && attempts < count * 10) {
      const firstName = Utils.randomChoice(pattern.first);
      const lastName = Utils.randomChoice(pattern.last);
      const fullName = `${firstName} ${lastName}`;
      
      if (!used.has(fullName)) {
        used.add(fullName);
        result.push(fullName);
      }
      attempts++;
    }

    return result;
  },

  async generateBackstory(character) {
    const fallback = `${character.name} is a ${character.race} ${character.class} with a mysterious past. `
      + "They don't talk about it much. Probably for the best.";

    if (!CONFIG.ENABLE_AI) {
      console.log('%c📖 BACKSTORY (Fallback - AI Disabled)', 'color: #ff0; font-weight: bold');
      return fallback;
    }

    try {
      console.log('%c📖 BACKSTORY: Calling backend AI...', 'color: #0ff; font-weight: bold');
      console.log('  Request:', { name: character.name, race: character.race, class: character.class });
      console.log('  Note: Will fallback after 10s if server is cold, but keep warming up in background...');
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/characters/backstory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: character.name,
          race: character.race,
          class_type: character.class,
          personality: character.personalityTrait || 'mysterious',
          background: character.background,
        }),
      }); // Uses CONFIG.AI_TIMEOUT (10s)

      if (!response.ok) {
        console.log('%c📖 BACKSTORY (Fallback - API Error)', 'color: #f80; font-weight: bold');
        return fallback;
      }

      const data = await response.json();
      if (data.success && data.backstory) {
        console.log('%c📖 BACKSTORY (AI Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  Response:', data.backstory.substring(0, 100) + '...');
        return data.backstory;
      }
    } catch (error) {
      if (error.message.includes('timed out')) {
        console.log('%c📖 BACKSTORY (Fallback - Backend Waking Up)', 'color: #f80; font-weight: bold');
        console.log('  ⏰ 10s timeout reached. Using fallback now, but backend warmup continues...');
        console.log('  ✅ Once awake, subsequent requests will use AI!');
      } else {
        console.log('%c📖 BACKSTORY (Fallback - Connection Error)', 'color: #f00; font-weight: bold');
        console.error('  Error:', error);
      }
    }

    console.log('%c📖 BACKSTORY (Fallback)', 'color: #f80; font-weight: bold');
    return fallback;
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
    if (!CONFIG.ENABLE_AI) {
      console.log('AI service disabled for image generation');
      return null;
    }

    // Build a detailed prompt from character attributes
    const prompt = this.buildPortraitPrompt(character);

    return await this.generateImageFromPrompt(prompt);
  },

  // Generate image from custom prompt
  async generateImageFromPrompt(prompt) {
    if (!CONFIG.ENABLE_AI) {
      console.log('%c🎨 DALL-E (Unavailable - AI Disabled)', 'color: #ff0; font-weight: bold');
      return null;
    }

    try {
      console.log('%c🎨 DALL-E: Calling backend AI...', 'color: #0ff; font-weight: bold');
      console.log('  Prompt:', prompt.substring(0, 100) + '...');
      console.log('  Note: Will fallback after 10s if server is cold, but keep warming up in background...');
      
      const response = await this.fetchWithTimeout(`${CONFIG.BACKEND_URL}/api/ai/images/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          size: '1024x1024',
          quality: 'standard',
        }),
      }); // Uses CONFIG.AI_TIMEOUT (10s)

      if (!response.ok) {
        const errorData = await response.json();
        console.log('%c🎨 DALL-E (Error)', 'color: #f00; font-weight: bold');
        console.log('  Error:', errorData.detail);
        
        // Check for rate limiting
        if (response.status === 429) {
          const rateLimitError = new Error(errorData.detail || 'Rate limit exceeded');
          rateLimitError.isRateLimit = true;
          throw rateLimitError;
        }
        
        throw new Error(errorData.detail || `API error: ${response.status}`);
      }

      const data = await response.json();
      if (data.success) {
        console.log('%c🎨 DALL-E (Image Generated) ✨', 'color: #0f0; font-weight: bold');
        console.log('  URL:', data.url.substring(0, 50) + '...');
        return data.url;
      }
      return null;
    } catch (error) {
      console.log('%c🎨 DALL-E (Failed)', 'color: #f00; font-weight: bold');
      console.error('  Error:', error);
      throw error;
    }
  },

  // Build character description (shown to user in modal)
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

  // Build full DALL-E prompt with rendering instructions (not shown to user)
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



