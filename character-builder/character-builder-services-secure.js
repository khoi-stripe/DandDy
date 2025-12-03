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
    const characterDescription = this.buildCharacterDescription(character);

    // Normalize class key for lookups
    const classKey = (character.class || 'default').toLowerCase();

    // Class-specific pose variants (5 each where applicable)
    const poseVariantsByClass = {
      fighter: [
        'posed mid-swing with a heavy weapon, body twisted to show the arc of the strike',
        'standing in a ready battle stance, shield raised and weapon held low but tense',
        'caught in the moment of blocking an attack, weight shifted back with shield braced',
        'charging forward with weapon raised overhead, cloak and gear trailing behind',
        'standing atop fallen rubble in a victorious stance, weapon planted like a banner',
      ],
      barbarian: [
        'leaning forward in a feral roar, muscles tensed, weapon mid-swing',
        'standing wide and grounded, one foot on a rock, gripping a massive weapon with both hands',
        'caught mid-leap as if diving into battle, hair and trophies flying outward',
        'holding a weapon across the shoulders, posture relaxed but intimidating',
        'bracing against an unseen impact, teeth bared and stance low and aggressive',
      ],
      paladin: [
        'kneeling with shield planted in front, weapon held upright in a solemn vow pose',
        'standing tall with shield forward and weapon raised in a protective gesture',
        'framed in a side stance, shield angled and weapon ready for a precise strike',
        'holding a holy symbol aloft with one hand while resting the weapon point-down',
        'striding forward with shield half-raised, cloak sweeping back in a confident march',
      ],
      rogue: [
        'crouched low in the shadows, one dagger drawn and the other held behind for balance',
        'leaning casually against an unseen wall, one hand resting on a hidden blade',
        'mid-step on a narrow ledge, body turned sideways with cloak pulled close',
        'poised behind an unseen target, daggers reversed in a silent takedown stance',
        'perched on a raised surface, knees bent, ready to spring into motion',
      ],
      monk: [
        'balanced on one leg in a classic kick pose, arms forming a flowing guard shape',
        'mid-strike with an open palm, body rotated and lines clean and focused',
        'seated in calm meditation, legs crossed and hands resting in a composed mudra',
        'low sweeping stance with one arm extended and the other drawn back defensively',
        'caught at the peak of a spinning kick, robes and sashes tracing the motion',
      ],
      ranger: [
        'drawing a bow with the string fully pulled, body turned in a three-quarter stance',
        'kneeling on one knee with bow lowered, scanning the distance like a watchful scout',
        'mid-stride through an implied forest floor, bow held loosely but ready',
        'standing on a slight rise, bow raised and arrow aimed slightly downward',
        'leaning against an unseen tree, one hand resting on the bow, posture relaxed but alert',
      ],
      wizard: [
        'standing with one hand raised and fingers splayed, arcane energy swirling upward',
        'leaning over an invisible spellbook, staff angled forward as if channeling power',
        'mid-gesture with both hands shaping a spell, sleeves and robes pulled by the motion',
        'holding a staff planted before them, gaze lifted as if calling down distant power',
        'caught turning dramatically, cloak sweeping, one hand tracing a glowing sigil',
      ],
      sorcerer: [
        'surrounded by swirling magical energy, one hand outstretched and the other pulled close',
        'standing with arms wide, raw power coiling around their torso and shoulders',
        'mid-step as a surge of magic bursts from the ground around their feet',
        'leaning back slightly as if resisting an overwhelming tide of inner power',
        'cradling a concentrated sphere of magic between both hands at chest height',
      ],
      warlock: [
        'holding a pact focus or talisman forward, dark energy streaming from it',
        'standing in a relaxed stance with one hand behind their back, the other tracing eldritch runes',
        'reaching upward toward an unseen patron, cloak and garments pulled by unnatural wind',
        'half-turned away, casting a spell over their shoulder with a sly or knowing posture',
        'arms crossed loosely while faint sigils burn in the air around them',
      ],
      cleric: [
        'raising a holy symbol high, light radiating outward in a protective arc',
        'standing with shield angled and mace lowered, posture firm and resolute',
        'kneeling in prayerful focus, holy symbol clasped between both hands',
        'reaching one hand toward an unseen ally as if channeling healing energy',
        'planting a weapon or staff into the ground as radiant power rises around them',
      ],
      druid: [
        'standing with staff planted in the earth, vines and leaves swirling around',
        'mid-transformation pose, body partly turned and framed by natural shapes',
        'kneeling to touch the ground, one hand extended as if coaxing growth',
        'arms lifted as if calling wind or storm, cloak and hair driven by imaginary weather',
        'leaning gently against an unseen tree, posture relaxed and rooted',
      ],
      bard: [
        'mid-performance with an instrument, one foot forward and body open to an unseen crowd',
        'leaning back in a dramatic flourish, cloak and hair trailing with the motion',
        'perched casually on an unseen stool or crate, instrument resting comfortably in hand',
        'bowing deeply at the end of a performance, one arm sweeping wide',
        'caught mid-step in a dance-like pose, instrument held close to the torso',
      ],
      default: [
        'standing in a relaxed but heroic stance, weight shifted slightly to one side',
        'mid-stride as if walking toward the viewer with confident energy',
        'standing in profile with head turned toward the viewer, posture composed and steady',
        'seated on an implied stone or crate, leaning slightly forward in a thoughtful pose',
        'standing with arms loosely folded or resting on a weapon, calm and watchful',
      ],
    };

    // Camera angle variants (5 each where applicable)
    const cameraVariantsByClass = {
      fighter: [
        'Camera angle: slightly low and three-quarter to emphasize strength and presence.',
        'Camera angle: eye-level, centered on the torso and weapon for a direct confrontation.',
        'Camera angle: three-quarter from the shield side, highlighting defense and stance.',
        'Camera angle: slightly above, looking down to show battlefield context around the figure.',
        'Camera angle: close to ground level, making the character loom large in the frame.',
      ],
      barbarian: [
        'Camera angle: low and close, exaggerating size and ferocity.',
        'Camera angle: three-quarter with a strong diagonal, emphasizing motion and power.',
        'Camera angle: eye-level but tilted slightly to make the pose feel unstable and wild.',
        'Camera angle: pulled back to show the full silhouette and large weapon in motion.',
        'Camera angle: slightly below the shoulders, looking up into a battle roar.',
      ],
      paladin: [
        'Camera angle: eye-level, straight on, emphasizing honor and symmetry.',
        'Camera angle: slightly low, looking up past the shield to give a guardian feeling.',
        'Camera angle: three-quarter from the weapon side, showing both devotion and readiness.',
        'Camera angle: slightly above, as if from the viewpoint of someone being protected.',
        'Camera angle: close to the chest and shoulders, focusing on heraldry and holy symbols.',
      ],
      rogue: [
        'Camera angle: slightly above and to the side, emphasizing stealth and environment.',
        'Camera angle: three-quarter from behind, with the face turned back toward the viewer.',
        'Camera angle: low and angled sharply, creating long, dramatic shadows.',
        'Camera angle: tight framing around the upper body, leaving the background mostly in shadow.',
        'Camera angle: oblique and off-center, reinforcing a feeling of secrecy and motion.',
      ],
      monk: [
        'Camera angle: mid-distance and centered, capturing clean lines of the martial pose.',
        'Camera angle: slightly low, emphasizing balance and upward motion in kicks or strikes.',
        'Camera angle: from above, looking down on a circular stance pattern.',
        'Camera angle: three-quarter, letting limbs and flowing cloth create dynamic diagonals.',
        'Camera angle: side-on profile to highlight precision and alignment of the form.',
      ],
      ranger: [
        'Camera angle: three-quarter from the front, aligned with the drawn bow and arrow.',
        'Camera angle: from slightly behind the shoulder, looking along the line of the bowstring.',
        'Camera angle: slightly elevated, framing the ranger and implied terrain below.',
        'Camera angle: low and angled upward through implied undergrowth or rough ground.',
        'Camera angle: mid-distance, with the character slightly off-center to suggest open space.',
      ],
      wizard: [
        'Camera angle: three-quarter, framing both staff and spell effect in the same view.',
        'Camera angle: slightly low, making the spellcasting gesture feel towering and grand.',
        'Camera angle: slightly above, looking down on a circle of arcane energy.',
        'Camera angle: tight on the upper body and hands, emphasizing complex spell gestures.',
        'Camera angle: oblique and off-center, with arcane elements framing the composition.',
      ],
      sorcerer: [
        'Camera angle: close and low, centered on the chest where power is gathering.',
        'Camera angle: three-quarter from the side, showing energy spiraling around the figure.',
        'Camera angle: above and tilted, as if the viewer is caught in the swirl of magic.',
        'Camera angle: tight framing on the face and hands, emphasizing raw intensity.',
        'Camera angle: pulled back slightly, letting arcs of power form a halo-like shape.',
      ],
      warlock: [
        'Camera angle: slightly low and off-center, giving a subtle, ominous imbalance.',
        'Camera angle: three-quarter from behind, looking toward an unseen source of power.',
        'Camera angle: eye-level but pushed to one side, leaving empty darkness opposite the figure.',
        'Camera angle: close to the focus or talisman, with the character looming just behind it.',
        'Camera angle: slightly above, letting eldritch patterns form around the character\'s feet.',
      ],
      cleric: [
        'Camera angle: slightly low, looking up toward the raised holy symbol.',
        'Camera angle: eye-level, centered to evoke balance and stability.',
        'Camera angle: three-quarter, allowing both shield and symbol to read clearly.',
        'Camera angle: slightly above, as if from the viewpoint of a blessed ally.',
        'Camera angle: mid-distance with the character framed symmetrically in the composition.',
      ],
      druid: [
        'Camera angle: low and close to the ground, emphasizing roots, stones, and natural forms.',
        'Camera angle: three-quarter, with implied branches or leaves partially framing the view.',
        'Camera angle: slightly above, looking down as if from a bird\'s-eye vantage.',
        'Camera angle: eye-level but softened, placing the character gently into the environment.',
        'Camera angle: mid-distance, with the figure slightly off-center to leave room for nature.',
      ],
      bard: [
        'Camera angle: eye-level, as if the viewer is part of an unseen audience.',
        'Camera angle: three-quarter, capturing both gesture and instrument clearly.',
        'Camera angle: slightly low, turning a performance flourish into a heroic moment.',
        'Camera angle: above and angled, as if looking down from a balcony over a small stage.',
        'Camera angle: tight around the upper body and instrument, focusing on expression.',
      ],
      default: [
        'Camera angle: three-quarter view that clearly shows the full silhouette.',
        'Camera angle: eye-level, centered, with the figure dominating the frame.',
        'Camera angle: slightly low, making the character feel larger and more heroic.',
        'Camera angle: slightly above, looking down just enough to show shoulders and gear.',
        'Camera angle: mid-distance with the character placed slightly off-center for balance.',
      ],
    };

    const poseList =
      poseVariantsByClass[classKey] || poseVariantsByClass.default;
    const cameraList =
      cameraVariantsByClass[classKey] || cameraVariantsByClass.default;

    const posePrompt =
      poseList[Math.floor(Math.random() * poseList.length)];
    const cameraPrompt =
      cameraList[Math.floor(Math.random() * cameraList.length)];

    const renderingInstructions = [
      `Create a high-contrast black-and-white fantasy illustration of a ${characterDescription}.`,
      'Art style: classic fantasy ink illustration with strong contrast.',
      'Use bold shadow shapes, strong silhouettes, and clean white highlights.',
      'Include some controlled, directional hatching to define form (light mid-tone texture only).',
      'Use realistic heroic anatomy with natural proportions (smaller head, longer arms, taller figure).',
      `Pose: ${posePrompt}`,
      'Frame the character so the entire head, hands, and primary weapon or spell effect are fully visible in the image (no cropping at the top of the head).',
      cameraPrompt,
      'Background should be simple, entirely black, and free of symbols or text.',
      'Overall mood: classic fantasy ink illustration with a dramatic, mythic tone.',
      'Aspect ratio 3:4.',
    ];

    return renderingInstructions.join(' ');
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

